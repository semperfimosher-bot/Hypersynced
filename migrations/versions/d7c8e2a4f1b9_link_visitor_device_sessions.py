"""Link authentication sessions to first-party visitor device tokens.

Revision ID: d7c8e2a4f1b9
Revises: d6c8e2a4f1b9
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "d7c8e2a4f1b9"
down_revision: str | Sequence[str] | None = "d6c8e2a4f1b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("visitor_token_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_user_sessions_visitor_token_hash", "user_sessions", ["visitor_token_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_user_sessions_visitor_token_hash", table_name="user_sessions")
    op.drop_column("user_sessions", "visitor_token_hash")
