from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
)

from .base import (
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class ArtistProfile(
    UUIDPrimaryKeyMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "artist_profiles"

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    normalized_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
        index=True,
    )

    bio: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    artwork_object_key: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    artwork_artist_qid: Mapped[str | None] = mapped_column(
        String(32),
        nullable=True,
    )

    artwork_source_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    artwork_source_page_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    artwork_license: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    artwork_credit: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    has_profile_picture: Mapped[bool] = mapped_column(
        default=False,
        server_default="false",
        nullable=False,
    )
    artwork_status: Mapped[str] = mapped_column(
        String(24),
        default="missing",
        server_default="missing",
        nullable=False,
    )
    artwork_attempts: Mapped[int] = mapped_column(
        default=0,
        server_default="0",
        nullable=False,
    )
    artwork_next_retry_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    artwork_lease_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    artwork_temporary_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


class ArtistFollow(
    TimestampMixin,
    Base,
):
    __tablename__ = "artist_follows"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    artist_id: Mapped[UUID] = mapped_column(
        ForeignKey(
            "artist_profiles.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
        index=True,
    )
