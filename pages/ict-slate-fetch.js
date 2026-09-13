(() => {
  'use strict';

  // BSD event dates are UTC while SlipTrace slate dates are ICT (UTC+7).
  // A local ICT day therefore spans two UTC calendar dates. This bridge runs
  // before config.js so it can widen the BSD request without triggering the
  // board filter against the wrong UTC date.
  const nativeFetch = window.fetch.bind(window);
  const API_ORIGIN = 'https://football-v2.acchtt.workers.dev';
  const TZ = 'Asia/Ho_Chi_Minh';
  const PAGE_SIZE = 200;
  const MAX_PAGES = 5;

  function shiftDate(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return date;
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function ictDateKey(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const get = type => parts.find(p => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function kickoff(event) {
    return event?.event_date ?? event?.kickoff_at ?? event?.kickoff ??
      event?.start_time ?? event?.start_at ?? event?.date ??
      event?.time?.kickoff_at ?? event?.time?.start_time ?? null;
  }

  function rowsFrom(payload) {
    const data = payload?.data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.results)) return data.results;
    if (Array.isArray(data.events)) return data.events;
    return [];
  }

  function eventKey(event) {
    const id = event?.id ?? event?.event_id ?? event?.eventId;
    if (id !== undefined && id !== null && id !== '') return `id:${id}`;
    const h = event?.home_team?.name ?? event?.home_team_name ?? event?.home?.name ?? '';
    const a = event?.away_team?.name ?? event?.away_team_name ?? event?.away?.name ?? '';
    return `${kickoff(event) || ''}|${h}|${a}`;
  }

  async function fetchPage(baseUrl, offset) {
    const url = new URL(baseUrl);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    const response = await nativeFetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`BSD window HTTP ${response.status}`);
    const payload = await response.json();
    return { response, payload };
  }

  async function fetchIctSlate(originalUrl, selectedDate) {
    const widened = new URL(originalUrl);
    widened.searchParams.set('date_from', shiftDate(selectedDate, -1));
    widened.searchParams.set('date_to', selectedDate);

    let firstResponse = null;
    let template = null;
    const merged = new Map();
    let offset = 0;
    let total = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { response, payload } = await fetchPage(widened, offset);
      if (!firstResponse) firstResponse = response;
      if (!template) template = payload;

      const rows = rowsFrom(payload);
      rows.forEach(event => merged.set(eventKey(event), event));

      const count = Number(payload?.data?.count ?? payload?.count);
      if (Number.isFinite(count)) total = count;
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      if (total !== null && offset >= total) break;
    }

    const selected = [...merged.values()].filter(event => {
      const value = kickoff(event);
      return value && ictDateKey(value) === selectedDate;
    });

    const data = template?.data && typeof template.data === 'object' ? template.data : {};
    const out = {
      ...(template || {}),
      data: {
        ...data,
        count: selected.length,
        next: null,
        previous: null,
        results: selected,
        events: selected,
      },
      ictSlateDate: selectedDate,
      ictWindow: {
        utcFrom: shiftDate(selectedDate, -1),
        utcTo: selectedDate,
      },
    };

    const headers = new Headers(firstResponse?.headers || {});
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify(out), {
      status: firstResponse?.status || 200,
      statusText: firstResponse?.statusText || 'OK',
      headers,
    });
  }

  window.fetch = async function ictSlateFetch(input, init) {
    const text = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    let url;
    try { url = new URL(text, location.href); } catch { return nativeFetch(input, init); }

    if (url.origin !== API_ORIGIN || url.pathname !== '/api/bsd/events') {
      return nativeFetch(input, init);
    }

    const from = url.searchParams.get('date_from');
    const to = url.searchParams.get('date_to');
    if (!from || from !== to) return nativeFetch(input, init);

    try {
      return await fetchIctSlate(url, from);
    } catch {
      // Never block Matchday if the widened fetch has an upstream problem.
      return nativeFetch(input, init);
    }
  };
})();
