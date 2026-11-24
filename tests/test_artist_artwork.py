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

    assert verified_artist_entity_candidates("Sample Artist", search_results, claims) == []


def test_artist_image_source_urls_must_be_wikimedia_https() -> None:
    assert is_safe_wikimedia_url("https://upload.wikimedia.org/example.jpg")
    assert is_safe_wikimedia_url("https://commons.wikimedia.org/wiki/File:Example.jpg")
    assert not is_safe_wikimedia_url("http://upload.wikimedia.org/example.jpg")
    assert not is_safe_wikimedia_url("https://example.com/image.jpg")
    assert not is_safe_wikimedia_url("https://commons.wikimedia.org@evil.example/image.jpg")


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
                                    "thumburl": "https://upload.wikimedia.org/artist.jpg",
                                    "url": "https://upload.wikimedia.org/full.jpg",
                                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Artist.jpg",
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
            yield b"\\xff\\xd8\\xffsample"

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
    assert result["image_bytes"] == b"\\xff\\xd8\\xffsample"
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
                            "P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q215380"}}}}],
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
