from types import SimpleNamespace
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

import backend.app.api.routes.audio as audio_route
from backend.app.api.routes.audio import safe_filename
from backend.app.main import app


@pytest.mark.asyncio
async def test_audio_streams_locally_when_b2_is_unavailable(
    monkeypatch,
    tmp_path,
) -> None:
    audio_file = tmp_path / "demo_track.wav"

    audio_file.write_bytes(b"RIFFdemo-audio-sample")

    track_id = uuid4()

    track = SimpleNamespace(
        id=track_id,
        title="Demo Track",
        mime_type="audio/wav",
        b2_object_key=str(audio_file),
        is_published=True,
    )

    class FakeResult:
        @staticmethod
        def scalar_one_or_none():
            return track

    class FakeSession:
        async def __aenter__(
            self,
        ):
            return self

        async def __aexit__(
            self,
            exc_type,
            exc,
            tb,
        ):
            return False

        async def execute(
            self,
            *args,
            **kwargs,
        ):
            return FakeResult()

    monkeypatch.setattr(
        ("backend.app.api.routes.audio.get_session_factory"),
        lambda: lambda: FakeSession(),
    )

    def raise_b2_error():
        raise RuntimeError("B2 is not configured")

    monkeypatch.setattr(
        audio_route,
        "get_settings",
        lambda: SimpleNamespace(b2_bucket_name="test-bucket"),
    )
    monkeypatch.setattr(
        audio_route,
        "get_b2_s3_client",
        raise_b2_error,
    )

    monkeypatch.setattr(
        (
            "backend.app.api.routes.audio."
            "resolve_local_audio_fallback"
        ),
        lambda _object_key: audio_file,
    )

    transport = ASGITransport(
        app=app,
    )

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/audio/{track_id}",
            headers={
                "Range": "bytes=0-10",
            },
        )

    assert response.status_code == 206

    assert response.headers["Content-Type"].startswith("audio/")

    assert response.content.startswith(b"RIFF")


@pytest.mark.asyncio
async def test_audio_uses_s3_range_reads_and_returns_partial_content(monkeypatch) -> None:
    track_id = uuid4()
    audio_bytes = b"0123456789"

    track = SimpleNamespace(
        id=track_id,
        title="Range Track",
        mime_type="audio/mpeg",
        b2_object_key="tracks/range-track.mp3",
        file_size=len(audio_bytes),
        is_published=True,
    )

    class FakeResult:
        @staticmethod
        def scalar_one_or_none():
            return track

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, *args, **kwargs):
            return FakeResult()

    class FakeBody:
        def __init__(self, data):
            self.data = data
            self.closed = False

        def read(self, size=-1):
            if not self.data:
                return b""
            chunk, self.data = self.data[:size], self.data[size:]
            return chunk

        def close(self):
            self.closed = True

    body = FakeBody(audio_bytes[2:6])
    calls = {}

    class FakeS3:
        def get_object(self, **kwargs):
            calls.update(kwargs)
            return {
                "Body": body,
                "ContentLength": 4,
                "ContentRange": "bytes 2-5/10",
            }

    monkeypatch.setattr(
        audio_route,
        "get_session_factory",
        lambda: lambda: FakeSession(),
    )
    monkeypatch.setattr(
        audio_route,
        "get_settings",
        lambda: SimpleNamespace(b2_bucket_name="test-bucket"),
    )
    monkeypatch.setattr(
        audio_route,
        "get_b2_s3_client",
        lambda: FakeS3(),
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/audio/{track_id}",
            headers={"Range": "bytes=2-5"},
        )

    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["Content-Range"] == "bytes 2-5/10"
    assert response.headers["Content-Length"] == "4"
    assert calls["Bucket"] == "test-bucket"
    assert calls["Key"] == "tracks/range-track.mp3"
    assert calls["Range"] == "bytes=2-5"
    assert body.closed


@pytest.mark.asyncio
async def test_invalid_audio_range_is_not_reported_as_storage_unavailable(monkeypatch) -> None:
    track_id = uuid4()
    track = SimpleNamespace(
        id=track_id,
        title="Range Track",
        mime_type="audio/mpeg",
        b2_object_key="tracks/range-track.mp3",
        file_size=10,
        is_published=True,
    )

    class FakeResult:
        @staticmethod
        def scalar_one_or_none():
            return track

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, *args, **kwargs):
            return FakeResult()

    class FakeS3:
        def get_object(self, **kwargs):
            raise AssertionError("Invalid ranges must be rejected before storage access")

    monkeypatch.setattr(
        audio_route,
        "get_session_factory",
        lambda: lambda: FakeSession(),
    )
    monkeypatch.setattr(
        audio_route,
        "get_settings",
        lambda: SimpleNamespace(b2_bucket_name="test-bucket"),
    )
    monkeypatch.setattr(
        audio_route,
        "get_b2_s3_client",
        lambda: FakeS3(),
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get(
            f"/api/audio/{track_id}",
            headers={"Range": "bytes=99-100"},
        )

    assert response.status_code == 416
    assert response.headers["Content-Range"] == "bytes */10"


def test_safe_filename_is_header_safe() -> None:
    filename = safe_filename(
        "Don’t Stop",
    )

    filename.encode(
        "latin-1",
    )

    assert filename == "Dont Stop.mp3"
