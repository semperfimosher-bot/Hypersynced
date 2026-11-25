from backend.app.services.admin_notifications import should_record_admin_activity


def test_visitor_heartbeat_activity_is_never_notified_to_admins() -> None:
    for kind in (
        "heartbeat",
        "visitor_heartbeat",
        "visitor-heartbeat",
        "visitor_heartbeat_ping",
        "VisitorHeartbeat",
        "admin_visitor_heartbeat",
        "visitor_device_heartbeat",
        "heartbeat_ping",
        "visitor_online_heartbeat",
    ):
        assert should_record_admin_activity(kind) is False


def test_new_visitor_device_notifications_remain_allowed() -> None:
    assert should_record_admin_activity("new_visitor_device") is True
    assert should_record_admin_activity("new_visitor") is True


def test_automated_system_activity_is_not_notified_to_admins() -> None:
    for kind in (
        "automated_health_check",
        "service_monitoring",
        "scheduled_cleanup",
        "background_worker_status",
        "catalog_backfill",
        "cache_warm_job",
        "maintenance_polling",
    ):
        assert should_record_admin_activity(kind) is False


def test_automated_maintenance_activity_is_not_recorded() -> None:
    for kind in (
        "automated_health_check",
        "service_monitoring",
        "scheduled_cleanup",
        "background_worker_status",
        "catalog_backfill",
        "cache_warm_job",
        "maintenance_polling",
    ):
        assert should_record_admin_activity(kind) is False
