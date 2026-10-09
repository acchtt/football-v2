// Badges belong to teams/competitions, independently of live-score coverage.
(() => {
  'use strict';
  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const CACHE_KEY = 'arcxi.logo-ids.v1';
  const requests = new Map();
  const failedImages = new Set();
  let leagueRequest;
  const local = {
    team: {
      'belgium':'belgium', 'turkiye':'turkiye', 'turkey':'turkiye',
      'bosnia herzegovina':'bosnia-herzegovina', 'sweden':'sweden',
      'faroe islands':'faroe-islands', 'slovakia':'slovakia', 'poland':'poland',
      'romania':'romania', 'france':'france', 'italy':'italy',
      'dukla praha':'dukla-praha', 'jablonec':'jablonec',
      'helmond sport':'helmond-sport', 'heracles almelo':'heracles-almelo'
    },
    competition: {
      'uefa nations league':'nations-league', 'nations league':'nations-league',
      'czech cup':'czech-cup', 'mol cup':'czech-cup',
      'netherlands eerste divisie':'eerste-divisie', 'eerste divisie':'eerste-divisie',
      'keuken kampioen divisie':'eerste-divisie'
    }
  };
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch {}

  function normalize(name) {
    return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\b(fc|cf|afc|sc|ac|sk|fk|club|and)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function selectEntity(entities, name, kind) {
    // Full-name equality preserves women, age groups and reserve-team identity.
    const matches = entities.filter(entity =>
      (normalize(entity.name) === normalize(name) ||
        (kind === 'competition' && normalize(entity.country + ' ' + entity.name) === normalize(name))) &&
      !(kind === 'competition' && entity.is_women && !/\bwomen\b/i.test(name)) &&
      Number.isSafeInteger(entity.id) && entity.id > 0);
    return matches.length === 1 ? matches[0] : null;
  }
  function resolveLogo(kind, name) {
    const normalized = normalize(name);
    const filename = local[kind]?.[normalized];
    if (filename) return Promise.resolve('./media/football/' + filename + '.png');
    // Static demos must not attempt unavailable live lookup endpoints.
    if (window.__ARCXI_DEMO_SNAPSHOT__) return Promise.resolve(null);
    const key = kind + ':' + normalized;
    const saved = cache[key];
    const image = id => 'https://sports.bzzoiro.com/img/' + (kind === 'team' ? 'team' : 'league') + '/' + id + '/?bg=transparent';
    if (saved && Number.isSafeInteger(saved.id) && saved.id > 0 && Date.now() - saved.at < 7 * 86400000) {
      return Promise.resolve(image(saved.id));
    }
    if (requests.has(key)) return requests.get(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const read = response => response.ok ? response.json() : null;
    // The league collection works; upstream name-filtered league requests fail.
    const lookup = kind === 'competition' ?
      (leagueRequest ||= fetch(API + '/api/bsd/leagues?limit=200', {signal:controller.signal})
        .then(read).then(payload => {
          if (!payload) leagueRequest = null;
          return payload;
        }).catch(() => { leagueRequest = null; return null; })) :
      fetch(API + '/api/bsd/teams?name=' + encodeURIComponent(normalized) + '&limit=100', {signal:controller.signal}).then(read);
    const task = lookup.then(payload => {
        const entities = payload?.data?.results;
        const entity = Array.isArray(entities) ? selectEntity(entities, name, kind) : null;
        if (!entity) return null;
        cache[key] = {id:entity.id, at:Date.now()};
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
        return image(entity.id);
      }).catch(() => null).finally(() => clearTimeout(timer));
    requests.set(key, task);
    return task;
  }
  function decorate(node, kind, name) {
    const current = node.querySelector('img,.crestFallback,.competitionMark');
    if (!current || (current.tagName === 'IMG' && (!current.complete || current.naturalWidth))) return;
    resolveLogo(kind, name).then(source => {
      if (!source || failedImages.has(source) || !node.isConnected || !current.isConnected) return;
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.dataset.scheduleLogo = kind;
      img.addEventListener('error', () => {
        failedImages.add(source);
        img.replaceWith(current);
      }, {once:true});
      img.src = source;
      current.replaceWith(img);
    });
  }
  function update() {
    document.querySelectorAll('.scheduleTeam').forEach(node =>
      decorate(node, 'team', node.querySelector('span[title]')?.textContent?.trim() || ''));
    document.querySelectorAll('.scheduleCompetitionHead').forEach(node =>
      decorate(node, 'competition', node.querySelector('strong')?.textContent?.trim() || ''));
  }
  const root = document.getElementById('app');
  if (!root) return;
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(update, 50);
  }).observe(root, {childList:true, subtree:true});
  update();
})();
