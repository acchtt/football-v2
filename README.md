# Football v2

Private decision-control software for football Asian-total Over selections. The target production model is **Football v0.2.47-R — PRE-HARDENING**.

The system is designed to turn a full eligible daily slate into an immutable PRE shortlist, ingest confirmed XI information, accept a manually uploaded Asian-total market, require explicit user verification, issue `OFFICIAL LOCK` or `HOLD` only through approved model logic, and later settle the result and P/L correctly.

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
→ verified Asian-total market comparison
→ LOCK/HOLD
→ result settlement
→ optional audit
```

Structure comes before price. Price cannot promote a structurally weak match.

Chance quality / xG is supporting repeatability evidence. Missing or weak xG is not a blanket veto and no general 5-match / 3-venue / 60%-xG hard gate is active.

Extreme recent totals or defensive leakage may identify a candidate but cannot carry the pick by themselves. The scoring route still needs repeatable creation evidence; otherwise priority/protection should fall or the match should HOLD.

H2H is a modifier only. Confirmed attacking names may strengthen an existing route but cannot create a route that the underlying profile contradicts.

When structure is valid, prefer the lowest clean Asian-total burden rather than stretching for a small price improvement. This preference does not authorize a lowest-line-only market selector.

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
├── web/                          Next.js dashboard/workbench
└── api/
    ├── app/
    │   ├── api/                  HTTP routes + model-control endpoint
    │   ├── db/                   SQLAlchemy models/session
    │   ├── football_engine/
    │   │   └── versions/
    │   │       └── v0_2_47_R/   version-contained deterministic engine
    │   ├── jobs/                 daily + provider update entry points
    │   ├── providers/            BSD/Sportmonks/demo + scope filtering
    │   ├── services/             board, XI/result updates, market verification, Airtable
    │   ├── storage/              private screenshot storage
    │   └── vision/               demo/OpenAI image extraction adapters
    └── tests/

infra/postgres/schema.sql         reference PostgreSQL schema
```

The dashboard reads the active model state from `GET /api/v1/model/state` and displays the model version/regime plus recent-total and Sep-1 status. The model version/timezone are not environment-overridable settings.

## Implemented on this branch

- Next.js structural board and match workbench
- FastAPI daily-board and analysis endpoints
- canonical model-state validation and visible runtime banner
- PostgreSQL append-only records for PRE, submissions, stage events, market verification, official bets, settlements and audit/change-control records
- BSD provider integration with automatic **confirmed** XI ingestion; predicted XI is not accepted as production confirmation
- automatic final-result retrieval using regulation-time score for settlement
- Sportmonks/demo provider support and canonical competition scope wrapper
- ICT date normalization
- deterministic PRE structural scorer
- immutable `(fixture, model_version)` PRE freezes
- deterministic XI rerank with neutral fallback when no approved player-role mapping exists
- explicit immutable state-machine events through `MARKET_RECEIVED`
- manual bookmaker odds screenshot upload/extraction
- manual odds correction as a new immutable submission version
- **explicit user verification of the latest saved odds version before `MARKET_RECEIVED`**
- browser dirty-state protection: edited but unsaved prices cannot be verified
- legacy HTTP verdict execution disabled while canonical fair-total logic is missing
- correct Asian-total quarter-line settlement and exact P/L, including `O2.75 @1.93` with exactly 3 goals = `+0.465u`
- optional Airtable projection to `SlipTrace Football Decision Control / Decision States`
- Airtable remains a reporting mirror; PostgreSQL/event history remains authoritative
- Airtable market verification is represented as `Assessment Period = MARKET` plus evidence, without creating new legacy Verdict select choices

## Market workflow

V1 does **not** use an automatic bookmaker odds feed.

```text
WAITING_MARKET
→ upload bookmaker screenshot
→ OCR / extraction
→ review extracted match + Asian totals + prices
→ optional correction (creates new immutable odds version)
→ explicit Verify saved odds action
→ MARKET_RECEIVED
```

API endpoints:

```text
GET  /api/v1/matches/{fixture_id}/market
POST /api/v1/matches/{fixture_id}/odds
POST /api/v1/matches/{fixture_id}/odds/{submission_id}/corrections
POST /api/v1/matches/{fixture_id}/odds/{submission_id}/verify
```

Only the latest immutable odds submission can be verified. A correction after verification creates a new unverified version and must be verified again.

`POST /api/v1/matches/{fixture_id}/verdict` currently returns `503` by design. The old market selector is not allowed to issue a production lock while the approved situational adjustment / projected-goal-distribution / fair-total / market-comparison logic is absent.

## Airtable sync

Airtable is optional and non-authoritative.

```text
AIRTABLE_SYNC_ENABLED=true
AIRTABLE_TOKEN=<secret>
AIRTABLE_BASE_ID=appWyZJjitSBATXAU
AIRTABLE_DECISION_STATES_TABLE=Decision States
```

Sync is keyed by the stable structural `Assessment ID`, so repeated jobs update the same reporting record rather than creating duplicates. Airtable failures do not roll back or alter canonical football decisions.

## Remaining V1 work

The major model blocker is still the deterministic calculation chain after XI:

1. restore/define the approved situational adjustment;
2. restore/define projected goal distribution and fair total;
3. implement fair-total vs verified-market comparison without a lowest-line-only shortcut;
4. reproduce the Club América–Monterrey acceptance case as `OFFICIAL LOCK O2.75 @1.89` and settle FT 2-2 as `+0.89u`;
5. add production database migrations for the new append-only tables;
6. complete audit/proposed-change API/UI and deployment scheduler wiring;
7. pass the full API/web/container validation gate before merge.

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

The default fixture and vision providers are `demo`. BSD is the preferred production data provider on this branch when `FIXTURE_PROVIDER=bsd` and `BSD_API_TOKEN` is configured. Sportmonks remains available as an alternate provider.

For screenshot extraction set `VISION_PROVIDER=openai`, `VISION_MODEL=gpt-5.6`, and `OPENAI_API_KEY` in the backend environment.

## Jobs

```bash
cd apps/api
python -m app.jobs.daily
python -m app.jobs.updates
```

The daily job builds/freeze the slate. The updates job polls provider-confirmed XI and finished results. Calendar dates are resolved in the canonical `Asia/Ho_Chi_Minh` timezone.

## Validation

```bash
cd apps/api && ruff check . && pytest
cd apps/web && npm run typecheck && npm run build
docker compose build api web
```

The repository should not be considered production-ready if these checks fail or if `/api/v1/model/state` does not show `v0.2.47-R`, `PRE-HARDENING`, recent-total confirmation active, and Sep-1 hardening inactive.
