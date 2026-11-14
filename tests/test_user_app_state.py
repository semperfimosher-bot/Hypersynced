from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import app


async def register_and_login(
    client: AsyncClient,
    username: str,
) -> str:
    password = "app-state-test-pass"

    register = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": password,
        },
    )

    assert register.status_code == 201, register.text

    login = await client.post(
        "/api/auth/login",
        json={
            "username": username,
            "password": password,
        },
    )

    assert login.status_code == 200, login.text

    return login.json()["access_token"]


@pytest.mark.asyncio
async def test_app_state_defaults_to_home() -> None:
    run_id = uuid4().hex[:8]
    username = f"state-default-{run_id}"

    transport = ASGITransport(
        app=app,
    )

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        token = await register_and_login(
            client,
            username,
        )

        response = await client.get(
            "/api/users/me/app-state",
            headers={
                "Authorization": f"Bearer {token}",
            },
        )

    assert response.status_code == 200, response.text

    assert response.json() == {
        "active_page": "home",
        "search_query": "",
        "profile_username": None,
        "updated_at": None,
    }


@pytest.mark.asyncio
async def test_app_state_persists_search_context() -> None:
    run_id = uuid4().hex[:8]
    username = f"state-search-{run_id}"

    transport = ASGITransport(
        app=app,
    )

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        token = await register_and_login(
            client,
            username,
        )

        headers = {
            "Authorization": f"Bearer {token}",
        }

        update = await client.patch(
            "/api/users/me/app-state",
            headers=headers,
            json={
                "active_page": "search",
                "search_query": "Eminem",
                "profile_username": None,
                "expected_updated_at": None,
            },
        )

        assert update.status_code == 200, update.text

        response = await client.get(
            "/api/users/me/app-state",
            headers=headers,
        )

    assert response.status_code == 200, response.text

    assert response.json()["active_page"] == "search"
    assert response.json()["search_query"] == "Eminem"
    assert response.json()["profile_username"] is None
    assert response.json()["updated_at"] is not None


@pytest.mark.asyncio
async def test_app_state_persists_public_profile() -> None:
    run_id = uuid4().hex[:8]

    owner_username = f"state-owner-{run_id}"

    target_username = f"state-target-{run_id}"

    transport = ASGITransport(
        app=app,
    )

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        await register_and_login(
            client,
            target_username,
        )

        owner_token = await register_and_login(
            client,
            owner_username,
        )

        headers = {
            "Authorization": f"Bearer {owner_token}",
        }

        update = await client.patch(
            "/api/users/me/app-state",
            headers=headers,
            json={
                "active_page": "public-profile",
                "search_query": "",
                "profile_username": target_username,
                "expected_updated_at": None,
            },
        )

        assert update.status_code == 200, update.text

        response = await client.get(
            "/api/users/me/app-state",
            headers=headers,
        )

    assert response.status_code == 200, response.text

    assert response.json()["active_page"] == "public-profile"
    assert response.json()["profile_username"] == target_username
    assert response.json()["updated_at"] is not None


@pytest.mark.asyncio
async def test_normal_user_cannot_save_admin_page() -> None:
    run_id = uuid4().hex[:8]

    username = f"state-user-{run_id}"

    transport = ASGITransport(
        app=app,
    )

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
    ) as client:
        token = await register_and_login(
            client,
            username,
        )

        response = await client.patch(
            "/api/users/me/app-state",
            headers={
                "Authorization": f"Bearer {token}",
            },
            json={
                "active_page": "admin",
                "search_query": "",
                "profile_username": None,
                "expected_updated_at": None,
            },
        )

    assert response.status_code == 403



@pytest.mark.asyncio
async def test_app_state_rejects_stale_version() -> None:
    run_id = uuid4().hex[:8]
    username = f"state-stale-{run_id}"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await register_and_login(client, username)
        headers = {"Authorization": f"Bearer {token}"}

        first = await client.patch(
            "/api/users/me/app-state",
            headers=headers,
            json={
                "active_page": "library",
                "search_query": "",
                "profile_username": None,
                "expected_updated_at": None,
            },
        )
        assert first.status_code == 200, first.text

        stale = await client.patch(
            "/api/users/me/app-state",
            headers=headers,
            json={
                "active_page": "profile",
                "search_query": "",
                "profile_username": None,
                "expected_updated_at": None,
            },
        )
        assert stale.status_code == 409, stale.text

        current = await client.get("/api/users/me/app-state", headers=headers)
        assert current.status_code == 200
        assert current.json()["active_page"] == "library"


@pytest.mark.asyncio
async def test_playback_state_rejects_stale_version_and_preserves_app_version() -> None:
    run_id = uuid4().hex[:8]
    username = f"playback-stale-{run_id}"
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = await register_and_login(client, username)
        headers = {"Authorization": f"Bearer {token}"}

        first = await client.put(
            "/api/users/me/playback-state",
            headers=headers,
            json={
                "track_id": None,
                "position_seconds": 12,
                "paused": True,
                "expected_playback_updated_at": None,
            },
        )
        assert first.status_code == 200, first.text
        assert first.json()["updated_at"] is not None

        app_before = await client.get("/api/users/me/app-state", headers=headers)
        app_version = app_before.json()["updated_at"]

        stale = await client.put(
            "/api/users/me/playback-state",
            headers=headers,
            json={
                "track_id": None,
                "position_seconds": 2,
                "paused": True,
                "expected_playback_updated_at": None,
            },
        )
        assert stale.status_code == 409, stale.text

        app_after = await client.get("/api/users/me/app-state", headers=headers)
        assert app_after.json()["updated_at"] == app_version
