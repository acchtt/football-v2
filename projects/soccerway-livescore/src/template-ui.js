const STYLE_ORIGIN = "https://acchtt.github.io/football-v2";
const TZ = "Asia/Ho_Chi_Minh";

function escHtml(v = "") {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function kickoffValue(f) {
  return f?.boardKickoff || f?.kickoffUtcSource || (f?.kickoffTimestamp ? new Date(Number(f.kickoffTimestamp) * 1000).toISOString() : null);
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d);
}

function dayKey(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isLive(f) { return f?.status === "live"; }
function isFinished(f) { return f?.status === "finished"; }

function statusLabel(f) {
  if (isFinished(f)) return "FT";
  if (isLive(f)) return f?.minute ? `${f.minute}′` : (f?.statusText || "LIVE");
  return formatTime(kickoffValue(f));
}

function pageHref(view = "today", day = 0, status = null) {
  const p = new URLSearchParams();
  p.set("view", view);
  if (day) p.set("day", String(day));
  if (status && view === "today") p.set("status", status);
  return `/?${p.toString()}`;
}

function ssrHeader(active, day = 0, status = null) {
  const cls = (name) => active === name ? "active" : "";
  return `<header class="appHeader"><div class="headerInner">
    <a class="brand" href="${pageHref("today", day, status)}"><span class="brandMark">ST</span><span>SLIPTRACE</span></a>
    <nav class="topNav">
      <a class="${cls("today")}" href="${pageHref("today", day, status)}">Matchday</a>
      <a class="${cls("board")}" href="${pageHref("board", day)}">Board</a>
      <a class="${cls("leagues")}" href="${pageHref("leagues", day)}">Competitions</a>
      <a class="${cls("teams")}" href="${pageHref("teams", day)}">Teams</a>
      <a class="${cls("picks")}" href="${pageHref("picks", day)}">Picks</a>
    </nav>
    <form class="headerSearch" method="get" action="/">
      <input type="hidden" name="view" value="today" />
      <input type="hidden" name="day" value="${day}" />
      <input aria-label="Search" name="q" placeholder="Search board teams…" />
    </form>
    <div class="systemState"><span><i class="dot live"></i>SOCCERWAY LIVE</span><span>1s feed</span></div>
  </div></header>`;
}

function mobileNav(active, day = 0) {
  const cls = (name) => active === name ? "active" : "";
  return `<nav class="mobileNav">
    <a class="${cls("today")}" href="${pageHref("today", day)}">Today</a>
    <a class="${cls("board")}" href="${pageHref("board", day)}">Board</a>
    <a class="${cls("leagues")}" href="${pageHref("leagues", day)}">Leagues</a>
    <a class="${cls("teams")}" href="${pageHref("teams", day)}">Teams</a>
    <a class="${cls("picks")}" href="${pageHref("picks", day)}">Picks</a>
  </nav>`;
}

function ssrDateStrip(activeDay = 0, view = "today", status = null) {
  return `<div class="dateStrip">${[-3,-2,-1,0,1,2,3].map((o) => {
    const d = dayKey(o);
    const dt = new Date(`${d}T12:00:00Z`);
    const label = o === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dt);
    return `<a class="dateBtn ${activeDay === o ? "active" : ""}" href="${pageHref(view, o, status)}"><small>${label}</small><strong>${d.slice(5).replace("-", "/")}</strong></a>`;
  }).join("")}</div>`;
}

function ssrMatchRow(f, boardMode = false) {
  const score = f?.homeScore != null && f?.awayScore != null ? `${f.homeScore}–${f.awayScore}` : "–";
  const cls = isLive(f) ? "is-live-row" : isFinished(f) ? "is-ft-row" : "";
  const time = isLive(f)
    ? '<span class="tag live"><i class="dot bad"></i>LIVE</span>'
    : escHtml(formatTime(kickoffValue(f)));
  const tierClass = f?.tier === "FOCUS" ? "live" : "ws";
  const rightMain = boardMode ? escHtml(f?.structure || "—") : escHtml(score);
  const rightSub = boardMode ? (f?.matchedToSoccerway ? "SOCCERWAY" : "BOARD ONLY") : escHtml(statusLabel(f));
  return `<div class="matchRow ${cls}" data-match-id="${escHtml(f?.matchId || "")}" data-match-status="${escHtml(f?.status || "scheduled")}">
    <div class="matchTime">${time}<small data-status-label>${isLive(f) ? escHtml(f?.statusText || "LIVE") : escHtml(f?.region || "")}</small></div>
    <div class="teams"><div class="teamLine"><span></span><span>${escHtml(f?.homeTeam || "")}</span></div><div class="teamLine"><span></span><span>${escHtml(f?.awayTeam || "")}</span></div><div class="matchCompetition">${escHtml(f?.competition || "")}</div></div>
    <div class="matchMeta"><span class="tag ${tierClass}">${escHtml(f?.grade || "—")} · ${escHtml(f?.tier || "—")}</span></div>
    <div class="matchScore"><strong data-score>${rightMain}</strong><small data-clock>${rightSub}</small></div>
  </div>`;
}

function statusBuckets(list) {
  return {
    live: list.filter(isLive),
    scheduled: list.filter((f) => !isLive(f) && !isFinished(f)),
    ft: list.filter(isFinished),
  };
}

function ssrStatusTabs(list, requested, day) {
  const buckets = statusBuckets(list);
  const active = requested && buckets[requested] ? requested : buckets.live.length ? "live" : buckets.scheduled.length ? "scheduled" : "ft";
  const selected = buckets[active];
  return `<div class="matchStatusTabsHost"><div class="matchStatusTabs" role="tablist">
    ${["live","scheduled","ft"].map((s) => `<a class="matchStatusTab status-${s} ${active === s ? "active" : ""}" href="${pageHref("today", day, s)}"><span class="statusDot"></span><strong>${s === "ft" ? "FT" : s.toUpperCase()}</strong><b>${buckets[s].length}</b></a>`).join("")}
  </div><div class="matchStatusTabContent"><div class="matchStatusPane"><div class="chronoMatches">${selected.length ? selected.map((f) => ssrMatchRow(f, false)).join("") : `<div class="empty statusEmpty">No ${active === "ft" ? "finished" : active} board matches.</div>`}</div></div></div></div>`;
}

function sortedRows(initial, query = "") {
  const q = String(query || "").trim().toLowerCase();
  let list = Array.isArray(initial?.fixtures) ? initial.fixtures.slice() : [];
  if (q) list = list.filter((f) => `${f?.homeTeam || ""} ${f?.awayTeam || ""} ${f?.competition || ""} ${f?.tier || ""} ${f?.grade || ""}`.toLowerCase().includes(q));
  return list.sort((a,b) => (Date.parse(kickoffValue(a)) || 0) - (Date.parse(kickoffValue(b)) || 0));
}

function renderToday(initial, day, status, query) {
  const list = sortedRows(initial, query);
  const live = list.filter(isLive);
  const upcoming = list.filter((f) => !isLive(f) && !isFinished(f)).slice(0, 6);
  const nextUp = upcoming.map((f) => `<div class="sideItem"><div><strong>${escHtml(f?.homeTeam || "")} – ${escHtml(f?.awayTeam || "")}</strong><span>${escHtml(f?.competition || "")}</span></div><b>${escHtml(formatTime(kickoffValue(f)))}</b></div>`).join("") || '<div class="empty">No upcoming matches.</div>';
  return `${ssrHeader("today", day, status)}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Football operations</span><h1>Matchday</h1><p class="subtle">FOCUS/WATCHLIST board only. Soccerway supplies the live score and match state. Times shown in ICT.</p></div><div class="toolbar"><a class="toolBtn" href="${pageHref("today", day, status)}">Refresh</a></div></div>
    ${ssrDateStrip(day, "today", status)}
    <div class="layout"><div class="mainCol"><section class="panel"><div class="panelHead"><h2>${day === 0 ? "Today" : "Fixtures"}</h2><span>${list.length}</span></div>${ssrStatusTabs(list, status, day)}</section></div>
    <aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Board signal</h3></div><div class="kpis"><div class="kpi"><span>Focus</span><strong>${Number(initial?.focusCount || 0)}</strong></div><div class="kpi"><span>Live</span><strong>${live.length}</strong></div><div class="kpi"><span>Matched</span><strong>${Number(initial?.matchedCount || 0)}</strong></div></div></section>
    <section class="panel"><div class="panelHead"><h3>Next up</h3></div><div class="sideList">${nextUp}</div></section></aside></div></main>${mobileNav("today", day)}`;
}

function renderBoard(initial, day) {
  const list = sortedRows(initial);
  return `${ssrHeader("board", day)}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Model layer</span><h1>Board</h1><p class="subtle">Airtable FOCUS/WATCHLIST decisions with Soccerway state merged onto matched fixtures.</p></div></div>${ssrDateStrip(day, "board")}
    <section class="panel"><div class="panelHead"><h2>Focus & watchlist</h2><span>${list.length}</span></div><div class="chronoMatches">${list.length ? list.map((f) => ssrMatchRow(f, true)).join("") : '<div class="empty">No board rows.</div>'}</div></section></main>${mobileNav("board", day)}`;
}

function renderLeagues(initial, day) {
  const list = sortedRows(initial);
  const map = new Map();
  for (const f of list) {
    const k = f?.competition || "Other";
    if (!map.has(k)) map.set(k, { name: k, count: 0, live: 0 });
    const x = map.get(k); x.count += 1; if (isLive(f)) x.live += 1;
  }
  const cards = [...map.values()].sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
  return `${ssrHeader("leagues", day)}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Board competitions</span><h1>Competitions</h1><p class="subtle">Competitions represented on the selected FOCUS/WATCHLIST slate.</p></div></div>${ssrDateStrip(day, "leagues")}
    <div class="cards">${cards.length ? cards.map((x) => `<div class="entityCard"><div><h3>${escHtml(x.name)}</h3><p>${x.count} board matches · ${x.live} live</p></div></div>`).join("") : '<div class="empty">No competitions.</div>'}</div></main>${mobileNav("leagues", day)}`;
}

function renderTeams(initial, day) {
  const list = sortedRows(initial);
  const map = new Map();
  for (const f of list) for (const name of [f?.homeTeam, f?.awayTeam]) {
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, count: 0, live: 0 });
    const x = map.get(name); x.count += 1; if (isLive(f)) x.live += 1;
  }
  const cards = [...map.values()].sort((a,b) => a.name.localeCompare(b.name));
  return `${ssrHeader("teams", day)}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Board clubs</span><h1>Teams</h1><p class="subtle">Teams appearing on the selected model board.</p></div></div>${ssrDateStrip(day, "teams")}
    <div class="cards">${cards.length ? cards.map((x) => `<div class="entityCard"><div><h3>${escHtml(x.name)}</h3><p>${x.count} board appearance${x.count === 1 ? "" : "s"}${x.live ? ` · ${x.live} live` : ""}</p></div></div>`).join("") : '<div class="empty">No teams.</div>'}</div></main>${mobileNav("teams", day)}`;
}

