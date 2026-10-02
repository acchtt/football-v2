// Keep Airtable-backed schedule and picks fresh without requiring a hard reload.
(() => {
  const intervalMs = 30000;
  let syncing = false;

  function pickSignature(rows) {
    return (rows || []).slice(0, 25).map((row) => [
      row.pickId || row.id || "",
      row.recordedAt || row.kickoff || "",
      row.result || "",
      row.pl ?? "",
    ].join("|")).join("\n");
  }

  function scheduleSignature(rows) {
    return (rows || []).slice(0, 100).map((row) => [
      row.id || "",
      row.slateDate || "",
      row.match || "",
      row.displayKickoff || row.kickoff || "",
      row.tier || "",
      row.grade || "",
      row.coverageStatus || "",
      row.manualScore ? `${row.manualScore.home}-${row.manualScore.away}` : "",
      row.bsd ? [row.bsd.status || "", row.bsd.home ?? "", row.bsd.away ?? "", row.bsd.minute ?? ""].join(":") : "",
    ].join("|")).join("\n");
  }

  async function syncDashboard() {
    if (syncing || document.visibilityState !== "visible") return;
    syncing = true;
    try {
      const origin = window.SLIPTRACE_API || "https://football-v2.acchtt.workers.dev";
      const response = await fetch(`${origin}/api/dashboard-data?t=${Date.now()}`, { cache: "no-store" });
      const incoming = await response.json();
      if (!response.ok || !incoming?.ok) throw new Error(incoming?.error || `HTTP ${response.status}`);

      const beforePicks = pickSignature(data?.picks);
      const afterPicks = pickSignature(incoming.picks);
      const beforeSchedule = scheduleSignature(data?.schedule);
      const afterSchedule = scheduleSignature(incoming.schedule);
      data = incoming;

      const tab = currentTab();
      if (beforePicks !== afterPicks && tab === "picks") renderPicks();
      if (beforeSchedule !== afterSchedule && tab === "schedule") renderSchedule();
    } catch (error) {
      console.warn("SlipTrace dashboard sync failed", error);
    } finally {
      syncing = false;
    }
  }

  setInterval(syncDashboard, intervalMs);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncDashboard();
  });
})();
