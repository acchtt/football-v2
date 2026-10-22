(() => {
'use strict';

// Standalone demonstration only. All fixtures, scores and dates below are illustrative.
// No bookmaker API, score provider, ranking engine, or production storage is contacted.
const demoFixtures = [
 ['2026-10-20','19:00','Eredivisie','NED','AZ Alkmaar','FC Utrecht','PRE','FOLLOW','3.0'],
 ['2026-10-20','20:00','UEFA Champions League','UCL','Arsenal','Bayer Leverkusen','PRE','RESERVE','3.25'],
 ['2026-10-20','22:00','La Liga','ESP','Real Sociedad','Real Betis','PRE','STOP','—'],
 ['2026-10-21','18:45','UEFA Champions League','UCL','Paris Saint-Germain','AC Milan','PRE','FOLLOW','3.25'],
 ['2026-10-21','21:00','Bundesliga','GER','Eintracht Frankfurt','RB Leipzig','LIVE','RESERVE','2.75','1:1','74′'],
 ['2026-10-21','23:30','Premier League','ENG','Brighton & Hove Albion','Newcastle United','PRE','STOP','—'],
 ['2026-10-22','18:00','Eredivisie','NED','PSV Eindhoven','Feyenoord','PRE','FOLLOW','3.25'],
 ['2026-10-22','19:30','Bundesliga','GER','Borussia Dortmund','VfB Stuttgart','PRE','RESERVE','3.0'],
 ['2026-10-22','20:00','Premier League','ENG','Liverpool','Aston Villa','LIVE','FOLLOW','3.5','2:1','65′'],
 ['2026-10-22','20:45','Serie A','ITA','Inter Milan','Atalanta','PRE','RESERVE','3.0'],
 ['2026-10-22','21:00','La Liga','ESP','Barcelona','Villarreal','PRE','FOLLOW','3.25'],
 ['2026-10-22','22:30','Premier League','ENG','Arsenal','Chelsea','PRE','STOP','—'],
 ['2026-10-22','23:45','Eredivisie','NED','Ajax Amsterdam','FC Twente','HT','RESERVE','2.75','1:0','HT'],
 ['2026-10-22','23:55','Premier League','ENG','Fulham','Everton','FT','STOP','—','2:0','FT'],
 ['2026-10-23','00:30','Saudi Pro League','KSA','Al Nassr','Al Hilal','PRE','FOLLOW','3.25'],
 ['2026-10-23','15:30','K League 1','KOR','Ulsan HD','Jeonbuk Hyundai','PRE','RESERVE','2.75'],
 ['2026-10-23','19:00','Premier League','ENG','Tottenham Hotspur','West Ham United','PRE','FOLLOW','3.0'],
 ['2026-10-23','20:30','Serie A','ITA','Napoli','AS Roma','PRE','STOP','—'],
 ['2026-10-23','22:00','Bundesliga','GER','Bayern Munich','Borussia Mönchengladbach','PRE','FOLLOW','3.5'],
 ['2026-10-24','11:00','J1 League','JPN','Kashima Antlers','Urawa Red Diamonds','PRE','FOLLOW','2.75'],
 ['2026-10-24','13:00','J1 League','JPN','FC Tokyo','Sanfrecce Hiroshima','PRE','RESERVE','3.0'],
 ['2026-10-24','19:30','La Liga','ESP','Real Madrid','Athletic Club','PRE','STOP','—'],
 ['2026-10-24','21:15','Premier League','ENG','Manchester City','Brentford','PRE','FOLLOW','3.5']
].map((row, index) => ({
 id: 'demo-' + String(index + 1).padStart(3,'0'),
 date: row[0], time: row[1], league: row[2], code: row[3],
 home: row[4], away: row[5], state: row[6], lane: row[7],
 supported: row[8], score: row[9] || null, clock: row[10] || null,
}));

const state = { day:'2026-10-22', lane:'ALL', league:'ALL', search:'', expanded:new Set(), collapsed:new Set() };
const $ = id => document.getElementById(id);
const ESC = value => String(value).replace(/[&<>"']/g, character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const dateFmt = new Intl.DateTimeFormat('en-GB',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const pad = n => String(n).padStart(2,'0');
const toUtcDay = date => new Date(date+'T12:00:00Z');
const dateString = d => [d.getUTCFullYear(),pad(d.getUTCMonth()+1),pad(d.getUTCDate())].join('-');
function offsetDay(date,offset){ const d=toUtcDay(date);d.setUTCDate(d.getUTCDate()+offset);return dateString(d) }
function fmtDay(date){ const d=toUtcDay(date); return { day:new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'}).format(d).toUpperCase(),daystamp:new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',timeZone:'UTC'}).format(d).toUpperCase(),full:dateFmt.format(d).toUpperCase() } }
function currentSet(){return demoFixtures.filter(x=>x.date===state.day && x.state!=='FT')}
function currentShown(){const q=state.search.trim().toLocaleLowerCase();return currentSet().filter(f=>(state.lane==='ALL'||f.lane===state.lane)&&(state.league==='ALL'||f.league===state.league)&&(!q||(f.home+' '+f.away+' '+f.league).toLocaleLowerCase().includes(q)))}
function renderDates(){
 let html='';
 for(let i=-2;i<=2;i++){
  const day=offsetDay(state.day,i),t=fmtDay(day);
  html+='<button type="button" class="date-button'+(i===0?' date-selected':'')+'" data-date="'+day+'" aria-pressed="'+(i===0)+'" aria-label="'+ESC(t.full)+'" title="'+ESC(t.full)+'"><span class="weekday">'+t.day+'</span><span class="daystamp">'+t.daystamp+'</span></button>';
 }
 $('date-days').innerHTML=html;
 $('selected-date-label').textContent=fmtDay(state.day).full;
 document.querySelectorAll('[data-date]').forEach(btn=>btn.addEventListener('click',()=>setDay(btn.dataset.date)));
}
function setDay(day){state.day=day;state.expanded.clear();state.collapsed.clear();render();updateRoute()}
function updateRoute(){const url=new URL(location.href);url.searchParams.set('day',state.day);try{history.replaceState(null,'',url)}catch{}}
function renderCounts(){
 const rows=currentSet(),counts={ALL:rows.length,FOLLOW:0,RESERVE:0,STOP:0};
 rows.forEach(x=>{if(counts[x.lane]!==undefined)counts[x.lane]++});
 for(const key of Object.keys(counts))$(key.toLowerCase()+'-count').textContent=counts[key];
 for(const btn of document.querySelectorAll('[data-lane]')){
  const active=btn.dataset.lane===state.lane;
  btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));
 }
}
function renderLeagueOptions(){
 const leagues=Array.from(new Set(demoFixtures.map(x=>x.league))).sort((a,b)=>a.localeCompare(b));
 $('competition-filter').innerHTML='<option value="ALL">All competitions</option>'+leagues.map(l=>'<option value="'+ESC(l)+'">'+ESC(l)+'</option>').join('');
 $('competition-filter').value=state.league;
}
function crestText(name){const first=name.split(/\s+/)[0];return first.length<=3?first.toUpperCase():first.slice(0,3).toUpperCase()}
function card(f){
 const expanded=state.expanded.has(f.id);
 const live=f.state==='LIVE'||f.state==='HT';
 const score=live&&f.score?ESC(f.score):'<span class="dim">– : –</span>';
 const clock=live&&f.clock?ESC(f.clock):f.state==='PRE'?'PRE':'HT';
 const details=expanded?'<div class="match-detail" id="info-'+ESC(f.id)+'">'+
  '<div class="detail-col"><span class="detail-title">COMPETITION</span><span class="detail-value">'+ESC(f.league)+'</span></div>'+
  '<div class="detail-col"><span class="detail-title">BOARD LANE</span><span class="detail-value">'+ESC(f.lane)+'</span></div>'+
  '<div class="detail-col"><span class="detail-title">ILLUSTRATIVE SUPPORTED LINE</span><span class="detail-value">'+ESC(f.supported)+'</span></div>'+
  '<div class="detail-note">Preview interaction only. Football C decision authority remains in the production workflow.</div></div>':'';
 return '<article class="fixture'+(expanded?' expanded':'')+'" data-match="'+ESC(f.id)+'" tabindex="0" role="button" aria-expanded="'+expanded+'" aria-controls="info-'+ESC(f.id)+'" aria-label="'+ESC(f.home+' versus '+f.away+', '+f.lane+', '+f.time+' ICT')+'">'+
 '<div class="time-block"><span class="kickoff-time">'+ESC(f.time)+'</span><span class="match-state'+(live?' live':'')+'">'+ESC(clock)+'</span></div>'+
 '<div class="team-pair"><span class="team-with-crest home-crest"><span class="team-name home-name">'+ESC(f.home)+'</span><span class="team-crest" aria-hidden="true">'+ESC(crestText(f.home))+'</span></span><span class="versus-mark">VS</span><span class="team-with-crest away-crest"><span class="team-crest" aria-hidden="true">'+ESC(crestText(f.away))+'</span><span class="team-name away-name">'+ESC(f.away)+'</span></span></div>'+
 '<div class="result'+(live?' live':'')+'">'+score+'</div>'+
 '<span class="status '+f.lane.toLowerCase()+'">'+ESC(f.lane)+'</span><span class="detail-chevron" aria-hidden="true">⌄</span>'+details+'</article>';
}
function groupMarkup(league,fixtures){
 const key=league.code+'-'+league.league;
 const collapsed=state.collapsed.has(key);
 return '<section class="league" data-league="'+ESC(key)+'" aria-expanded="'+String(!collapsed)+'">'+
  '<button class="league-heading" type="button" data-toggle-league="'+ESC(key)+'" aria-expanded="'+String(!collapsed)+'" aria-label="Toggle '+ESC(league.league)+' fixtures">'+
   '<span class="league-left"><span class="league-flag">'+ESC(league.code)+'</span><strong>'+ESC(league.league.toUpperCase())+'</strong><span class="league-count">'+fixtures.length+' MATCH'+(fixtures.length===1?'':'ES')+'</span></span><span class="league-collapse" aria-hidden="true">⌄</span></button>'+
   '<div class="league-matches">'+fixtures.map(card).join('')+'</div></section>';
}
function renderGroups(){
 const matches=currentShown();
 $('visible-count').textContent=matches.length+' MATCH'+(matches.length===1?'':'ES');
 if(!matches.length){
  $('fixture-groups').innerHTML='<div class="empty-state"><span class="empty-icon">NO MATCHES</span><h3>NOTHING ON THIS SLATE.</h3><p>Try another date, clear a filter or search another team. This preview only contains a few sample fixtures.</p></div>';
  return;
 }
 // Leagues are ordered by their first chronological kickoff, not alphabetically.
 const groupMap=new Map();
 matches.sort((a,b)=>a.time.localeCompare(b.time));
 for(const item of matches){
  if(!groupMap.has(item.league))groupMap.set(item.league,{league:item.league,code:item.code,fixtures:[]});
  groupMap.get(item.league).fixtures.push(item);
 }
 $('fixture-groups').innerHTML=[...groupMap.values()].map(g=>groupMarkup(g,g.fixtures)).join('');
}
function render(){renderDates();renderCounts();renderLeagueOptions();renderGroups()}
document.querySelectorAll('[data-lane]').forEach(btn=>btn.addEventListener('click',()=>{state.lane=btn.dataset.lane;renderCounts();renderGroups()}));
$('previous-day').addEventListener('click',()=>setDay(offsetDay(state.day,-1)));
$('next-day').addEventListener('click',()=>setDay(offsetDay(state.day,1)));
$('fixture-search').addEventListener('input',ev=>{state.search=ev.target.value;renderGroups()});
$('competition-filter').addEventListener('change',ev=>{state.league=ev.target.value;renderGroups()});
$('clear-filters').addEventListener('click',()=>{state.lane='ALL';state.league='ALL';state.search='';$('fixture-search').value='';renderCounts();renderLeagueOptions();renderGroups();$('fixture-search').focus()});
$('fixture-groups').addEventListener('click',e=>{
 const toggle=e.target.closest('[data-toggle-league]');
 if(toggle){const key=toggle.dataset.toggleLeague;state.collapsed.has(key)?state.collapsed.delete(key):state.collapsed.add(key);renderGroups();return}
 const row=e.target.closest('[data-match]');
 if(row){const id=row.dataset.match;state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);renderGroups();const next=document.querySelector('[data-match="'+id+'"]');next?.focus({preventScroll:true})}
});
$('fixture-groups').addEventListener('keydown',e=>{
 if(e.key!=='Enter'&&e.key!==' ')return;
 const row=e.target.closest('[data-match]');
 if(!row)return;
 e.preventDefault();row.click();
});
const menu=$('mobile-menu'),menuButton=document.querySelector('.menu-button');
menuButton.addEventListener('click',()=>{
 const expanded=menuButton.getAttribute('aria-expanded')==='true';
 menuButton.setAttribute('aria-expanded',String(!expanded));menuButton.setAttribute('aria-label',expanded?'Open navigation':'Close navigation');menu.hidden=expanded;
});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open navigation')}));
const routeDay=new URL(location.href).searchParams.get('day');
if(routeDay&&/^\d{4}-\d{2}-\d{2}$/.test(routeDay)&&!Number.isNaN(toUtcDay(routeDay).valueOf()))state.day=routeDay;
render();
})();