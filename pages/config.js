// SlipTrace production backend. Cloudflare Worker is the only API origin.
(() => {
  const targetOrigin = "https://football-v2.acchtt.workers.dev";
  const legacyOrigin = "https://football-v2-nwyg.vercel.app";
  const nativeFetch = window.fetch.bind(window);

  window.SLIPTRACE_API = targetOrigin;

  // Keep the static app compatible with legacy hard-coded API URLs while routing
  // every request to the Cloudflare Worker.
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith(legacyOrigin)) {
      input = targetOrigin + input.slice(legacyOrigin.length);
    }
    return nativeFetch(input, init);
  };
})();
