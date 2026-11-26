import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import Icon from "../ui/Icon.jsx";
import useQuietRefresh from "../../hooks/useQuietRefresh.js";
import { getVisitorDevicesCache, setVisitorDevicesCache } from "../../adminVisitorDevicesCache.js";

export default function AdminVisitorDevicesPage() {
  const [devices, setDevices] = useState(getVisitorDevicesCache());
  const [busy, setBusy] = useState(getVisitorDevicesCache() === null);
  const [deleteBusy, setDeleteBusy] = useState(null);
  const [error, setError] = useState("");

  const loadDevices = useCallback(async () => {
    setBusy(true);
    try {
      const result = await apiRequest("/visitors/admin");
      setVisitorDevicesCache(result);
      setDevices(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load visitor devices.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);
  useQuietRefresh(loadDevices, { intervalMs: 60_000, enabled: true });

  const revoke = async (device) => {
    if (!window.confirm(`Revoke device #${device.device_number} and remove its linked login sessions?`)) return;
    setDeleteBusy(device.device_number);
    try {
      await apiRequest(`/visitors/admin/${device.device_number}`, { method: "DELETE" });
      await loadDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke visitor device.");
    } finally {
      setDeleteBusy(null);
    }
  };

  return (
    <div className="page-stack hs-search-page hs-library-page hs-admin-device-page">
      <header className="hs-total-played-header">
        <div className="hs-search-playlist-view__nav">
          
        </div>
        <section className="hs-search-playlist-view__hero hs-total-played-hero">
          <div className="hs-search-playlist-view__copy hs-total-played-heading">
            <span>ADMIN · VISITOR REGISTRY</span>
            <h2>Devices & Sessions</h2>
            <p>Every visitor device, including guests. Live status updates automatically.</p>
            <small className="hs-total-played-summary">
              <strong>{devices?.total_count ?? 0}</strong> devices tracked · <strong>{devices?.online_count ?? 0}</strong> online now
            </small>
          </div>
        </section>
      </header>
      <section className="hs-total-played-list hs-admin-device-list" aria-label="Visitor devices">
        <div className="hs-total-played-table-head hs-admin-device-head" aria-hidden="true">
          <span>DEVICE</span><span>DETAILS</span><span>ACTIONS</span>
        </div>
        {error ? <div className="hs-empty-card" role="alert">{error}<button type="button" onClick={() => void loadDevices()}>Retry</button></div> : null}
        {devices?.devices?.length ? (
          <div className="hs-total-played-rows hs-admin-device-rows">
            {devices.devices.map((device) => (
              <article key={device.device_number} className="hs-search-track hs-library-track-row hs-admin-device-row">
                <div className="hs-admin-device-main">
                  <span className={device.online ? "admin-device-dot is-online" : "admin-device-dot"} />
                  <strong>Device #{device.device_number}</strong>
                  <span className={device.online ? "admin-status admin-status--online" : "admin-status admin-status--offline"}>{device.revoked ? "REVOKED" : device.online ? "ONLINE" : "OFFLINE"}</span>
                  <span className="hs-admin-device-ip">{device.ip_address || "IP retention expired"}</span>
                </div>
                <div className="hs-admin-device-info">
                  <span><b>ACCOUNT</b>{device.account || "Guest"}</span>
                  <span><b>VISITS</b>{device.visit_count ?? 0}</span>
                  <span><b>FIRST SEEN</b>{device.first_seen_at ? new Date(device.first_seen_at).toLocaleString() : "—"}</span>
                  <span><b>LAST SEEN</b>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "—"}</span>
                  <small>{device.user_agent || "Browser details unavailable"}</small>
                </div>
                <div className="hs-admin-device-actions">
                  <button type="button" className="danger-button" disabled={deleteBusy !== null || device.revoked} onClick={() => void revoke(device)}>{deleteBusy === device.device_number ? "Revoking…" : device.revoked ? "Revoked" : "Revoke sessions"}</button>
                </div>
              </article>
            ))}
          </div>
        ) : !error ? (
          <div className="hs-empty-card"><Icon name="monitor-smartphone" size={28}/><strong>{busy ? "Loading visitor devices…" : "No visitor devices yet"}</strong><p>Tracked visitors will appear here as devices connect.</p></div>
        ) : null}
        <div className="hs-admin-device-footer">
          <button type="button" className="secondary-admin-button" onClick={() => void loadDevices()} disabled={busy}>{busy ? "Refreshing…" : "Refresh devices"}</button>
        </div>
      </section>
    </div>
  );
}
