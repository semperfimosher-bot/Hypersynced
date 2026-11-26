import { useMemo, useState } from "react";
import { readDeviceListeningSessions } from "../../deviceListeningStats.js";
import Icon from "../ui/Icon.jsx";
import TrackArtwork from "../ui/TrackArtwork.jsx";

function todayInput() {
  const date = new Date();
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}
function parseDate(value) {
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}
function secondsLabel(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function timeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
export default function ListeningTimePage({ currentUser }) {
  const owner = currentUser?.id ?? currentUser?.username ?? null;
  const [dateText, setDateText] = useState(todayInput);
  const selectedDate = useMemo(() => parseDate(dateText), [dateText]);
  const sessions = useMemo(() => readDeviceListeningSessions(owner), [owner]);
  const selectedSessions = useMemo(() => {
    if (!selectedDate) return [];
    return sessions.filter((session) => {
      const date = new Date(session.started_at);
      return !Number.isNaN(date.getTime()) && date.getFullYear() === selectedDate.getFullYear() && date.getMonth() === selectedDate.getMonth() && date.getDate() === selectedDate.getDate();
    }).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  }, [sessions, selectedDate]);
  const daySeconds = selectedSessions.reduce((sum, s) => sum + Math.max(0, Number(s.day_seconds) || 0), 0);
  const nightSeconds = selectedSessions.reduce((sum, s) => sum + Math.max(0, Number(s.night_seconds) || 0), 0);
  const totalSeconds = daySeconds + nightSeconds;
  const dayPercent = totalSeconds ? Math.round(daySeconds / totalSeconds * 100) : 0;
  const nightPercent = totalSeconds ? Math.round(nightSeconds / totalSeconds * 100) : 0;
  return (
    <div className="page-stack hs-search-page hs-library-page hs-listening-time-page">
      <header className="hs-total-played-header">
        <section className="hs-search-playlist-view__hero hs-total-played-hero">
          <div className="hs-search-playlist-view__copy hs-total-played-heading">
            <span>LISTENING INSIGHTS · THIS DEVICE</span>
            <h2>Listening Time</h2>
            <p>Review your listening by date, and see how your listening time is split between day and night.</p>
            <small className="hs-total-played-summary"><strong>{sessions.length.toLocaleString()}</strong> recorded listening sessions</small>
          </div>
        </section>
      </header>
      <section className="hs-listening-time-date">
        <label htmlFor="hs-listening-date">Choose a date (M/D/YYYY)</label>
        <input id="hs-listening-date" inputMode="numeric" placeholder="M/D/YYYY" value={dateText} onChange={(event) => setDateText(event.target.value)} />
        {selectedDate ? <span>{selectedDate.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span> : <span className="hs-listening-time-error">Enter a valid date as M/D/YYYY.</span>}
      </section>
      <section className="hs-listening-time-split" aria-label="Day and night listening percentage">
        <article className="hs-listening-time-card hs-listening-time-card--night"><span>EVENING & NIGHT · 6 PM–12 AM</span><strong>{nightPercent}%</strong><small>{secondsLabel(nightSeconds)} listened</small></article>
        <article className="hs-listening-time-card hs-listening-time-card--day"><span>DAY · 12 AM–6 PM</span><strong>{dayPercent}%</strong><small>{secondsLabel(daySeconds)} listened</small></article>
      </section>
      <section className="hs-listening-time-list">
        <header><div><span>LISTENING LOG</span><h3>What you played</h3></div><strong>{secondsLabel(totalSeconds)} total</strong></header>
        {!selectedDate ? <div className="hs-empty-card">Please enter a valid date.</div> : selectedSessions.length ? selectedSessions.map((session, i) => (
          <article key={session.session_id ?? `${session.track_id}-${session.started_at}-${i}`} className="hs-listening-time-row">
            <TrackArtwork src={session.artwork_url} alt={session.title || "Track artwork"} variant={1} />
            <div><strong>{session.title || "Unknown track"}</strong><small>{session.artist || "Unknown artist"}{session.album ? ` · ${session.album}` : ""}</small></div>
            <span>{timeLabel(session.started_at)}</span><small>{secondsLabel(session.listened_seconds)}</small>
          </article>
        )) : <div className="hs-empty-card"><Icon name="headphones" size={28}/><strong>No listening sessions found for this date</strong><p>Timestamped listening logs start when this feature is added. Older plays are not available as detailed sessions.</p></div>}
      </section>
    </div>
  );
}
