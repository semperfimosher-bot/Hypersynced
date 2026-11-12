# HyperSynced instant-experience performance plan

**Target branch:** `Semifinals`  
**Status:** Architecture and measurement plan; implementation not yet approved or certified.  
**Primary objective:** Make every user interaction feel immediate while preserving correct server state, playback reliability, security, accessibility, and offline behavior.

## 1. Product-level performance goal

The application should respond immediately to user intent. A click, keypress, tab switch, search submission, playlist open, or page navigation must not wait for unrelated network work.

“Instant” is a perceived-performance requirement, not a promise that every remote operation completes in zero milliseconds. The UI should render useful cached or optimistic state immediately, show clear pending feedback for work that truly requires the server, and reconcile with authoritative results without jarring reloads.

This applies to:
- App startup, session restoration, and initial home content.
- Every navigation destination and return to a previously visited page.
- Search typing, suggestions, filters, sorting, and result opening.
- Playlist, album, artist, profile, library, and Recently Played views.
- Track actions, likes/saves, playlist edits, queue actions, and other buttons.
- Artwork, metadata, lyrics, and audio preparation.
- Background refresh, listening-history writes, and cross-device account/library synchronization.

## 2. Existing architecture observed in Semifinals

Initial source inspection found:
- React 19 and Vite 8; the frontend package currently lists React, React DOM, Vite, and music-metadata, but no TanStack Query dependency.
- Route-level React lazy loading in `App.jsx`, with the home page import warmed during bootstrap.
- A visited-page warm cache in `pageWarmCache.js`; `App.jsx` uses React Activity to retain visited page state.
- Account-scoped library and playlist snapshots in `libraryCache.js`, backed by IndexedDB and a small localStorage mirror.
- API GET request deduplication in `api/client.js`.
- A single long-lived HTML audio element and track warm-up logic in `audioPlayer.js`.
- Existing service-worker, media-cache, artwork, and offline-download modules that need to be audited before changing cache ownership or policies.

These are useful foundations. They do not prove the app is currently fast or correct. In particular, retaining page components does not guarantee their data is already available, and caching must be validated for freshness, account isolation, invalidation, memory use, and failure recovery.

## 3. Engineering principles

1. **Measure before changing.** Capture real startup, navigation, search, playlist-open, artwork, and playback timings on representative devices and network conditions.
2. **Instant local response; authoritative server state.** Render cached state immediately when safe. Use optimistic updates for reversible user actions, then reconcile with the server and roll back clearly on failure.
3. **One coherent cache strategy.** Inventory existing in-memory, localStorage, IndexedDB, service-worker, HTTP, and backend caches. Do not add a second server-state cache library until the audit shows a concrete gap and a migration plan.
4. **Prefetch by intent and probability.** Warm the likely next page, playlist metadata, and visible artwork on hover, focus, viewport proximity, or navigation intent, with concurrency and bandwidth limits. Do not eagerly download the entire library or audio catalog.
5. **Keep the main thread responsive.** Profile long tasks, large renders, parsing, sorting, and metadata work. Move only measured CPU-heavy work to Web Workers; avoid worker overhead for trivial tasks.
6. **Keep audio independent.** Playback and queue transitions must not wait on page rendering, artwork, lyrics, or listening-history writes. Audio preloading must respect data-saver, memory, and bandwidth limits.
7. **Protect correctness and privacy.** Cache keys must include the correct account/guest scope. Logout and account changes must prevent private data leaking between users. Mutations must remain authorized by the backend.
8. **Progressive enhancement.** The app must remain usable when caches are empty, IndexedDB is unavailable, the service worker is absent, or the network is slow.
9. **No technology cargo-culting.** Adopt Spotify-like engineering outcomes, not an arbitrary copy of Spotify’s internal stack. Keep the existing React/FastAPI/PostgreSQL architecture unless profiling proves a technology change is justified.

## 4. Workstreams and implementation order

### Phase 0 — Baseline and instrumentation

- Record the exact Semifinals commit and clean/dirty working-tree state before implementation.
- Map app startup, session restoration, navigation, data-fetch, cache, rendering, artwork, and playback flows.
- Add or verify performance marks for app boot, first useful content, route intent, route content ready, search keystroke-to-results, playlist intent-to-content, artwork visible, and play intent-to-audio-start.
- Use browser Performance traces, React Profiler, Network panel, and backend request timings.
- Establish repeatable cold-cache and warm-cache test journeys for home, search, library, playlist, artist, profile, and Recently Played.
- Record p50/p75/p95 results and the test device, browser, cache state, and network conditions.

### Phase 1 — Navigation and page readiness

- Ensure route code is prefetched before likely navigation without bloating the initial bundle.
- Separate “page shell ready” from “page data ready”; show the cached view immediately when valid.
- Preserve page state only where it improves return navigation; cap retained page instances and memory.
- Avoid duplicate page fetches and repeated effects when a page is reactivated.
- Make every navigation control respond immediately, with accessible pending states only when needed.
- Test direct deep links, browser back/forward, refresh, session expiry, and account switching.

### Phase 2 — Unified server-state and local cache behavior

