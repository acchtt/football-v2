# Football v2

Private decision-control software for football Asian-total Over selections. The application turns a full daily fixture slate into a frozen shortlist, reads confirmed-lineup and Asian-total screenshots, reranks the XI, and issues an immutable LOCK/HOLD verdict using Football `v0.2.47-R`.

This is not a generic tips site and it does not use price to rescue a weak structural match.

## Current status

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
- match detail decision workbench
- multi-image lineup and odds screenshot uploads
- swappable demo/OpenAI vision adapters
- structured lineup, bench, formation, missing-player, and odds extraction
- manual correction that creates a new immutable submission version
- deterministic XI rerank with normal one-band promotion cap
- explicit failure-mode validation and protected goal-burden selection
- automatic `OFFICIAL LOCK` creation when every gate clears
- append-only XI decision timeline with exact evidence snapshots

Live automation and settlement workflows remain future phases. Live evidence must validate or invalidate the frozen prematch thesis rather than create an unrelated thesis.

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
    │   ├── providers/           fixture/stats contracts and demo adapter
    │   ├── schemas/             typed API contracts
    │   ├── services/            ingestion, freezing, analysis, verdicts
    │   ├── storage/             private screenshot storage abstraction
    │   └── vision/              demo and OpenAI Responses adapters
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

The default fixture and vision providers are both `demo`. The fixture provider seeds the requested ICT date the first time its board is read. The demo vision adapter returns neutral, clearly labelled extraction data so the full upload-to-lock workflow can be tested without credentials.

## Enable real screenshot extraction

Set these values in `.env`:

```dotenv
VISION_PROVIDER=openai
VISION_MODEL=gpt-5.6
OPENAI_API_KEY=your_key_here
```

The adapter uses the OpenAI Responses API with Base64 image inputs and Pydantic Structured Outputs. Uploaded images are private application inputs and are not exposed by a public file route. Keep the API key only on the backend.

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

Match analysis endpoints:

```http
GET  /api/v1/matches/{fixture_id}
POST /api/v1/matches/{fixture_id}/lineup
POST /api/v1/matches/{fixture_id}/odds
POST /api/v1/matches/{fixture_id}/lineup/{submission_id}/corrections
POST /api/v1/matches/{fixture_id}/odds/{submission_id}/corrections
POST /api/v1/matches/{fixture_id}/verdict
```

Running the daily job again does not rewrite an existing `(fixture, model_version)` assessment. Repeating a verdict against the same evidence is also idempotent. Once an official lock exists for a fixture/model version, later calls return that original lock.

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

`structural_assessments` is unique by fixture and model version. Structural assessments, screenshot submissions, corrections, and decision states are append-only in application code; `infra/postgres/schema.sql` adds database triggers as a second guardrail. Manual correction inserts a new record linked through `supersedes_submission_id`.

For an existing Phase 1 database, apply `infra/postgres/migrations/0002_phase2.sql` before starting the Phase 2 API.

Do not put provider keys, database passwords, or model credentials in the repository. Add new keys to `.env.example` with empty/demo-safe values only.
