// Run with: node scripts/check-schedule.cjs
// Exercises the real renderer with BSD, Soccerway and unsupported/manual rows.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('pages/app-v2.js', 'utf8');
const root = {innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
const storage = {getItem:()=>null,setItem:()=>{}};
const context = {window:{},document:{getElementById:id=>id==='app'?root:null},
  localStorage:storage,sessionStorage:storage,location:{hash:'#board'},Date,Intl,console};
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf("  window.addEventListener('hashchange'")) +
  'window.test = {state, todayKey, boardMatchBlock, boardMatchList, renderMatchday, skeleton, formatTime, dateStrip, externalLogo, crest, boardEventScore, eventForBoardRow, statusKey, statusLabel, boardWarning};})();', context);
const t = context.window.test;
const date = t.todayKey();
const kickoff = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
const fixedKickoff = '2026-01-01T11:00:00Z';
const make = (id,match,extra={}) => ({id,match,kickoff,slateDate:date,competition:'Test League',tier:'FOCUS',...extra});
const bsd=make('bsd','Arsenal vs Chelsea');
const sw=make('sw','Singapore U23 vs Vietnam U23');
const manual=make('manual','Unsupported Home vs Unsupported Away',{manualScore:{home:2,away:1},status:'finished'});
const upcoming=make('pre','Upcoming Home vs Upcoming Away',{coverageNotes:'[FOLLOW: FOLLOW]',frozenPreSummary:'Rank #1 C-FOCUS'});
t.state.board={schedule:[bsd,sw,manual,upcoming],picks:[]};
t.state.today=[{id:101,home_team:{id:1,name:'Arsenal'},away_team:{id:2,name:'Chelsea'},league:{id:10,name:'Test League'},event_date:kickoff,status:'live',home_score:1,away_score:0,minute:30}];
const fixture={boardId:'sw',status:'finished',homeScore:2,awayScore:2,homeLogoUrl:'https://static.flashscore.com/res/image/data/test.png'};
t.state.soccerwayCache.set(date,{byId:new Map([['sw',fixture]])});
let row=t.boardMatchBlock(bsd,0);
assert(row.includes('1–0') && row.includes('LIVE') && row.includes('#match/101'));
assert(row.includes('sports.bzzoiro.com/img/team/1/'));
row=t.boardMatchBlock(sw,1);
assert(row.includes('2–2') && row.includes('FT') && row.includes('static.flashscore.com'));
row=t.boardMatchBlock(manual,2);
assert(row.includes('2–1') && row.includes('data-manual-score'));
assert(row.indexOf('scheduleRowTools') > row.indexOf('</div></div>'), 'manual action must be a separate row control');
assert(!row.includes('NO FEED') && !row.includes('SOCCERWAY'));
row=t.boardMatchBlock(upcoming,3);
assert(row.includes('FOLLOW') && row.includes('#1'));
assert(t.boardMatchBlock(make('legacy','Legacy Upcoming vs Legacy Away'),4).includes('PRE'));
assert.equal(t.formatTime(fixedKickoff),'18:00');
const older = make('old','Unknown Town vs Unknown City',{
  kickoff:new Date(Date.now()-4*3600000).toISOString(),
  competition:'Unmatched League'
});
const notVerified=t.boardMatchBlock(older,5);
assert(notVerified.includes('UNVERIFIED')&&notVerified.includes('NO RESULT'),
  'An unmatched old fixture must not fabricate provider-confirmed FT');
assert(!notVerified.includes('fixtureStatus finished') &&
  notVerified.includes('is-unverified-row'),
  'An unmatched historical fixture must not enter the confirmed FT lane');
const previousDate=new Date(Date.now()+86400000*9).toISOString().slice(0,10);
t.state.date=previousDate;
let dateButtons=t.dateStrip();
assert(dateButtons.includes('data-date="'+previousDate+'" aria-pressed="true"'),
  'Visible date strip must follow selected date');
assert(!/class="dateBtn[^"]*"[^>]*disabled/.test(dateButtons),
  'Dates without board rows must remain navigable');
assert(!/<button[^>]*aria-label=/.test(dateButtons),
  'Date buttons should derive accessible names from visible text');
t.state.date=date;
const sortedBoard=t.boardMatchList([
  make('one','Club A vs Team One',{competition:'League A',kickoff:new Date(Date.now()+3600000).toISOString()}),
  make('two','Club B vs Team Two',{competition:'League B',kickoff:new Date(Date.now()+5400000).toISOString()}),
  make('three','Club C vs Team Three',{competition:'League A',kickoff:new Date(Date.now()+7200000).toISOString()})
]);
assert(sortedBoard.indexOf('Club A') < sortedBoard.indexOf('Club B') &&
  sortedBoard.indexOf('Club B') < sortedBoard.indexOf('Club C'),
  'Competition grouping must not break global kickoff chronology');
assert((sortedBoard.match(/boardCompetitionGroup/g)||[]).length===3,
  'Reopened league groups must remain separate in time order');
