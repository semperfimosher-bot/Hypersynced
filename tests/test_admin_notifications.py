from backend.app.services.admin_notifications import should_record_admin_activity


def test_visitor_heartbeat_activity_is_never_notified_to_admins() -> None:
    for kind in (
        "heartbeat",
        "visitor_heartbeat",
        "visitor-heartbeat",
        "visitor_heartbeat_ping",
        "VisitorHeartbeat",
        "admin_visitor_heartbeat",
    ):
        assert should_record_admin_activity(kind) is False


def test_new_visitor_device_notifications_remain_allowed() -> None:
    assert should_record_admin_activity("new_visitor_device") is True
    assert should_record_admin_activity("new_visitor") is True
