# BSD architecture for Football v2

## Decision

Use BSD in two different ways because the website and the AI agent have different needs.

```text
Website / automation
  -> BSD REST API for fixtures, history, lineups, odds and snapshots
  -> BSD WebSocket for live score/stat/odds updates when enabled
  -> Football v2 deterministic engine
  -> frozen decisions / picks store / Airtable sync

AI analysis
  -> BSD MCP server
  -> retrieve match detail, lineups, odds, predictions, incidents and shotmaps
  -> explain, audit and review Football v2 decisions
```

The website should not use MCP as its primary data transport. MCP is the agent-facing interface; REST and WebSocket are the deterministic application-facing interfaces.

## Why this split

- REST is predictable, cacheable and straightforward to test in the backend.
- WebSocket avoids polling for live changes and is appropriate for notifications/live monitoring.
- MCP lets an AI agent discover and call BSD tools without screenshot OCR or custom endpoint plumbing.
- The football engine remains provider-agnostic. BSD data is normalized into the existing `ProviderFixture`, `TeamProfileSnapshot` and `StructuralMetrics` contracts.
- Provider output remains evidence, not the final verdict. BSD predictions and prices must not rescue a structurally weak match.

## Production cutover rule

Do not switch an already-used deployment from Sportmonks to BSD under the same frozen model/evidence identity.

The current database freezes structural assessments by fixture + model version. A provider change can materially change the evidence while the deterministic engine code stays the same. Production cutover therefore needs one of these:

1. deploy BSD together with the current new Football model version, or
2. extend the freeze identity to include an explicit evidence/provider version.

The live Airtable schema now explicitly separates these concepts. New decision states should carry the Football model version plus provider/evidence metadata rather than encoding provider changes into `Model Version` strings.

## Live Airtable mapping

Base: `SlipTrace Football Decision Control` (`appWyZJjitSBATXAU`)

Table: `Decision States` (`tblQmUpd5WjBLQ38X`)

Existing website sync fields:

- `Website Fixture ID` — `fld9Xd1TuQ8YgKHgc`
- `Result` — `fldbj9hGDsFRoLqJD`
- `P/L u` — `fldHsWSxgsttOLdSS`
- `Stake u` — `fldQAfycHA2H7XLdw`

BSD migration fields added on 2026-09-02:

- `BSD Event ID` — `fldJkbO5Pux6n3qL8`
- `Data Provider` — `fldMEPCDNDCY50A10`
- `Evidence Version` — `fldDOcl4GcqpW6isQ`
- `BSD Snapshot At` — `fldnkOQOd4i5E5b2J`

Recommended identity for new frozen evidence:

```text
Website Fixture ID
+ Model Version
+ Data Provider
+ Evidence Version
```

`BSD Event ID` is the canonical external match identifier whenever BSD coverage exists. `BSD Snapshot At` must be the exact ISO-8601 evidence timestamp used for the decision state so lineup/odds/live evidence cannot be treated as synchronized when captured at different moments.

Do not rewrite historical records just to backfill these fields. Populate them prospectively and only backfill when the source identity is authoritative.

## Backend settings

```dotenv
FIXTURE_PROVIDER=bsd
BSD_API_TOKEN=your_backend_only_token
BSD_BASE_URL=https://sports.bzzoiro.com/api/v2
BSD_TIMEOUT_SECONDS=20
BSD_HISTORY_MATCHES=10
BSD_LOOKBACK_DAYS=180
```

Never expose `BSD_API_TOKEN` to the Next.js browser bundle.

## MCP endpoint

Football MCP server:

```text
https://sports.bzzoiro.com/mcp
```

Use MCP for AI research/audits, not as the website's canonical feed.

## Migration order

1. Treat the current ChatGPT-hosted site as production source of truth; the GitHub `main` branch is stale.
2. Export/sync the current deployed BSD/Airtable/picks-tracking source back into this repository before merging this branch.
3. Rebase this branch onto that source.
4. Wire new Decision States to `BSD Event ID`, `Data Provider`, `Evidence Version`, and `BSD Snapshot At`.
5. Verify BSD event/team/stat field shapes with the real account token in staging.
6. Run provider parser tests and a one-day shadow board against the current production board.
7. Compare fixture coverage, xG coverage, lineup availability and odds timestamps.
8. Cut over the board ingestion provider only after the shadow board is stable.
9. Replace screenshot lineup/odds ingestion with BSD REST data where the deployed source still uses screenshots.
10. Add WebSocket live updates only after prematch ingestion is stable.
11. Keep MCP separate as the AI analysis/audit layer.

## Fail-closed behavior

The BSD provider intentionally returns incomplete evidence when team IDs/history/xG are unavailable. Existing normalization gates then keep the match off the ranked board rather than substituting weaker data.
