import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const read = p => fs.readFile(p,"utf8");
const [app,html,css,glass,bridge,config,behavior,snapshot,logos] = await Promise.all([
  read("pages/app-v2.js"),read("pages/index.html"),read("pages/schedule-v2.css"),
  read("pages/cosmic-schedule-background.css"),read("pages/demo-api-bridge.js"),
  read("pages/config.js"),read("pages/matchday-behavior.js"),
  read("demo-preview/capture-snapshot.mjs"),read("pages/schedule-logos.js")
]);
const extract=(source,start,end)=> {
  const i=source.indexOf(start), j=source.indexOf(end,i+start.length);
  assert(i>=0&&j>i,"Missing function block: "+start);
  return source.slice(i,j);
};

// Run the REAL date-strip function with a selected date outside the today window.
const dateCode=extract(app,"  function dateStrip() {","  function anchorClock(");
const dateHtml=vm.runInNewContext("(function(){"+dateCode+";return dateStrip()})()",{
  state:{date:"2026-10-15",board:{schedule:[]}},
  todayKey:()=>"2026-10-09",boardDateCount:()=>0,
  esc:x=>x,Date,Intl
});
assert.deepEqual([...dateHtml.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"/g)].map(x=>x[1]),[
  "2026-10-13","2026-10-14","2026-10-15","2026-10-16","2026-10-17"
]);
assert(!dateHtml.includes(" disabled"),"Empty days must stay navigable");
assert(dateHtml.includes('aria-pressed="true"'));

// Run REAL competition grouping against interleaved competitions.
const displayNameCode=extract(app,"  function displayCompetitionName(name) {","  function boardMatchList(");
const groupCode=extract(app,"  function boardMatchList(boardRows) {","  function groupedMatches(");
const rows=[
  {match:"Fixture A",competition:"League X"},
  {match:"Fixture B",competition:"League Y"},
  {match:"Fixture C",competition:"League X"}
];
const listing=vm.runInNewContext("(function(){"+displayNameCode+groupCode+";return boardMatchList(rows)})()",{
  rows,eventForBoardRow:()=>null,soccerwayForBoardRow:()=>null,
  leagueName:()=>"unknown",leagueId:()=>null,esc:x=>x,
  boardMatchBlock:r=>'<article data-fixture="'+r.match+'"></article>',
  competitionMark:()=>'<svg></svg>',crest:()=>'',externalLogo:()=>''
});
assert.deepEqual([...listing.matchAll(/data-fixture="([^"]+)"/g)].map(x=>x[1]),
  rows.map(x=>x.match),"Grouping changed chronological order");
assert.equal((listing.match(/League X/g)||[]).length,2,
  "Separated league fixtures must create separate chronological groups");
assert(!listing.includes("scheduleGroupChevron"));
assert(listing.includes('role="heading" aria-level="2"'));

// Guard major regression classes. Syntax validation runs separately in CI.
assert(html.includes('<div id="app"></div>')&&!html.includes('<main id="app">'));
assert(html.includes("app-v2.js?v=69"));
assert(app.includes("root.inert = true")&&app.includes("root.inert = false"));
assert(app.includes("event.key !== 'Tab'")&&app.includes("returnFocus?.isConnected"));
assert(app.includes("if (IS_SNAPSHOT || document.visibilityState"));
assert(app.includes("if (editing) state.boardQuery = editing.value"));
assert(app.includes("IS_READ_ONLY_PREVIEW &&")||app.includes("!IS_READ_ONLY_PREVIEW &&"));
assert(bridge.includes("window.__ARCXI_DEMO_READ_ONLY__ = true"));
assert(bridge.includes("window.__ARCXI_SNAPSHOT_CAPTURED_AT = m.capturedAt"));
assert(snapshot.includes("Array.from({length: 13}") &&
       !snapshot.includes("if (!hasBoard && day !== today)"));
assert(config.includes("window.__ARCXI_BUILD__ !== 'schedule-reference-v67-demo-repair'"));
assert(behavior.includes("if (!window.__ARCXI_DEMO_SNAPSHOT__) setInterval("));
assert(logos.includes("verifiedSnapshotLogos()")&&logos.includes("normalize(found.name) === normalized"));
assert(snapshot.includes('logos.json')&&snapshot.includes('conflictingTeams.add(key)'));
assert(!app.includes("IS_SNAPSHOT && state.board && !boardRowsForDate().length ? ''"));
assert(app.includes("Saved fixture coverage unavailable"));
const formatted=vm.runInNewContext("(function(){"+displayNameCode+";return displayCompetitionName('QATAR_STARS_LEAGUE')})()");
assert.equal(formatted,"Qatar Stars League","Raw league IDs must become readable labels");
assert(app.includes("Older than 6 hours"),"Stale snapshots must be labeled");
assert(css.includes("min-width:44px")&&css.includes("min-height:44px"));
assert(css.includes("scheduleSnapshotNotice")&&css.includes("grid-template-columns:44px"));
assert(glass.includes("cosmic-wallpaper-3840.webp"));
assert(app.includes("wonyoung-liz-bottom-right.webp?v=2"));
console.log("PASS: actual date-strip, consecutive competition grouping, snapshot guards, keyboard, CSS and identity invariants");
