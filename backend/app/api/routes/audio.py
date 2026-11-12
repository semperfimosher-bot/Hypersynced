import asyncio
import logging
import unicodedata
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from starlette.types import Receive, Scope, Send

from ...config import get_settings
from ...database import get_session_factory
from ...models.media import Track
from ...services.b2 import get_b2_s3_client
from ...services.thread_work import run_blocking, run_blocking_resource

router = APIRouter(
    prefix="/audio",
    tags=["audio"],
)


STREAM_CHUNK_SIZE = 1024 * 1024
logger = logging.getLogger(__name__)


def close_s3_body(body) -> None:
    close = getattr(body, "close", None)
    if callable(close):
        close()


class S3StreamingResponse(StreamingResponse):
    def __init__(self, body, **kwargs):
        self.body = body
        self.stream = stream_s3_body(body)
        super().__init__(self.stream, **kwargs)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            try:
                await self.stream.aclose()
            finally:
                # Also close when the client disconnects before iteration starts.
                await run_blocking(close_s3_body, self.body)


def range_error(
    detail: str,
    file_size: int,
) -> HTTPException:
    return HTTPException(
        status_code=416,
        detail=detail,
        headers={
            "Content-Range": f"bytes */{file_size}",
        },
    )


def parse_range(
    range_header: str | None,
    file_size: int,
) -> tuple[int, int]:
    if file_size <= 0:
        raise range_error(
            "Cannot stream an empty file.",
            file_size,
        )

    if not range_header:
        return 0, file_size - 1

    if not range_header.startswith("bytes="):
        raise range_error(
            "Invalid range header.",
            file_size,
        )

    value = range_header.removeprefix("bytes=")

    if "," in value:
        raise range_error(
            "Multiple ranges are not supported.",
            file_size,
        )

    if "-" not in value:
        raise range_error(
            "Invalid range.",
            file_size,
        )

    start_text, end_text = value.split("-", 1)

    if not start_text and not end_text:
        raise range_error(
            "Invalid range.",
            file_size,
        )

    try:
        if not start_text:
            suffix_length = int(end_text)

            if suffix_length <= 0:
                raise range_error(
                    "Invalid range.",
                    file_size,
                )

            start = max(
                file_size - suffix_length,
                0,
            )
            end = file_size - 1

        else:
            start = int(start_text)

            if start < 0 or start >= file_size:
                raise range_error(
                    "Range is outside the file.",
                    file_size,
                )

            if end_text:
                end = int(end_text)

                if end < 0:
                    raise range_error(
                        "Invalid range.",
                        file_size,
                    )

                end = min(
                    end,
                    file_size - 1,
                )
            else:
                end = file_size - 1

    except ValueError as exc:
        raise range_error(
            "Invalid range.",
            file_size,
        ) from exc

    if start > end:
        raise range_error(
            "Invalid range.",
            file_size,
        )

    return start, end


def safe_filename(
    title: str,
) -> str:
    filename = title.strip()

    if not filename:
        filename = "audio"

    filename = filename.replace(
        "\\",
        "_",
    )

    filename = filename.replace(
        "/",
        "_",
    )

    filename = filename.replace(
        '"',
        "_",
    )

    filename = filename.replace(
        "\r",
        "_",
    )

    filename = filename.replace(
        "\n",
        "_",
    )

    filename = (
        unicodedata.normalize(
            "NFKD",
            filename,
        )
        .encode(
            "ascii",
            "ignore",
        )
        .decode(
            "ascii",
        )
        .strip()
    )

    if not filename:
        filename = "audio"

    return f"{filename}.mp3"


async def stream_s3_body(body):
    try:
        while True:
            chunk = await asyncio.to_thread(
                body.read,
                STREAM_CHUNK_SIZE,
            )
            if not chunk:
                break
            yield chunk
    finally:
        await run_blocking(close_s3_body, body)


