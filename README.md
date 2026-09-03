# Football v1.0 Website

Fresh rebuild of the football decision-control website.

## Current model

- Football v0.2.47-R
- PRE-HARDENING
- ICT / Asia/Ho_Chi_Minh
- Recent-total / defensive-leakage confirmation: active
- Sep-1 hardening framework: inactive
- Minimum Over price: 1.70
- Maximum Over price: 2.30
- No blanket grade-based maximum-total ceiling

## Product flow

1. Daily eligible slate
2. Structural ranking before price
3. Mandatory team GF/GA profile
4. PRE freeze
5. Confirmed XI ingestion / rerank
6. Odds screenshot upload
7. Visible market verification
8. LOCK or HOLD
9. Automatic result settlement
10. P/L ledger

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The app runs in **DEMO** mode until a live normalized fixture endpoint is configured.

```bash
cp .env.example .env.local
```

Set `FOOTBALL_FIXTURES_JSON_URL` to a server that returns:

```json
{
  "matches": [
    {
      "id": "...",
      "kickoff": "2026-09-04T19:00:00+07:00",
      "competition": "...",
      "home": "...",
      "away": "...",
      "focus": "TOP FOCUS",
      "preRank": 1,
      "preScore": 9.1,
      "structuralFamily": "Two independent routes",
      "carrier": "...",
      "secondaryRoute": "...",
      "failureModeResistance": "High",
      "evidenceSummary": "...",
      "stage": "XI_CONFIRMED",
      "homeProfile": { "gf": 1.9, "ga": 1.2, "scoringTwoPlusRate": 0.6, "concedingTwoPlusRate": 0.3 },
      "awayProfile": { "gf": 1.8, "ga": 1.4, "scoringTwoPlusRate": 0.55, "concedingTwoPlusRate": 0.4 },
      "lineupStatus": "confirmed",
      "homeXI": [],
      "awayXI": [],
      "xiNote": "...",
      "offers": [],
      "verdict": "PENDING",
      "verdictReason": "Waiting for market"
    }
  ]
}
```

## Current build status

The visible website is now the priority. The first clean slice contains:

- ranked daily board;
- current-model banner and guardrails;
- match detail workbench;
- PRE structure and GF/GA profile;
- XI section;
- Asian-total market table;
- odds screenshot preview;
- verdict and settlement display;
- a normalized live-provider seam.

Next implementation work is to connect the existing football API directly, then connect server-side screenshot extraction and automated result settlement.
