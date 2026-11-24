import pytest

from backend.app.services.artist_artwork import (
    exact_artist_entity_candidates,
    has_artist_entity_type,
    is_safe_wikimedia_url,
    license_is_reusable,
    musicbrainz_identity_matches,
    musicbrainz_artist_id,
    verified_artist_entity_candidates,
    wikidata_qid_from_musicbrainz_relations,
)


def test_artist_lookup_accepts_only_exact_normalized_artist_names() -> None:
    results = [
        {"id": "Q1", "label": "The Example"},
        {"id": "Q2", "label": "The Example Band"},
        {"id": "Q3", "label": "the example"},
        {"id": "Q4", "label": "The Example ",},
        {"label": "The Example"},
    ]

    candidates = exact_artist_entity_candidates("  THE Example ", results)

    assert [item["id"] for item in candidates] == ["Q1", "Q3", "Q4"]


def test_artist_entity_must_have_a_musical_artist_or_group_type() -> None:
    artist_claims = {
        "P31": [
            {"mainsnak": {"datavalue": {"value": {"id": "Q639669"}}}},
        ],
    }
    group_claims = {
        "P31": [
            {"mainsnak": {"datavalue": {"value": {"id": "Q215380"}}}},
        ],
    }
    unrelated_claims = {
        "P31": [
            {"mainsnak": {"datavalue": {"value": {"id": "Q5"}}}},
        ],
    }

    assert has_artist_entity_type(artist_claims)
    assert has_artist_entity_type(group_claims)
    assert not has_artist_entity_type(unrelated_claims)
    assert not has_artist_entity_type({})


def test_artist_image_requires_reusable_license() -> None:
    assert license_is_reusable("CC BY-SA 4.0")
    assert license_is_reusable("CC BY 4.0")
    assert license_is_reusable("CC0")
    assert license_is_reusable("Public domain")
    assert not license_is_reusable("All rights reserved")
    assert not license_is_reusable("CC BY-NC 4.0")
    assert not license_is_reusable("Unknown")


def test_image_bytes_must_match_declared_image_format() -> None:
    from backend.app.services.artist_artwork import image_bytes_match_mime

    assert image_bytes_match_mime(b"\xff\xd8\xffsample", "image/jpeg")
    assert image_bytes_match_mime(b"\x89PNG\r\n\x1a\nsample", "image/png")
    assert image_bytes_match_mime(b"RIFFxxxxWEBPsample", "image/webp")
    assert not image_bytes_match_mime(b"not an image", "image/jpeg")
    assert not image_bytes_match_mime(b"\xff\xd8\xffsample", "image/png")


def test_candidate_selection_rejects_ambiguous_exact_artist_matches() -> None:
    search_results = [
        {"id": "Q1", "label": "Sample Artist"},
        {"id": "Q2", "label": "Sample Artist"},
    ]
    claims = {
        "Q1": {
            "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q639669"}}}}],
            "P18": [{}],
            "P434": [{"mainsnak": {"datavalue": {"value": "mbid-q1"}}}],
        },
        "Q2": {
            "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q215380"}}}}],
            "P18": [{}],
            "P434": [{"mainsnak": {"datavalue": {"value": "mbid-q2"}}}],
        },
    }

    assert (
        verified_artist_entity_candidates(
            "Sample Artist",
            search_results,
            claims,
        )
        == []
    )


def test_artist_image_source_urls_must_be_wikimedia_https() -> None:
    assert is_safe_wikimedia_url("https://upload.wikimedia.org/example.jpg")
    assert is_safe_wikimedia_url("https://commons.wikimedia.org/wiki/File:Example.jpg")
    assert not is_safe_wikimedia_url("http://upload.wikimedia.org/example.jpg")
    assert not is_safe_wikimedia_url("https://example.com/image.jpg")
    assert not is_safe_wikimedia_url(
        "https://commons.wikimedia.org@evil.example/image.jpg",
    )


def test_artist_identity_requires_matching_musicbrainz_and_wikidata_link() -> None:
    artist_claims = {
        "P434": [{"mainsnak": {"datavalue": {"value": "mbid-123"}}}],
    }
    mb_response = {
        "name": "Sample Artist",
        "type": "Person",
        "relations": [
            {
                "type": "wikidata",
                "url": {"resource": "https://www.wikidata.org/wiki/Q123"},
            },
        ],
    }

    assert musicbrainz_artist_id(artist_claims) == "mbid-123"
    assert wikidata_qid_from_musicbrainz_relations(mb_response) == "Q123"
    assert musicbrainz_identity_matches("sample artist", "Q123", mb_response)
    assert not musicbrainz_identity_matches("Other Artist", "Q123", mb_response)
    assert not musicbrainz_identity_matches("Sample Artist", "Q999", mb_response)
    assert not musicbrainz_identity_matches(
        "Sample Artist",
        "Q123",
        {"name": "Sample Artist", "type": "Person", "relations": []},
    )


