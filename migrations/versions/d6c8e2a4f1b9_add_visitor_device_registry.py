"""Create privacy-scoped first-party visitor device records.

Revision ID: d6c8e2a4f1b9
Revises: f8b2d6a4c1e9
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "d6c8e2a4f1b9"
down_revision: str | Sequence[str] | None = "f8b2d6a4c1e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "visitor_devices",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("account_user_id", sa.Uuid(), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("visit_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["account_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_visitor_devices_token_hash", "visitor_devices", ["token_hash"], unique=False)
    op.create_index("ix_visitor_devices_account_user_id", "visitor_devices", ["account_user_id"], unique=False)
    op.create_index("ix_visitor_devices_last_seen_at", "visitor_devices", ["last_seen_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_visitor_devices_last_seen_at", table_name="visitor_devices")
    op.drop_index("ix_visitor_devices_account_user_id", table_name="visitor_devices")
    op.drop_index("ix_visitor_devices_token_hash", table_name="visitor_devices")
    op.drop_table("visitor_devices")
