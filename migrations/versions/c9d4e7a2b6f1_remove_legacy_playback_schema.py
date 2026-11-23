"""remove unused legacy playback device and saved queue schema

Revision ID: c9d4e7a2b6f1
Revises: b2c7d9e4f1a6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "c9d4e7a2b6f1"
down_revision: str | Sequence[str] | None = "b2c7d9e4f1a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The device-control tables and saved queue fields were confirmed empty.
    # IF EXISTS also supports databases where the cleanup SQL was run first.
    op.execute("DROP TABLE IF EXISTS playback_commands")
    op.execute("DROP TABLE IF EXISTS playback_devices")
    op.execute(
        "ALTER TABLE user_app_state "
        "DROP COLUMN IF EXISTS playback_queue_index"
    )
    op.execute(
        "ALTER TABLE user_app_state "
        "DROP COLUMN IF EXISTS playback_queue_track_ids"
    )
    op.execute(
        "ALTER TABLE user_app_state "
        "DROP COLUMN IF EXISTS playback_device_id"
    )


def downgrade() -> None:
    # These legacy structures are recreated empty; deleted rows cannot be restored.
    op.add_column(
        "user_app_state",
        sa.Column(
            "playback_device_id",
            sa.String(length=64),
            nullable=True,
        ),
    )
    op.add_column(
        "user_app_state",
        sa.Column(
            "playback_queue_track_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "user_app_state",
        sa.Column(
            "playback_queue_index",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_table(
        "playback_devices",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "device_type",
            sa.String(length=24),
            nullable=False,
            server_default="browser",
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "device_id"),
    )
    op.create_index(
        "ix_playback_devices_last_seen_at",
        "playback_devices",
        ["last_seen_at"],
        unique=False,
    )

    op.create_table(
        "playback_commands",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("target_device_id", sa.String(length=64), nullable=False),
        sa.Column("source_device_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=24), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_playback_commands_user_id",
        "playback_commands",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_playback_commands_target_device_id",
        "playback_commands",
        ["target_device_id"],
        unique=False,
    )
    op.create_index(
        "ix_playback_commands_consumed_at",
        "playback_commands",
        ["consumed_at"],
        unique=False,
    )