function renderPicks(dashboard, day) {
  const picks = Array.isArray(dashboard?.picks) ? dashboard.picks : [];
  return `${ssrHeader("picks", day)}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Decision record</span><h1>Picks</h1><p class="subtle">Official SlipTrace picks from the existing board database.</p></div></div>
    <section class="panel"><div class="panelHead"><h2>All picks</h2><span>${picks.length}</span></div>${picks.length ? picks.map((p) => `<div class="matchRow"><div class="matchTime">${escHtml(formatDate(p?.kickoff))}<small>${escHtml(formatTime(p?.kickoff))}</small></div><div class="teams"><div class="teamLine"><span></span><span>${escHtml(p?.match || "Match")}</span></div><div class="matchCompetition">${escHtml(p?.competition || "")}</div></div><div class="matchMeta"><span class="tag">OVER ${escHtml(p?.line || "—")} @ ${escHtml(p?.odds || "—")}</span></div><div class="matchScore"><strong>${escHtml(p?.result || "PENDING")}</strong><small>${p?.pl != null ? `${Number(p.pl) > 0 ? "+" : ""}${Number(p.pl).toFixed(2)}u` : ""}</small></div></div>`).join("") : '<div class="empty">No picks.</div>'}</section></main>${mobileNav("picks", day)}`;
}

