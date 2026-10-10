// Capture only public production GET responses from a server-side GitHub Actions runner.
// No credentials, bets, manual scores, or fabricated fixtures enter this snapshot.
import fs from "node:fs/promises";
import path from "node:path";
const API = "https://football-v2.acchtt.workers.dev";
const ROOT = "pages/demo-preview-data";
const date = (offset) => {
  const now = new Date(Date.now() + 7 * 3600000);
  now.setUTCDate(now.getUTCDate() + offset);
  return now.toISOString().slice(0, 10);
};
async function getJSON(route) {
  const url = API + route;
  let err;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {headers: {Accept: "application/json"},
        signal: AbortSignal.timeout(13000), cache:"no-store"});
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (!data || data.ok === false) throw new Error("Invalid API payload");
      return data;
    } catch (e) { err = e; }
  }
  console.warn("Unavailable public feed:", route, String(err).slice(0, 180));
  return null;
}
await fs.mkdir(ROOT, {recursive:true});
const dashboard = await getJSON("/api/dashboard-data?snapshot=" + Date.now());
if (!dashboard || !Array.isArray(dashboard.schedule) || !Array.isArray(dashboard.picks)) {
  console.error("Dashboard API unavailable: refusing to publish an empty/fake snapshot.");
  process.exit(1);
}
// Include one extra UTC day on either side so ICT midnight windows stay covered.
const dates = [...new Set(Array.from({length: 13}, (_, i) => date(i - 6)))];
const today = date(0);
// Only source-confirmed provider identifiers can ever supply preview crests.
const providerTeams = new Map();
const conflictingTeams = new Set();
const normalizeTeam = name => String(name || '').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club|and)\b/g,' ')
  .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const results = await Promise.all(dates.map(async day => {
  // Capture genuine empty fixture days as well as ranked days.
  // Missing files must mean unavailable, never silently "zero matches".
  const hasBoard = dashboard.schedule.some(row => row.slateDate === day);
  const events = await getJSON("/api/bsd/events?date_from=" + day + "&date_to=" + day + "&limit=200");
  if (events) {
    await fs.mkdir(path.join(ROOT,"events"),{recursive:true});
    await fs.writeFile(path.join(ROOT,"events",day+".json"),JSON.stringify(events));
    for (const event of (events.data?.results || events.data?.events || [])) {
      for (const side of ["home","away"]) {
        const id = Number(event[side+"_team_id"]);
        const name = String(event[side+"_team"] || "");
        const key = normalizeTeam(name);
        if (!key || !Number.isSafeInteger(id) || id <= 0) continue;
        if (providerTeams.has(key) && providerTeams.get(key).id !== id) {
          conflictingTeams.add(key);
        } else if (!providerTeams.has(key)) providerTeams.set(key,{name,id});
      }
    }
  }
  return {date:day,hasBoard,eventsCaptured:Boolean(events)};
}));
const live = await getJSON("/api/bsd/live");
if (live) await fs.writeFile(path.join(ROOT,"live.json"),JSON.stringify(live));
const soccer = await Promise.all(dates.map(async day => {
  if (!dashboard.schedule.some(row => row.slateDate === day)) return {date:day,skipped:true};
  const diff = Math.round((Date.parse(day+"T12:00:00Z")-Date.parse(today+"T12:00:00Z"))/86400000);
  const value = await getJSON("/api/soccerway/board?day="+diff);
  if (value) {
    await fs.mkdir(path.join(ROOT,"soccerway"),{recursive:true});
    await fs.writeFile(path.join(ROOT,"soccerway",day+".json"),JSON.stringify(value));
  }
  return {date:day,captured:Boolean(value)};
}));
// Do not publish ambiguous aliases. Empty mappings are explicit, never guessed.
const verifiedTeams = Object.fromEntries([...providerTeams].filter(([name]) =>
  !conflictingTeams.has(name)).sort(([a],[b]) => a.localeCompare(b)));
await fs.writeFile(path.join(ROOT,"logos.json"),JSON.stringify({
  source:"captured public football-v2 fixture IDs",
  capturedAt:new Date().toISOString(),
  teams:verifiedTeams
}));
await fs.writeFile(path.join(ROOT,"dashboard.json"), JSON.stringify(dashboard));
await fs.writeFile(path.join(ROOT,"manifest.json"), JSON.stringify({
  source:"public football-v2 API", mode:"read-only-snapshot", capturedAt:new Date().toISOString(),
  timeZone:"Asia/Ho_Chi_Minh", scheduleRows:dashboard.schedule.length,
  dates:results,soccerway:soccer,liveCaptured:Boolean(live)
},null,2));
console.log("Captured verified public snapshot:",dashboard.schedule.length,"board rows;",results.filter(x=>x.eventsCaptured).length,"event days.");
