# Football v1.0 Website

Fresh website-first rebuild of the football decision-control workflow.

## Current model

- Football v0.2.47-R
- PRE-HARDENING
- ICT / Asia/Ho_Chi_Minh
- Recent-total / defensive-leakage confirmation: active
- Sep-1 hardening framework: inactive
- Minimum Over price: 1.70
- Maximum Over price: 2.30
- No blanket grade-based maximum-total ceiling
- Approved distribution adapter: `RECIPROCAL_TOTAL_SCENARIO_COUNT_V1`
- Upstream total-goal scenario producer: still pending; no Poisson fallback

## Product flow

1. BSD daily eligible slate
2. Mandatory pre-kickoff GF/GA history
3. Structural ranking before price
4. PRE freeze / PASS-FIRST when mandatory evidence is missing
5. Confirmed XI from BSD only (`lineup_status=confirmed`)
6. Bookmaker odds screenshot
7. Visible line/price verification
8. LOCK or HOLD
9. Regulation-time result settlement

BSD's own odds endpoints are deliberately not used in the V1 verdict path.

## BSD setup

```bash
cp .env.example .env.local
```

Set:

```env
DATA_PROVIDER=bsd
BSD_API_BASE_URL=https://sports.bzzoiro.com/api/v2
BSD_API_TOKEN=YOUR_BSD_API_KEY
BSD_HISTORY_MATCHES=10
BSD_LOOKBACK_DAYS=180
```

BSD authentication is `Authorization: Token YOUR_BSD_API_KEY`.

The website uses:

- `GET /api/v2/events/` for the ICT daily slate and finished team history;
- `GET /api/v2/events/{id}/` for match detail and regulation-time scores;
- `GET /api/v2/events/{id}/lineups/` for the teamsheet.

Predicted lineups are ignored. Only `lineup_status=confirmed` populates the XI stage.

You can check the configured connection at:

```text
/api/bsd/status
```

Without `BSD_API_TOKEN`, the app stays in DEMO mode using three canonical model controls rather than silently fabricating live data.

## Example odds images

Every match workbench contains three built-in bookmaker-style example screenshots:

- Club América–Monterrey
- Köln–Hoffenheim
- Ipswich–Leicester

Selecting an example displays the actual local image and preloads only the values visibly shown in it. Those values remain editable and require **Verify visible odds** before the UI marks the market as received.

Custom screenshots can also be uploaded and previewed. Until server-side image extraction is connected, their visible rows are entered manually; no hidden OCR values can reach the model.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The daily board supports an ICT date parameter, for example:

```text
/?date=2026-09-04
/api/board?date=2026-09-04
```

## Build gate

GitHub Actions runs `npm install` and `npm run build` on every push to `main`.
