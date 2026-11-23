# HyperSynced scope and simplification audit

**Branch:** `Semifinals`  
**Audit baseline:** `d0e12b2dda315022e3a86e96fa91b63ab75ef3cf`  
**Audit type:** Static repository inventory and architecture review. No runtime, production, or staging behavior was changed.

## Executive summary

HyperSynced is a real, feature-rich music application, but the codebase has grown past a simple project. It is not necessary to rewrite it. The safer approach is to freeze scope, clarify boundaries, and simplify only after we can prove which parts are redundant and what behavior they protect.

The biggest immediate maintainability risks are large central files and overlapping state/cache responsibilities. Size and naming are signals to investigate, not proof that code is unnecessary or defective. This audit deliberately makes no destructive removals.

## Product scope we should keep

**Product definition:** A personal music streaming app for discovering and playing music, organizing a library/playlists, and downloading music for offline use, with account-owned library and listening history syncing across devices.

Core user outcomes:
1. **Discover:** Home, search, artist/music discovery, recommendations and artwork.
2. **Play:** Reliable local browser playback, queue, seek, next/previous, lyrics, and restore behavior.
3. **Organize:** Account library, liked tracks, playlists, saved playlists, and profile basics.
4. **Sync:** Account authentication and library/history data persists and syncs; playback control remains device-local.
5. **Offline:** PWA shell, cached artwork/metadata where appropriate, and explicitly downloaded media.

These are the product's foundation. Keep them working throughout simplification.

## Repository inventory (baseline snapshot)

| Area | Count / observed stack |
|---|---|
| Repository tracked tree blobs | 523 files |
| Frontend source | 226 files under `frontend/src` |
| Frontend components | 44 component files |
| Frontend stylesheets | 7 CSS files |
| Backend app | 65 files under `backend/app` |
| Backend API route files | 17 route modules (including package/router files) |
| Backend service modules | 24 files (including package initializer) |
| Backend tests | 82 files under `tests/` |
| Documentation | 28 files under `docs/` |
| Scripts and verification utilities | 35 files under `scripts/` |
| GitHub Actions workflows | 3 |
| Migration directory files | 38, including migration tooling; preserve historical migrations |

**Stack:** React 19 + Vite; Python/FastAPI; SQLAlchemy async + PostgreSQL/Alembic; object storage for media; PWA/service worker and IndexedDB for offline features. Frontend package scripts currently expose development, production build/check, preview, and the offline/regression test runner. Backend dependencies are declared in `requirements.backend.txt`; development tooling is in `requirements.dev.txt`.

## What each major area is for

### Frontend
- `App.jsx`: app startup, session restore, shell/navigation and high-level account/page state. Currently a large central coordination file.
- `components/pages/`: user-facing pages (Home, Search, Library, Artist, Profile, Messages and Admin).
- `components/layout/`: desktop/mobile navigation and layout.
- `components/player/`, `audioPlayer.js`, `player/`, `playerQueue*`, `accountPlayback.js`: player UI, browser audio, queue and playback lifecycle.
- `api/`: API client, auth/session handling and media/upload requests.
- `libraryCache.js`, `appShellCache.js`, `appViewCache.js`, `appViewState.js`, `catalogStore.js`, `profileSnapshotCache.js`, `messagesListCache.js`, `playerQueueCache.js`: different local state/cache responsibilities. Their boundaries and invalidation rules need to be reviewed before consolidation.
- `mediaCache.js`, `mediaNetworkCache.js`, `mediaStore.js`, `offlineDownloads.js`, `serviceWorker.js`, `artworkWarmCache.js`: media/network/offline/PWA storage. These are important to offline and playback behavior; do not casually remove or merge.
- `styles/`: styles are split by general, desktop, mobile, lyrics, profile, search and uploads. Large stylesheets need modularization only with visual regression coverage.

