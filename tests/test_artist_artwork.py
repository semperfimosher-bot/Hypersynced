from backend.app.services.artist_artwork import (
    exact_artist_entity_candidates,
    has_artist_entity_type,
    is_safe_wikimedia_url,
    license_is_reusable,
    verified_artist_entity_candidates,
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
        "Q1": {"P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q639669"}}}}], "P18": [{}]},
        "Q2": {"P31": [{"mainsnak": {"datavalue": {"value": {"id": "Q215380"}}}}], "P18": [{}]},
    }

    assert verified_artist_entity_candidates("Sample Artist", search_results, claims) == []


def test_artist_image_source_urls_must_be_wikimedia_https() -> None:
    assert is_safe_wikimedia_url("https://upload.wikimedia.org/example.jpg")
    assert is_safe_wikimedia_url("https://commons.wikimedia.org/wiki/File:Example.jpg")
    assert not is_safe_wikimedia_url("http://upload.wikimedia.org/example.jpg")
    assert not is_safe_wikimedia_url("https://example.com/image.jpg")
    assert not is_safe_wikimedia_url("https://commons.wikimedia.org@evil.example/image.jpg")
