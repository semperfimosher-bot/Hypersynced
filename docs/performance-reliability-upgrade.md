# HyperSynced performance and reliability upgrade

## Baseline audit (Semifinals)

The current branch already has several performance and offline foundations. Avoid replacing them with duplicate cache systems.

- **Home:** recently played, suggestions, and recently-added snapshots are cached; refreshes can preserve cached content. Carousel fallback selection and artwork warming were strengthened in this upgrade.
- **Library and playlists:** an account-scoped IndexedDB cache stores library snapshots, track pages, and playlist details. Cache bounds include up to 100 playlist snapshots and 40 pages per owner; cached snapshots expire after 30 days.
- **Search:** frontend search has a 30-day result cache, bounded in-memory/persistent entries, in-flight request sharing, stale refresh, cancellation, and a debounced page request. Backend search uses bounded candidate sets; profiling is still needed before changing query/index behavior.
- **Artwork:** artwork is cached for offline downloads in IndexedDB, the service worker serves cached artwork, and network artwork retries are bounded. The service worker's artwork storage is capped at 12 MiB. Homepage art is now warmed in bounded batches and Quick Picks/active slides use higher fetch priority.
- **Authentication:** access tokens are short-lived (configured to 60 minutes); refresh sessions are configured for 30 days, refresh-token rotation is implemented, Remember Me controls cookie persistence, and server-side sessions support revocation. Keep this architecture; validate behavior with browser tests instead of extending access-token life.
- **Offline media:** downloaded media and metadata already use IndexedDB. Search can use downloaded tracks. Listening history previously failed online-only writes without a durable retry queue; a local owner-scoped queue and idempotent server event IDs now cover this gap.

## Changes made in this upgrade

1. Homepage slides can use cached Recently Added tracks as fallback when recent/suggestion data is empty. Active carousel artwork is prioritized; a bounded artwork warm-up covers the Home collections.
2. Quick Picks images load eagerly with high priority.
3. Listening events have client-generated event IDs and original timestamps. Failed/offline starts are queued by account, retained until acknowledged, and flushed when the connection returns or the account playback owner is restored. The API accepts those IDs/timestamps and treats matching event retries as idempotent.
4. Recommendation genre matching no longer maps hardcoded genre names to taxonomy families. It compares normalized catalog genre labels and token overlap, keeping genre metadata database-driven and ready for future analyzed features.

## Remaining implementation work and acceptance criteria

### A. Baseline measurements and search/database profiling
- Capture cold/warm timings for Home, Search, Library, playlist open, artwork, and API requests.
- Profile representative search query plans and DB indexes with realistic catalog sizes.
- Keep candidate caps, pagination, cancellation, and result correctness intact.
- Add regression measurements to CI; optimize only identified hot paths.

### B. Cache and artwork consistency
- Reconcile cache invalidation across Home, Library, Search, Artist, Album, Playlist, and Player.
- Verify artwork version changes invalidate the right cached cover; retain old good art while refreshes fail.
- Confirm cache storage limits and account scoping, including guest identity behavior.
- Avoid warming large libraries; prioritize visible/next content.

### C. Recommendations and AI analysis preparation
- Continue using actual listening history, completions/skips, recent context, artist/album/genre catalog metadata, and diversity rules.
- Design AI track analysis as a versioned, asynchronous background service with structured results stored in the database (for example, descriptors/features and analysis provenance). The recommender should consume cached structured analysis; page loads and playback must never wait on AI.
- Do not select a provider or add AI secrets/dependencies until model/provider and privacy requirements are decided.
- Evaluate recommendation quality with repeatability, diversity, skip/complete feedback, cold-start, and no-hardcoded-catalog tests.

### D. Sessions
- Validate Remember Me checked: persistent refresh cookie, silent token rotation, browser restart restoration.
- Validate Remember Me unchecked: session cookie only and no remembered profile.
- Validate logout, admin revocation, and security invalidation clear/reject sessions.
- Keep access tokens short-lived and refresh tokens rotated.

### E. Offline-first
- Test offline play with downloads, local Recently Played, queue retention, reconnection upload, duplicate retries, account changes, and partial upload failure.
- Add reconciliation for offline progress/outcome data if required, beyond recording offline play starts.
- Confirm storage quota/eviction and explain download availability in the UI.

### F. Regression and release gate
- Run frontend tests/build, backend tests/lint, offline/PWA tests, desktop/mobile checks, and cross-device playback tests.
- Do not deploy to production until checks pass and the build/deploy status is verified.
- Test guest, registered, admin, offline-only, and account-switch cases.
