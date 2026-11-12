import asyncio

import pytest

from backend.app.middleware.memory_admission import MemoryAdmissionMiddleware


def make_scope(path: str, method: str = "GET", query: bytes = b"") -> dict:
    return {
        "type": "http",
        "path": path,
        "method": method,
        "query_string": query,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/audio/song",
        "/api/catalog/tracks/song/artwork",
        "/api/catalog/tracks",
    ],
)
async def test_media_and_catalog_requests_wait_briefly_for_capacity(path):
    first_started = asyncio.Event()
    release_first = asyncio.Event()
    second_started = asyncio.Event()
    calls = 0

    async def app(scope, receive, send):
        nonlocal calls
        calls += 1
        if calls == 1:
            first_started.set()
            await release_first.wait()
        else:
            second_started.set()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    first_status, second_status = [], []

    async def send_first(message):
        if message["type"] == "http.response.start":
            first_status.append(message["status"])

    async def send_second(message):
        if message["type"] == "http.response.start":
            second_status.append(message["status"])

    middleware = MemoryAdmissionMiddleware(
        app,
        upload_limit=1,
        stream_limit=1,
        artwork_limit=1,
        catalog_limit=1,
        admission_timeout_seconds=0.5,
    )
    scope = make_scope(path)
    first = asyncio.create_task(middleware(scope, receive, send_first))
    await first_started.wait()
    second = asyncio.create_task(middleware(scope, receive, send_second))
    await asyncio.sleep(0)
    assert not second_started.is_set()

    release_first.set()
    await asyncio.gather(first, second)
    assert first_status == [200]
    assert second_status == [200]
    assert second_started.is_set()


@pytest.mark.asyncio
async def test_artwork_has_its_own_budget_and_cannot_block_audio():
    audio_started = asyncio.Event()
    release_audio = asyncio.Event()
    artwork_started = asyncio.Event()

    async def app(scope, receive, send):
        if scope["path"].startswith("/api/audio/"):
            audio_started.set()
            await release_audio.wait()
        else:
            artwork_started.set()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        pass

    middleware = MemoryAdmissionMiddleware(
        app,
        stream_limit=1,
        artwork_limit=1,
        admission_timeout_seconds=0.1,
    )
    audio = asyncio.create_task(
        middleware(make_scope("/api/audio/song"), receive, send)
    )
    await audio_started.wait()
    await middleware(
        make_scope("/api/catalog/tracks/song/artwork"),
        receive,
        send,
    )
    assert artwork_started.is_set()
    release_audio.set()
    await audio


@pytest.mark.asyncio
async def test_uploads_still_reject_immediately_without_reading_body():
    entered = asyncio.Event()
    release_upload = asyncio.Event()
    reads = 0

    async def app(scope, receive, send):
        entered.set()
        await release_upload.wait()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        nonlocal reads
        reads += 1
        return {"type": "http.request", "body": b"upload"}

    responses = []

    async def send_first(message):
        pass

    async def send_second(message):
        responses.append(message)

    middleware = MemoryAdmissionMiddleware(app, upload_limit=1)
    scope = make_scope("/api/admin/tracks/upload", method="POST")
    first = asyncio.create_task(middleware(scope, receive, send_first))
    await entered.wait()
    await middleware(scope, receive, send_second)
    assert responses[0]["status"] == 503
    assert (b"retry-after", b"1") in responses[0]["headers"]
    assert reads == 0
    release_upload.set()
    await first


@pytest.mark.asyncio
async def test_media_wait_timeout_returns_retryable_503_and_releases_cleanly():
    entered = asyncio.Event()
    release = asyncio.Event()

    async def app(scope, receive, send):
        entered.set()
        await release.wait()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def receive():
        raise AssertionError("No request body should be read")

    async def send(message):
        pass

    rejected = []

    async def send_rejected(message):
        rejected.append(message)

    middleware = MemoryAdmissionMiddleware(
        app,
        stream_limit=1,
        admission_timeout_seconds=0.01,
    )
    scope = make_scope("/api/audio/song")
    first = asyncio.create_task(middleware(scope, receive, send))
    await entered.wait()
    await middleware(scope, receive, send_rejected)
    assert rejected[0]["status"] == 503
    assert (b"retry-after", b"1") in rejected[0]["headers"]

    release.set()
    await first
    await middleware(scope, receive, send)


@pytest.mark.asyncio
async def test_cancel_releases_permit_and_paged_catalog_does_not_use_export_slot():
    entered = asyncio.Event()

    async def app(scope, receive, send):
        entered.set()
        await asyncio.Event().wait()

    async def receive():
        raise AssertionError("No body read expected")

    async def send(message):
        raise AssertionError("No rejection expected")

    middleware = MemoryAdmissionMiddleware(
        app,
        upload_limit=1,
        stream_limit=1,
        artwork_limit=1,
        catalog_limit=1,
    )
    scope = make_scope("/api/catalog/tracks")
    task = asyncio.create_task(middleware(scope, receive, send))
    await entered.wait()
    assert middleware._catalog.locked()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not middleware._catalog.locked()
    for query in [b"page_size=250", b"cursor=abc", b"page%5fsize=250"]:
        paged_scope = make_scope("/api/catalog/tracks", query=query)
        assert middleware._permit(paged_scope) is None


@pytest.mark.parametrize("limit", [0, -1])
def test_invalid_limit_rejected(limit):
    async def app(scope, receive, send):
        pass

    with pytest.raises(ValueError):
        MemoryAdmissionMiddleware(app, upload_limit=limit)
