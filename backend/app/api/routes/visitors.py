from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import delete, select, update

from ...models.account import User, UserSession
from ...models.visitor import VisitorDevice
from ...services.admin_notifications import record_admin_activity
from ..dependencies import AdminUser, DatabaseSession, OptionalCurrentUser

router = APIRouter(prefix="/visitors", tags=["visitor devices"])
ONLINE_WINDOW_SECONDS = 180
IP_RETENTION_DAYS = 30


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _client_ip(request: Request) -> str | None:
    # Use the direct peer address; do not trust arbitrary forwarded headers.
    return request.client.host if request.client else None


@router.post("/heartbeat")
async def visitor_heartbeat(
    request: Request,
    session: DatabaseSession,
    user: OptionalCurrentUser,
):
    token = request.headers.get("x-hs-visitor-id", "").strip()
    if len(token) < 32 or len(token) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Visitor token is missing or invalid.",
        )
    hashed = token_hash(token)
    now = datetime.now(UTC)
    result = await session.execute(select(VisitorDevice).where(VisitorDevice.token_hash == hashed))
    device = result.scalar_one_or_none()
    if device is not None and device.revoked_at is not None:
        return {"registered": False, "revoked": True}
    is_new = device is None
    if device is not None:
        current_ip = _client_ip(request)
        current_user_agent = request.headers.get("user-agent", "")[:1200]
        current_account_id = user.id if user else device.account_user_id
        heartbeat_cutoff = now - timedelta(seconds=90)
        if (
            device.last_seen_at >= heartbeat_cutoff
            and device.ip_address == current_ip
            and device.user_agent == current_user_agent
            and device.account_user_id == current_account_id
        ):
            return {"registered": True, "device_number": device.id, "online": True}
    if device is None:
        device = VisitorDevice(
            token_hash=hashed,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent", "")[:1200],
            account_user_id=user.id if user else None,
            first_seen_at=now,
            last_seen_at=now,
            visit_count=1,
        )
        session.add(device)
    else:
        device.ip_address = _client_ip(request)
        device.user_agent = request.headers.get("user-agent", "")[:1200]
        device.account_user_id = user.id if user else device.account_user_id
        if device.last_seen_at < now - timedelta(minutes=30):
            device.visit_count = int(device.visit_count or 0) + 1
        device.last_seen_at = now
    await session.commit()
    if is_new:
        await record_admin_activity(
            kind="new_visitor_device",
            title="New browser/device visit",
            body=(
                f"Visitor device #{device.id} was seen for the first time. "
                f"IP: {device.ip_address or 'Unavailable'}. "
                f"Browser details: {device.user_agent or 'Unknown'}. "
                f"Account: {user.username if user and user.username else 'Guest'}"
            ),
            actor_user_id=user.id if user else None,
            actor_username=user.username if user else "Guest",
        )
    return {"registered": True, "device_number": device.id, "online": True}


@router.get("/admin")
async def list_visitor_devices(
    user: AdminUser,
    session: DatabaseSession,
):
    now = datetime.now(UTC)
    cutoff_online = now - timedelta(seconds=ONLINE_WINDOW_SECONDS)
    ip_cutoff = now - timedelta(days=IP_RETENTION_DAYS)
    await session.execute(
        update(VisitorDevice)
        .where(VisitorDevice.last_seen_at < ip_cutoff, VisitorDevice.ip_address.is_not(None))
        .values(ip_address=None)
    )
    result = await session.execute(
        select(VisitorDevice, User)
        .outerjoin(User, User.id == VisitorDevice.account_user_id)
        .order_by(VisitorDevice.last_seen_at.desc())
        .limit(1000)
    )
    rows = result.all()
    await session.commit()
    return {
        "online_count": sum(
            1
            for device, _ in rows
            if device.revoked_at is None and device.last_seen_at >= cutoff_online
        ),
        "total_count": len(rows),
        "devices": [
            {
                "device_number": device.id,
                "ip_address": device.ip_address,
                "user_agent": device.user_agent,
                "account": account.username if account else "Guest",
                "first_seen_at": device.first_seen_at,
                "last_seen_at": device.last_seen_at,
                "visit_count": device.visit_count,
                "online": device.revoked_at is None and device.last_seen_at >= cutoff_online,
                "revoked": device.revoked_at is not None,
            }
            for device, account in rows
        ],
    }


@router.delete("/admin/{device_number}")
async def revoke_visitor_device(
    device_number: int,
    user: AdminUser,
    session: DatabaseSession,
):
    result = await session.execute(select(VisitorDevice).where(VisitorDevice.id == device_number))
    device = result.scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visitor device not found.",
        )
    device.revoked_at = datetime.now(UTC)
    await session.execute(
        delete(UserSession).where(UserSession.visitor_token_hash == device.token_hash)
    )
    await session.commit()
    return {
        "success": True,
        "device_number": device_number,
        "message": "Device record revoked and linked login sessions removed.",
    }
