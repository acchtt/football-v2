// Slate XI production configuration + BSD compatibility/runtime guard.
// Private credentials remain in the Cloudflare Worker.
(() => {
  'use strict';

  const API = 'https://football-v2.acchtt.workers.dev';
  const TZ = 'Asia/Ho_Chi_Minh';
  const DASHBOARD_CACHE_KEY = 'sliptrace.dashboard.compat.v2';
  const nativeFetch = window.fetch.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);

  let replacedAppLiveTimer = false;
  let boardSnapshot = null;
  let boardSnapshotAt = 0;
  let boardSnapshotPromise = null;
  let boardWatchSignature = '';
  let boardWatchInFlight = false;

  window.SLIPTRACE_API = API;
  window.SLIPTRACE_TIME_ZONE = TZ;

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const pick = (...values) => values.find(v => v !== undefined && v !== null && v !== '') ?? null;
  const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;

  function participant(event, side) {
    const direct = [
      event?.[`${side}_team`],
      event?.[`${side}Team`],
      event?.[side],
      event?.teams?.[side],
      event?.participants?.[side],
      event?.[`${side}_participant`],
    ].find(isObj);
    if (direct) return direct.team && isObj(direct.team) ? { ...direct, ...direct.team } : direct;

    if (Array.isArray(event?.participants)) {
      const hit = event.participants.find(p => {
        const marker = String(p?.side ?? p?.type ?? p?.position ?? p?.designation ?? '').toLowerCase();
        return marker === side || marker === (side === 'home' ? '1' : '2');
      });
      if (hit) return hit.team && isObj(hit.team) ? { ...hit, ...hit.team } : hit;
    }
    return {};
  }

  function entityName(event, side) {
    const p = participant(event, side);
    const stringDirect = typeof event?.[side] === 'string' ? event[side] : null;
    const stringTeam = typeof event?.[`${side}_team`] === 'string' ? event[`${side}_team`] : null;
    return pick(
      p.name, p.team_name, p.display_name, p.full_name, p.short_name, p.shortName,
      event?.[`${side}_team_name`], event?.[`${side}_name`], event?.[`${side}Name`],
      event?.[`${side}_team_display_name`], stringTeam, stringDirect
    );
  }

  function entityId(event, side) {
    const p = participant(event, side);
    return finite(pick(
      p.id, p.team_id, p.teamId,
      event?.[`${side}_team_id`], event?.[`${side}_id`], event?.[`${side}Id`]
    ));
  }

  function competitionObject(event) {
    return [event?.league, event?.competition, event?.tournament, event?.league_info, event?.competition_info].find(isObj) || {};
  }

  function competitionName(event) {
    const c = competitionObject(event);
    return pick(c.name, c.league_name, c.display_name, c.title, c.short_name,
      event?.league_name, event?.competition_name, event?.tournament_name);
  }

  function competitionId(event) {
    const c = competitionObject(event);
    return finite(pick(c.id, c.league_id, c.competition_id, event?.league_id, event?.competition_id, event?.tournament_id));
  }

  function normalizeStatus(raw) {
    const s = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (['inprogress','in_progress','playing','ongoing'].includes(s)) return 'live';
    if (['notstarted','not_started','scheduled','pending'].includes(s)) return 'upcoming';
    if (['ended','complete','completed','final','ft'].includes(s)) return 'finished';
    return s || 'upcoming';
  }

  function normalizeEvent(event) {
    if (!isObj(event)) return event;

    const home = participant(event, 'home');
    const away = participant(event, 'away');
    const league = competitionObject(event);
    const homeName = entityName(event, 'home');
    const awayName = entityName(event, 'away');
    const homeId = entityId(event, 'home');
    const awayId = entityId(event, 'away');
    const leagueName = competitionName(event);
    const leagueId = competitionId(event);

    const nestedScore = isObj(event.score) ? event.score : {};
    const homeScore = finite(pick(event.home_score, nestedScore.home, nestedScore.home_score, event.scores?.home));
    const awayScore = finite(pick(event.away_score, nestedScore.away, nestedScore.away_score, event.scores?.away));

    const oldTime = isObj(event.time) ? event.time : {};
    const minute = finite(pick(oldTime.minute, event.current_minute, event.minute));
    const second = finite(pick(oldTime.second, event.current_second, event.second)) ?? 0;
    const period = pick(oldTime.period, event.current_period, event.period, '');
    const status = normalizeStatus(pick(event.status, oldTime.status));
    const kickoff = pick(event.event_date, event.kickoff_at, event.kickoff, event.start_time, event.start_at, event.date, oldTime.kickoff_at);

    return {
      ...event,
      status,
      event_date: kickoff ?? event.event_date,
      home_team: {
        ...home,
        ...(homeId !== null ? { id: homeId } : {}),
        ...(homeName ? { name: homeName } : {}),
      },
      away_team: {
        ...away,
        ...(awayId !== null ? { id: awayId } : {}),
        ...(awayName ? { name: awayName } : {}),
      },
      league: {
        ...league,
        ...(leagueId !== null ? { id: leagueId } : {}),
        ...(leagueName ? { name: leagueName } : {}),
      },
      ...(homeName ? { home_team_name: homeName } : {}),
      ...(awayName ? { away_team_name: awayName } : {}),
      ...(leagueName ? { league_name: leagueName } : {}),
      ...(homeId !== null ? { home_team_id: homeId } : {}),
      ...(awayId !== null ? { away_team_id: awayId } : {}),
      ...(leagueId !== null ? { league_id: leagueId } : {}),
      ...(homeScore !== null ? { home_score: homeScore } : {}),
      ...(awayScore !== null ? { away_score: awayScore } : {}),
      score: {
        ...nestedScore,
        ...(homeScore !== null ? { home: homeScore } : {}),
        ...(awayScore !== null ? { away: awayScore } : {}),
      },
      time: {
        ...oldTime,
        status,
        ...(minute !== null ? { minute } : {}),
        second,
        period,
        ...(kickoff ? { kickoff_at: kickoff } : {}),
        display: pick(oldTime.display, minute !== null ? `${minute}′` : null, status === 'live' ? 'LIVE' : null),
      },
    };
  }

  function normalizeBsdPayload(payload, pathname) {
    if (!isObj(payload) || payload.ok === false) return payload;
    const data = isObj(payload.data) ? payload.data : null;
    if (!data) return payload;

    if (pathname === '/api/bsd/live') {
      const source = Array.isArray(data.events) ? data.events : Array.isArray(data.results) ? data.results : [];
      const rows = source.map(normalizeEvent);
      return { ...payload, data: { ...data, events: rows, results: rows } };
    }

    if (pathname === '/api/bsd/events') {
      const source = Array.isArray(data.results) ? data.results : Array.isArray(data.events) ? data.events : [];
      const rows = source.map(normalizeEvent);
      return { ...payload, data: { ...data, results: rows, events: rows } };
    }

    return payload;
  }

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function splitMatch(match='') {
    for (const re of [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/, /\s+-\s+/]) {
      const parts = String(match).split(re).map(x => x.trim()).filter(Boolean);
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
    let overlap = 0;
    aa.forEach(token => { if (bb.has(token)) overlap++; });
    const ratio = overlap / Math.max(aa.size, bb.size);
    return ratio >= .75 ? 4 : ratio >= .5 ? 3 : 0;
  }

  function eventTeamName(event, side) {
    return entityName(event, side) || side.toUpperCase();
  }

  function rememberDashboard(payload) {
    if (!payload || !Array.isArray(payload.schedule) || !Array.isArray(payload.picks)) return;
    boardSnapshot = payload;
    boardSnapshotAt = Date.now();
    try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload)); } catch {}
  }

  function readCachedDashboard() {
    try {
      const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || 'null');
      if (cached && Array.isArray(cached.schedule) && Array.isArray(cached.picks)) return cached;
    } catch {}
    return null;
  }

  async function timedFetch(input, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await nativeFetch(input, { ...(init || {}), signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }

  async function getBoardSnapshot() {
    if (boardSnapshot && Date.now() - boardSnapshotAt < 30000) return boardSnapshot;
    if (boardSnapshotPromise) return boardSnapshotPromise;

    boardSnapshotPromise = (async () => {
      try {
        const response = await timedFetch(`${API}/api/dashboard-data?board_only=${Date.now()}`, { cache: 'no-store' }, 6500);
        if (response.ok) {
          const payload = await response.json();
          if (payload?.ok !== false && Array.isArray(payload.schedule) && Array.isArray(payload.picks)) {
            rememberDashboard(payload);
            return payload;
          }
        }
      } catch {}
      const cached = readCachedDashboard();
      if (cached) {
        boardSnapshot = cached;
        boardSnapshotAt = Date.now();
        return cached;
      }
      return { ok: true, schedule: [], picks: [], degraded: true };
    })();

    try { return await boardSnapshotPromise; }
    finally { boardSnapshotPromise = null; }
  }

  function filterEventsToBoard(payload, dashboard, date) {
    if (!isObj(payload)) return payload;
    const data = isObj(payload.data) ? payload.data : null;
    if (!data || !Array.isArray(data.results)) return payload;

    const boardRows = (dashboard?.schedule || []).filter(row => {
      const tier = String(row?.tier || '').toUpperCase();
      return row?.slateDate === date && (tier === 'FOCUS' || tier === 'WATCHLIST');
    });

    const filtered = data.results.filter(event => boardRows.some(row => {
      const teams = splitMatch(row.match || '');
      const score = nameScore(teams.home, eventTeamName(event, 'home')) + nameScore(teams.away, eventTeamName(event, 'away'));
      return score >= 6;
    }));

    return {
      ...payload,
      data: { ...data, count: filtered.length, next: null, previous: null, results: filtered, events: filtered },
      boardOnly: true,
      boardDate: date,
    };
  }

  function jsonResponse(payload, original) {
    const headers = new Headers(original?.headers || {});
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify(payload), {
      status: original?.status || 200,
      statusText: original?.statusText || 'OK',
      headers,
    });
  }

  function cachedDashboardResponse() {
    const cached = readCachedDashboard();
    if (cached) return new Response(JSON.stringify({ ...cached, ok: true, cached: true, degraded: true }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
    return new Response(JSON.stringify({ ok: true, schedule: [], picks: [], cached: true, degraded: true }), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  function boardSignature(payload) {
    if (!payload || !Array.isArray(payload.schedule) || !Array.isArray(payload.picks)) return '';
    const compactSchedule = payload.schedule.map(row => [
      row?.id || '', row?.slateDate || '', row?.match || '', row?.competition || '',
      row?.kickoff || row?.displayKickoff || '', row?.tier || '', row?.grade || '',
      row?.structure || '', row?.xiStatus || '', row?.marketStatus || '',
      row?.coverageStatus || '', row?.frozenPreSummary || '', row?.coverageNotes || '',
      row?.manualScore?.home ?? '', row?.manualScore?.away ?? ''
    ]);
    const compactPicks = payload.picks.map(row => [
      row?.id || '', row?.pickId || '', row?.match || '', row?.kickoff || '',
      row?.verdict || '', row?.line ?? '', row?.odds ?? '', row?.result || '', row?.pl ?? ''
    ]);
    return JSON.stringify([compactSchedule, compactPicks]);
  }

  function publishBoardRefresh(payload) {
    rememberDashboard(payload);
    boardWatchSignature = boardSignature(payload);
    window.dispatchEvent(new CustomEvent('sliptrace:board-refresh', { detail: { board: payload } }));
    const refresh = document.getElementById('refreshToday');
    if (refresh) refresh.click();
  }

  async function checkBoardRefresh() {
    if (boardWatchInFlight || document.visibilityState === 'hidden') return;
    boardWatchInFlight = true;
    try {
      const baseline = boardWatchSignature || boardSignature(boardSnapshot || readCachedDashboard());
      const response = await timedFetch(`${API}/api/dashboard-data?board_watch=${Date.now()}`, { cache: 'no-store' }, 6500);
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.ok === false || !Array.isArray(payload?.schedule) || !Array.isArray(payload?.picks)) return;
      const next = boardSignature(payload);
      if (!next) return;

      if (!baseline) {
        boardWatchSignature = next;
        rememberDashboard(payload);
        return;
      }
      if (next !== baseline) publishBoardRefresh(payload);
      else {
        boardWatchSignature = next;
        rememberDashboard(payload);
      }
    } catch {
      // Keep the mounted board on transient API failure; the next poll retries.
    } finally {
      boardWatchInFlight = false;
    }
  }

  window.fetch = async function sliptraceFetch(input, init) {
    const urlText = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    let url;
    try { url = new URL(urlText, location.href); } catch { return nativeFetch(input, init); }
    if (url.origin !== API) return nativeFetch(input, init);

    if (url.pathname === '/api/dashboard-data') {
      try {
        const response = await timedFetch(input, init, 6500);
        if (response.ok) {
          response.clone().json().then(payload => {
            if (payload?.ok !== false && Array.isArray(payload.schedule) && Array.isArray(payload.picks)) rememberDashboard(payload);
          }).catch(() => {});
          return response;
        }
        return cachedDashboardResponse();
      } catch { return cachedDashboardResponse(); }
    }

    if (url.pathname === '/api/bsd/live' || url.pathname === '/api/bsd/events') {
      const response = await timedFetch(input, init, 8000);
      if (!response.ok) return response;
      try {
        const payload = await response.clone().json();
        let normalized = normalizeBsdPayload(payload, url.pathname);
        if (url.pathname === '/api/bsd/events') {
          const dateFrom = url.searchParams.get('date_from');
          const dateTo = url.searchParams.get('date_to');
          if (dateFrom && dateFrom === dateTo) normalized = filterEventsToBoard(normalized, await getBoardSnapshot(), dateFrom);
        }
        return jsonResponse(normalized, response);
      } catch { return response; }
    }

    return timedFetch(input, init, 10000);
  };

  function quietLiveRefresh() {
    if (document.visibilityState === 'hidden') return;
    window.fetch(`${API}/api/bsd/live?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(payload => {
        const source = payload?.data?.results || payload?.data?.events || [];
        if (!Array.isArray(source)) return;
        const rows = source.map(normalizeEvent);
        const byId = new Map(rows.map(e => [String(pick(e.id, e.event_id)), e]));

        document.querySelectorAll('.matchRow[data-live-event]').forEach(node => {
          const event = byId.get(String(node.dataset.liveEvent || ''));
          if (!event) return;
          const home = finite(event.home_score ?? event.score?.home);
          const away = finite(event.away_score ?? event.score?.away);
          const minute = finite(event.time?.minute ?? event.current_minute ?? event.minute);
          const period = String(pick(event.time?.period, event.period, '') || '').replace(/_/g, ' ');

          const score = node.querySelector('.matchScore strong');
          if (score && home !== null && away !== null) score.textContent = `${home}–${away}`;
          const clock = node.querySelector('.matchScore [data-clock]');
          if (clock) clock.textContent = minute !== null ? `${minute}′` : 'LIVE';
          const time = node.querySelector('.matchTime');
          if (time) time.innerHTML = `<span class="tag live"><i class="dot bad"></i>LIVE</span><small>${period}</small>`;
        });

        const system = document.querySelector('.systemState');
        if (system) {
          const spans = system.querySelectorAll('span');
          if (spans[0]) spans[0].innerHTML = '<i class="dot live"></i>BSD LIVE';
          if (spans[1]) spans[1].textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
      }).catch(() => {});
  }

  // Prevent app-v2's legacy live timer from rebuilding Matchday.
  window.setInterval = function sliptraceSetInterval(callback, delay, ...args) {
    if (!replacedAppLiveTimer && Number(delay) === 10000 && callback?.name === 'refreshLive') {
      replacedAppLiveTimer = true;
      return nativeSetInterval(quietLiveRefresh, 10000);
    }
    return nativeSetInterval(callback, delay, ...args);
  };

  // app-v2's legacy focus/visibility listeners call the full loader. Because this
  // script loads first, capture-phase guards prevent those handlers from firing.
  // We refresh live values silently instead, leaving the current board mounted.
  document.addEventListener('visibilitychange', event => {
    if (document.visibilityState !== 'visible') return;
    event.stopImmediatePropagation();
    quietLiveRefresh();
    checkBoardRefresh();
  }, true);

  window.addEventListener('focus', event => {
    event.stopImmediatePropagation();
    quietLiveRefresh();
    checkBoardRefresh();
  }, true);

  // New Airtable publications should appear without a reload, but Matchday is
  // only rebuilt when the board fingerprint actually changes.
  nativeSetInterval(checkBoardRefresh, 15000);
  setTimeout(checkBoardRefresh, 2500);
})();
