# HyperSynced

HyperSynced is a mobile-first music streaming application with a React/Vite frontend, a FastAPI backend, Neon PostgreSQL persistence, and Backblaze B2 media storage.

This README describes the **current deployment and code paths on `Semifinals`**. It is not a list of every planned feature. The implementation in the repository is authoritative; where a feature is still being developed, it is identified as such.

## Current deployment

| Layer | Current location / responsibility |
|---|---|
| Production web app | `https://hypersynced.app/` |
| Frontend hosting | Northflank frontend service |
| API | `https://api.hypersynced.app/` |
| Backend hosting | Contabo Ubuntu VPS, repository at `/opt/hypersynced` |
| Backend process | Docker container `hypersynced-backend`, listening on port 8000 and bound locally to `127.0.0.1:8000` |
| Database | Neon PostgreSQL |
| Media and artwork storage | Backblaze B2 |
| Lyrics lookup | LRCLIB integration |
| DNS / edge | Cloudflare |

The frontend and backend deploy independently. The GitHub Actions workflow `.github/workflows/deploy-contabo-vps.yml` runs on pushes to `Semifinals`: it builds the backend image, connects to the VPS using pinned SSH host verification, deploys the triggering commit, checks database readiness and a playlist API route, and attempts to restore the previous backend container if deployment fails.

The frontend is built by the Northflank frontend service. A successful GitHub status/build check is not, by itself, proof that the live site has completed a release or that every browser path works.

## Source of truth and client-side storage

- Neon PostgreSQL is the persistent source of truth for accounts, catalog records, playlists, library records, listening history, and account app state.
- The browser may keep short-lived, same-runtime in-memory data to avoid repeating work during the current page session. This is an optimization, not persistent account storage.
- IndexedDB is reserved for explicit offline media/download data and related offline job records. It is not the authoritative store for account navigation, playback state, or playlist ownership.
- The service worker manages the versioned PWA application shell and static assets. It must not turn account state or playback state into a stale browser-persisted source of truth.
- The player is a browser audio experience. Account playback state is synchronized through the backend and database; do not describe the current system as a shared local-only player or assume a persistent cross-device WebSocket player unless the implementation is changed and verified.

When changing state ownership, preserve the existing database models, API contracts, and migration history. Do not add a second persistent state system or new tables to solve a frontend cache problem.

## Main application areas

The current frontend is organized under `frontend/src`, with the main application shell in `App.jsx` and page components under `components/pages/`. Major user-facing areas include:

- Home and recently played
- Search across tracks, artists, albums, playlists, and people
- Library, liked tracks, owned playlists, and saved playlists
- Playlist detail, editing, ordering, and offline-download actions
- Artist, album, and profile views
- Player controls and synchronized lyrics
- Administrative catalog and upload tools

The backend is under `backend/app/`, with FastAPI routes in `backend/app/api/routes/`, SQLAlchemy models in `backend/app/models/`, and shared services in `backend/app/services/`.

## Search behavior and performance

Search is served by the backend search route and its search service. It supports normalized query interpretation, intent-aware results, PostgreSQL-assisted candidate selection and similarity matching where available, bounded candidate/result sets, and separate result construction for tracks, artists, albums, and people.

Artist playlist generation is not supposed to rank and build a playlist inside the latency-sensitive search request. Search returns an existing generated artist playlist when available; missing playlist maintenance is queued through the existing maintenance-job path.

Performance changes should preserve:
- Existing query meaning, ranking tiers, and stable ordering
- Published-track visibility and account authorization
- Existing result response schemas and frontend API contracts
- Bounded database work and predictable memory use
- The existing background maintenance mechanism

Do not optimize search by silently removing fuzzy matching, changing result visibility, or returning stale account-specific data.

## Playlist behavior

Playlist records and membership are stored in PostgreSQL. The backend exposes playlist summary/detail and mutation routes through `backend/app/api/routes/playlists.py`. Playlist detail supports `limit` and `offset` pagination; the frontend API helper preserves the legacy full-playlist behavior when a caller requests the complete collection.