### Backend
- `api/routes/`: HTTP entry points and request/response contracts for auth, users, playlists/library, catalog/search, artists, audio/media, messages, recommendations and admin.
- `api/dependencies.py` and `api/router.py`: shared auth/session dependencies and route composition.
- `models/`: database entities for accounts/sessions, media/catalog, playlists, artist profiles, messages/notifications, maintenance and system state.
- `services/`: reusable business logic including authentication, catalog ingestion/metadata, search, playback-related playlist generation/autoplay, storage/media, lyrics, artist/profile, maintenance and notifications.
- `middleware/`, `security/`, `config.py`, `database.py`: resource bounds, request diagnostics, security/rate limits, configuration, DB connection/session management. These are safety and operational infrastructure—not cleanup targets without proof.

### Storage and deployment
- PostgreSQL + Alembic: authoritative account, catalog, library/playlist, history and related application data. Migration history is immutable; do not delete old migrations or drop production data as a cleanup shortcut.
- Object storage: audio/artwork assets. Keep ownership, authorization, upload recovery, integrity and stream-range behavior intact.
- PWA/IndexedDB/service worker: browser-side offline/cache layers. Keep cache account boundaries, logout clearing, offline download ownership, and versioned shell behavior.
- Docker/workflows/scripts: build, deploy, test, local startup/updating and operational verification. Do not change hosting/deploy credentials, production routing, or deploy configuration in a simplification pass.

## Keep / simplify / freeze / remove decision

### KEEP (core, protected)
- Auth, account registration/login/logout, Guest behavior, session lifecycle and Remember Me.
- Catalog, search, music metadata, artist pages, artwork, lyrics and audio streaming.
- Browser-local player/queue/seek/next/previous and correct same-device playback restoration.
- Library, liked music, playlists, saved playlists, account-scoped persistence and cross-device library/history synchronization.
- Offline/PWA shell, offline artwork/metadata support, and explicit downloads.
- Admin catalog/upload tools needed to maintain the music catalog and platform.
- DB schema/migration history, object storage, auth/security limits, error handling, tests and deployment safety.

### SIMPLIFY / CONSOLIDATE (only after mapping and tests)
- App shell and page state coordination in `App.jsx`; extract responsibilities into small focused modules, preserving behavior.
- Large pages (`LibraryPage.jsx`, `SearchPage.jsx`) and large stylesheets: split by responsibility with snapshot/journey coverage, not cosmetic wholesale rewrites.
- Cache/state architecture: first document each cache's key, storage, scope, TTL, owner, invalidation and fallback; then consolidate only genuinely duplicate caches.
- API orchestration and duplicated refresh/restore logic, if source review confirms duplicate behavior.
- Verification/docs: clarify the canonical run commands and current roadmap, archive stale plans after confirming they're superseded. Do not remove evidence or historical reports just to reduce file count.

### FREEZE (no expansion during stabilization)
- Messaging/social features (messages, follows, push notifications): retain existing behavior and security for now; no new social feature work.
- AI/recommendation/generated-playlist expansion: retain existing basic functionality; avoid expanding until core performance/reliability baseline is green.
- Advanced admin features beyond essential catalog maintenance: freeze new additions, but don't remove current admin functionality in this phase.
- Any new product feature: defer until cleanup/stability phases are complete.

### REMOVE (not approved yet; candidates require evidence)
No runtime features, routes, models, dependencies, cache layers, tests, or migrations are removed in this audit. Candidates can be removed only when all call sites, data ownership, production dependencies, tests and rollback implications have been checked and the change has an explicit preserve-list. Historical migration files and data are not candidates for deletion.

## Source-confirmed maintainability hotspots (not a claim of runtime bugs)

Large source files in the current snapshot:
- `frontend/src/components/pages/LibraryPage.jsx` (~144 KB)
- `frontend/src/styles/base.css` (~139 KB)
- `frontend/src/styles/search.css` (~129 KB)
- `frontend/src/components/pages/SearchPage.jsx` (~107 KB)
- `frontend/src/offlineDownloads.js` (~73 KB)
- `backend/app/api/routes/admin.py` (~63 KB)
- `backend/app/api/routes/search.py` (~61 KB)
- `frontend/src/audioPlayer.js` (~61 KB)
- `frontend/src/App.jsx` (~52 KB)
- `backend/app/services/music_metadata.py` (~48 KB)
- `backend/app/api/routes/playlists.py` (~46 KB)
- `backend/app/api/routes/users.py` (~45 KB)
- `frontend/src/mediaStore.js` (~45 KB)
- `backend/app/api/routes/messages.py` (~41 KB)

