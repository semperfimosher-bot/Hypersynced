from __future__ import annotations

import asyncio
import re
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from sqlalchemy import select

from ..config import get_settings
from ..database import get_session_factory
from ..models.artist import ArtistProfile

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "HyperSynced/1.0 (artist artwork attribution; https://hypersynced.app)"
MAX_ART_BYTES = 4 * 1024 * 1024
ARTIST_TYPES = {"Q639669", "Q215380", "Q2088357", "Q483501"}
ALLOWED_LICENSES = {
    "cc0", "cc0-1.0", "cc-by", "cc-by-2.0", "cc-by-2.5", "cc-by-3.0",
    "cc-by-4.0", "cc-by-sa", "cc-by-sa-2.0", "cc-by-sa-2.5",
    "cc-by-sa-3.0", "cc-by-sa-4.0", "public domain",
    "public domain mark", "pd",
}
_active_artist_jobs: set[str] = set()
_artist_artwork_queue_event = asyncio.Event()
_artist_artwork_retry_after: dict[str, float] = {}
_musicbrainz_lock = asyncio.Lock()
_last_musicbrainz_request_at = 0.0


def exact_artist_entity_candidates(artist_name: str, search_results: list[dict]) -> list[dict]:
    """Keep exact case-folded label matches only; fuzzy matches are never accepted."""
    target = " ".join(str(artist_name or "").split()).casefold()
    if not target:
        return []
    return [
        item for item in search_results
        if " ".join(str(item.get("label") or "").split()).casefold() == target
        and item.get("id")
    ]


def has_artist_entity_type(claims: dict) -> bool:
    instance_claims = claims.get("P31") or []
    return any(
        claim.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
        in ARTIST_TYPES
        for claim in instance_claims
        if isinstance(claim, dict)
    )


def verified_artist_entity_candidates(
    artist_name: str,
    search_results: list[dict],
    claims_by_entity: dict[str, dict],
) -> list[dict]:
    """Return exact-label, typed music artists that have a portrait claim."""
    candidates = [
        candidate
        for candidate in exact_artist_entity_candidates(
            artist_name,
            search_results,
        )
        if has_artist_entity_type(
            claims_by_entity.get(candidate["id"], {}),
        )
        and claims_by_entity.get(candidate["id"], {}).get("P18")
        and musicbrainz_artist_id(
            claims_by_entity.get(candidate["id"], {}),
        )
    ]
    # Exact-name matches can still collide across people/groups. Fail closed.
    return candidates if len(candidates) == 1 else []


def musicbrainz_artist_id(claims: dict) -> str | None:
    identifiers = claims.get("P434") or []
    for claim in identifiers:
        value = (
            claim.get("mainsnak", {})
            .get("datavalue", {})
            .get("value")
        )
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def wikidata_qid_from_musicbrainz_relations(response: dict) -> str | None:
    for relation in response.get("relations") or []:
        if relation.get("type") != "wikidata":
            continue
        resource = relation.get("url", {}).get("resource", "")
        match = re.search(r"(?:^|/)(Q[0-9]+)$", resource)
        if match:
            return match.group(1)
    return None


def musicbrainz_identity_matches(
    artist_name: str,
    wikidata_qid: str,
    response: dict,
) -> bool:
    normalized_name = " ".join(
        str(response.get("name") or "").split(),
    ).casefold()
    requested_name = " ".join(
        str(artist_name or "").split(),
    ).casefold()
    return (
        normalized_name == requested_name
        and response.get("type") in {"Person", "Group"}
        and wikidata_qid_from_musicbrainz_relations(response)
        == wikidata_qid
    )


async def _verify_musicbrainz_link(
    client: httpx.AsyncClient,
    artist_name: str,
    wikidata_qid: str,
    mbid: str,
) -> bool:
    global _last_musicbrainz_request_at
    async with _musicbrainz_lock:
        delay = max(
            0.0,
            1.1 - (time.monotonic() - _last_musicbrainz_request_at),
        )
        if delay:
            await asyncio.sleep(delay)
        response = await _request_json(
            client,
            f"https://musicbrainz.org/ws/2/artist/{mbid}",
            {"inc": "url-rels", "fmt": "json"},
        )
        _last_musicbrainz_request_at = time.monotonic()
    return musicbrainz_identity_matches(
        artist_name,
        wikidata_qid,
        response,
    )


