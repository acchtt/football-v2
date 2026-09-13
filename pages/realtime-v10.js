// SlipTrace v10 — BSD WebSocket positional animation, isolated from board polling.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const matchApp = document.getElementById('matchApp');
  if (!matchApp) return;

  const state = {
    eventId: null,
    socket: null,
    reconnect: null,
    blocked: false,
    source: '',
    position: null,
    situation: '',
    commentary: '',
    activity: [],
    coverageText: '',
    coverageClass: '',
    coverageNote: '',
    ballNode: null,
  };

  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function active() { return /^#match\//.test(location.hash); }
  function currentEventId() {
    const text = matchApp.querySelector('.matchTopline>span')?.textContent || '';
    const match = text.match(/BSD EVENT\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  }
  function wsUrl() {
    const url = new URL(API);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/api/live-centre';
    url.search = '';
    return url.toString();
  }
  function label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function sideClass(value) {
    const side = String(value || '').toLowerCase();
    return side === 'home' || side === 'away' ? side : '';
  }
  function setCoverage(text, cls, note) {
    state.coverageText = text;
    state.coverageClass = cls || 'limited';
    state.coverageNote = note || '';
    const panel = matchApp.querySelector('#bsdLiveCentre');
    if (!panel) return;
    const badge = panel.querySelector('.lcCoverage b');
    const small = panel.querySelector('.lcCoverage small');
    if (badge) {
      badge.className = state.coverageClass;
      badge.textContent = state.coverageText;
    }
    if (small) small.textContent = state.coverageNote;
  }
  function renderActivity() {
    if (!state.activity.length) return;
    const node = matchApp.querySelector('#bsdLiveCentre .lcActivity');
    if (!node) return;
    node.innerHTML = state.activity.map(row => `<div><span class="${sideClass(row.side)}">${row.minute !== undefined && row.minute !== null ? `${esc(row.minute)}′` : '•'}</span><p>${esc(row.text)}</p></div>`).join('');
  }
  function pushActivity(item) {
    if (!item?.text) return;
    state.activity.unshift(item);
    state.activity = state.activity.slice(0, 5);
    renderActivity();
  }
  function applyOverlay() {
    const panel = matchApp.querySelector('#bsdLiveCentre');
    if (!panel) return;
    if (state.coverageText) setCoverage(state.coverageText, state.coverageClass, state.coverageNote);
    const ball = panel.querySelector('.lcBall');
    if (ball && state.position) {
      const side = sideClass(state.position.side);
      let x = Number(state.position.x);
      const y = Number(state.position.y);
      if (side === 'away') x = 100 - x;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        ball.style.left = `${Math.max(1, Math.min(99, x))}%`;
        ball.style.top = `${Math.max(2, Math.min(98, y))}%`;
        ball.classList.add('active');
      }
    }
    const situation = panel.querySelector('.lcSituation > span');
    const commentary = panel.querySelector('.lcSituation > p');
    if (situation && state.situation) {
      situation.textContent = label(state.situation);
      situation.className = sideClass(state.position?.side);
    }
    if (commentary && state.commentary) commentary.textContent = state.commentary;
    renderActivity();
  }
  function positionFromLivedata(frame) {
    const points = Array.isArray(frame?.coordinates) ? frame.coordinates : [];
    const point = points[points.length - 1];
    if (!point) return;
    state.position = { x: point.x, y: point.y, side: frame.side };
    state.situation = frame.situation || 'live';
    state.commentary = frame.commentary || `${label(frame.situation || 'Live')} · ${frame.side || ''}`;
    pushActivity({ side: frame.side, text: state.commentary });
    applyOverlay();
  }
  function positionFromAction(frame) {
    if (!Number.isFinite(Number(frame?.x)) || !Number.isFinite(Number(frame?.y))) return;
    state.position = { x: Number(frame.x), y: Number(frame.y), side: frame.team || frame.side };
    state.situation = frame.action_type || 'action';
    const player = frame.player?.name ? `${frame.player.name} · ` : '';
    state.commentary = `${player}${label(frame.action_type || 'Action')}`;
    pushActivity({ side: frame.team || frame.side, minute: frame.minute, text: state.commentary });
    applyOverlay();
  }
  function handleFrame(frame) {
    if (!frame || typeof frame !== 'object') return;
    if (frame.event_id && Number(frame.event_id) !== state.eventId) return;

    if (frame.type === 'subscribed') {
      state.source = frame.source || 'basic';
      state.blocked = false;
      setCoverage(state.source === 'full' ? 'WS+' : 'LIVE WS', state.source === 'full' ? 'plus' : 'live', state.source === 'full' ? 'per-action position' : 'position ~5s');
      const live = Array.isArray(frame.livedata) ? frame.livedata : [];
      const history = Array.isArray(frame.history) ? frame.history : [];
      if (history.length) positionFromAction(history[history.length - 1]);
      else if (live.length) positionFromLivedata(live[live.length - 1]);
      else applyOverlay();
      return;
    }
    if (frame.type === 'livedata') {
      setCoverage(state.source === 'full' ? 'WS+' : 'LIVE WS', state.source === 'full' ? 'plus' : 'live', state.source === 'full' ? 'per-action position' : 'position ~5s');
      positionFromLivedata(frame);
      return;
    }
    if (frame.type === 'action') {
      state.source = 'full';
      setCoverage('WS+', 'plus', 'per-action position');
      positionFromAction(frame);
      return;
    }
    if (frame.type === 'error') {
      const code = String(frame.code || '');
      const message = frame.message || code || 'WebSocket error';
      if (code === 'subscription_required') {
        state.blocked = true;
        state.situation = 'WebSocket addon required';
        state.commentary = 'Real pitch animation requires the BSD WebSocket addon. REST stats remain active.';
        setCoverage('WS ADDON', 'limited', 'BSD WebSocket addon required');
      } else if (code === 'not_tracked') {
        state.blocked = true;
        state.situation = 'No positional feed';
        state.commentary = 'BSD does not provide positional WebSocket coverage for this match.';
        setCoverage('NO WS', 'limited', 'no positional coverage');
      } else {
        state.situation = 'WebSocket error';
        state.commentary = message;
        setCoverage('WS ERROR', 'limited', message);
      }
      applyOverlay();
    }
  }
  function closeSocket() {
    clearTimeout(state.reconnect);
    state.reconnect = null;
    const socket = state.socket;
    state.socket = null;
    if (socket) {
      try { socket.close(1000, 'match changed'); } catch {}
    }
  }
  function scheduleReconnect(id) {
    if (state.blocked || !active()) return;
    clearTimeout(state.reconnect);
    state.reconnect = setTimeout(() => {
      if (state.eventId === id && active() && document.visibilityState === 'visible') connect();
    }, 4000);
  }
  function connect() {
    if (!state.eventId || state.socket || state.blocked || !active() || document.visibilityState === 'hidden') return;
    const id = state.eventId;
    setCoverage('CONNECTING', 'stats', 'opening BSD live channel');
    let socket;
    try { socket = new WebSocket(wsUrl()); }
    catch (error) {
      setCoverage('WS ERROR', 'limited', error?.message || 'connection failed');
      scheduleReconnect(id);
      return;
    }
    state.socket = socket;
    socket.addEventListener('open', () => {
      if (id !== state.eventId) return;
      try { socket.send(JSON.stringify({ action: 'subscribe', event_id: id })); } catch {}
    });
    socket.addEventListener('message', event => {
      if (id !== state.eventId) return;
      let frame;
      try { frame = JSON.parse(event.data); } catch { return; }
      handleFrame(frame);
    });
    socket.addEventListener('close', () => {
      if (state.socket === socket) state.socket = null;
      if (id !== state.eventId || state.blocked) return;
      setCoverage('RECONNECT', 'limited', 'BSD live channel disconnected');
      scheduleReconnect(id);
    });
    socket.addEventListener('error', () => {
      if (id !== state.eventId || state.blocked) return;
      setCoverage('WS ERROR', 'limited', 'live channel unavailable');
    });
  }
  function start(id) {
    if (!id) return;
    if (state.eventId === id) { applyOverlay(); connect(); return; }
    closeSocket();
    state.eventId = id;
    state.blocked = false;
    state.source = '';
    state.position = null;
    state.situation = '';
    state.commentary = '';
    state.activity = [];
    state.coverageText = '';
    state.coverageClass = '';
    state.coverageNote = '';
    state.ballNode = null;
    connect();
  }
  function stop() {
    closeSocket();
    state.eventId = null;
    state.blocked = false;
    state.position = null;
    state.activity = [];
    state.ballNode = null;
  }
  function sync() {
    if (!active()) return stop();
    const id = currentEventId();
    if (id) start(id);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(() => {
      sync();
      const ball = matchApp.querySelector('#bsdLiveCentre .lcBall');
      if (ball && ball !== state.ballNode) {
        state.ballNode = ball;
        applyOverlay();
      }
    }, 20);
  });
  observer.observe(matchApp, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', () => setTimeout(sync, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') closeSocket();
    else { sync(); connect(); }
  });
  sync();
})();
