# football-v2

SlipTrace Football Control now uses a hybrid deployment:

- GitHub Pages hosts the frontend UI from `pages/`.
- GitHub Actions deploys the Pages site on frontend changes.
- The existing Vercel project is retained only as the private API backend for Airtable and BSD secrets plus manual score writes.

This avoids Vercel build-rate limits for normal UI/layout work while keeping credentials off the public GitHub Pages client.

GitHub Pages URL: `https://acchtt.github.io/football-v2/`
API backend: `https://football-v2-nwyg.vercel.app`

The pre-scrap site remains preserved on branch `archive/site-before-scrap-2026-09-06`.
