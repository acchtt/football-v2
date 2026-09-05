# Football Decision Control

A deliberately narrow workflow:

1. ChatGPT researches upcoming matches using Football v0.2.47-R PRE-HARDENING.
2. ChatGPT publishes only approved PRE matches by updating `data/published-matches.json`.
3. Vercel deploys the publication automatically from `main`.
4. The website resolves each published match against BSD and waits for `lineup_status=confirmed`.
5. Published XI requirements are checked against the confirmed starters.
6. The user uploads an Asian-total odds screenshot.
7. Browser-side OCR extracts candidate line/price rows; the user verifies them.
8. The website returns LOCK / HOLD / WAIT using only the published XI and market policy.

The website does **not** research the slate, rank fixtures, create scoring routes, or invent a market burden. ChatGPT is the research/publishing control plane; the site is the execution plane.

## Published match contract

Each match contains:

- kickoff / competition / teams
- focus status
- research summary and source links
- carrier / secondary route / failure resistance / recent confirmation
- player-specific XI requirements when relevant
- an ordered Asian-total line/price ladder

If no match is published, the website board is intentionally empty.

## Runtime configuration

```env
BSD_API_BASE_URL=https://sports.bzzoiro.com/api/v2
BSD_API_TOKEN=YOUR_BSD_TOKEN
```

No OpenAI API key or database is required.

## Market execution

The site supports decimal prices and Hong Kong prices. Prices below 1.20 are interpreted as HK and normalized to decimal by adding 1.00. The user must verify OCR results before a verdict is allowed.

A LOCK is possible only when:

- confirmed BSD XI is available when required;
- every required published starter is present;
- a verified offered total exactly matches a published market choice;
- the normalized price is inside both the match-specific and global published range.

Otherwise the site returns HOLD or WAIT.

## Development

```bash
npm install
npm run dev
```

GitHub Actions runs `npm install` and `npm run build`. Vercel production is connected to `main`.
