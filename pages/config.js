// SlipTrace API endpoint. Change this single value when moving backend hosts.
window.SLIPTRACE_API = "https://football-v2-nwyg.vercel.app";

// Keep the existing static app unchanged while allowing the API host to move.
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
