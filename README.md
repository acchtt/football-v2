# Football v1.0 Website

Website-first rebuild of the football decision-control workflow.

## Current model

- Football v0.2.47-R
- PRE-HARDENING
- ICT / Asia/Ho_Chi_Minh
- Recent-total / defensive-leakage confirmation: active
- Sep-1 hardening framework: inactive
- Minimum Over price: 1.70
- Maximum Over price: 2.30
- No blanket grade-based maximum-total ceiling

## V1 architecture — no OpenAI API required

The website automates data collection and market verification, while current-model reasoning is handed off manually to the Football ChatGPT project.

1. BSD daily competition-scoped slate
2. Mandatory pre-kickoff GF/GA + xG/chance evidence
3. Broad mechanical retrieval pass only
4. Website generates a PRE analysis packet
5. User copies packet into the Football ChatGPT project
6. ChatGPT returns JSON TOP FOCUS / STRONG FOCUS / SECONDARY shortlist
7. User pastes JSON back into the website
8. Match page loads confirmed BSD XI only (`lineup_status=confirmed`)
9. User uploads bookmaker odds screenshot and verifies visible rows
10. Website generates an XI + market decision packet
11. User copies packet into the Football ChatGPT project
12. ChatGPT returns JSON LOCK/HOLD + preferred line/price
13. User pastes the result back into the website

The mechanical 0–100 retrieval score is not an official model decision. It exists only to reduce the evidence set handed to ChatGPT. The website fails closed instead of treating retrieval candidates as official picks.

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

No `OPENAI_API_KEY` is needed.

BSD authentication is `Authorization: Token YOUR_BSD_API_KEY`.

The website uses:

- `GET /api/v2/events/` for the ICT daily slate and finished team history;
- `GET /api/v2/events/{id}/` for match detail and regulation-time scores;
- `GET /api/v2/events/{id}/stats/` when historical xG/chance fields are missing;
- `GET /api/v2/events/{id}/lineups/` for the teamsheet.

Predicted lineups are ignored. Only `lineup_status=confirmed` populates the XI stage.

You can check the BSD connection at:

```text
/api/bsd/status
```

## Example odds images

Every match workbench contains three built-in bookmaker-style example screenshots:

- Club América–Monterrey
- Köln–Hoffenheim
- Ipswich–Leicester

Selecting an example displays the local image and preloads only the values visibly shown in it. Those values remain editable and require **Verify visible odds** before the final ChatGPT decision packet becomes available.

Custom screenshots can also be uploaded and previewed. Until server-side extraction is connected, their visible rows are entered manually.

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

## Build and deploy

GitHub Actions runs `npm install` and `npm run build` on every push to `main`.

Vercel production is connected to GitHub and deploys `main` automatically.