The frontend uses a bounded, same-runtime in-memory cache for recently visited library and playlist data. It is not a durable database substitute. Offline playlist downloads are a separate explicit feature and use the offline storage/job system.

When improving playlist opening:
1. Start the playlist API request immediately.
2. Display a usable cached playlist immediately when one exists.
3. Display the fresh server response as soon as it arrives.
4. Run offline membership reconciliation and cache updates after the visible playlist is rendered.
5. Preserve track order, complete-playlist behavior for playback/download operations, and safe error handling.

Avoid making a user click twice, waiting for unrelated offline metadata, or forcing a full-library download just to resolve a single track.

## Local development

The repository is designed for Windows, VS Code, and PowerShell, with Python backend tooling and Node/Vite frontend tooling.

Typical setup:

```powershell
cd C:\Users\<you>\Desktop\Hypersynced

# Activate the project virtual environment
.\.venv\Scripts\Activate.ps1

# Backend checks
python -m ruff check backend tests
python -m pytest -q
python -m compileall -q backend

# Frontend build and PWA/offline tests
cd frontend
npm ci
npm run build
npm run test:offline
```

Use the repository's provided launcher scripts for local startup. `go` is the update-oriented launcher and may fetch/switch to a selected remote commit according to its installed version. `go-local` is intended to run the current working tree without updating or discarding local edits. Read the current `go.ps1`, `go-local`, and installer scripts before changing launcher behavior; do not assume older README instructions about a special branch still apply.

## Verification and deployment safety

Useful checks before pushing:

```powershell
python -m ruff check backend tests
python -m pytest -q
python -m compileall -q backend
powershell -ExecutionPolicy Bypass -File .\scripts\verify-project.ps1
git diff --check
git status
```

Run the frontend build and offline/PWA tests using the scripts in `frontend/package.json`. Run database-backed tests only with the configured isolated test database and required test services.

The load-test scripts under `load/` are guarded against production targets. Keep those safeguards. Load testing must use an explicitly identified staging host; never point load tests at the live production application.

For a backend deployment, confirm the GitHub Actions workflow completed successfully and then verify the live API readiness endpoint and critical routes. For a frontend deployment, separately confirm the Northflank release and test the live site. Do not infer a completed production deployment from a commit or build status alone.

## Security and media authorization

- Keep database, JWT, and B2 credentials on the server.
- Never commit `.env` files or expose private credentials through `VITE_*` variables.
- Enforce playlist ownership, account permissions, and administrative access in the backend.
- Keep request-size limits, admission controls, rate limits, and CORS restrictions enabled.
- Media ingestion, storage, and streaming must be limited to content the project owner owns, licenses, or has explicit permission to use. Public metadata discovery does not grant permission to ingest media.

## Change-management rules

- Make changes on `Semifinals` unless the project owner explicitly asks otherwise.
- Do not create a new branch, rewrite `main`, or deploy to an unapproved environment.
- Preserve working playback, authentication, navigation, database, PWA, and offline-download behavior.
- Prefer small, coherent changes over broad rewrites or duplicated state systems.
- Do not add migrations or tables unless the existing schema cannot support the requirement and the change is explicitly approved.
- Update this README when the actual architecture, deployment topology, commands, or behavior changes.
- State exactly which checks and deployments were verified. A passing test suite is useful evidence, not a guarantee that every production user path is flawless.

## Repository map

```text
backend/
  app/
    api/routes/       FastAPI route handlers
    models/           SQLAlchemy models
    services/         Shared backend business logic
frontend/
  src/
    api/              Frontend API clients
    components/pages/ Application pages
    player/           Player-related modules
    *.js              Shared state, cache, and utility modules
tests/                Backend tests
frontend/src/*.test.js  Frontend Node tests
load/                 Guarded staging-only load scenarios
scripts/              Verification and development utilities
.github/workflows/    CI and deployment workflows
```

For the current implementation, inspect the source files and workflows on the checked-out branch rather than relying on older milestone descriptions or speculative architecture notes.
