from __future__ import annotations

import asyncio
import re
import time
from urllib.parse import urlsplit
from uuid import UUID

import httpx

from ..config import get_settings
from ..database import get_session_factory
from ..models.artist import ArtistProfile


WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "HyperSynced/1.0 (artist artwork attribution; https://hypersynced.app)"
MAX_ART_BYTES = 4 * 1024 * 1024
ARTIST_TYPES = {"Q639669", "Q215380", "Q2088357", "Q483501"}
ALLOWED_LICENSES = {
    "cc0", "cc-by", "cc-by-sa", "cc-by-3.0", "cc-by-4.0",
    "cc-by-sa-3.0", "cc-by-sa-4.0", "public domain", "public domain mark", "pd",
}
_active_artist_jobs: set[str] = set()
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


def image_bytes_match_mime(content: bytes, content_type: str) -> bool:
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
            return None

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
        content = bytearray()
        async with client.stream("GET", image_url) as image_response:
            image_response.raise_for_status()
            content_type = image_response.headers.get("content-type", "").split(";", 1)[0].lower()
            if content_type not in {"image/jpeg", "image/png", "image/webp"}:
                return None
            content_length = image_response.headers.get("content-length")
            if content_length and int(content_length) > MAX_ART_BYTES:
                return None
            async for chunk in image_response.aiter_bytes():
                content.extend(chunk)
                if len(content) > MAX_ART_BYTES:
                    return None
        if not image_bytes_match_mime(bytes(content), content_type):
            return None
        if not content:
            return None
        return {
            "artist_qid": candidate["id"],
            "image_bytes": bytes(content),
            "content_type": content_type,
            "source_url": image_info.get("url") or image_url,
            "source_page_url": source_page,
            "license": license_name,
            "credit": (
                ext.get("Artist", {}).get("value")
                or ext.get("Credit", {}).get("value")
                or ""
            ),
        }


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

        try:
            candidate = await find_reusable_artist_image(artist_name)
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
            return
        if not candidate:
            _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
            return

        settings = get_settings()
        if not settings.b2_bucket_name:
            _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
            return
        object_key = f"artist-artwork/{profile_id}/{candidate['artist_qid']}"
        from .b2 import get_b2_s3_client

        await asyncio.to_thread(
            get_b2_s3_client().put_object,
            Bucket=settings.b2_bucket_name,
            Key=object_key,
            Body=candidate["image_bytes"],
            ContentType=candidate["content_type"],
            CacheControl="public, max-age=2592000",
        )

        async with factory() as session:
            profile = await session.get(ArtistProfile, profile_id)
            if not profile or profile.artwork_object_key:
                return
            profile.artwork_object_key = object_key
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
        # Artwork is optional. Provider or storage failures do not break artist pages.
        _artist_artwork_retry_after[job_key] = time.monotonic() + 6 * 60 * 60
        print(
            "[artist-artwork] fetch/store failed for "
            f"{profile_id}: {type(exc).__name__}"
        )
    finally:
        _active_artist_jobs.discard(job_key)