Large files increase review/debugging costs and make regressions easier to miss. The first refactoring candidates should be selected by responsibility and test coverage, not file size alone.

## Proposed simplified architecture (no technology rewrite)

**Frontend:** page components + focused UI components; one clear application/session coordinator; API client; local player and queue; resource-specific caches only where they demonstrably improve UX; separate offline download/media storage.

**Backend:** FastAPI routes stay thin; shared services contain business logic; SQLAlchemy/PostgreSQL remains authoritative; object storage handles media; background maintenance is bounded and observable.

**Ownership rules:**
- Server/database is authoritative for account identity, catalog, library, playlists, listening history, and account settings.
- Browser is authoritative for current device's audio playback, queue, and temporary UI state.
- Browser caches are performance/offline layers—not competing authorities. Each must be scoped, invalidated and cleared correctly.
- Account data syncs across devices; audio control does not silently become cross-device control.

## Cleanup roadmap and safeguards

### Phase 0 — Baseline and protection (this audit)
- Record branch and commit.
- Document product keep-list, inventory and architecture.
- No runtime changes and no destructive cleanup.

### Phase 1 — Stabilize the current core
- Verify current CI and local test status at the exact baseline SHA.
- Establish reproducible journeys: Guest startup, login/Remember Me/logout, search, library, playlist open/edit/save, play/seek/next/queue, same-device progress restore, artwork/lyrics, offline/download, account switch/privacy boundaries.
- Capture performance before modifying code; include warm/cold cache and recent-played behavior.
- Fix actual failures first, one cohesive issue at a time. Keep regressions protected with tests.

### Phase 2 — Simplify the largest coordination areas
- Begin with a responsibility map for `App.jsx`; extract cohesive session/navigation/page orchestration modules without changing behavior.
- Review `LibraryPage.jsx` and `SearchPage.jsx` for separable data-fetch/action/render submodules; add targeted tests before extraction.
- Decompose oversized backend route modules into route groups/services only when contracts remain unchanged and tests cover them.
- No broad CSS restyling or cache rewrite during these extractions.

### Phase 3 — Cache/state consolidation
- Create a cache matrix (resource, authoritative source, storage, scope, freshness, invalidation, fallback, owning module).
- Identify duplicate cache implementations and overlapping refresh coordinators from actual reads/writes.
- Consolidate one resource family at a time; require account-isolation, logout, offline and stale-data tests.
- Don't add another cache library or state-management framework without evidence that existing code can't serve the need.

### Phase 4 — Documentation/dependency housekeeping
- Identify outdated docs and branch-specific plans; tag canonical docs and move/archive superseded plans rather than deleting verification evidence.
- Review every dependency using imports, build scripts, tests and deployment image contents before proposing removals.
- Normalize Playwright ownership if the browser suite remains active (currently CI installs a pinned runtime without adding it to the frontend dev manifest); treat this as a dependency-management improvement, not a feature deletion.

### Phase 5 — Feature decisions
- After core journeys are stable, revisit frozen features and decide retain, simplify or remove. For any removal, trace UI/API/model/migration/storage/tests and migration/data consequences. Remove only in a separate, reviewable change with behavior tests and rollback plan.

## Required verification for every code cleanup

- Frontend regression tests and production build.
- Backend pytest, Ruff, Pyright and security/dependency checks as available.
- Migration-chain validation (without applying destructive changes to production).
- `git diff --check`, import/reference searches, and exact changed-file review.
- Browser/journey tests for touched behavior; performance comparison for cache, page, search or player changes.
- No claim of passing until checks have actually run on the resulting commit.

## Immediate next step

Use this document as the project scope boundary. The next code change should be a small, behavior-preserving extraction with tests (prefer a module with clear ownership and little cross-cutting state), or first repair/verify a failed core journey. Avoid doing multiple architectural rewrites together.
