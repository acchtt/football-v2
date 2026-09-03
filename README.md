# Football v2

Private decision-control software for football Asian-total Over selections. The target production model is **Football v0.2.47-R — PRE-HARDENING**.

The system is designed to turn a full eligible daily slate into an immutable PRE shortlist, ingest confirmed XI information, compare a manually uploaded Asian-total market against the model projection, issue `OFFICIAL LOCK` or `HOLD`, and later settle the result and P/L correctly.

## Canonical model control

The authoritative production configuration is:

```text
/model/MODEL_STATE.json
```

Runtime model behavior must come from that file. Historical audit notes, old patches, chat history, README text, and archived versions are not allowed to activate production rules.

Current canonical banner:

```text
Football v0.2.47-R
PRE-HARDENING
Recent-total confirmation: ACTIVE
Sep-1 hardening: INACTIVE
```

The API validates these guardrails at startup and fails closed if the canonical state attempts to activate Sep-1 hardening, silent model changes, audit-driven mutation, a legacy K League blanket exclusion, or the explicitly deprecated hardened restrictions.

Model changes follow:

```text
AUDIT OBSERVATION
→ PROPOSED CHANGE
→ EXPLICIT USER APPROVAL
→ MODEL_STATE.json CHANGE
→ VERSIONED GIT COMMIT
→ PRODUCTION ACTIVATION
```

An audit is evidence only. It cannot edit the active model automatically.

## Active structural principles

Production sequence:

```text
FULL ELIGIBLE SLATE
→ mandatory GF/GA team profile
→ structural scoring routes
→ carrier ceiling
→ secondary route
→ failure-mode resistance
→ recent-total/leakage confirmation where relevant
→ PRE rank/freeze
→ confirmed XI adjustment
→ situational adjustment
→ projected goal distribution / fair total
→ Asian-total market comparison
→ LOCK/HOLD
→ result settlement
→ optional audit
```

Structure comes before price. Price cannot promote a structurally weak match.

Chance quality / xG is supporting repeatability evidence. Missing or weak xG is not a blanket veto and no general 5-match / 3-venue / 60%-xG hard gate is active.

Extreme recent totals or defensive leakage may identify a candidate but cannot carry the pick by themselves. The scoring route still needs repeatable creation evidence; otherwise priority/protection should fall or the match should HOLD.

H2H is a modifier only. Confirmed attacking names may strengthen an existing route but cannot create a route that the underlying profile contradicts.

When structure is valid, prefer the lowest clean Asian-total burden rather than stretching for a small price improvement.

## Competition scope

Eligible:

- normal domestic leagues
- all English domestic cup competitions
- DFB-Pokal
- North American Leagues Cup (MLS/Liga MX)

Excluded unless explicitly added later:

- other domestic cups / league cups
- continental cups

`Leagues Cup` is a named exception and is evaluated before generic cup filtering. K League 1/2 do **not** have a blanket hard exclusion in the current canonical state.

All displayed times use `Asia/Ho_Chi_Minh` (ICT / GMT+7).

## Current repository architecture

```text
model/
└── MODEL_STATE.json              canonical active model source of truth

apps/
├── web/                          Next.js dashboard
└── api/
    ├── app/
    │   ├── api/                  HTTP routes + model-control endpoint
    │   ├── db/                   SQLAlchemy models/session
    │   ├── football_engine/
    │   │   └── versions/
    │   │       └── v0_2_47_R/   version-contained deterministic engine
    │   ├── jobs/                 daily scheduler entry point
    │   ├── providers/            demo/Sportmonks + canonical scope filter
    │   ├── services/             board, import, analysis/verdict flows
    │   ├── storage/              private screenshot storage
    │   └── vision/               demo/OpenAI image extraction adapters
    └── tests/

infra/postgres/schema.sql         reference PostgreSQL schema
```

The dashboard reads the active model state from `GET /api/v1/model/state` and displays the model version/regime plus recent-total and Sep-1 status. The model version/timezone are not environment-overridable settings.

## Implemented today

- Next.js structural board and match workbench
- FastAPI daily-board and analysis endpoints
- PostgreSQL models with append-only guards for structural assessments, submissions and decision states
- Sportmonks fixture/history adapter
- canonical competition scope wrapper
- ICT date normalization
- deterministic PRE structural scorer
- immutable `(fixture, model_version)` PRE freezes
- deterministic XI rerank engine
- odds screenshot upload/extraction with manual correction versions
- goal-burden selection
- immutable decision snapshots and official-bet creation
- correct Asian-total quarter-line settlement classification
- correct unit P/L helper, including `O2.75 @1.93` with exactly 3 goals = `+0.465u`
- canonical model-state validation and visible runtime banner

## Remaining V1 work

The repo is not yet the complete V1 described by the project handoff. The main remaining production work is:

1. replace the current lineup-screenshot workflow with automatic confirmed-lineup ingestion from the football API;
2. store explicit immutable state-machine events (`DISCOVERED → PRE_SCREENED → PRE_FROZEN → WAITING_XI → XI_CONFIRMED → XI_RERANKED → WAITING_MARKET → MARKET_RECEIVED → OFFICIAL_LOCK/HOLD → SETTLED → AUDITED`);
3. implement explicit situational adjustment and projected goal distribution / fair total in the persisted decision chain;
4. fetch final results automatically and persist settlement/P&L into the ledger;
5. add audit records and proposed-change records that cannot mutate `MODEL_STATE.json`;
6. add the Club América–Monterrey end-to-end acceptance fixture.

Do not add a bookmaker odds feed for V1. Odds remain a manual image upload with reviewable extraction before an official lock.

## Run locally

Requirements: Docker with Compose.

```bash
cp .env.example .env
docker compose up --build
```

Open:

- dashboard: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- health: `http://localhost:8000/health`
- active model state: `http://localhost:8000/api/v1/model/state`

The default fixture and vision providers are `demo`. For production fixtures/history set `FIXTURE_PROVIDER=sportmonks` and provide the Sportmonks API token. The token belongs only in backend/deployment secrets.

For screenshot extraction set `VISION_PROVIDER=openai`, `VISION_MODEL=gpt-5.6`, and `OPENAI_API_KEY` in the backend environment.

## Daily job

```bash
cd apps/api
python -m app.jobs.daily
```

Run it once per day from the deployment scheduler. The calendar date is always resolved in the canonical `Asia/Ho_Chi_Minh` timezone.

## Validation

```bash
cd apps/api && ruff check . && pytest
cd apps/web && npm run typecheck && npm run build
```

The repository should not be considered production-ready if these checks fail or if `/api/v1/model/state` does not show `v0.2.47-R`, `PRE-HARDENING`, recent-total confirmation active, and Sep-1 hardening inactive.
