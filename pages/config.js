// SlipTrace production configuration + thin BSD compatibility/runtime guard.
// Private credentials remain in the Cloudflare Worker.
(() => {
  'use strict';

  const API = 'https://football-v2.acchtt.workers.dev';
  const TZ = 'Asia/Ho_Chi_Minh';
  const DASHBOARD_CACHE_KEY = 'sliptrace.dashboard.compat.v1';
  const nativeFetch = window.fetch.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  let replacedAppLiveTimer = false;

  window.SLIPTRACE_API = API;
  window.SLIPTRACE_TIME_ZONE = TZ;

  function normalizeEvent(event) {
    if (!event || typeof event !== 'object') return event;
    const status = String(event.status || '').toLowerCase();
    if (!['inprogress', 'in_progress'].includes(status)) return event;

    const minute = Number.isFinite(Number(event.current_minute)) ? Number(event.current_minute) : undefined;
    const second = Number.isFinite(Number(event.current_second)) ? Number(event.current_second) : 0;
    const period = event.period || '';
    return {
      ...event,
      status: 'live',
      minute,
      second,
      time: {
        ...(event.time && typeof event.time === 'object' ? event.time : {}),
        status: 'live',
        minute,
        second,
        period,
        display: minute !== undefined ? `${minute}′` : 'LIVE',
      },
    };
  }

  function normalizeBsdPayload(payload, pathname) {
    if (!payload || typeof payload !== 'object' || payload.ok === false) return payload;
    const data = payload.data && typeof payload.data === 'object' ? payload.data : null;
    if (!data) return payload;

    if (pathname === '/api/bsd/live') {
      const rows = Array.isArray(data.events) ? data.events.map(normalizeEvent) : [];
      return { ...payload, data: { ...data, events: rows, results: rows } };
    }

    if (pathname === '/api/bsd/events') {
      const rows = Array.isArray(data.results) ? data.results.map(normalizeEvent) : [];
      return { ...payload, data: { ...data, results: rows } };
    }

    return payload;
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

  async function timedFetch(input, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await nativeFetch(input, { ...(init || {}), signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function cachedDashboardResponse() {
    try {
      const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || 'null');
      if (cached && Array.isArray(cached.schedule) && Array.isArray(cached.picks)) {
        return new Response(JSON.stringify({ ...cached, ok: true, cached: true, degraded: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
    } catch {}
    return new Response(JSON.stringify({ ok: true, schedule: [], picks: [], cached: true, degraded: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
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
            if (payload?.ok && Array.isArray(payload.schedule) && Array.isArray(payload.picks)) {
              try { localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload)); } catch {}
            }
          }).catch(() => {});
          return response;
        }
        return cachedDashboardResponse();
      } catch {
        return cachedDashboardResponse();
      }
    }

    if (url.pathname === '/api/bsd/live' || url.pathname === '/api/bsd/events') {
      const response = await timedFetch(input, init, 8000);
      if (!response.ok) return response;
      try {
        const payload = await response.clone().json();
        return jsonResponse(normalizeBsdPayload(payload, url.pathname), response);
      } catch {
        return response;
      }
    }

    return timedFetch(input, init, 10000);
  };

  function quietLiveRefresh() {
    if (document.visibilityState === 'hidden') return;
    window.fetch(`${API}/api/bsd/live?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(payload => {
        const rows = payload?.data?.results || payload?.data?.events || [];
        if (!Array.isArray(rows)) return;
        const byId = new Map(rows.map(e => [String(e.id), e]));

        document.querySelectorAll('.matchRow[data-live-event]').forEach(node => {
          const event = byId.get(String(node.dataset.liveEvent || ''));
          if (!event) return;
          const home = Number(event.home_score);
          const away = Number(event.away_score);
          const minute = Number(event.current_minute ?? event.minute ?? event.time?.minute);
          const period = String(event.period || event.time?.period || '').replace(/_/g, ' ');

          const score = node.querySelector('.matchScore strong');
          if (score && Number.isFinite(home) && Number.isFinite(away)) score.textContent = `${home}–${away}`;

          const clock = node.querySelector('.matchScore [data-clock]');
          if (clock) clock.textContent = Number.isFinite(minute) ? `${minute}′` : 'LIVE';

          const time = node.querySelector('.matchTime');
          if (time) time.innerHTML = `<span class="tag live"><i class="dot bad"></i>LIVE</span><small>${period}</small>`;
        });

        const system = document.querySelector('.systemState');
        if (system) {
          const spans = system.querySelectorAll('span');
          if (spans[0]) spans[0].innerHTML = '<i class="dot live"></i>BSD LIVE';
          if (spans[1]) spans[1].textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
        }
      })
      .catch(() => {});
  }

  // app-v2 originally ran refreshLive every 10s; refreshLive called loadMatchday(),
  // which replaced the whole page with the loading skeleton and waited on Airtable.
  // Replace only that application timer with a non-destructive DOM live updater.
  window.setInterval = function sliptraceSetInterval(callback, delay, ...args) {
    if (!replacedAppLiveTimer && Number(delay) === 10000 && callback?.name === 'refreshLive') {
      replacedAppLiveTimer = true;
      return nativeSetInterval(quietLiveRefresh, 10000);
    }
    return nativeSetInterval(callback, delay, ...args);
  };
})();
