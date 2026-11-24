from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
)
from sqlalchemy import select

from pydantic import (
    BaseModel,
    Field,
)

from ...models.account import ListeningEvent
from ...models.media import Track
from ...services.autoplay import (
    recommend_autoplay_tracks,
)
from ..dependencies import (
    DatabaseSession,
    OptionalCurrentUser,
)
from .catalog import (
    _track_artwork_url,
    _track_artwork_version,
    _track_audio_url,
    _track_media_version,
)

router = APIRouter(
    prefix="/recommendations",
    tags=[
        "recommendations",
    ],
)


def _catalog_uuid_or_none(
    value: Any,
) -> UUID | None:
    if value is None:
        return None

    if isinstance(
        value,
        UUID,
    ):
        return value

    try:
        return UUID(
            str(
                value,
            ).strip()
        )
    except (
        TypeError,
        ValueError,
        AttributeError,
    ):
        return None


def _catalog_uuid_list(
    values: Any,
    *,
    limit: int,
) -> list[
    UUID
]:
    if not isinstance(
        values,
        (
            list,
            tuple,
            set,
        ),
    ):
        return []

    result: list[
        UUID
    ] = []
    seen: set[
        UUID
    ] = set()

    for value in values:
        track_id = (
            _catalog_uuid_or_none(
                value,
            )
        )

        if (
            track_id is None
            or track_id in seen
        ):
            continue

        seen.add(
            track_id,
        )

        result.append(
            track_id,
        )

        if (
            len(
                result,
            )
            >= limit
        ):
            break

    return result


def _autoplay_limit(
    value: Any,
) -> int:
    try:
        parsed = int(
            value,
        )
    except (
        TypeError,
        ValueError,
    ):
        return 8

    return max(
        1,
        min(
            parsed,
            20,
        ),
    )


class AutoplayRequest(
    BaseModel,
):
    # Autoplay is best-effort playback support.
    # Keep this request deliberately permissive:
    # stale browser/service-worker state must not
    # be able to turn recommendation refill into
    # a FastAPI 422. The route sanitizes every
    # value before it reaches the service layer.
    current_track_id: Any = None

    exclude_track_ids: Any = Field(
        default_factory=list,
    )

    context_track_ids: Any = Field(
        default_factory=list,
    )

    limit: Any = 8

    home_explore: bool = False


class AutoplayTrackResponse(
    BaseModel,
):
    id: UUID

    title: str

    artist: str

    album: str | None
    genre: str | None = None
    release_year: int | None = None

    audio_url: str | None

    artwork_url: str | None

    mime_type: str | None

    file_size: int | None

    media_version: str | None
    artwork_version: str | None


@router.post(
    "/autoplay",
    response_model=list[
        AutoplayTrackResponse
    ],
)
async def autoplay(
    payload: AutoplayRequest,
    session: DatabaseSession,
    user: OptionalCurrentUser,
) -> list[
    AutoplayTrackResponse
]:
    tracks = (
        await recommend_autoplay_tracks(
            session,
            user_id=(
                user.id
                if user is not None
                else None
            ),
            current_track_id=(
                _catalog_uuid_or_none(
                    payload.current_track_id
                )
            ),
            exclude_track_ids=set(
                _catalog_uuid_list(
                    payload.exclude_track_ids,
                    limit=100,
                )
            ),
            context_track_ids=(
                _catalog_uuid_list(
                    payload.context_track_ids,
                    limit=12,
                )
            ),
            limit=(
                _autoplay_limit(
                    payload.limit
                )
            ),
        )
    )

    # Home discovery avoids tracks and artists listened to during the last two weeks.
    if user is not None and payload.home_explore:
        cutoff = datetime.now(UTC) - timedelta(days=14)
        recent_result = await session.execute(
            select(Track.id, Track.artist)
            .join(ListeningEvent, ListeningEvent.track_id == Track.id)
            .where(
                ListeningEvent.user_id == user.id,
                ListeningEvent.listened_at >= cutoff,
                Track.is_published.is_(True),
            )
        )
        recent_rows = recent_result.all()
        recent_track_ids = {row.id for row in recent_rows}
        recent_artist_keys = {
            str(row.artist or "").strip().casefold()
            for row in recent_rows
            if str(row.artist or "").strip()
        }
        tracks = [
            track
            for track in tracks
            if track.id not in recent_track_ids
            and str(track.artist or "").strip().casefold()
            not in recent_artist_keys
        ]
        tracks = tracks[:6]

    return [
        AutoplayTrackResponse(
            id=track.id,

            title=track.title,

            artist=track.artist,

            album=track.album,
            genre=getattr(
                track,
                "genre",
                None,
            ),
            release_year=getattr(
                track,
                "release_year",
                None,
            ),

            audio_url=(
                _track_audio_url(
                    track,
                )
            ),

            artwork_url=(
                _track_artwork_url(
                    track,
                )
            ),

            mime_type=(
                track.mime_type
            ),

            file_size=(
                track.file_size
            ),

            media_version=(
                _track_media_version(
                    track,
                )
            ),
            artwork_version=(
                _track_artwork_version(
                    track,
                )
            ),
        )
        for track in tracks
    ]
