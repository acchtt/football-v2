// SlipTrace polling cadence + shared response bus.
// Fast enough to feel live, slow enough to avoid upstream rate-limit cascades.
// desk-v4 owns refresh functions inside its IIFE, so remap only its two known polling intervals
// before it initializes. Match Desk consumes the same responses without creating duplicate polls.
(() => {
  'use strict';

  const nativeSetInterval = window.setInterval.bind(window);
  const nativeFetch = window.fetch.bind(window);
  const LIVE_MS = 5000;
  const DASHBOARD_MS = 12000;

  const bus = window.SLIPTRACE_DATA_BUS = window.SLIPTRACE_DATA_BUS || {
    dashboard: null,
    live: null,
    dashboardAt: 0,
    liveAt: 0,
  };

  window.SLIPTRACE_POLLING = Object.freeze({ liveMs: LIVE_MS, dashboardMs: DASHBOARD_MS });

  window.setInterval = function sliptraceSetInterval(handler, delay, ...args) {
    let nextDelay = delay;
    if (delay === 15000) nextDelay = LIVE_MS;
    else if (delay === 30000) nextDelay = DASHBOARD_MS;
    return nativeSetInterval(handler, nextDelay, ...args);
  };

  window.fetch = async function sliptraceFetch(input, init) {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';

    if (response.ok && (url.includes('/api/dashboard-data') || url.includes('/api/live-scores'))) {
      response.clone().json().then((payload) => {
        if (!payload?.ok) return;
        if (url.includes('/api/dashboard-data')) {
          bus.dashboard = payload;
          bus.dashboardAt = Date.now();
          window.dispatchEvent(new CustomEvent('sliptrace:dashboard', { detail: payload }));
        } else {
          bus.live = payload;
          bus.liveAt = Date.now();
          window.dispatchEvent(new CustomEvent('sliptrace:live', { detail: payload }));
        }
      }).catch(() => {});
    }

    return response;
  };
})();