- Document each resource’s source of truth, cache key, storage layer, TTL/staleness policy, invalidation events, and account scope.
- Reuse existing IndexedDB snapshots where sound; fix missing cache-first reads or invalidation rather than layering on competing caches.
- Consider TanStack Query only if it materially simplifies uncovered server-state needs; if adopted, migrate one resource family at a time and remove duplicate caching logic.
- Use stale-while-revalidate for suitable read-only data, with explicit freshness rules for permissions and private data.
- Persist snapshots asynchronously; never block a click or first render on a storage write.
- Add tests for cache miss, stale cache, network failure, invalidation, logout, and account switching.

### Phase 3 — Search and collection opening

- Debounce network search only enough to avoid request floods; keep input and local filtering immediate.
- Cancel or ignore stale requests so older results cannot overwrite newer queries.
- Deduplicate equivalent requests and cache recent query results with bounded memory.
- Load playlist/album/artist summaries first; fetch large track collections progressively.
- Virtualize long lists when profiling shows DOM/render cost is material.
- Prefetch collection details when the user expresses intent, without fetching every collection in the background.
- Keep sorting/filtering local when the complete relevant dataset is already available.

### Phase 4 — Optimistic interactions and button responsiveness

- Inventory all interactive controls and classify them as local, server mutation, navigation, or destructive.
- Update local UI immediately for safe reversible actions such as likes, saves, and playlist edits.
- Reconcile successful writes with server responses; roll back and explain failures.
- Prevent double submissions and conflicting mutations without making controls feel frozen.
- Keep destructive actions confirmed and server-authorized.
- Add interaction tests for rapid repeated clicks, offline use, 4xx/5xx responses, and concurrent updates.

### Phase 5 — Artwork, static assets, and media

- Audit artwork URL resolution, cache keys, versioning, expiry, 503 behavior, and duplicate requests.
- Use responsive image sizes, modern formats where supported, lazy loading below the fold, and preloading for the currently visible/high-confidence next artwork.
- Set correct CDN/browser cache headers for immutable versioned assets; do not cache authorization-sensitive responses publicly.
- Verify service-worker cache behavior, update lifecycle, quota handling, and offline fallback.
- Keep lyrics and metadata loading independent from audio playback.

### Phase 6 — Playback and background work

- Measure play-intent-to-audible-start and next-track transition separately from page load.
- Prepare only the current and a small, justified number of likely next audio sources; respect Save-Data and connection constraints.
- Keep listening-history writes, analytics, artwork, lyrics, and nonessential sync off the critical playback path.
- Validate source reuse, range requests, media cache behavior, and failure recovery before changing the player.
- Preserve the single-player invariant and cross-device account/library behavior currently intended by the product.

### Phase 7 — Backend and delivery path

- Measure endpoint p50/p95 latency, database query count, connection-pool pressure, payload size, and cache hit rate.
- Add indexes or query changes only from query plans and measured bottlenecks.
- Paginate large collections and avoid N+1 query patterns.
- Use compression and conditional HTTP requests where beneficial.
- Verify CDN and reverse-proxy behavior for static assets and artwork separately from authenticated API responses.
- Do not change hosting, secrets, DNS, production routing, or deployment configuration as part of this performance work without explicit authorization.

## 5. Initial performance budgets (targets to validate, not current claims)

Measure on a defined reference desktop and mobile device, with both warm and cold cache.

| Journey | Initial target |
|---|---:|
| Local button/navigation feedback | within 100 ms |
| Warm cached page shell | within 100 ms |
| Warm cached page useful content | p75 within 200 ms |
| Search local feedback | within 100 ms |
| Search results after settled query | p75 within 300 ms on normal network |
| Cached playlist/album opening | p75 within 200 ms |
| Artwork for visible primary item | p75 within 300 ms when cached/CDN reachable |
| Main-thread long tasks | minimize; investigate tasks over 50 ms |
| Audio start | retain the existing sub-1-second product goal; measure separately |

Remote cold-cache requests depend on network and server conditions. Report them honestly rather than masking slow work with fake loading completion.

## 6. Required regression gates

Every implementation step must:
- Pass the relevant frontend tests and production build.
- Pass relevant backend tests when API or data behavior changes.
- Include tests for cache invalidation and account isolation when caching changes.
- Preserve login/logout, guest access, library, playlist, search, Recently Played, lyrics, queue, playback, and offline behavior.
- Be manually checked in a real browser on cold and warm cache.
- Include before/after measurements from the same journey and environment.
- Be reverted or redesigned if it improves one path while making startup, navigation, Recently Played, or playback worse.

## 7. Explicit non-goals and safeguards

- Do not blindly install TanStack Query, Redux, a new router, a new database, or a new backend framework.
- Do not prefetch every page, playlist, artwork file, or audio track.
- Do not sacrifice data correctness for optimistic UI.
- Do not serve stale private data across account boundaries.
- Do not remove existing cache/service-worker/player code until all call sites and tests are understood.
- Do not create a new branch; work only on `Semifinals`.
- Do not merge, deploy, alter production infrastructure, or change credentials as part of this plan.
- Do not claim “instant” or “fixed” without repeatable measurements and regression tests.

## 8. First implementation task

Complete Phase 0 as a read-only audit first. Produce:
1. A route and interaction inventory.
2. A cache ownership/invalidation map.
3. A request waterfall for startup, search, playlist open, and Recently Played.
4. A ranked bottleneck list with evidence.
5. A small first implementation slice with tests and measurable acceptance criteria.

Only then change production code, one bounded slice at a time.
