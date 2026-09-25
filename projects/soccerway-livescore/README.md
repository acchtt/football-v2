# Soccerway Live

Standalone livescore prototype backed by Soccerway's public web feed.

## Endpoints

- `/` — live score UI
- `/api/fixtures?day=0` — normalized fixture feed
- `/api/fixtures?day=0&view=live` — live matches only
- `/api/live?day=0` — live matches only
- `/api/health` — health check

`day` supports integers from `-7` to `7`.

## Design

- Soccerway is the primary upstream source.
- The Worker normalizes match ID, competition, region, kickoff timestamp, teams, score and status.
- Upstream responses are cached at the Worker for 10 seconds to reduce unnecessary load.
- The browser UI refreshes every 20 seconds.
- This project is isolated from the main `football-v2` Worker.

## Development

```bash
npm install
npm run dev
```

## Deployment

The repository workflow `.github/workflows/deploy-soccerway-livescore.yml` deploys this folder as the independent Cloudflare Worker `soccerway-livescore`.

This relies on an undocumented website feed and may require maintenance if Soccerway changes its frontend protocol.

## ARC XI fallback

This worker is also used as the zero-cost fallback score source for ARC XI when a ranked Board match is not available from BSD.
