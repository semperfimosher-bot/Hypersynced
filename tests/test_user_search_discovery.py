from datetime import UTC, datetime
from uuid import uuid4

import pytest

from backend.app.api.routes import users as user_routes


class _FakeUsersResult:
    def __init__(self, users):
        self._users = users

    def scalars(self):
        return self

    def all(self):
        return self._users


class _FakeCountsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeSearchSession:
    def __init__(self, users, counts):
        self.users = users
        self.counts = counts
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _FakeUsersResult(self.users)
        return _FakeCountsResult(self.counts)


def _fake_user(username: str):
    return type(
        "SearchUser",
        (),
        {
            "id": uuid4(),
            "username": username,
            "profile": type(
                "SearchProfile",
                (),
                {"display_name": f"{username} Display"},
            )(),
            "created_at": datetime.now(UTC),
        },
    )()


@pytest.mark.asyncio
async def test_empty_user_search_is_bounded_and_batches_follower_counts(
    monkeypatch,
) -> None:
    users = [_fake_user(f"discovery-{index:02}") for index in range(16)]
    counts = [(users[0].id, 5), (users[3].id, 2)]
    session = _FakeSearchSession(users, counts)
    monkeypatch.setattr(
        user_routes,
        "avatar_url",
        lambda user: f"avatar:{user.username}",
    )

    results = await user_routes.search_users("", session)

    assert len(results) == 16
    assert session.statements[0]._limit_clause.value == 16
    assert len(session.statements) == 2
    assert results[0].followers_count == 5
    assert results[3].followers_count == 2
    assert results[1].followers_count == 0
    assert results[0].avatar_url == "avatar:discovery-00"


@pytest.mark.asyncio
async def test_empty_user_search_skips_follower_query_when_no_users(
) -> None:
    session = _FakeSearchSession([], [])

    results = await user_routes.search_users("", session)

    assert results == []
    assert len(session.statements) == 1


@pytest.mark.asyncio
async def test_typed_user_search_keeps_standard_search_batch_limit(
    monkeypatch,
) -> None:
    session = _FakeSearchSession([], [])
    monkeypatch.setattr(
        user_routes,
        "avatar_url",
        lambda user: None,
    )

    results = await user_routes.search_users("search-term", session)

    assert results == []
    assert session.statements[0]._limit_clause.value == 20
