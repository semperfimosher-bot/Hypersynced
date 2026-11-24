from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from backend.app.api.routes.users import ListeningRequest, record_listening


@pytest.mark.asyncio
async def test_offline_listening_event_sync_is_idempotent_for_same_owner_and_track():
    owner_id = uuid4()
    track_id = uuid4()
    event_id = uuid4()
    existing = SimpleNamespace(id=event_id, user_id=owner_id, track_id=track_id)
    session = SimpleNamespace(
        get=AsyncMock(return_value=existing),
        execute=AsyncMock(),
        add=Mock(),
    )

    response = await record_listening(
        ListeningRequest(track_id=track_id, event_id=event_id),
        SimpleNamespace(id=owner_id),
        session,
    )

    assert response == {
        "recorded": True,
        "duplicate": True,
        "event_id": str(event_id),
        "track_id": str(track_id),
    }
    session.execute.assert_not_called()
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_offline_listening_event_sync_rejects_id_collision():
    event_id = uuid4()
    existing = SimpleNamespace(id=event_id, user_id=uuid4(), track_id=uuid4())
    session = SimpleNamespace(get=AsyncMock(return_value=existing), execute=AsyncMock(), add=Mock())

    with pytest.raises(HTTPException) as error:
        await record_listening(
            ListeningRequest(track_id=uuid4(), event_id=event_id),
            SimpleNamespace(id=uuid4()),
            session,
        )

    assert error.value.status_code == 409
    session.execute.assert_not_called()


@pytest.mark.asyncio
async def test_offline_listening_event_sync_preserves_client_timestamp():
    owner_id = uuid4()
    track_id = uuid4()
    event_id = uuid4()
    listened_at = datetime(2026, 11, 23, 18, 30, tzinfo=UTC)
    track = SimpleNamespace(id=track_id, is_published=True)
    session = SimpleNamespace(
        get=AsyncMock(return_value=None),
        execute=AsyncMock(
            return_value=SimpleNamespace(
                scalar_one_or_none=lambda: track,
            ),
        ),
        add=Mock(),
        flush=AsyncMock(),
        commit=AsyncMock(),
    )

    response = await record_listening(
        ListeningRequest(track_id=track_id, event_id=event_id, listened_at=listened_at),
        SimpleNamespace(id=owner_id),
        session,
    )

    saved_event = session.add.call_args.args[0]
    assert saved_event.id == event_id
    assert saved_event.user_id == owner_id
    assert saved_event.track_id == track_id
    assert saved_event.listened_at == listened_at
    assert response["duplicate"] is False
    assert response["event_id"] == str(event_id)
    session.commit.assert_awaited_once()