function clientApp() {
  'use strict';
  const initial = window.__SLIPTRACE_INITIAL__ && typeof window.__SLIPTRACE_INITIAL__ === 'object' ? window.__SLIPTRACE_INITIAL__ : null;
  if (!initial) return;
  document.documentElement.dataset.appBooted = '1';
  const day = Number(initial.day || 0);
  const boardIds = new Set((initial.fixtures || []).filter(f => f?.matchedToSoccerway).map(f => String(f.matchId)));
  let previousLive = new Set((initial.fixtures || []).filter(f => f?.status === 'live' && f?.matchedToSoccerway).map(f => String(f.matchId)));
  let busy = false;

  function patchLive(payload) {
    const visible = new Map();
    document.querySelectorAll('[data-match-id]').forEach(el => visible.set(String(el.getAttribute('data-match-id') || ''), el));
    const next = new Set();
    for (const f of payload.fixtures || []) {
      const id = String(f.matchId || '');
      if (!boardIds.has(id)) continue;
      next.add(id);
      const el = visible.get(id);
      if (!el) continue;
      const score = el.querySelector('[data-score]');
      const clock = el.querySelector('[data-clock]');
      const status = el.querySelector('[data-status-label]');
      if (score && f.homeScore != null && f.awayScore != null) score.textContent = `${f.homeScore}–${f.awayScore}`;
      if (clock) clock.textContent = f.minute ? `${f.minute}′` : (f.statusText || 'LIVE');
      if (status) status.textContent = f.statusText || 'LIVE';
      el.classList.add('is-live-row');
      el.dataset.matchStatus = 'live';
    }
    const disappeared = [...previousLive].some(id => !next.has(id));
    previousLive = next;
    if (disappeared) setTimeout(() => location.reload(), 300);
  }

  async function poll() {
    if (busy || document.visibilityState === 'hidden') return;
    busy = true;
    try {
      const r = await fetch(`/api/live?day=${day}&t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      const p = await r.json();
      if (r.ok && p?.ok) patchLive(p);
    } catch {}
    finally { busy = false; }
  }

  setInterval(poll, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
  poll();
}

export function clientScript() {
  return `(${clientApp.toString()})();`;
}

export function renderSiteHtml(initial = null, options = {}) {
  const safeInitial = initial && typeof initial === "object" ? initial : { ok: true, day: 0, fixtures: [], focusCount: 0, matchedCount: 0, generatedAt: new Date().toISOString() };
  const day = Number(safeInitial.day || 0);
  const view = ["today","board","leagues","teams","picks"].includes(options?.view) ? options.view : "today";
  const status = ["live","scheduled","ft"].includes(options?.status) ? options.status : null;
  const query = options?.query || "";
  const dashboard = options?.dashboard || { picks: [] };
  let body;
  if (view === "board") body = renderBoard(safeInitial, day);
  else if (view === "leagues") body = renderLeagues(safeInitial, day);
  else if (view === "teams") body = renderTeams(safeInitial, day);
  else if (view === "picks") body = renderPicks(dashboard, day);
  else body = renderToday(safeInitial, day, status, query);
  const initialJson = JSON.stringify(safeInitial).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SlipTrace Football · Soccerway</title>
  <meta name="description" content="SlipTrace FOCUS and WATCHLIST matchday board with near-real-time Soccerway live scores." />
  <meta name="theme-color" content="#090b0f" />
  <link rel="preconnect" href="${STYLE_ORIGIN}" crossorigin />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${STYLE_ORIGIN}/app-v2.css?v=1" />
  <link rel="stylesheet" href="${STYLE_ORIGIN}/app-polish.css?v=3" />
  <style>.source-note{color:var(--cyan)}.matchCompetition{display:block}.entityCard{min-height:78px}.matchStatusTab{text-decoration:none}.dateBtn{text-decoration:none}.matchHero .heroTeam,.matchHero .heroTeam.away{justify-content:center;text-align:center}.matchHero .heroScore .clock{min-width:62px}@media(max-width:760px){.matchCompetition{margin-left:0}.headerSearch{width:min(250px,68vw)}}</style>
</head>
<body>
  <main id="app" aria-live="polite">${body}</main>
  <script>window.__SLIPTRACE_INITIAL__=${initialJson};</script>
  <script src="/sliptrace-client-v4.js" defer></script>
</body>
</html>`;
}