def is_safe_wikimedia_url(value: str | None) -> bool:
    try:
        parsed = urlsplit(str(value or ""))
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname in {
            "commons.wikimedia.org",
            "upload.wikimedia.org",
            "www.wikidata.org",
            "wikidata.org",
        }
        and parsed.username is None
        and parsed.password is None
    )


def license_is_reusable(value: str | None) -> bool:
    normalized = re.sub(r"[^a-z0-9]", "", str(value or "").casefold())
    return normalized in {
        re.sub(r"[^a-z0-9]", "", item)
        for item in ALLOWED_LICENSES
    }


def image_bytes_match_mime(content: bytes | bytearray, content_type: str) -> bool:
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


async def _request_json(client: httpx.AsyncClient, url: str, params: dict) -> dict:
    response = await client.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, dict):
        raise ValueError("Provider returned an unexpected response.")
    return data


async def _commons_search_for_artist_image(
    client: httpx.AsyncClient,
    artist_name: str,
) -> dict | None:
    """Find a name-matched, freely reusable Commons portrait when Wikidata is incomplete."""
    search = await _request_json(
        client,
        COMMONS_API,
        {
            "action": "query",
            "generator": "search",
            "gsrsearch": f'file:"{artist_name}"',
            "gsrnamespace": 6,
            "gsrlimit": 12,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": 1200,
            "format": "json",
        },
    )
    pages = search.get("query", {}).get("pages", {})
    normalized_artist = " ".join(artist_name.split()).casefold()
    for page in pages.values():
        title = str(page.get("title") or "").casefold()
        info = (page.get("imageinfo") or [{}])[0]
        ext = info.get("extmetadata") or {}
        description = str(ext.get("ImageDescription", {}).get("value") or "")
        # Search results are not identity proof. Require the exact artist name to
        # appear in the file title or its Commons description, and reject other
        # licenses before any image bytes are downloaded.
        text_blob = title + " " + re.sub(r"<[^>]+>", " ", description).casefold()
        if normalized_artist not in text_blob:
            continue
        license_name = str(ext.get("LicenseShortName", {}).get("value") or "")
        if not license_is_reusable(license_name):
            continue
        image_url = info.get("thumburl") or info.get("url")
        source_page = info.get("descriptionurl")
        if not image_url or not source_page or not (
            is_safe_wikimedia_url(image_url)
            and is_safe_wikimedia_url(source_page)
        ):
            continue
        return {
            "artist_qid": "commons-search",
            "image_url": image_url,
            "content_type": None,
            "source_url": info.get("url") or image_url,
            "source_page_url": source_page,
            "license": license_name,
            "credit": (
                ext.get("Artist", {}).get("value")
                or ext.get("Credit", {}).get("value")
                or ""
            ),
        }
    return None


