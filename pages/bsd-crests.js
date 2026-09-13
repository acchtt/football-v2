// SlipTrace BSD crest layer — resolves displayed fixtures to BSD team IDs without touching the core board controller.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const ZONE = 'Asia/Ho_Chi_Minh';
  const assets = [];
  const loadedRanges = new Set();
  let busy = false;
  let queued = false;
  let extraDayBudget = 10;

  function normalize(value = '') {
    return String(value)
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nameScore(a, b) {
    const x = normalize(a), y = normalize(b);
    if (!x || !y) return 0;
    if (x === y) return 6;
    if (x.includes(y) || y.includes(x)) return 4;
    const aa = new Set(x.split(' ')), bb = new Set(y.split(' '));
    let shared = 0;
    aa.forEach((token) => bb.has(token) && shared++);
    const overlap = shared / Math.max(aa.size, bb.size);
    return overlap >= .75 ? 4 : overlap >= .5 ? 3 : 0;
  }

  function dateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(value));
    const get = (type) => parts.find((x) => x.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function shiftDay(key, delta) {
    const date = new Date(`${key}T12:00:00+07:00`);
    date.setUTCDate(date.getUTCDate() + delta);
    return dateKey(date);
  }

  function addAssets(rows) {
    const seen = new Set(assets.map((event) => `${event.id ?? ''}|${event.home}|${event.away}|${event.eventDate || ''}`));
    for (const event of rows || []) {
      if (!event?.home || !event?.away) continue;
      const key = `${event.id ?? ''}|${event.home}|${event.away}|${event.eventDate || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      assets.push(event);
    }
  }

  async function fetchRange(from, to) {
    const key = `${from}|${to}`;
    if (loadedRanges.has(key)) return;
    loadedRanges.add(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const url = `${API}/api/fixture-assets?date_from=${encodeURIComponent(from)}&date_to=${encodeURIComponent(to)}&t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      addAssets(payload.events);
    } catch (error) {
      loadedRanges.delete(key);
      console.warn('SlipTrace crest lookup failed', error);
    } finally {
      clearTimeout(timer);
    }
  }

  function fixtureAsset(home, away) {
    let best = null;
    for (const event of assets) {
      const forward = nameScore(home, event.home) + nameScore(away, event.away);
      const reversed = nameScore(home, event.away) + nameScore(away, event.home);
      const score = Math.max(forward, reversed);
      if (score < 6) continue;
      if (!best || score > best.score) best = { event, score, reversed: reversed > forward };
    }
    return best;
  }

  function teamAsset(name) {
    let best = null;
    for (const event of assets) {
      for (const side of ['home', 'away']) {
        const score = nameScore(name, event[side]);
        if (score < 4) continue;
        if (!best || score > best.score) {
          best = {
            score,
            id: event[`${side}TeamId`],
            logo: event[`${side}Logo`],
          };
        }
      }
    }
    return best;
  }

  function applyImage(crest, id, logo, alt) {
    if (!crest || (!id && !logo)) return;
    const src = logo || `https://sports.bzzoiro.com/img/team/${id}/?bg=transparent`;
    const existing = crest.querySelector('img');
    if (existing?.dataset?.bsdSrc === src) return;
    if (existing) existing.remove();
    const img = document.createElement('img');
    img.src = src;
    img.alt = `${alt} crest`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.dataset.bsdSrc = src;
    img.addEventListener('load', () => crest.classList.add('hasImage'), { once: true });
    img.addEventListener('error', () => {
      img.remove();
      crest.classList.remove('hasImage');
    }, { once: true });
    crest.prepend(img);
  }

  function decorateMatchRow(row) {
    const lines = [...row.querySelectorAll('.fixtureTeams .teamLine')];
    if (lines.length < 2) return;
    const home = lines[0].querySelector('strong')?.textContent?.trim() || '';
    const away = lines[1].querySelector('strong')?.textContent?.trim() || '';
    if (!home || !away) return;
    const match = fixtureAsset(home, away);
    if (!match) return;
    const event = match.event;
    const homeSide = match.reversed ? 'away' : 'home';
    const awaySide = match.reversed ? 'home' : 'away';
    applyImage(lines[0].querySelector('.crest'), event[`${homeSide}TeamId`], event[`${homeSide}Logo`], home);
    applyImage(lines[1].querySelector('.crest'), event[`${awaySide}TeamId`], event[`${awaySide}Logo`], away);
  }

  function decorateRail(row) {
    const name = row.querySelector('.railTeams b')?.textContent?.trim() || '';
    const crest = row.querySelector('.railCrest .crest');
    if (!name || !crest) return;
    const team = teamAsset(name);
    if (team) applyImage(crest, team.id, team.logo, name);
  }

  function decorate() {
    document.querySelectorAll('.fixtureRow,.pickRow').forEach(decorateMatchRow);
    document.querySelectorAll('.rightRail li').forEach(decorateRail);
  }

  async function loadInitial() {
    if (busy) { queued = true; return; }
    busy = true;
    const today = dateKey();
    await fetchRange(shiftDay(today, -7), shiftDay(today, 1));
    decorate();
    busy = false;
    if (queued) { queued = false; loadInitial(); }
  }

  async function loadVisiblePickDays() {
    if (extraDayBudget <= 0) return;
    const dates = [...document.querySelectorAll('.pickRow .pickWhen span')]
      .map((node) => node.textContent?.trim())
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value || ''));
    const unique = [...new Set(dates)];
    const today = dateKey();
    const initialFrom = shiftDay(today, -7), initialTo = shiftDay(today, 1);
    const missing = unique.filter((day) => day < initialFrom || day > initialTo).slice(0, Math.min(3, extraDayBudget));
    for (const day of missing) {
      extraDayBudget -= 1;
      await fetchRange(day, day);
    }
    if (missing.length) decorate();
  }

  let mutationTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      decorate();
      loadVisiblePickDays();
    }, 40);
  });

  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(() => { decorate(); loadVisiblePickDays(); }, 50));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadInitial();
  });
  setInterval(loadInitial, 10 * 60 * 1000);
  loadInitial();
})();
