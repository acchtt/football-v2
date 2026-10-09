/* Only the independently hosted Liquid Glass Worker preview uses same-origin public GET APIs.
   Existing production pages and third-party previews are never redirected by this file. */
(() => {
  "use strict";
  const host = window.location.hostname;
  if (!/^football-v2-liquid-glass-demo\.[a-z0-9-]+\.workers\.dev$/i.test(host)) return;
  const sourceOrigin = "https://football-v2.acchtt.workers.dev";
  const realFetch = window.fetch.bind(window);
  window.__ARCXI_DEMO_READ_ONLY__ = true;
  window.fetch = function demoReadOnlyFetch(input, init) {
    let url;
    try {
      url = new URL(typeof input === "string" ? input : input.url, window.location.href);
    } catch {
      return realFetch(input, init);
    }
    if (url.origin !== sourceOrigin) return realFetch(input, init);
    const target = window.location.origin + url.pathname + url.search;
    if (typeof input === "string" || input instanceof URL) return realFetch(target, init);
    if (input instanceof Request) return realFetch(new Request(target, input), init);
    return realFetch(target, init);
  };
})();