async def find_reusable_artist_image(artist_name: str) -> dict | None:
    """Resolve a single exact-name Wikidata music-artist entity and a licensed Commons image.

    Ambiguous exact-name artist entities are rejected instead of guessing. Only Commons
    files with a known permissive license are returned, with source/credit metadata.
    """
    clean_name = " ".join(str(artist_name or "").split())
    if not clean_name:
        return None

    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(8.0),
        follow_redirects=True,
    ) as client:
        search_data = await _request_json(
            client, WIKIDATA_API,
            {
                "action": "wbsearchentities",
                "search": clean_name,
                "language": "en",
                "format": "json",
                "limit": 20,
            },
        )
        candidates = exact_artist_entity_candidates(clean_name, search_data.get("search") or [])
        if len(candidates) > 6:
            return None
        claims_by_entity: dict[str, dict] = {}
        for candidate in candidates:
            entity_data = await _request_json(
                client,
                (
                    "https://www.wikidata.org/wiki/Special:EntityData/"
                    f"{candidate['id']}.json"
                ),
                {},
            )
            entity = entity_data.get("entities", {}).get(candidate["id"], {})
            claims_by_entity[candidate["id"]] = entity.get("claims") or {}
        verified = verified_artist_entity_candidates(
            clean_name,
            candidates,
            claims_by_entity,
        )
        if len(verified) != 1:
            # Wikidata may have no artist photo or a missing MusicBrainz link.
            # Fall back to Commons title/description search, still requiring an
            # exact name hit and a known reusable license.
            return await _commons_search_for_artist_image(client, clean_name)

        candidate = verified[0]
        claims = claims_by_entity[candidate["id"]]
        mbid = musicbrainz_artist_id(claims)
        if not mbid or not await _verify_musicbrainz_link(
            client,
            clean_name,
            candidate["id"],
            mbid,
        ):
            return None
        image_value = claims["P18"][0].get("mainsnak", {}).get("datavalue", {}).get("value")
        if not isinstance(image_value, str) or not image_value:
            return None
        file_title = "File:" + image_value.replace(" ", "_")
        commons_data = await _request_json(
            client, COMMONS_API,
            {
                "action": "query",
                "titles": file_title,
                "prop": "imageinfo",
                "iiprop": "url|extmetadata",
                "iiurlwidth": 1200,
                "format": "json",
            },
        )
        pages = commons_data.get("query", {}).get("pages", {})
        page = next(iter(pages.values()), {})
        image_info = (page.get("imageinfo") or [{}])[0]
        ext = image_info.get("extmetadata") or {}
        license_name = ext.get("LicenseShortName", {}).get("value", "")
        if not license_is_reusable(license_name):
            return None
        image_url = image_info.get("thumburl") or image_info.get("url")
        source_page = image_info.get("descriptionurl")
        if (
            not image_url
            or not source_page
            or not is_safe_wikimedia_url(image_url)
            or not is_safe_wikimedia_url(source_page)
        ):
            return None
        return {
            "artist_qid": candidate["id"],
            "image_url": image_url,
            "content_type": None,
            "source_url": image_info.get("url") or image_url,
            "source_page_url": source_page,
            "license": license_name,
            "credit": (
                ext.get("Artist", {}).get("value")
                or ext.get("Credit", {}).get("value")
                or ""
            ),
        }


async def _stream_commons_image_to_b2(
    image_url: str, b2_client, bucket: str, object_key: str
) -> str:
    """Fetch Commons artwork boundedly, validate it, and commit to B2 multipart."""
    if not is_safe_wikimedia_url(image_url):
        raise ValueError("Untrusted Wikimedia image URL")
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(20.0),
        follow_redirects=False,
    ) as client:
        async with client.stream("GET", image_url) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type not in {"image/jpeg", "image/png", "image/webp"}:
                raise ValueError("Unsupported image MIME type")
            declared_length = response.headers.get("content-length")
            if declared_length and int(declared_length) > MAX_ART_BYTES:
                raise ValueError("Artwork exceeds size limit")
            buffer = bytearray()
            async for chunk in response.aiter_bytes(64 * 1024):
                buffer.extend(chunk)
                if len(buffer) > MAX_ART_BYTES:
                    raise ValueError("Artwork exceeds size limit")
            if not buffer or not image_bytes_match_mime(buffer, content_type):
                raise ValueError("Image bytes do not match MIME type")
            started = await asyncio.to_thread(
                b2_client.create_multipart_upload,
                Bucket=bucket, Key=object_key, ContentType=content_type,
                CacheControl="public, max-age=2592000",
            )
            upload_id = started["UploadId"]
            try:
                part = await asyncio.to_thread(
                    b2_client.upload_part,
                    Bucket=bucket, Key=object_key, UploadId=upload_id,
                    PartNumber=1, Body=buffer,
                )
                await asyncio.to_thread(
                    b2_client.complete_multipart_upload,
                    Bucket=bucket, Key=object_key, UploadId=upload_id,
                    MultipartUpload={"Parts": [{"PartNumber": 1, "ETag": part["ETag"]}]},
                )
            except Exception:
                try:
                    await asyncio.to_thread(
                        b2_client.abort_multipart_upload,
                        Bucket=bucket, Key=object_key, UploadId=upload_id,
                    )
                except Exception:
                    pass
                raise
            return content_type


