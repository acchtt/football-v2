(() => {
  'use strict';

  const STATUS_KEY = 'sliptrace.statusFilter.v3';
  const DEFAULT_MIGRATION_KEY = 'sliptrace.statusDefaultUpcoming.v1';
  const AUTO_FT_MS = 135 * 60 * 1000;
  const originalFetch = window.fetch.bind(window);

  function setUpcomingDefault() {
    try {
      const hasStatus = Boolean(sessionStorage.getItem(STATUS_KEY));
      const migrated = localStorage.getItem(DEFAULT_MIGRATION_KEY) === '1';
      if (!hasStatus || !migrated) {
        sessionStorage.setItem(STATUS_KEY, 'upcoming');
        localStorage.setItem(DEFAULT_MIGRATION_KEY, '1');
      }
    } catch {}
  }

  function shouldAutoFinish(row, now) {
    const declared = String(row?.status || row?.matchStatus || '').toLowerCase();
    if (['postponed','cancelled','canceled','abandoned','suspended'].includes(declared)) return false;
    const kickoff = Date.parse(row?.kickoff || row?.displayKickoff || '');
    return Number.isFinite(kickoff) && now >= kickoff + AUTO_FT_MS;
  }

  function applyAutoFt(payload) {
    if (!payload || !Array.isArray(payload.schedule)) return payload;
    const now = Date.now();
    payload.schedule = payload.schedule.map((row) => {
      if (!row || !shouldAutoFinish(row, now)) return row;
      return Object.assign({}, row, {
        status: 'finished',
        matchStatus: 'finished',
        autoFt: true,
        autoFtAt: new Date((Date.parse(row.kickoff || row.displayKickoff) || now) + AUTO_FT_MS).toISOString()
      });
    });
    return payload;
  }

  function isDashboardRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return false;
      return new URL(raw, location.href).pathname.endsWith('/api/dashboard-data');
    } catch { return false; }
  }

  window.fetch = async function(input, init) {
    const response = await originalFetch(input, init);
    if (!isDashboardRequest(input) || !response.ok) return response;
    try {
      const payload = applyAutoFt(await response.clone().json());
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return response;
    }
  };

  function todayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function selectUpcomingAfterDateChange(button) {
    const nextDate = String(button?.dataset?.date || '');
    if (!nextDate || nextDate < todayKey()) return;
    try { sessionStorage.setItem(STATUS_KEY, 'upcoming'); } catch {}

    const started = Date.now();
    const timer = setInterval(() => {
      const upcoming = document.querySelector('[data-status-filter="upcoming"]');
      if (upcoming) {
        clearInterval(timer);
        if (!upcoming.classList.contains('active')) upcoming.click();
      } else if (Date.now() - started > 2000) {
        clearInterval(timer);
      }
    }, 40);
  }

  document.addEventListener('click', (event) => {
    const dateButton = event.target.closest('.dateBtn[data-date]');
    if (dateButton) setTimeout(() => selectUpcomingAfterDateChange(dateButton), 0);
  });

  setUpcomingDefault();
})();
