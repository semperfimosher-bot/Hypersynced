"""Keep expensive uploads, exports and slow media consumers within fixed budgets."""

import asyncio
import urllib.parse

import starlette.responses
import starlette.types


BUSY_DETAIL = "Media processing is busy. Please retry shortly."
RETRY_AFTER_SECONDS = "1"


class MemoryAdmissionMiddleware:
    def __init__(
        self,
        app: starlette.types.ASGIApp,
        *,
        upload_limit: int = 1,
        stream_limit: int = 4,
        artwork_limit: int = 1,
        catalog_limit: int = 1,
        admission_timeout_seconds: float = 5.0,
    ) -> None:
        if min(upload_limit, stream_limit, artwork_limit, catalog_limit) < 1:
            raise ValueError("Memory admission limits must be positive")
        if admission_timeout_seconds <= 0:
            raise ValueError("Media admission timeout must be positive")

        self.app = app
        self.admission_timeout_seconds = admission_timeout_seconds
        self._uploads = asyncio.Semaphore(upload_limit)
        self._streams = asyncio.Semaphore(stream_limit)
        self._artwork = asyncio.Semaphore(artwork_limit)
        self._catalog = asyncio.Semaphore(catalog_limit)

    def _permit(self, scope: starlette.types.Scope) -> asyncio.Semaphore | None:
        path = scope.get("path", "")
        method = scope.get("method", "")
        if method == "POST" and path.rstrip("/") in {
            "/api/admin/tracks/upload",
            "/api/admin/tracks/upload/finalize",
            "/api/admin/tracks/backfill-metadata",
        }:
            return self._uploads

        if method in {"GET", "HEAD"}:
            if path.startswith("/api/audio/"):
                return self._streams
            if (
                path.startswith("/api/catalog/tracks/")
                and path.endswith("/artwork")
            ):
                return self._artwork
            if path.rstrip("/") == "/api/catalog/tracks":
                query = urllib.parse.parse_qs(
                    scope.get("query_string", b""),
                    keep_blank_values=True,
                )
                if b"page_size" not in query and b"cursor" not in query:
                    return self._catalog
        return None

    async def _reject(self, scope: types.Scope, receive: starlette.types.Receive, send: starlette.types.Send) -> None:
        await starlette.responses.JSONResponse(
            {"detail": BUSY_DETAIL},
            status_code=503,
            headers={"Retry-After": RETRY_AFTER_SECONDS},
        )(scope, receive, send)

    async def __call__(self, scope: types.Scope, receive: types.Receive, send: types.Send) -> None:
        permit = self._permit(scope) if scope["type"] == "http" else None
        if permit is None:
            await self.app(scope, receive, send)
            return

        # Never queue uploads: waiting requests may already hold large bodies.
        # Media reads and catalog exports get a short bounded queue so a burst
        # of browser range/artwork requests does not become an immediate 503.
        is_upload = permit is self._uploads
        if is_upload:
            if permit.locked():
                await self._reject(scope, receive, send)
                return
            await permit.acquire()
        else:
            try:
                await asyncio.wait_for(
                    permit.acquire(),
                    timeout=self.admission_timeout_seconds,
                )
            except TimeoutError:
                await self._reject(scope, receive, send)
                return

        try:
            # Keep the permit for the complete stream, including disconnect cleanup.
            await self.app(scope, receive, send)
        finally:
            permit.release()