async def fetch_and_store_artist_artwork(profile_id: UUID | str) -> None:
    job_key = str(profile_id)
    if job_key in _active_artist_jobs:
        return
    if _artist_artwork_retry_after.get(job_key, 0) > time.monotonic():
        return
    _active_artist_jobs.add(job_key)
    try:
        factory = get_session_factory()
        async with factory() as session:
            profile = await session.get(ArtistProfile, profile_id)
            if not profile or profile.artwork_object_key:
                return
            artist_name = profile.name
            profile.artwork_status = "fetching"
            profile.artwork_lease_until = datetime.now(UTC) + timedelta(minutes=10)
            await session.commit()

        try:
            candidate = await find_reusable_artist_image(artist_name)
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            async with factory() as session:
                profile = await session.get(ArtistProfile, profile_id)
                if profile:
                    profile.artwork_status = "failed"
                    profile.artwork_attempts += 1
                    retry_days = min(30, 2 ** min(profile.artwork_attempts, 5))
                    profile.artwork_next_retry_at = (
                        datetime.now(UTC) + timedelta(days=retry_days)
                    )
                    profile.artwork_lease_until = None
                    await session.commit()
            _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
            return
        if not candidate:
            async with factory() as session:
                profile = await session.get(ArtistProfile, profile_id)
                if profile:
                    profile.artwork_status = "missing"
                    profile.artwork_next_retry_at = datetime.now(UTC) + timedelta(days=14)
                    profile.artwork_lease_until = None
                    await session.commit()
            _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
            return

        settings = get_settings()
        if not settings.b2_bucket_name:
            async with factory() as session:
                profile = await session.get(ArtistProfile, profile_id)
                if profile:
                    profile.artwork_status = "failed"
                    profile.artwork_attempts += 1
                    profile.artwork_next_retry_at = datetime.now(UTC) + timedelta(days=1)
                    profile.artwork_lease_until = None
                    await session.commit()
            _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
            return
        object_key = f"artist-artwork/{profile_id}/{candidate['artist_qid']}"
        async with factory() as session:
            profile = await session.get(ArtistProfile, profile_id)
            if profile:
                # Persist verified source and attribution before showing the temporary
                # image or starting the B2 upload, so the UI can credit it immediately.
                profile.artwork_status = "uploading"
                # Use the thumbnail URL for immediate display; keep the full source URL for attribution.
                profile.artwork_temporary_url = candidate["image_url"]
                profile.artwork_artist_qid = candidate["artist_qid"]
                profile.artwork_source_url = candidate["source_url"]
                profile.artwork_source_page_url = candidate["source_page_url"]
                profile.artwork_license = candidate["license"]
                profile.artwork_credit = candidate["credit"]
                profile.artwork_lease_until = datetime.now(UTC) + timedelta(minutes=10)
                await session.commit()
        from .b2 import get_b2_s3_client

        b2_client = get_b2_s3_client()
        await _stream_commons_image_to_b2(
            candidate["image_url"],
            b2_client,
            settings.b2_bucket_name,
            object_key,
        )

        async with factory() as session:
            profile = await session.get(ArtistProfile, profile_id)
            if not profile or profile.artwork_object_key:
                return
            profile.artwork_object_key = object_key
            profile.has_profile_picture = True
            profile.artwork_status = "ready"
            profile.artwork_temporary_url = None
            profile.artwork_next_retry_at = None
            profile.artwork_lease_until = None
            profile.artwork_artist_qid = candidate["artist_qid"]
            profile.artwork_source_url = candidate["source_url"]
            profile.artwork_source_page_url = candidate["source_page_url"]
            profile.artwork_license = candidate["license"]
            profile.artwork_credit = candidate["credit"]
            await session.commit()
            _artist_artwork_retry_after.pop(job_key, None)
            if len(_artist_artwork_retry_after) > 1000:
                _artist_artwork_retry_after.clear()
    except Exception as exc:
        try:
            async with get_session_factory()() as session:
                profile = await session.get(ArtistProfile, profile_id)
                if profile and not profile.artwork_object_key:
                    profile.artwork_status = "failed"
                    profile.artwork_attempts = (profile.artwork_attempts or 0) + 1
                    retry_days = min(30, 2 ** min(profile.artwork_attempts, 5))
                    profile.artwork_next_retry_at = (
                        datetime.now(UTC) + timedelta(days=retry_days)
                    )
                    profile.artwork_lease_until = None
                    await session.commit()
        except Exception:
            pass
        # Artwork is optional. Provider or storage failures do not break artist pages.
        _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
        print(
            "[artist-artwork] fetch/store failed for "
            f"{profile_id}: {type(exc).__name__}"
        )
    finally:
        _active_artist_jobs.discard(job_key)

