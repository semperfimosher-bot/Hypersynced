"""persist remember-me preference on refresh sessions

Revision ID: ca91b5e7d204
Revises: f8b2d6a4c1e9
"""
from collections.abc import Sequence
import sqlalchemy as sa
from alembic import op

revision: str = "ca91b5e7d204"
down_revision: str | Sequence[str] | None = "f8b2d6a4c1e9"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("user_sessions", sa.Column("remember_me", sa.Boolean(), nullable=False, server_default=sa.true()))

def downgrade() -> None:
    op.drop_column("user_sessions", "remember_me")
