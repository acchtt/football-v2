# Football v2

Private decision-control software for football Asian-total Over selections. Phase 1 turns a full daily fixture slate into a frozen, ranked shortlist using the deterministic Football `v0.2.47-R` methodology.

This is not a generic tips site and it does not use price to rescue a weak structural match.

## Phase 1 status

Implemented:

- Next.js daily shortlist dashboard
- FastAPI board and daily-job endpoints
- PostgreSQL data model and reference schema
- swappable fixture and stats provider interfaces
- ICT (`Asia/Ho_Chi_Minh`) date normalization
- permanent K League 1/2 exclusion
- versioned structural engine with Two-Sided and Elite Carrier peer routes
- mandatory profile, chance-quality, and failure-resistance gates
- immutable structural freezes and append-only decision states
- quality-first ranking plus independent next-kickoff marker
- realistic demo slate for end-to-end local use
- Asian-total settlement tests for `O2.75`, `O3`, `O3.25`, `O3.5`, and `O3.75`

Phase 2 (lineup/odds screenshot extraction, manual correction, XI rerank, goal-burden choice, and final LOCK/HOLD verdict) is intentionally not started in this milestone.

## Architecture

```text
apps/
├── web/                         Next.js 16 + TypeScript dashboard
└── api/
    ├── app/
    │   ├── api/                 HTTP routes
    │   ├── db/                  SQLAlchemy models and session
    │   ├── football_engine/
    │   │   └── versions/
    │   │       └── v0_2_47_R/  immutable model implementation
    │   ├── jobs/                daily scheduler entry point
    │   ├── providers/           provider contracts and demo adapter
    │   ├── schemas/             typed API contracts
    │   └── services/            ingestion, freezing, board queries
    └── tests/
infra/postgres/schema.sql         reference PostgreSQL schema + append-only triggers
docker-compose.yml                local database, API, and web stack
```

The engine accepts normalized evidence rather than provider-specific payloads. A future API integration implements `FixtureProvider` and `StatsProvider`; it does not change grading rules or UI code.

## Run locally

Requirements: Docker with Compose.

```bash
cp .env.example .env
docker compose up --build
```

Open:

- dashboard: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- health check: `http://localhost:8000/health`

The default `demo` provider seeds the requested ICT date the first time its board is read. It includes strong, weak, and K League fixtures so filtering behavior is visible.

## API

Read today’s ICT board:

```http
GET /api/v1/board
```

Read a specific ICT date:

```http
GET /api/v1/board?date=2026-08-31
```

Run idempotent ingestion/freezing explicitly:

```http
POST /api/v1/jobs/daily?date=2026-08-31
```

Running that job again does not rewrite an existing `(fixture, model_version)` assessment.

## Schedule the daily job

The scheduler entry point is:

```bash
cd apps/api
python -m app.jobs.daily
```

Run it once per day from cron, a Supabase scheduled function, or a worker. For example, `00:05 ICT` corresponds to `17:05 UTC` on the preceding day:

```cron
5 17 * * * cd /path/to/football-v2/apps/api && /path/to/python -m app.jobs.daily
```

The job itself always resolves the calendar date in `Asia/Ho_Chi_Minh`, so host timezone does not change the board date.

## Development without Docker

API:

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
export DATABASE_URL='postgresql+psycopg://football:football_local_only@localhost:5432/football_v2'
pytest
uvicorn app.main:app --reload
```

Web:

```bash
cd apps/web
npm ci
API_BASE_URL=http://localhost:8000 npm run dev
```

Validation:

```bash
cd apps/api && ruff check . && pytest
cd apps/web && npm run typecheck && npm run build
```

## Structural engine behavior

The prematch scorer uses the strongest legitimate primary route—Two-Sided strength or Elite Carrier ceiling—then applies profile, chance-quality, and failure-mode resistance. Two-Sided and Elite Carrier are peers. A strong carrier does not need opponent scoring, but it still needs repeatable creation and acceptable suppression risk.

Hard rules are applied outside the weighted score:

- K League 1/2 always returns `EXCLUDED`.
- Missing required profile/evidence returns `DATA_INCOMPLETE` and is not displayed.
- A failed mandatory gate caps the match below the board.
- Only `A1`, `A2`, and `B+` frozen assessments appear.
- Existing freezes are returned unchanged on repeated ingestion.
- Price is absent from Phase 1 ranking by design.

Thresholds live in `apps/api/app/football_engine/versions/v0_2_47_R/config.py` and are explicit, typed, and version-contained.

## Data integrity

`structural_assessments` is unique by fixture and model version. Both structural assessments and decision states are append-only in application code; `infra/postgres/schema.sql` adds database triggers that reject updates and deletes as a second guardrail.

Do not put provider keys, database passwords, or model credentials in the repository. Add new keys to `.env.example` with empty/demo-safe values only.

