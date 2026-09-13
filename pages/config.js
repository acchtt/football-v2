// SlipTrace production backend. Cloudflare Worker is the only private API origin.
(() => {
  const targetOrigin = "https://football-v2.acchtt.workers.dev";
  const legacyOrigin = "https://football-v2-nwyg.vercel.app";
  const soccerwayOrigin = "https://soccerway-livescore.acchtt.workers.dev";
  const nativeFetch = window.fetch.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  let remappedLiveInterval = false;

  window.SLIPTRACE_API = targetOrigin;
  window.SLIPTRACE_LIVE_ORIGIN = soccerwayOrigin;
  window.SLIPTRACE_LIVE_SOURCE = "Soccerway";

  function normalizeSoccerwayFixture(fixture) {
    const minute = fixture?.minute ?? undefined;
    return {
      id: fixture?.matchId || "",
      eventId: fixture?.matchId || "",
      home: fixture?.homeTeam || "",
      away: fixture?.awayTeam || "",
      homeScore: fixture?.homeScore,
      awayScore: fixture?.awayScore,
      status: fixture?.status || "",
      minute,
      currentMinute: minute,
      period: fixture?.statusText || "",
      kickoff: fixture?.kickoffUtcSource || null,
      source: "Soccerway",
    };
  }

  async function fetchSoccerwayLive(init) {
    const response = await nativeFetch(`${soccerwayOrigin}/api/live?day=0&t=${Date.now()}`, {
      ...(init || {}),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Soccerway HTTP ${response.status}`);
    }
    const events = (Array.isArray(payload.fixtures) ? payload.fixtures : []).map(normalizeSoccerwayFixture);
    return new Response(JSON.stringify({
      ok: true,
      source: "Soccerway",
      count: events.length,
      events,
      generatedAt: payload.generatedAt || new Date().toISOString(),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // Keep the static app compatible with legacy hard-coded API URLs, while using
  // the dedicated Soccerway service for the live-score overlay on FOCUS/WATCHLIST.
  window.fetch = async (input, init) => {
    let nextInput = input;
    let urlText = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);

    if (urlText.startsWith(legacyOrigin)) {
      urlText = targetOrigin + urlText.slice(legacyOrigin.length);
      nextInput = typeof input === "string" ? urlText : new Request(urlText, input);
    }

    try {
      const parsed = new URL(urlText, location.href);
      if (parsed.pathname === "/api/live-scores" && [targetOrigin, legacyOrigin].includes(parsed.origin)) {
        try {
          return await fetchSoccerwayLive(init);
        } catch (error) {
          console.warn("Soccerway live overlay failed; falling back to legacy live source", error);
        }
      }
    } catch {}

    return nativeFetch(nextInput, init);
  };

  // desk-v4's live loop was 15s. Remap that one timer to 1s while leaving its
  // dashboard/Airtable refresh and all unrelated timers unchanged.
  window.setInterval = (callback, delay, ...args) => {
    if (!remappedLiveInterval && Number(delay) === 15000) {
      remappedLiveInterval = true;
      return nativeSetInterval(callback, 1000, ...args);
    }
    return nativeSetInterval(callback, delay, ...args);
  };
})();
