# HyperSynced

HyperSynced is a mobile-first music streaming application. Its codebase is organized as a web frontend, an API backend, persistent data storage, and supporting background and offline features.

This README explains how the application is structured and how its main parts work. It focuses on the codebase rather than hosting vendors, infrastructure providers, or server addresses.

## Technology stack

- **Frontend:** React and Vite
- **Backend:** Python and FastAPI
- **Database access:** SQLAlchemy and database migrations
- **Frontend testing:** Node-based tests and build checks
- **Backend testing:** pytest and Ruff
- **Application delivery:** Progressive Web App (PWA) support

## Application architecture

The application is divided into two main code areas:

- `frontend/` contains the user interface, page components, API clients, player modules, and browser-side utilities.
- `backend/` contains API routes, database models, and shared application services.

The frontend communicates with the backend through API requests. The backend validates requests, applies application rules, reads or updates persistent records, and returns structured responses for the frontend.

## Frontend

The main frontend application is under `frontend/src/`.

- `App.jsx` provides the main application shell.
- `components/pages/` contains the main application pages.
- `api/` contains frontend API clients.
- `player/` contains player-related modules.
- Shared JavaScript modules support application state, caching, and common utilities.

Major application areas include:

- Home and recently played
- Search for tracks, artists, albums, playlists, and people
- Library, liked tracks, owned playlists, and saved playlists
- Playlist details, editing, ordering, and offline-download actions
- Artist, album, and profile pages
- Player controls and synchronized lyrics
- Administrative catalog and upload tools

## Backend

The backend application is under `backend/app/`.

- `api/routes/` contains FastAPI route handlers.
- `models/` contains SQLAlchemy database models.
- `services/` contains shared business logic used by API routes and background tasks.

The backend is responsible for authentication and authorization, validating input, enforcing ownership rules, coordinating database operations, and returning API responses.

## Database and application state

Persistent account and application records are stored in the database. This includes catalog records, playlists, library information, listening history, and account application state.

The browser may use short-lived in-memory data to avoid repeating work during the current page session. This is a performance optimization, not a replacement for persistent storage.

IndexedDB is used for explicit offline media/download data and related offline job records. It is not the authoritative store for account navigation, playback state, or playlist ownership.

The service worker manages the versioned PWA application shell and static assets. Account and playback state should continue to be resolved through the application backend rather than becoming dependent on stale browser-persisted state.

## Search

Search is handled by backend search routes and shared search services. The implementation supports normalized query interpretation, intent-aware results, database-assisted candidate selection and similarity matching where available, bounded candidate/result sets, and separate result construction for tracks, artists, albums, and people.

Artist playlist generation is kept out of the latency-sensitive search request. Search can return an existing generated artist playlist, while missing playlist maintenance is handled through the background maintenance-job path.

Search changes should preserve query meaning, ranking behavior, stable ordering, published-track visibility, authorization, response schemas, and bounded database work.

## Playlists

Playlist records and membership are stored persistently. Backend routes provide playlist summaries, details, and mutations.

Playlist detail supports pagination through `limit` and `offset`. The frontend API helper also preserves full-playlist behavior for operations that need the complete collection.

The frontend may use a bounded, same-session in-memory cache for recently visited library and playlist data. Offline playlist downloads are handled separately through the offline storage and job system.

When a playlist is opened, the frontend can display usable cached data while requesting the latest server response. Offline membership reconciliation and cache updates should not delay the initial visible playlist.

## Player and playback state

The player is a browser audio experience. Account playback state is synchronized through the backend and persistent database records.

The player, account state, and offline-download system have separate responsibilities. Changes should preserve existing playback behavior, track ordering, authorization, and synchronization contracts.

## Offline and PWA support

The application includes PWA support for its application shell and static assets. Offline media/download data and related job records are handled separately from normal account state.

The service worker should serve the correct versioned application assets without allowing outdated cached assets to override a newer application release.

## Local development

The project can be developed with VS Code, PowerShell, Python, and Node.js.

Typical setup:

```powershell
# Open the project directory
cd C:\Users\<you>\Desktop\Hypersynced

# Activate the Python virtual environment
.\.venv\Scripts\Activate.ps1

# Backend checks
python -m ruff check backend tests
python -m pytest -q
python -m compileall -q backend

# Frontend build and offline/PWA tests
cd frontend
npm ci
npm run build
npm run test:offline
```

Use the repository's provided launcher scripts for local startup. The `go` launcher is update-oriented; `go-local` is intended to run the current working tree without updating or discarding local edits. Check the current launcher scripts for their exact behavior.

## Testing and code quality

Useful backend and repository checks include:

```powershell
python -m ruff check backend tests
python -m pytest -q
python -m compileall -q backend
powershell -ExecutionPolicy Bypass -File .\scripts\verify-project.ps1
git diff --check
git status
```

Run frontend build and offline/PWA tests using the scripts defined in `frontend/package.json`. Run database-backed tests only with the configured isolated test database and required test services.

Load-test scenarios under `load/` are guarded against production targets and should only be run against an explicitly designated test environment.

## Security principles

- Keep database, authentication, and storage credentials out of frontend code.
- Never commit `.env` files or expose private credentials through `VITE_*` variables.
- Enforce playlist ownership, account permissions, and administrative access in the backend.
- Keep request-size limits, admission controls, rate limits, and cross-origin restrictions enabled.

## Repository structure

```text
backend/
  app/
    api/routes/       API route handlers
    models/           Database models
    services/         Shared backend business logic
frontend/
  src/
    api/              Frontend API clients
    components/pages/ Application pages
    player/           Player-related modules
    *.js              Shared state, cache, and utility modules
tests/                Backend tests
frontend/src/*.test.js  Frontend Node tests
load/                 Guarded test load scenarios
scripts/              Verification and development utilities
.github/workflows/    Automation workflows
```

The checked-out source code is the authoritative description of current behavior. Treat planned features and architectural proposals as unimplemented until they are present in the code and verified.
