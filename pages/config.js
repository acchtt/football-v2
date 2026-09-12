// SlipTrace backend resolver. Probe known Cloudflare Worker endpoints and use the one that is actually live.
(() => {
  const candidates = [
    "https://football-v2-2.acchtt.workers.dev",
    "https://football-v2.acchtt.workers.dev"
  ];
  const legacyOrigin = "https://football-v2-nwyg.vercel.app";
  const nativeFetch = window.fetch.bind(window);
  let resolvedOriginPromise;

  async function probe(origin) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await nativeFetch(`${origin}/health?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return null;
      const payload = await response.json().catch(() => null);
      return payload?.service === "sliptrace-football-api" ? origin : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveOrigin() {
    if (!resolvedOriginPromise) {
      resolvedOriginPromise = (async () => {
        for (const origin of candidates) {
          const live = await probe(origin);
          if (live) {
            window.SLIPTRACE_API = live;
            return live;
          }
        }
        throw new Error(`No SlipTrace Cloudflare API endpoint is reachable. Checked: ${candidates.join(", ")}`);
      })();
    }
    return resolvedOriginPromise;
  }

  window.fetch = async (input, init) => {
    if (typeof input === "string" && input.startsWith(legacyOrigin)) {
      const origin = await resolveOrigin();
      input = origin + input.slice(legacyOrigin.length);
    }
    return nativeFetch(input, init);
  };

  window.SLIPTRACE_RESOLVE_API = resolveOrigin;
})();
