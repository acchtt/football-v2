// SlipTrace Live Centre v8 — BSD stats + proxied WebSocket pitch activity.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const matchApp = document.getElementById('matchApp');
  if (!matchApp) return;

  const state = {
    eventId: null,
    stats: null,
    statsAt: 0,
    eventFrame: null,
    livedata: [],
    actions: [],
    socket: null,
    source: '',
    wsStatus: 'idle',
    wsError: '',
    statsError: '',
    statsTimer: null,
    reconnectTimer: null,
    renderTimer: null,
  };

  const metricSpecs = [
    ['Possession', ['possession','ball_possession','possession_percent'], '%'],
    ['Shots', ['shots_total','total_shots','shots','shot_total'], ''],
    ['On target', ['shots_on_target','shots_ontarget','shots_on_goal','on_target'], ''],
    ['Corners', ['corners','corner_kicks','corner'], ''],
    ['xG', ['xg','expected_goals','expected_goal'], ''],
    ['Dangerous', ['dangerous_attacks','dangerous_attack'], ''],
    ['Big chances', ['big_chances','big_chances_created'], ''],
    ['Saves', ['saves','goalkeeper_saves'], ''],
  ];

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  function routeActive() {
    return /^#match\//.test(location.hash);
  }

  function domEventId() {
    const text = matchApp.querySelector('.matchTopline > span')?.textContent || '';
    const match = text.match(/BSD EVENT\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  function teamNames() {
    const teams = [...matchApp.querySelectorAll('.matchHeroTeam strong')].map((node) => node.textContent.trim());
    return { home: teams[0] || 'HOME', away: teams[1] || 'AWAY' };
  }

  function wsUrl() {
    const url = new URL(API);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/live-centre';
    url.search = '';
    return url.toString();
  }

  function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function numeric(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/%/g, '').trim();
      if (cleaned && Number.isFinite(Number(cleaned))) return Number(cleaned);
    }
    if (isRecord(value)) {
      for (const key of ['value','total','count','stat']) {
        const result = numeric(value[key]);
        if (result !== null) return result;
      }
    }
    return null;
  }

  function readMetric(obj, aliases) {
    if (!obj) return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (!isRecord(item)) continue;
        const name = normalizeKey(item.name ?? item.label ?? item.type ?? item.key);
        if (aliases.some((alias) => normalizeKey(alias) === name)) {
          const value = numeric(item.value ?? item.stat ?? item.total ?? item.count);
          if (value !== null) return value;
        }
      }
      return null;
    }
    if (!isRecord(obj)) return null;
    const lookup = new Map(Object.entries(obj).map(([key, value]) => [normalizeKey(key), value]));
    for (const alias of aliases) {
      const value = lookup.get(normalizeKey(alias));
      const result = numeric(value);
      if (result !== null) return result;
    }
    return null;
  }

  function metricHits(obj) {
    return metricSpecs.reduce((sum, [, aliases]) => sum + (readMetric(obj, aliases) !== null ? 1 : 0), 0);
  }

  function findStatsPair(root, depth = 0, seen = new Set()) {
    if (!root || depth > 5 || seen.has(root)) return null;
    if (typeof root === 'object') seen.add(root);
    if (isRecord(root)) {
      const home = root.home ?? root.home_stats ?? root.homeStats;
      const away = root.away ?? root.away_stats ?? root.awayStats;
      if ((isRecord(home) || Array.isArray(home)) && (isRecord(away) || Array.isArray(away))) {
        if (metricHits(home) + metricHits(away) >= 2) return { home, away };
      }
      for (const key of ['stats','statistics','match_stats','matchStats','data','result','results']) {
        if (root[key]) {
          const found = findStatsPair(root[key], depth + 1, seen);
          if (found) return found;
        }
      }
      for (const value of Object.values(root)) {
        if (value && typeof value === 'object') {
          const found = findStatsPair(value, depth + 1, seen);
          if (found) return found;
        }
      }
    } else if (Array.isArray(root)) {
      for (const value of root) {
        const found = findStatsPair(value, depth + 1, seen);
        if (found) return found;
      }
    }
    return null;
  }

  function statsPair() {
    const wsPair = state.eventFrame?.stats;
    if (isRecord(wsPair?.home) && isRecord(wsPair?.away)) return { home: wsPair.home, away: wsPair.away };
    return findStatsPair(state.stats?.stats ?? state.stats);
  }

  function findNamed(root, wanted, depth = 0, seen = new Set()) {
    if (!root || depth > 5 || seen.has(root)) return null;
    if (typeof root === 'object') seen.add(root);
    if (isRecord(root)) {
      for (const [key, value] of Object.entries(root)) {
        if (wanted.includes(normalizeKey(key))) return value;
      }
      for (const value of Object.values(root)) {
        if (value && typeof value === 'object') {
          const found = findNamed(value, wanted, depth + 1, seen);
          if (found !== null) return found;
        }
      }
    } else if (Array.isArray(root)) {
      for (const value of root) {
        const found = findNamed(value, wanted, depth + 1, seen);
        if (found !== null) return found;
      }
    }
    return null;
  }

  function momentumValues() {
    const raw = findNamed(state.stats?.stats ?? state.stats, ['momentum','match_momentum','momentum_data']);
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw.slice(-30)) {
      if (typeof item === 'number') {
        out.push(Math.max(-100, Math.min(100, item)));
        continue;
      }
      if (!isRecord(item)) continue;
      const home = numeric(item.home ?? item.home_value ?? item.homeValue);
      const away = numeric(item.away ?? item.away_value ?? item.awayValue);
      const value = numeric(item.value ?? item.momentum ?? item.pressure);
      const side = String(item.side ?? item.team ?? '').toLowerCase();
      if (home !== null || away !== null) out.push(Math.max(-100, Math.min(100, (home || 0) - (away || 0))));
      else if (value !== null) out.push(Math.max(-100, Math.min(100, side === 'away' ? -Math.abs(value) : side === 'home' ? Math.abs(value) : value)));
    }
    return out;
  }

  function latestPosition() {
    const action = state.actions[state.actions.length - 1];
    if (action && numeric(action.x) !== null && numeric(action.y) !== null) {
      let x = numeric(action.x), y = numeric(action.y);
      const side = String(action.team ?? action.side ?? '').toLowerCase();
      if (side === 'away') x = 100 - x;
      return { x, y, side, label: action.action_type || action.type || 'action', commentary: action.commentary || '' };
    }
    const frame = state.livedata[state.livedata.length - 1];
    const point = Array.isArray(frame?.coordinates) ? frame.coordinates[frame.coordinates.length - 1] : null;
    if (point && numeric(point.x) !== null && numeric(point.y) !== null) {
      let x = numeric(point.x), y = numeric(point.y);
      const side = String(frame.side || '').toLowerCase();
      if (side === 'away') x = 100 - x;
      return { x, y, side, label: frame.situation || 'live', commentary: frame.commentary || '' };
    }
    return null;
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatStat(value, suffix) {
    if (value === null) return '—';
    if (suffix === '%') return `${Math.round(value)}%`;
    if (Math.abs(value) < 10 && !Number.isInteger(value)) return value.toFixed(2);
    return String(Math.round(value * 100) / 100);
  }

  function activityRows() {
    const combined = [
      ...state.livedata.slice(-5).map((frame) => ({
        stamp: Number(frame.uts || 0) * 1000,
        side: frame.side,
        text: frame.commentary || label(frame.situation),
        type: frame.situation,
      })),
      ...state.actions.slice(-8).map((frame) => ({
        stamp: Number(frame.uts || frame.timestamp || 0) * 1000,
        minute: frame.minute,
        side: frame.team ?? frame.side,
        text: frame.commentary || label(frame.action_type || 'action'),
        type: frame.action_type,
      })),
    ].sort((a, b) => (a.stamp || 0) - (b.stamp || 0)).slice(-5).reverse();
    return combined;
  }

  function coverageLabel() {
    if (state.wsStatus === 'live') return state.source === 'full' ? 'WS+' : 'LIVE WS';
    if (state.stats && !state.statsError) return 'STATS';
    if (state.wsStatus === 'connecting') return 'CONNECTING';
    return 'LIMITED';
  }

  function coverageClass() {
    if (state.wsStatus === 'live') return state.source === 'full' ? 'plus' : 'live';
    if (state.stats && !state.statsError) return 'stats';
    return 'limited';
  }

  function mount() {
    if (!routeActive() || !state.eventId) return null;
    let node = matchApp.querySelector('#bsdLiveCentre');
    if (node) return node;
    const grid = matchApp.querySelector('.matchGrid');
    if (!grid) return null;
    node = document.createElement('section');
    node.id = 'bsdLiveCentre';
    node.className = 'matchPanel liveCentrePanel';
    grid.insertAdjacentElement('afterend', node);
    return node;
  }

  function renderPanel() {
    const node = mount();
    if (!node) return;
    const teams = teamNames();
    const pair = statsPair();
    const pos = latestPosition();
    const metrics = metricSpecs.map(([name, aliases, suffix]) => {
      const home = pair ? readMetric(pair.home, aliases) : null;
      const away = pair ? readMetric(pair.away, aliases) : null;
      if (home === null && away === null) return '';
      const total = Math.max(1, Math.abs(home || 0) + Math.abs(away || 0));
      const homePct = Math.max(3, Math.min(97, Math.abs(home || 0) / total * 100));
      return `<div class="lcStat"><strong>${esc(formatStat(home, suffix))}</strong><div><span>${esc(name)}</span><i style="--home:${homePct}%"></i></div><strong>${esc(formatStat(away, suffix))}</strong></div>`;
    }).filter(Boolean).join('');
    const momentum = momentumValues();
    const activities = activityRows();
    const wsNote = state.wsStatus === 'unavailable' ? (state.wsError || 'WebSocket coverage unavailable; using BSD stats.') : state.wsStatus === 'error' ? (state.wsError || 'Live WebSocket reconnecting…') : '';

    node.innerHTML = `<header><span>LIVE CENTRE</span><div class="lcCoverage"><b class="${coverageClass()}">${coverageLabel()}</b><small>${state.source === 'full' ? 'per-action' : state.source === 'basic' ? 'position ~5s' : 'BSD live data'}</small></div></header>
      <div class="lcBody">
        <div class="lcPitchColumn">
          <div class="lcPitch" aria-label="Live pitch activity">
            <span class="lcTeamLabel home">${esc(teams.home)}</span><span class="lcTeamLabel away">${esc(teams.away)}</span>
            <i class="lcHalf"></i><i class="lcCircle"></i><i class="lcBox left"></i><i class="lcBox right"></i>
            <span class="lcBall ${pos ? 'active' : ''}" style="left:${pos ? Math.max(1, Math.min(99, pos.x)) : 50}%;top:${pos ? Math.max(2, Math.min(98, pos.y)) : 50}%"></span>
          </div>
          <div class="lcSituation"><span class="${pos?.side || ''}">${esc(pos ? label(pos.label) : state.wsStatus === 'live' ? 'Live feed connected' : 'Waiting for pitch feed')}</span><p>${esc(pos?.commentary || wsNote || (state.wsStatus === 'live' ? 'BSD positional activity is live.' : 'Stats remain available even without WebSocket coverage.'))}</p></div>
          <div class="lcActivity">${activities.length ? activities.map((item) => `<div><span class="${esc(String(item.side || '').toLowerCase())}">${item.minute !== undefined ? `${esc(item.minute)}′` : '•'}</span><p>${esc(item.text)}</p></div>`).join('') : '<div class="empty"><p>No live actions received yet.</p></div>'}</div>
        </div>
        <div class="lcStatsColumn">
          <div class="lcStatsHead"><span>${esc(teams.home)}</span><b>LIVE STATS</b><span>${esc(teams.away)}</span></div>
          <div class="lcStats">${metrics || `<div class="lcStatsEmpty">${state.statsError ? esc(state.statsError) : 'Waiting for BSD match statistics…'}</div>`}</div>
          <div class="lcMomentum"><header><span>MOMENTUM</span><small>${momentum.length ? 'latest pressure' : 'awaiting data'}</small></header><div>${momentum.length ? momentum.map((value) => `<i class="${value >= 0 ? 'home' : 'away'}" style="--m:${Math.max(8, Math.min(100, Math.abs(value)))}%"></i>`).join('') : Array.from({length:18},()=>'<i class="idle"></i>').join('')}</div></div>
          <div class="lcFreshness"><span>STATS ${state.statsAt ? `${Math.max(0, Math.floor((Date.now()-state.statsAt)/1000))}s` : '—'}</span><span>EVENT ${esc(String(state.eventId))}</span></div>
        </div>
      </div>`;
  }

  function scheduleRender() {
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(renderPanel, 20);
  }

  async function fetchStats() {
    if (!state.eventId || !routeActive() || document.visibilityState === 'hidden') return;
    const id = state.eventId;
    try {
      const response = await fetch(`${API}/api/match-stats?event_id=${id}&t=${Date.now()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (id !== state.eventId) return;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      state.stats = payload;
      state.statsAt = Date.now();
      state.statsError = '';
      scheduleRender();
    } catch (error) {
      if (id !== state.eventId) return;
      state.statsError = error?.message || 'BSD stats unavailable';
      scheduleRender();
    }
  }

  function stopSocket() {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    if (state.socket) {
      try { state.socket.close(1000, 'match changed'); } catch {}
    }
    state.socket = null;
  }

  function connectSocket() {
    if (!state.eventId || !routeActive() || document.visibilityState === 'hidden') return;
    stopSocket();
    const id = state.eventId;
    state.wsStatus = 'connecting';
    state.wsError = '';
    scheduleRender();

    let socket;
    try { socket = new WebSocket(wsUrl()); }
    catch (error) {
      state.wsStatus = 'error';
      state.wsError = error?.message || 'WebSocket connection failed';
      scheduleReconnect(id);
      return;
    }
    state.socket = socket;

    socket.addEventListener('open', () => {
      if (id !== state.eventId) return;
      try { socket.send(JSON.stringify({ action: 'subscribe', event_id: id })); }
      catch {}
    });

    socket.addEventListener('message', (event) => {
      if (id !== state.eventId) return;
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      if (!frame || typeof frame !== 'object') return;

      if (frame.type === 'subscribed') {
        state.wsStatus = 'live';
        state.source = frame.source || 'basic';
        state.eventFrame = frame.event || state.eventFrame;
        state.livedata = Array.isArray(frame.livedata) ? frame.livedata.slice(-30) : state.livedata;
        state.actions = Array.isArray(frame.history) ? frame.history.slice(-80) : state.actions;
      } else if (frame.type === 'event') {
        state.wsStatus = 'live';
        state.eventFrame = frame;
      } else if (frame.type === 'livedata') {
        state.wsStatus = 'live';
        state.livedata.push(frame);
        if (state.livedata.length > 40) state.livedata.shift();
      } else if (frame.type === 'action') {
        state.wsStatus = 'live';
        state.source = 'full';
        state.actions.push(frame);
        if (state.actions.length > 100) state.actions.shift();
      } else if (frame.type === 'error') {
        const code = String(frame.code || '');
        state.wsError = frame.message || code || 'BSD WebSocket error';
        if (['subscription_required','not_tracked','bad_event_id'].includes(code)) state.wsStatus = 'unavailable';
        else state.wsStatus = 'error';
      }
      scheduleRender();
    });

    socket.addEventListener('close', () => {
      if (id !== state.eventId || state.socket !== socket) return;
      state.socket = null;
      if (state.wsStatus === 'unavailable') return;
      state.wsStatus = 'error';
      if (!state.wsError) state.wsError = 'Live WebSocket disconnected';
      scheduleRender();
      scheduleReconnect(id);
    });
    socket.addEventListener('error', () => {
      if (id !== state.eventId) return;
      if (state.wsStatus !== 'unavailable') {
        state.wsStatus = 'error';
        state.wsError = 'Live WebSocket connection unavailable';
      }
      scheduleRender();
    });
  }

  function scheduleReconnect(id) {
    if (state.wsStatus === 'unavailable' || !routeActive()) return;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(() => {
      if (id === state.eventId && routeActive() && document.visibilityState === 'visible') connectSocket();
    }, 5000);
  }

  function startFor(eventId) {
    if (!eventId) return;
    if (state.eventId === eventId) {
      scheduleRender();
      return;
    }
    stopSocket();
    clearInterval(state.statsTimer);
    state.eventId = eventId;
    state.stats = null;
    state.statsAt = 0;
    state.eventFrame = null;
    state.livedata = [];
    state.actions = [];
    state.source = '';
    state.wsStatus = 'idle';
    state.wsError = '';
    state.statsError = '';
    fetchStats();
    state.statsTimer = setInterval(fetchStats, 5000);
    connectSocket();
    scheduleRender();
  }

  function stopAll() {
    clearInterval(state.statsTimer);
    state.statsTimer = null;
    stopSocket();
    state.eventId = null;
    state.wsStatus = 'idle';
  }

  function syncFromDom() {
    if (!routeActive()) {
      stopAll();
      return;
    }
    const eventId = domEventId();
    if (eventId) startFor(eventId);
    if (state.eventId) scheduleRender();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(syncFromDom, 10);
  });
  observer.observe(matchApp, { childList: true, subtree: true });

  window.addEventListener('hashchange', () => setTimeout(syncFromDom, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncFromDom();
      if (state.eventId) fetchStats();
      if (state.eventId && !state.socket && state.wsStatus !== 'unavailable') connectSocket();
    } else {
      stopSocket();
    }
  });

  setInterval(() => { if (routeActive() && state.eventId) scheduleRender(); }, 1000);
  syncFromDom();
})();