def test_verified_entity_candidate_requires_external_musicbrainz_id() -> None:
    results = [{"id": "Q123", "label": "Verified Artist"}]
    claims_without_id = {
        "Q123": {
            "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q639669"}}}}],
            "P18": [{}],
        },
    }
    claims_with_id = {
        "Q123": {
            **claims_without_id["Q123"],
            "P434": [{"mainsnak": {"datavalue": {"value": "mbid-verified"}}}],
        },
    }

    assert verified_artist_entity_candidates(
        "Verified Artist", results, claims_without_id,
    ) == []
    assert verified_artist_entity_candidates(
        "Verified Artist", results, claims_with_id,
    ) == results



@pytest.mark.asyncio
async def test_artist_image_fetch_pipeline_verifies_identity_and_attribution(
    monkeypatch,
) -> None:
    from backend.app.services import artist_artwork

    calls: list[str] = []
    claims = {
        "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q215380"}}}}],
        "P18": [{"mainsnak": {"datavalue": {"value": "Artist portrait.jpg"}}}],
        "P434": [{"mainsnak": {"datavalue": {"value": "mbid-artist-1"}}}],
    }

    async def fake_request_json(client, url, params):
        calls.append(url)
        if url == artist_artwork.WIKIDATA_API:
            return {"search": [{"id": "Q100", "label": "Correct Artist"}]}
        if "Special:EntityData/Q100" in url:
            return {"entities": {"Q100": {"claims": claims}}}
        if "musicbrainz.org" in url:
            return {
                "name": "Correct Artist",
                "type": "Group",
                "relations": [
                    {
                        "type": "wikidata",
                        "url": {"resource": "https://www.wikidata.org/wiki/Q100"},
                    },
                ],
            }
        if url == artist_artwork.COMMONS_API:
            return {
                "query": {
                    "pages": {
                        "1": {
                            "imageinfo": [
                                {
                                    "thumburl": (
                                        "https://upload.wikimedia.org/artist.jpg"
                                    ),
                                    "url": "https://upload.wikimedia.org/full.jpg",
                                    "descriptionurl": (
                                        "https://commons.wikimedia.org/wiki/File:Artist.jpg"
                                    ),
                                    "extmetadata": {
                                        "LicenseShortName": {"value": "CC BY-SA 4.0"},
                                        "Artist": {"value": "Photographer"},
                                    },
                                },
                            ],
                        },
                    },
                },
            }
        raise AssertionError(f"Unexpected request URL: {url}")

    class FakeImageResponse:
        headers = {"content-type": "image/jpeg", "content-length": "9"}

        def raise_for_status(self):
            return None

        async def aiter_bytes(self):
            yield b"\xff\xd8\xffsample"

    class FakeStream:
        async def __aenter__(self):
            return FakeImageResponse()

        async def __aexit__(self, exc_type, exc, tb):
            return False

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        def stream(self, method, url):
            calls.append(url)
            return FakeStream()

    monkeypatch.setattr(artist_artwork, "_request_json", fake_request_json)
    monkeypatch.setattr(artist_artwork.httpx, "AsyncClient", FakeClient)

    result = await artist_artwork.find_reusable_artist_image("Correct Artist")

    assert result is not None
    assert result["artist_qid"] == "Q100"
    assert result["content_type"] == "image/jpeg"
    assert result["image_bytes"] == b"\xff\xd8\xffsample"
    assert result["license"] == "CC BY-SA 4.0"
    assert result["credit"] == "Photographer"
    assert result["source_page_url"].startswith("https://commons.wikimedia.org/")
    assert any("musicbrainz.org" in call for call in calls)


@pytest.mark.asyncio
async def test_artist_image_fetch_pipeline_rejects_ambiguous_identity(
    monkeypatch,
) -> None:
    from backend.app.services import artist_artwork

    async def fake_request_json(client, url, params):
        if url == artist_artwork.WIKIDATA_API:
            return {
                "search": [
                    {"id": "Q100", "label": "Same Name Artist"},
                    {"id": "Q200", "label": "Same Name Artist"},
                ],
            }
        if "Special:EntityData" in url:
            return {
                "entities": {
                    url.split("/")[-1].removesuffix(".json"): {
                        "claims": {
                            "P31": [
                                {
                                    "mainsnak": {
                                        "datavalue": {
                                            "value": {"id": "Q215380"},
                                        },
                                    },
                                },
                            ],
                            "P18": [{}],
                            "P434": [{"mainsnak": {"datavalue": {"value": "mbid"}}}],
                        },
                    },
                },
            }
        raise AssertionError("Ambiguous match must stop before other providers.")

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(artist_artwork, "_request_json", fake_request_json)
    monkeypatch.setattr(artist_artwork.httpx, "AsyncClient", FakeClient)

    assert await artist_artwork.find_reusable_artist_image("Same Name Artist") is None



