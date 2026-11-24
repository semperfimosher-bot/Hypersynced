"""persist artist artwork cache state
Revision ID: 8c4d2e7a1b9f
Revises: f6a9b3c2d8e1, f8b2d6a4c1e9
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op
revision: str = "8c4d2e7a1b9f"
down_revision: str | Sequence[str] | None = ("f6a9b3c2d8e1", "f8b2d6a4c1e9")
branch_labels = None
depends_on = None
def upgrade() -> None:
    op.add_column("artist_profiles", sa.Column("has_profile_picture", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("artist_profiles", sa.Column("artwork_status", sa.String(24), nullable=False, server_default="missing"))
    op.add_column("artist_profiles", sa.Column("artwork_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("artist_profiles", sa.Column("artwork_next_retry_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("artist_profiles", sa.Column("artwork_lease_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("artist_profiles", sa.Column("artwork_temporary_url", sa.Text(), nullable=True))
    op.execute("UPDATE artist_profiles SET has_profile_picture = true, artwork_status = 'ready' WHERE artwork_object_key IS NOT NULL")
    op.create_index("ix_artist_profiles_artwork_worker", "artist_profiles", ["artwork_status", "artwork_next_retry_at", "artwork_lease_until"])
def downgrade() -> None:
    op.drop_index("ix_artist_profiles_artwork_worker", table_name="artist_profiles")
    for name in ("artwork_temporary_url", "artwork_lease_until", "artwork_next_retry_at", "artwork_attempts", "artwork_status", "has_profile_picture"):
        op.drop_column("artist_profiles", name)
