"""persist licensed artist portrait metadata

Revision ID: f6a9b3c2d8e1
Revises: c9d4e7a2b6f1
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f6a9b3c2d8e1"
down_revision: str | Sequence[str] | None = "c9d4e7a2b6f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "artist_profiles",
        sa.Column("artwork_object_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "artist_profiles",
        sa.Column("artwork_artist_qid", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "artist_profiles",
        sa.Column("artwork_source_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "artist_profiles",
        sa.Column("artwork_source_page_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "artist_profiles",
        sa.Column("artwork_license", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "artist_profiles",
        sa.Column("artwork_credit", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("artist_profiles", "artwork_artist_qid")
    op.drop_column("artist_profiles", "artwork_credit")
    op.drop_column("artist_profiles", "artwork_license")
    op.drop_column("artist_profiles", "artwork_source_page_url")
    op.drop_column("artist_profiles", "artwork_source_url")
    op.drop_column("artist_profiles", "artwork_object_key")