async def enqueue_artist_artwork(profile_id: UUID | str) -> bool:
    """Persist an artwork request while deduplicating queued or active work."""
    async with get_session_factory()() as session:
        profile = await session.get(ArtistProfile, profile_id)
        if not profile or profile.artwork_object_key:
            return False
        now = datetime.now(UTC)
        active_status = profile.artwork_status in {
            "queued", "fetching", "verifying", "uploading"
        }
        if active_status and profile.artwork_lease_until and profile.artwork_lease_until > now:
            return False
        if profile.artwork_next_retry_at and profile.artwork_next_retry_at > now:
            return False
        profile.artwork_status = "queued"
        profile.artwork_lease_until = None
        await session.commit()
        _artist_artwork_queue_event.set()
        return True


async def run_artist_artwork_worker() -> None:
    """Low-duty-cycle artwork queue with small backfill batches."""
    factory = get_session_factory()
    backfill_at = datetime.now(UTC)
    while True:
        _artist_artwork_queue_event.clear()
        now = datetime.now(UTC)
        try:
            if now >= backfill_at:
                async with factory() as session:
                    result = await session.execute(
                        select(ArtistProfile.id).where(
                            ArtistProfile.artwork_object_key.is_(None),
                            (
                                ArtistProfile.artwork_status.in_(["missing", "failed"])
                                | (
                                    ArtistProfile.artwork_status.in_(["fetching", "uploading"])
                                    & (
                                        ArtistProfile.artwork_lease_until.is_(None)
                                        | (ArtistProfile.artwork_lease_until <= now)
                                    )
                                )
                            ),
                            (
                                ArtistProfile.artwork_next_retry_at.is_(None)
                                | (ArtistProfile.artwork_next_retry_at <= now)
                            ),
                        ).order_by(
                            ArtistProfile.updated_at.asc()
                        ).limit(8)
                    )
                    batch = list(result.scalars())
                for aid in batch:
                    await enqueue_artist_artwork(aid)
                backfill_at = now + timedelta(minutes=10)
            async with factory() as session:
                result = await session.execute(
                    select(ArtistProfile)
                    .where(
                        ArtistProfile.artwork_object_key.is_(None),
                        ArtistProfile.artwork_status == "queued",
                    )
                    # On-demand requests update the profile timestamp; newest queued
                    # requests outrank idle catalog backfill work.
                    .order_by(ArtistProfile.updated_at.desc())
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                claimed = result.scalar_one_or_none()
                job_id = claimed.id if claimed else None
                if claimed:
                    # Claim under a row lock and persist a lease before releasing it;
                    # another worker replica cannot process this queued row at once.
                    claimed.artwork_status = "fetching"
                    claimed.artwork_lease_until = now + timedelta(minutes=10)
                    await session.commit()
            if job_id:
                await fetch_and_store_artist_artwork(job_id)
                try:
                    await asyncio.wait_for(_artist_artwork_queue_event.wait(), timeout=2)
                except TimeoutError:
                    pass
            else:
                try:
                    await asyncio.wait_for(_artist_artwork_queue_event.wait(), timeout=60)
                except TimeoutError:
                    pass
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(120)
