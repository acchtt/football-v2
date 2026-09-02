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

Until the deployed source is synced back into GitHub, option 1 is safer and smaller.

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

1. Sync the current deployed BSD/Airtable/picks-tracking source back into this repository.
2. Rebase this branch onto that source.
3. Verify BSD event/team/stat field shapes with the real account token in staging.
4. Run provider parser tests and a one-day shadow board against the current production board.
5. Compare fixture coverage, xG coverage, lineup availability and odds timestamps.
6. Cut over the board ingestion provider only after the shadow board is stable.
7. Replace screenshot lineup/odds ingestion with BSD REST data where the deployed source still uses screenshots.
8. Add WebSocket live updates only after prematch ingestion is stable.
9. Keep MCP separate as the AI analysis/audit layer.

## Fail-closed behavior

The BSD provider intentionally returns incomplete evidence when team IDs/history/xG are unavailable. Existing normalization gates then keep the match off the ranked board rather than substituting weaker data.