assert(t.crest('team',1,'Arsenal').includes('data-external-logo="team"'));
assert(t.externalLogo('https://untrusted.invalid/logo.svg','Unknown','team').includes('crestFallback'));
t.state.statusFilter='live'; t.renderMatchday();
assert.equal((root.innerHTML.match(/class="boardMatchCard/g)||[]).length,1);
t.state.statusFilter='all'; t.state.boardQuery='vietnam'; t.renderMatchday();
assert.equal((root.innerHTML.match(/class="boardMatchCard/g)||[]).length,1);
t.state.boardQuery='no such club'; t.renderMatchday();
assert(root.innerHTML.includes('No matches found') && root.innerHTML.includes('data-reset-board-filters'));
t.state.boardQuery=''; t.state.board={schedule:[],picks:[]}; t.renderMatchday();
assert(root.innerHTML.includes('No scheduled Board matches'));
assert(t.dateStrip().includes('scheduleDateLabel') && !t.dateStrip().includes('dateCount'));
t.skeleton('board','Loading decision board');
assert(root.innerHTML.includes('scheduleHeader') && root.innerHTML.includes('scheduleLoadingRoute'));
assert(root.innerHTML.includes('aria-busy="true"') && root.innerHTML.includes('Loading schedule…'));
assert(!root.innerHTML.includes('contextRail') && !root.innerHTML.includes('Loading decision board'));
assert.equal((root.innerHTML.match(/class="scheduleFixture"/g)||[]).length,6);
assert(root.innerHTML.includes('disabled><span>All</span><b>—</b>'), 'loading must not claim zero matches');
t.renderMatchday();
assert(root.innerHTML.includes('aria-busy="false"') && !root.innerHTML.includes('scheduleLoadingRows'));
assert.equal((root.innerHTML.match(/class="iveCorner iveCorner--bottom"/g)||[]).length,1);
assert(root.innerHTML.indexOf('iveCorner--bottom') > root.innerHTML.indexOf('scheduleMatchSection'), 'artwork follows the match table');
const index=fs.readFileSync('pages/index.html','utf8');
assert(index.includes('icons/arc-xi-schedule.svg?v=2'));
assert(index.includes('<div id="app"></div>') && !index.includes('<main id="app">'),
  'Rendered main landmarks must not be nested');
assert(index.includes('app-v2.js?v=68') && index.includes('schedule-v2.css?v=25'));
assert(source.includes("event.key !== 'Tab'"),'Manual score modal must trap keyboard focus');
assert(source.includes("if (!state.board) throw error"),'Initial dashboard failures must surface errors');
assert(!index.includes('rel="manifest"') && !index.includes('pwa-v2.js') && index.includes('pwa-off.js'));

/* Impeccable regression: provider identity requires both teams and credible kickoff. */
const rowToMatch=make('identity','Arsenal vs Chelsea');
const validSource={id:991,home_team:{name:'Arsenal'},away_team:{name:'Chelsea'},
  league:{name:'Test League'},event_date:kickoff,status:'inprogress',home_score:1,away_score:0};
const wrongAway={...validSource,id:992,away_team:{name:'Brighton'}};
assert(t.boardEventScore(rowToMatch,validSource)>=6,'Both teams should match');
assert.equal(t.boardEventScore(rowToMatch,wrongAway),-1,'One matching team must not be sufficient');
assert.equal(t.boardEventScore(rowToMatch,{...validSource,id:993,
  event_date:new Date(Date.parse(kickoff)+24*3600000).toISOString()}),-1,
  'Same clubs on another date must not attach to the board row');
assert.equal(t.boardEventScore(make('female','Arsenal Women vs Chelsea Women',
  {competition:"Women's Super League"}),validSource),-1,
  'Women and men cannot share a provider fixture merely by club names');
t.state.today=[wrongAway];
assert.equal(t.eventForBoardRow(rowToMatch),null,'Never render wrong opponent scores');
t.state.today=[validSource,{...validSource,id:994}];
assert.equal(t.eventForBoardRow(rowToMatch),null,'Ambiguous same-time provider identities must fail closed');
t.state.today=[validSource];
assert.equal(t.eventForBoardRow(rowToMatch).id,991);
const statuses={postponed:'PP',cancelled:'CANC',abandoned:'ABD',suspended:'SUSP'};
for(const [source,label] of Object.entries(statuses)){
  const event={...validSource,status:source};
  t.state.today=[event];
  assert.equal(t.statusKey(event),source,'Preserve exceptional status '+source);
  assert(t.boardMatchBlock(rowToMatch,0).includes('>'+label+'</span>'),
    'Show provider-confirmed '+source+' instead of PRE');
}
const halftime={...validSource,status:'inprogress',
  time:{status:'inprogress',period:'HT',minute:45}};
t.state.today=[halftime];
assert.equal(t.statusKey(halftime),'live');
assert.equal(t.statusLabel(halftime),'HT');
assert(t.boardMatchBlock(rowToMatch,0).includes('>HT</span>'),
  'Half-time must not be displayed as ordinary LIVE or PRE');
assert.equal(t.boardWarning({cached:true,degraded:true,staleAgeMs:300000}).includes('5 minute(s)'),true);
assert(t.boardWarning({cached:true,degraded:true,staleAgeMs:null}).includes('unknown age'));

console.log('Schedule renderer: provider precedence, statuses, ICT time, search/filter, manual actions, fallback logos and PWA checks passed.');
