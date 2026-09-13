(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const nativeFetch = window.fetch.bind(window);
  const LIVE_TTL = 3000;

  let liveCache = [];
  let liveCacheAt = 0;
  let liveInFlight = null;

  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const pick = (...values) => values.find(value => value !== undefined && value !== null && value !== '') ?? null;

  function normalizeToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  function normalizedStatus(event) {
    const candidates = [
      event?.status,
      event?.time?.status,
      event?.time?.period,
      event?.current_period,
      event?.period,
      event?.match_period,
      event?.time?.display,
      event?.display,
      event?.state,
      event?.match_status,
    ].map(normalizeToken).filter(Boolean);

    const finished = new Set([
      'finished','ended','complete','completed','final','ft','full_time','fulltime',
      'aet','after_extra_time','after_penalties','penalties_finished','penalty_shootout_finished'
    ]);
    if (candidates.some(value => finished.has(value) || /^ft\b/.test(value) || /^full_time\b/.test(value))) return 'finished';

    const live = new Set([
      'live','inprogress','in_progress','playing','ongoing','1st_half','first_half','2nd_half','second_half',
      'ht','halftime','half_time','break','paused','extra_time','extra_time_first_half','extra_time_second_half',
      'penalties','penalty_shootout'
    ]);
    if (candidates.some(value => live.has(value))) return 'live';

    if (candidates.some(value => ['postponed','cancelled','canceled','abandoned','suspended'].includes(value))) return 'stopped';
    return 'upcoming';
  }

  function normName(value = '') {
    return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function teamName(event, side) {
    const value = event?.[`${side}_team`] ?? event?.[side] ?? event?.teams?.[side];
    if (typeof value === 'string') return value;
    if (isObject(value)) return String(pick(value.name, value.short_name, value.team_name, value.display_name, '') || '');
    return String(pick(event?.[`${side}_team_name`], event?.[`${side}_name`], '') || '');
  }

  function eventId(event) {
    const id = pick(event?.id, event?.event_id, event?.eventId);
    return id === null ? '' : String(id);
  }

  function teamKey(event) {
    const home = normName(teamName(event, 'home'));
    const away = normName(teamName(event, 'away'));
    return home && away ? `${home}|${away}` : '';
  }

  function eventKey(event) {
    const id = eventId(event);
    return id ? `id:${id}` : (teamKey(event) ? `teams:${teamKey(event)}` : '');
  }

  function rowsFrom(payload) {
    const data = payload?.data ?? payload;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.events)) return data.events;
    if (Array.isArray(data?.matches)) return data.matches;
    return [];
  }

  function rowsContainer(payload) {
    if (Array.isArray(payload)) return { parent: null, key: null, rows: payload };
    if (!isObject(payload)) return null;
    if (Array.isArray(payload.data)) return { parent: payload, key: 'data', rows: payload.data };
    if (isObject(payload.data)) {
      for (const key of ['results','events','matches']) {
        if (Array.isArray(payload.data[key])) return { parent: payload.data, key, rows: payload.data[key] };
      }
    }
    for (const key of ['results','events','matches']) {
      if (Array.isArray(payload[key])) return { parent: payload, key, rows: payload[key] };
    }
    return null;
  }

  function mergeEvent(dayEvent, liveEvent) {
    const merged = { ...dayEvent, ...liveEvent, status: 'live' };
    for (const key of ['home_team','away_team','league']) {
      if (isObject(dayEvent?.[key]) && !isObject(liveEvent?.[key])) merged[key] = dayEvent[key];
    }
    if (isObject(dayEvent?.time) || isObject(liveEvent?.time)) merged.time = { ...(isObject(dayEvent?.time) ? dayEvent.time : {}), ...(isObject(liveEvent?.time) ? liveEvent.time : {}) };
    if (isObject(dayEvent?.score) || isObject(liveEvent?.score)) merged.score = { ...(isObject(dayEvent?.score) ? dayEvent.score : {}), ...(isObject(liveEvent?.score) ? liveEvent.score : {}) };
    return merged;
  }

  async function fetchAuthoritativeLive() {
    const now = Date.now();
    if (liveCacheAt && now - liveCacheAt < LIVE_TTL) return { ok: true, rows: liveCache };
    if (liveInFlight) return liveInFlight;

    liveInFlight = (async () => {
      try {
        const response = await nativeFetch(`${API}/api/bsd/live?canonical=${now}`, { cache: 'no-store' });
        if (!response.ok) return { ok: false, rows: liveCache };
        const payload = await response.json();
        // Membership in BSD's dedicated live endpoint is authoritative. Some
        // compact rows omit a literal `status: live`, so only exclude rows that
        // explicitly resolve to a terminal/stopped state, then force LIVE.
        const rows = rowsFrom(payload)
          .filter(event => !['finished','stopped'].includes(normalizedStatus(event)))
          .map(event => ({ ...event, status: 'live' }));
        liveCache = rows;
        liveCacheAt = Date.now();
        window.__SLIPTRACE_CANONICAL_LIVE__ = rows;
        return { ok: true, rows };
      } catch {
        return { ok: false, rows: liveCache };
      } finally {
        liveInFlight = null;
      }
    })();

    return liveInFlight;
  }

  function isDailyEventsRequest(url) {
    try {
      const parsed = new URL(url, location.href);
      if (!parsed.pathname.endsWith('/api/bsd/events')) return false;
      const from = parsed.searchParams.get('date_from');
      const to = parsed.searchParams.get('date_to');
      return Boolean(from && to && from === to);
    } catch {
      return false;
    }
  }

  function responseWithPayload(response, payload) {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  async function canonicalizeDailyEvents(response) {
    if (!response.ok) return response;

    let payload;
    try {
      payload = await response.clone().json();
    } catch {
      return response;
    }

    const container = rowsContainer(payload);
    if (!container) return response;

    const liveResult = await fetchAuthoritativeLive();
    if (!liveResult.ok) return response;

    const liveById = new Map();
    const liveByTeams = new Map();
    for (const event of liveResult.rows) {
      const id = eventId(event);
      const teams = teamKey(event);
      if (id) liveById.set(id, event);
      if (teams) liveByTeams.set(teams, event);
    }

    const output = [];
    const included = new Set();

    for (const event of container.rows) {
      const id = eventId(event);
      const teams = teamKey(event);
      const key = eventKey(event);
      const liveEvent = (id && liveById.get(id)) || (teams && liveByTeams.get(teams)) || null;
      const dayStatus = normalizedStatus(event);

      if (liveEvent) {
        const merged = mergeEvent(event, liveEvent);
        output.push(merged);
        const mergedKey = eventKey(merged);
        if (mergedKey) included.add(mergedKey);
        continue;
      }

      if (dayStatus === 'live') {
        // The date feed can lag behind. Membership in the dedicated live feed
        // is authoritative, so a missing event must never enter the LIVE tab.
        output.push({ ...event, status: 'status_syncing' });
        if (key) included.add(key);
        continue;
      }

      if (dayStatus === 'finished') output.push({ ...event, status: 'finished' });
      else output.push(event);
      if (key) included.add(key);
    }

    // LIVE is global, not date-scoped. Append every genuinely live event even
    // when its provider fixture date differs from the selected Matchday date.
    for (const event of liveResult.rows) {
      const key = eventKey(event);
      if (!key || included.has(key)) continue;
      output.push({ ...event, status: 'live' });
      included.add(key);
    }

    if (container.parent === null) payload = output;
    else container.parent[container.key] = output;

    return responseWithPayload(response, payload);
  }

  window.fetch = async function(input, init) {
    const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
    const response = await nativeFetch(input, init);
    if (!isDailyEventsRequest(requestUrl)) return response;
    return canonicalizeDailyEvents(response);
  };
})();