@pytest.mark.asyncio
async def test_artist_artwork_worker_uploads_and_persists_verified_metadata(
    monkeypatch,
) -> None:
    import uuid

    from backend.app.services import artist_artwork

    profile_id = uuid.uuid4()
    job_key = str(profile_id)
    artist_artwork._active_artist_jobs.discard(job_key)
    artist_artwork._artist_artwork_retry_after.pop(job_key, None)
    profile = type(
        "Profile",
        (),
        {
            "id": profile_id,
            "name": "Verified Artist",
            "artwork_object_key": None,
            "artwork_artist_qid": None,
            "artwork_source_url": None,
            "artwork_source_page_url": None,
            "artwork_license": None,
            "artwork_credit": None,
        },
    )()
    session_calls = 0
    commit_count = 0
    find_calls = 0
    b2_client_calls = 0
    thread_calls = 0
    stage = "initial"
    uploaded: dict = {}

    class FakeSession:
        async def __aenter__(self):
            nonlocal stage
            stage = "session-enter"
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, model, requested_id):
            nonlocal stage
            stage = "session-get"
            assert requested_id == profile_id
            return profile

        async def commit(self):
            nonlocal commit_count
            commit_count += 1

    def session_factory():
        nonlocal session_calls, stage
        session_calls += 1
        stage = "session-factory"
        return FakeSession()

    class FakeB2Client:
        def put_object(self, **kwargs):
            uploaded.update(kwargs)

    candidate = {
        "artist_qid": "Q100",
        "image_bytes": b"verified-image",
        "content_type": "image/jpeg",
        "source_url": "https://upload.wikimedia.org/source.jpg",
        "source_page_url": "https://commons.wikimedia.org/wiki/File:Source.jpg",
        "license": "CC BY-SA 4.0",
        "credit": "Image Author",
    }

    async def fake_find_image(name):
        nonlocal find_calls, stage
        find_calls += 1
        stage = "provider"
        assert name == "Verified Artist"
        return candidate

    monkeypatch.setattr(artist_artwork, "get_session_factory", session_factory)
    monkeypatch.setattr(
        artist_artwork,
        "find_reusable_artist_image",
        fake_find_image,
    )
    def fake_settings():
        nonlocal stage
        stage = "settings"
        return type("Settings", (), {"b2_bucket_name": "test-bucket"})()

    monkeypatch.setattr(
        artist_artwork,
        "get_settings",
        fake_settings,
    )

    def fake_get_b2_client():
        nonlocal b2_client_calls, stage
        b2_client_calls += 1
        stage = "client"
        return FakeB2Client()

    monkeypatch.setattr(
        artist_artwork,
        "get_b2_s3_client",
        fake_get_b2_client,
    )

    thread_errors: list[str] = []

    async def fake_to_thread(func, *args, **kwargs):
        nonlocal thread_calls, stage
        thread_calls += 1
        stage = "thread"
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            thread_errors.append(f"{type(exc).__name__}: {exc}")
            raise

    monkeypatch.setattr(artist_artwork.asyncio, "to_thread", fake_to_thread)

    await artist_artwork.fetch_and_store_artist_artwork(profile_id)

    expected_key = f"artist-artwork/{profile_id}/Q100"
    assert find_calls == 1, f"worker stopped before provider lookup; stage={stage}"
    assert b2_client_calls == 1, f"worker stopped before B2 client; stage={stage}"
    assert thread_calls == 1, f"worker stopped before B2 upload; stage={stage}"
    assert not thread_errors, f"B2 upload failed in test double: {thread_errors}"
    assert session_calls == 2
    assert commit_count == 1
    assert uploaded["Bucket"] == "test-bucket"
    assert uploaded["Key"] == expected_key
    assert uploaded["Body"] == b"verified-image"
    assert uploaded["ContentType"] == "image/jpeg"
    assert profile.artwork_object_key == expected_key
    assert profile.artwork_artist_qid == "Q100"
    assert profile.artwork_source_url == candidate["source_url"]
    assert profile.artwork_source_page_url == candidate["source_page_url"]
    assert profile.artwork_license == candidate["license"]
    assert profile.artwork_credit == candidate["credit"]
