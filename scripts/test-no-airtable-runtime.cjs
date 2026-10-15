'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const active = [
  'backend/cloudflare-worker/src/push-entry.js',
  'backend/cloudflare-worker/src/app-v2-entry.js',
  'backend/cloudflare-worker/src/health-entry.js',
  'backend/cloudflare-worker/src/dashboard-entry.js',
  'backend/cloudflare-worker/wrangler.jsonc',
  'app/api/dashboard-data/route.ts',
  'app/api/manual-score/route.ts',
  'lib/manual-scores.ts',
];

for (const file of active) {
  const text = fs.readFileSync(file, 'utf8');
  assert(!/AIRTABLE_TOKEN|AIRTABLE_BASE_ID|api\.airtable\.com/i.test(text),
    `${file}: active Airtable runtime dependency remains`);
}

const dashboard = fs.readFileSync(
  'backend/cloudflare-worker/src/dashboard-entry.js',
  'utf8',
);
assert(!dashboard.includes('from "./index.js"'),
  'active dashboard must not import the legacy Airtable entry');
assert(dashboard.includes('sourceStore !== "GOOGLE_SHEETS"'),
  'dashboard must validate the Google Sheets projection source');

const health = fs.readFileSync(
  'backend/cloudflare-worker/src/health-entry.js',
  'utf8',
);
assert(health.includes('probeBoardProjection'),
  'health must probe the Google Sheets public projection');
assert(health.includes('activeStore: "GOOGLE_SHEETS"'),
  'health must report Google Sheets as the active store');
assert(!health.includes('probeAirtable'),
  'Airtable health probe must stay retired');
assert(health.includes('url.pathname === "/api/manual-score"'),
  'manual-score compatibility endpoint must be explicit');
assert(health.includes('}, 410, env, request)'),
  'manual-score web writes must fail closed after Airtable retirement');

const wrangler = fs.readFileSync(
  'backend/cloudflare-worker/wrangler.jsonc',
  'utf8',
);
assert(wrangler.includes('"BOARD_FEED_URL"'),
  'Worker must be configured with the Google Sheets board projection URL');
assert(!/AIRTABLE_/i.test(wrangler),
  'Worker config must not declare Airtable bindings');

console.log('PASS active website runtime has no Airtable dependency; Google Sheets projection is authoritative');
