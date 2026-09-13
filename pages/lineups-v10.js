// SlipTrace Match Desk v10 — canonical BSD lineups renderer.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const matchApp = document.getElementById('matchApp');
  if (!matchApp) return;

  const state = { eventId: null, data: null, error: '', at: 0, timer: null, busy: false };

  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function active() { return /^#match\//.test(location.hash); }
  function eventId() {
    const text = matchApp.querySelector('.matchTopline>span')?.textContent || '';
    const match = text.match(/BSD EVENT\s+(\d+)/i);
    return match ? Number(match[1]) : null;
  }
  function teamNames() {
    const rows = [...matchApp.querySelectorAll('.matchHeroTeam strong')].map(n => n.textContent.trim());
    return { home: rows[0] || 'Home', away: rows[1] || 'Away' };
  }
  function mount() {
    let node = matchApp.querySelector('#bsdLineups');
    if (node) return node;
    const anchor = matchApp.querySelector('#bsdLiveCentre') || matchApp.querySelector('.matchGrid');
    if (!anchor) return null;
    node = document.createElement('section');
    node.id = 'bsdLineups';
    node.className = 'matchPanel lineupsPanel';
    anchor.insertAdjacentElement('afterend', node);
    return node;
  }
  function playerRow(player) {
    const number = player?.number || '·';
    const position = player?.position || '';
    return `<div class="xiPlayer"><b>${esc(number)}</b><span>${esc(player?.name || 'Unknown')}${position ? `<small>${esc(position)}</small>` : ''}</span></div>`;
  }
  function teamBlock(name, side) {
    const starters = Array.isArray(side?.starters) ? side.starters : [];
    const subs = Array.isArray(side?.substitutes) ? side.substitutes : [];
    return `<div class="xiTeam">
      <header><div><strong>${esc(name)}</strong><span>${esc(side?.formation || 'Formation —')}</span></div><b>${starters.length || '—'} XI</b></header>
      <div class="xiStarters">${starters.length ? starters.map(playerRow).join('') : '<p>Starting XI not available yet.</p>'}</div>
      ${subs.length ? `<details class="xiBench"><summary>Substitutes <b>${subs.length}</b></summary><div>${subs.map(playerRow).join('')}</div></details>` : ''}
    </div>`;
  }
  function statusMeta() {
    const status = String(state.data?.status || 'unknown').toLowerCase();
    if (status === 'confirmed') return { label: 'CONFIRMED', cls: 'confirmed' };
    if (status === 'predicted') return { label: 'PREDICTED', cls: 'predicted' };
    return { label: 'LINEUP', cls: 'neutral' };
  }
  function render() {
    if (!active() || !state.eventId) return;
    const node = mount();
    if (!node) return;
    const teams = teamNames();
    const meta = statusMeta();
    const age = state.at ? Math.max(0, Math.floor((Date.now() - state.at) / 1000)) : 0;

    if (state.error && !state.data) {
      node.innerHTML = `<header><span>LINEUPS</span><b class="xiStatus unavailable">UNAVAILABLE</b></header><div class="xiEmpty">${esc(state.error)}</div>`;
      return;
    }

    if (!state.data) {
      node.innerHTML = `<header><span>LINEUPS</span><b class="xiStatus neutral">LOADING</b></header><div class="xiEmpty">Loading BSD lineups…</div>`;
      return;
    }

    if (!state.data.available) {
      node.innerHTML = `<header><span>LINEUPS</span><div class="xiHeadMeta"><b class="xiStatus neutral">NOT PUBLISHED</b><small>${age}s · BSD</small></div></header><div class="xiEmpty">BSD has not published a usable XI for this fixture yet.</div>`;
      return;
    }

    node.innerHTML = `<header><span>LINEUPS</span><div class="xiHeadMeta"><b class="xiStatus ${meta.cls}">${meta.label}</b><small data-lineup-age>${age}s · BSD</small></div></header>
      <div class="xiGrid">${teamBlock(teams.home, state.data.home)}${teamBlock(teams.away, state.data.away)}</div>
      ${meta.cls === 'predicted' ? '<div class="xiNotice">AI-predicted XI — do not treat as confirmed team news.</div>' : ''}`;
  }
  async function fetchLineups() {
    if (!state.eventId || state.busy || !active() || document.visibilityState === 'hidden') return;
    state.busy = true;
    const id = state.eventId;
    try {
      const response = await fetch(`${API}/api/match-lineups?event_id=${id}&t=${Date.now()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (id !== state.eventId) return;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      state.data = payload.normalized || null;
      state.error = '';
      state.at = Date.now();
      render();
    } catch (error) {
      if (id !== state.eventId) return;
      state.error = error?.message || 'BSD lineups unavailable';
      render();
    } finally {
      state.busy = false;
    }
  }
  function start(id) {
    if (!id) return;
    if (state.eventId === id) return;
    clearInterval(state.timer);
    state.eventId = id;
    state.data = null;
    state.error = '';
    state.at = 0;
    render();
    fetchLineups();
    state.timer = setInterval(fetchLineups, 30000);
  }
  function stop() {
    clearInterval(state.timer);
    state.timer = null;
    state.eventId = null;
    state.data = null;
    state.error = '';
    matchApp.querySelector('#bsdLineups')?.remove();
  }
  function sync() {
    if (!active()) return stop();
    const id = eventId();
    if (id) start(id);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(observer._timer);
    observer._timer = setTimeout(sync, 30);
  });
  observer.observe(matchApp, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', () => setTimeout(sync, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { sync(); fetchLineups(); }
  });
  setInterval(() => {
    const node = matchApp.querySelector('[data-lineup-age]');
    if (node && state.at) node.textContent = `${Math.max(0, Math.floor((Date.now() - state.at) / 1000))}s · BSD`;
  }, 1000);
  sync();
})();
