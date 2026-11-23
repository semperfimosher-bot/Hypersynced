"""Merge visitor-device and remember-me migration branches.

Revision ID: e1a7c3b9d5f2
Revises: ca91b5e7d204, d7c8e2a4f1b9
"""
from collections.abc import Sequence

revision: str = "e1a7c3b9d5f2"
down_revision: str | Sequence[str] | None = (
    "ca91b5e7d204",
    "d7c8e2a4f1b9",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
