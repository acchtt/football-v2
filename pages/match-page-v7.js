// SlipTrace Match Desk v7 — dedicated per-fixture route using the shared fast polling bus.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const ZONE = 'Asia/Ho_Chi_Minh';
  const app = document.getElementById('app');
  const CACHE_KEY = 'sliptrace.dashboard.v4';
  const SCROLL_KEY = 'sliptrace.schedule.scroll';
  const RETURN_KEY = 'sliptrace.match.return';
  const assetCache = new Map();
  let currentKey = '';

  const matchApp = document.createElement('main');
  matchApp.id = 'matchApp';
  matchApp.hidden = true;
  matchApp.setAttribute('aria-live', 'polite');
  app.insertAdjacentElement('afterend', matchApp);

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function norm(value = '') {
    return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function splitMatch(match = '') {
    for (const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const parts = String(match).split(re).map((x) => x.trim()).filter(Boolean);
      if (parts.length === 2) return { home: parts[0], away: parts[1] };
    }
    return { home: String(match), away: '' };
  }

  function nameScore(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 6;
    if (x.includes(y) || y.includes(x)) return 4;
    const aa = new Set(x.split(' ')), bb = new Set(y.split(' '));
    let shared = 0;
    aa.forEach((token) => bb.has(token) && shared++);
    const overlap = shared / Math.max(aa.size, bb.size);
    return overlap >= .75 ? 4 : overlap >= .5 ? 3 : 0;
  }

  function dateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function fmtTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  }

  function fmtDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    }).format(date);
  }

  function rowKey(row) {
    return `${row?.match || ''}|${row?.kickoff || row?.displayKickoff || row?.id || row?.pickId || ''}`;
  }

  function routeKey() {
    const match = location.hash.match(/^#match\/(.+)$/);
    if (!match) return '';
    try { return decodeURIComponent(match[1]); } catch { return ''; }
  }

  function busDashboard() {
    const payload = window.SLIPTRACE_DATA_BUS?.dashboard;
    if (payload?.ok && Array.isArray(payload.schedule)) return payload;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.payload && Array.isArray(cached.payload.schedule)) return { ok: true, ...cached.payload };
    } catch {}
    return null;
  }

  function busLive() {
    const payload = window.SLIPTRACE_DATA_BUS?.live;
    return Array.isArray(payload?.events) ? payload.events : [];
  }

  function liveEvent(row) {
    const teams = splitMatch(row?.match || '');
    return busLive().map((event) => ({
      event,
      score: nameScore(teams.home, event.home) + nameScore(teams.away, event.away),
    })).filter((item) => item.score >= 6).sort((a, b) => b.score - a.score)[0]?.event || null;
  }

  function findRow(key) {
    const dashboard = busDashboard();
    if (!dashboard) return null;
    return (dashboard.schedule || []).find((row) => rowKey(row) === key) || null;
  }

  function matchingPicks(row) {
    const dashboard = busDashboard();
    if (!dashboard) return [];
    const target = splitMatch(row.match || '');
    const targetMs = Date.parse(row.kickoff || row.displayKickoff || '') || 0;
    return (dashboard.picks || []).filter((pick) => {
      const teams = splitMatch(pick.match || '');
      const score = nameScore(target.home, teams.home) + nameScore(target.away, teams.away);
      if (score < 6) return false;
      const pickMs = Date.parse(pick.kickoff || '') || 0;
      return !targetMs || !pickMs || Math.abs(targetMs - pickMs) < 20 * 60 * 60 * 1000;
    }).sort((a, b) => (Date.parse(b.recordedAt || b.kickoff || '') || 0) - (Date.parse(a.recordedAt || a.kickoff || '') || 0));
  }

  function currentScore(row) {
    if (row?.manualScore && Number.isFinite(Number(row.manualScore.home)) && Number.isFinite(Number(row.manualScore.away))) {
      return { home: Number(row.manualScore.home), away: Number(row.manualScore.away), label: 'MANUAL', kind: 'manual' };
    }
    const event = liveEvent(row);
    if (event && event.homeScore !== undefined && event.awayScore !== undefined) {
      const status = String(event.status || '').toLowerCase();
      const ended = ['finished','ft','full_time','full time','ended','complete','completed'].includes(status);
      const label = ended ? 'FT' : event.minute !== undefined ? `${event.minute}′` : event.currentMinute !== undefined ? `${event.currentMinute}′` : event.period ? String(event.period).toUpperCase() : 'LIVE';
      return { home: Number(event.homeScore), away: Number(event.awayScore), label, kind: ended ? 'final' : 'live' };
    }
    return null;
  }

  function assetFor(row) {
    return assetCache.get(rowKey(row)) || null;
  }

  function crestSrc(asset, side) {
    if (!asset) return '';
    const logo = asset[`${side}Logo`];
    const id = asset[`${side}TeamId`];
    return logo || (id ? `https://sports.bzzoiro.com/img/team/${id}/?bg=transparent` : '');
  }

  function initials(name = '') {
    return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  }

  function heroCrest(name, src, side) {
    return `<span class="matchHeroCrest" data-match-side="${side}">${src ? `<img src="${esc(src)}" alt="${esc(name)} crest" loading="eager">` : `<span>${esc(initials(name))}</span>`}</span>`;
  }

  async function ensureAssets(row) {
    const key = rowKey(row);
    if (assetCache.has(key)) return;
    assetCache.set(key, null);
    const day = row.slateDate || dateKey(row.kickoff || row.displayKickoff || new Date());
    if (!day) return;
    try {
      const response = await fetch(`${API}/api/fixture-assets?date_from=${encodeURIComponent(day)}&date_to=${encodeURIComponent(day)}&t=${Date.now()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !Array.isArray(payload.events)) return;
      const teams = splitMatch(row.match || '');
      const best = payload.events.map((event) => ({
        event,
        forward: nameScore(teams.home, event.home) + nameScore(teams.away, event.away),
        reverse: nameScore(teams.home, event.away) + nameScore(teams.away, event.home),
      })).map((item) => ({ ...item, score: Math.max(item.forward, item.reverse) }))
        .filter((item) => item.score >= 6).sort((a, b) => b.score - a.score)[0];
      if (!best) return;
      const event = best.reverse > best.forward ? {
        ...best.event,
        homeTeamId: best.event.awayTeamId,
        homeLogo: best.event.awayLogo,
        awayTeamId: best.event.homeTeamId,
        awayLogo: best.event.homeLogo,
      } : best.event;
      assetCache.set(key, event);
      if (routeKey() === key) render();
    } catch {}
  }

  function field(label, value, tone = '') {
    return `<div class="matchField"><span>${esc(label)}</span><strong class="${tone}">${esc(value || '—')}</strong></div>`;
  }

  function decisionSection(row) {
    const picks = matchingPicks(row);
    if (!picks.length) {
      return `<section class="matchPanel"><header><span>BET / DECISION</span></header><div class="matchEmptyLine">No official pick is linked to this fixture.</div></section>`;
    }
    return `<section class="matchPanel"><header><span>BET / DECISION</span><b>${picks.length}</b></header><div class="decisionList">${picks.map((pick) => {
      const result = String(pick.result || 'PENDING').toUpperCase();
      const tone = ['WIN','HALF WIN'].includes(result) ? 'positive' : ['LOSS','HALF LOSS'].includes(result) ? 'negative' : 'pending';
      const pl = Number.isFinite(Number(pick.pl)) ? `${Number(pick.pl) > 0 ? '+' : ''}${Number(pick.pl).toFixed(2)}u` : '—';
      return `<div class="decisionRow"><div><span>OFFICIAL PICK</span><strong>Over ${esc(pick.line ?? '—')}</strong></div><div><span>ODDS</span><strong>${esc(pick.odds ?? '—')}</strong></div><div><span>STAKE</span><strong>${esc(pick.stake ?? '—')}u</strong></div><div><span>RESULT</span><strong class="${tone}">${esc(result)}</strong></div><div><span>P/L</span><strong class="${tone}">${esc(pl)}</strong></div></div>`;
    }).join('')}</div></section>`;
  }

  function manualControl(row) {
    const teams = splitMatch(row.match || '');
    const score = row.manualScore || {};
    return `<section class="matchPanel"><header><span>MANUAL CONTROL</span></header><form class="matchManual" data-match="${esc(row.match || '')}" data-kickoff="${esc(row.kickoff || row.displayKickoff || '')}"><label><span>${esc(teams.home)}</span><input name="home" type="number" min="0" max="99" value="${score.home ?? ''}" required></label><i>–</i><label><span>${esc(teams.away)}</span><input name="away" type="number" min="0" max="99" value="${score.away ?? ''}" required></label><button type="submit">Save final score</button>${row.manualScore ? '<button type="button" class="matchClear">Use BSD</button>' : ''}</form></section>`;
  }

  function render() {
    const key = routeKey();
    if (!key) return leaveMatch();
    currentKey = key;
    app.hidden = true;
    matchApp.hidden = false;

    const row = findRow(key);
    if (!row) {
      matchApp.innerHTML = `<div class="matchShell"><a class="matchBack" href="${esc(sessionStorage.getItem(RETURN_KEY) || '#schedule')}">← Back to Schedule</a><div class="matchLoading"><span>MATCH DESK</span><h1>Loading fixture</h1><p>Waiting for the latest board data…</p></div></div>`;
      return;
    }

    ensureAssets(row);
    const teams = splitMatch(row.match || '');
    const score = currentScore(row);
    const event = liveEvent(row);
    const asset = assetFor(row);
    const eventId = event?.id ?? event?.eventId ?? asset?.id ?? '—';
    const status = score?.label || (Date.now() < (Date.parse(row.kickoff || row.displayKickoff || '') || 0) ? 'PRE-MATCH' : 'AWAITING STATUS');
    const returnHash = sessionStorage.getItem(RETURN_KEY) || '#schedule';

    matchApp.innerHTML = `${stateBanner()}<div class="matchShell">
      <div class="matchTopline"><a class="matchBack" href="${esc(returnHash)}">← Back to Schedule</a><span>BSD EVENT ${esc(eventId)}</span></div>
      <section class="matchHero ${score?.kind || 'prematch'}">
        <div class="matchHeroTeam home">${heroCrest(teams.home, crestSrc(asset, 'home'), 'home')}<strong>${esc(teams.home)}</strong></div>
        <div class="matchScoreboard"><span>${esc(row.competition || 'MATCH')}</span><div>${score ? `<b>${score.home}</b><i>–</i><b>${score.away}</b>` : `<b class="kickoffHero">${esc(fmtTime(row.kickoff || row.displayKickoff))}</b>`}</div><em>${esc(status)}</em></div>
        <div class="matchHeroTeam away">${heroCrest(teams.away, crestSrc(asset, 'away'), 'away')}<strong>${esc(teams.away)}</strong></div>
        <footer><span>${esc(fmtDate(row.kickoff || row.displayKickoff))}</span><span>${esc(fmtTime(row.kickoff || row.displayKickoff))} ICT</span><span class="heroGrade">${esc(row.grade || '—')}</span><span class="heroTier ${row.tier === 'FOCUS' ? 'focus' : ''}">${esc(row.tier || '—')}</span></footer>
      </section>

      <div class="matchGrid">
        <section class="matchPanel assessment"><header><span>MODEL ASSESSMENT</span></header><div class="matchFields">${field('Structure', row.structure)}${field('PRE Grade', row.grade)}${field('Board Tier', row.tier, row.tier === 'FOCUS' ? 'negative' : '')}${field('XI', row.xiStatus)}${field('Market', row.marketStatus)}${field('Coverage', row.coverageStatus)}</div>${row.frozenPreSummary ? `<div class="matchText"><span>FROZEN PRE</span><p>${esc(row.frozenPreSummary)}</p></div>` : ''}${row.coverageNotes ? `<div class="matchText"><span>COVERAGE NOTES</span><p>${esc(row.coverageNotes)}</p></div>` : ''}</section>
        <section class="matchPanel liveData"><header><span>LIVE MATCH</span><i class="${score?.kind === 'live' ? 'on' : ''}"></i></header><div class="matchFields">${field('Score', score ? `${score.home}–${score.away}` : '—')}${field('Status', status)}${field('Minute', event?.minute !== undefined ? `${event.minute}′` : event?.currentMinute !== undefined ? `${event.currentMinute}′` : '—')}${field('BSD Event', String(eventId))}</div></section>
      </div>

      ${decisionSection(row)}
      ${manualControl(row)}
    </div>`;

    bindManual(row);
  }

  function stateBanner() {
    const bus = window.SLIPTRACE_DATA_BUS;
    if (!bus?.dashboardAt) return '';
    const age = Math.floor((Date.now() - bus.dashboardAt) / 1000);
    if (age < 20) return '';
    return `<div class="matchDataDelay">DATA DELAY · BOARD ${age}s OLD</div>`;
  }

  function bindManual(row) {
    const form = matchApp.querySelector('.matchManual');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        const fd = new FormData(form);
        await saveManual({ match: form.dataset.match, kickoff: form.dataset.kickoff, home: Number(fd.get('home')), away: Number(fd.get('away')), action: 'save' });
      } catch (error) {
        alert(`Manual score could not be saved.\n\n${error.message}`);
      } finally {
        button.disabled = false;
        button.textContent = 'Save final score';
      }
    });
    form.querySelector('.matchClear')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await saveManual({ match: form.dataset.match, kickoff: form.dataset.kickoff, action: 'clear' }); }
      catch (error) { alert(`Manual score could not be cleared.\n\n${error.message}`); }
      finally { button.disabled = false; }
    });
  }

  async function saveManual(body) {
    const response = await fetch(`${API}/api/manual-score`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    await fetch(`${API}/api/dashboard-data?t=${Date.now()}`, { cache: 'no-store' });
  }

  function leaveMatch() {
    currentKey = '';
    matchApp.hidden = true;
    app.hidden = false;
  }

  function enterFromRow(summary) {
    const row = summary.closest('.fixtureRow');
    const key = row?.dataset?.rowKey;
    if (!key) return;
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || 0));
    sessionStorage.setItem(RETURN_KEY, '#schedule');
    location.hash = `match/${encodeURIComponent(key)}`;
  }

  app.addEventListener('click', (event) => {
    const summary = event.target.closest('.fixtureRow > summary');
    if (!summary) return;
    event.preventDefault();
    enterFromRow(summary);
  });

  app.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const summary = event.target.closest('.fixtureRow > summary');
    if (!summary) return;
    event.preventDefault();
    enterFromRow(summary);
  });

  window.addEventListener('sliptrace:dashboard', () => { if (routeKey()) render(); });
  window.addEventListener('sliptrace:live', () => { if (routeKey()) render(); });

  window.addEventListener('hashchange', () => {
    if (routeKey()) {
      render();
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      const wasMatch = Boolean(currentKey);
      leaveMatch();
      if (wasMatch && location.hash === '#schedule') {
        const y = Number(sessionStorage.getItem(SCROLL_KEY) || 0);
        setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' }), 60);
      }
    }
  });

  if (routeKey()) render();
})();