def resolve_local_audio_fallback(
    object_key: str,
) -> Path | None:
    settings = get_settings()

    if settings.environment == "production":
        return None

    raw_path = Path(
        object_key,
    )

    if (
        raw_path.is_absolute()
        or ".." in raw_path.parts
    ):
        return None

    candidate = raw_path.resolve()

    demo_path = Path(
        settings.demo_audio_path,
    ).resolve()

    allowed_roots = [
        Path(
            settings.local_upload_root,
        ).resolve(),
        demo_path.parent,
    ]

    try:
        allowed = any(
            candidate.is_relative_to(
                root,
            )
            for root
            in allowed_roots
        )
    except ValueError:
        allowed = False

    if (
        allowed
        and candidate.exists()
        and candidate.is_file()
    ):
        return candidate

    return None


async def stream_local_file(
    file_path: Path,
    start: int,
    end: int,
):
    with file_path.open("rb") as source:
        source.seek(start)

        remaining = end - start + 1

        while remaining > 0:
            chunk = source.read(
                min(
                    STREAM_CHUNK_SIZE,
                    remaining,
                )
            )

            if not chunk:
                break

            yield chunk

            remaining -= len(chunk)


@router.get("/{track_id}")
async def stream_audio(
    track_id: UUID,
    range: str | None = Header(default=None),
):
    session_factory = get_session_factory()

    async with session_factory() as session:
        result = await session.execute(
            select(Track).where(
                Track.id == track_id,
                Track.is_published.is_(True),
            )
        )

        track = result.scalar_one_or_none()

    if track is None:
        raise HTTPException(
            status_code=404,
            detail="Track not found.",
        )

    body = None
    try:
        settings = get_settings()
        if not settings.b2_bucket_name:
            raise RuntimeError("B2_BUCKET_NAME is not configured.")

        s3 = await run_blocking(get_b2_s3_client)
        file_size = getattr(track, "file_size", None)
        if not isinstance(file_size, int) or file_size <= 0:
            metadata = await run_blocking(
                s3.head_object,
                Bucket=settings.b2_bucket_name,
                Key=track.b2_object_key,
            )
            file_size = metadata["ContentLength"]

        # Validate the client range before contacting storage. In particular,
        # never turn a valid 416 response into a misleading storage 503.
        start, end = parse_range(range, file_size)
        request_args = {
            "Bucket": settings.b2_bucket_name,
            "Key": track.b2_object_key,
        }
        if range:
            request_args["Range"] = f"bytes={start}-{end}"

        downloaded = await run_blocking_resource(
            s3.get_object,
            lambda result: close_s3_body(result["Body"]),
            **request_args,
        )
        body = downloaded["Body"]
        file_size = downloaded.get("ContentRange", "").rsplit("/", 1)[-1] or file_size
        file_size = int(file_size)

    except HTTPException:
        raise
    except Exception as storage_error:
        logger.exception(
            "Unable to stream audio from B2 for track %s (object key %s).",
            track.id,
            track.b2_object_key,
        )
        fallback_file = resolve_local_audio_fallback(track.b2_object_key)
        if fallback_file is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Audio storage is temporarily unavailable.",
                headers={"Retry-After": "2"},
            ) from storage_error

        file_size = fallback_file.stat().st_size
        start, end = parse_range(range, file_size)
        body = None
        local_body = stream_local_file(fallback_file, start, end)

    content_length = end - start + 1

    response_headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": track.mime_type,
        "Cache-Control": ("public, max-age=86400, stale-while-revalidate=604800"),
        "Content-Disposition": (f'inline; filename="{safe_filename(track.title)}"'),
    }

    if range:
        response_headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

    status_code = 206 if range else 200

    response_type = S3StreamingResponse if body is not None else StreamingResponse
    response_body = body if body is not None else local_body
    return response_type(
        response_body,
        status_code=status_code,
        headers=response_headers,
        media_type=track.mime_type,
    )
