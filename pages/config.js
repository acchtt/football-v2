// SlipTrace API endpoint. Cloudflare Workers is now the production backend.
window.SLIPTRACE_API = "https://football-v2.acchtt.workers.dev";

// Keep the static app unchanged while allowing the API host to move.
(() => {
  const oldOrigin = "https://football-v2-nwyg.vercel.app";
  const targetOrigin = String(window.SLIPTRACE_API || oldOrigin).replace(/\/$/, "");
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === "string" && input.startsWith(oldOrigin)) {
      input = targetOrigin + input.slice(oldOrigin.length);
    }
    return nativeFetch(input, init);
  };
})();
