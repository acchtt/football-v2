# SlipTrace Football API — Cloudflare Worker

This Worker replaces the Vercel backend for the GitHub Pages frontend.

## Endpoints

- `GET /health`
- `GET /api/dashboard-data`
- `GET /api/live-scores`
- `POST /api/manual-score`

## Cloudflare setup

1. Cloudflare Dashboard → Workers & Pages → Create application → Import a repository.
2. Select `acchtt/football-v2`.
3. Set the project/Worker name to `sliptrace-football-api`.
4. Set Root directory to `backend/cloudflare-worker`.
5. Deploy command: `npx wrangler deploy`.
6. Save and Deploy.

Cloudflare Workers supports direct GitHub integration and deploys automatically on pushes.

## Secrets

After the first Worker exists, open Worker → Settings → Variables and Secrets and add these as **Secret** values:

- `BSD_API_TOKEN`

`AIRTABLE_TOKEN` is no longer required for `/api/dashboard-data`. The dashboard reads the public-safe Google Sheets projection configured by `BOARD_FEED_URL`. Legacy manual-score code may still require the old token until that write path is retired.

The non-secret values are already in `wrangler.jsonc`:

- `BOARD_FEED_URL=https://raw.githubusercontent.com/acchtt/football-v2/main/pages/data/board-feed.json`
- `BSD_API_BASE_URL=https://sports.bzzoiro.com/api/v2`
- `ALLOWED_ORIGIN=https://acchtt.github.io`

Do not commit `.dev.vars` or `.env` files.

## Switch the frontend

After Cloudflare gives the Worker a URL such as:

`https://sliptrace-football-api.<your-subdomain>.workers.dev`

change `pages/config.js`:

```js
window.SLIPTRACE_API = "https://sliptrace-football-api.<your-subdomain>.workers.dev";
```

GitHub Pages will redeploy without requiring Vercel.
