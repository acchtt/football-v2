// SlipTrace v6 polling cadence.
// desk-v4 owns the refresh functions inside its IIFE, so remap only its two known polling intervals
// before it initializes. All other intervals keep their original cadence.
(() => {
  'use strict';
  const nativeSetInterval = window.setInterval.bind(window);
  const LIVE_MS = 3000;
  const DASHBOARD_MS = 8000;

  window.SLIPTRACE_POLLING = Object.freeze({ liveMs: LIVE_MS, dashboardMs: DASHBOARD_MS });

  window.setInterval = function sliptraceSetInterval(handler, delay, ...args) {
    let nextDelay = delay;
    if (delay === 15000) nextDelay = LIVE_MS;
    else if (delay === 30000) nextDelay = DASHBOARD_MS;
    return nativeSetInterval(handler, nextDelay, ...args);
  };
})();
