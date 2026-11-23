from scripts.verification.postgres import migration_predecessor


def test_merge_migration_selects_remember_me_branch_for_populated_session_upgrade():
    assert migration_predecessor(("ca91b5e7d204", "d7c8e2a4f1b9")) == "ca91b5e7d204"


def test_single_parent_migration_uses_its_parent():
    assert migration_predecessor("c9d4e7a2b6f1") == "c9d4e7a2b6f1"


def test_migration_predecessor_rejects_missing_parent():
    import pytest

    with pytest.raises(RuntimeError, match="migration predecessor"):
        migration_predecessor(None)
