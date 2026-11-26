"""Add the playlist collaboration permission flag.

Revision ID: d1a8c6e2b9f4
Revises: 8c4d2e7a1b9f
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d1a8c6e2b9f4"
down_revision: str | Sequence[str] | None = "8c4d2e7a1b9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "playlists",
        sa.Column(
            "allow_collaborators",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("playlists", "allow_collaborators")
