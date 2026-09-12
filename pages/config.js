// SlipTrace API endpoint. Cloudflare Workers is the production backend.
window.SLIPTRACE_API = "https://football-v2.acchtt.workers.dev";

// Keep the existing static app unchanged while routing its legacy API calls to Cloudflare.
(() => {
  const legacyOrigin = "https://football-v2-nwyg.vercel.app";
  const targetOrigin = String(window.SLIPTRACE_API || legacyOrigin).replace(/\/$/, "");
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith(legacyOrigin)) {
      input = targetOrigin + input.slice(legacyOrigin.length);
    }
    return nativeFetch(input, init);
  };
})();
