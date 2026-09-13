// Keep Airtable-backed picks fresh without requiring a hard reload.
(() => {
  const intervalMs = 30000;
  let syncing = false;

  function signature(rows) {
    return (rows || []).slice(0, 25).map((row) => [
      row.pickId || row.id || "",
      row.recordedAt || row.kickoff || "",
      row.result || "",
      row.pl ?? "",
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

      const before = signature(data?.picks);
      const after = signature(incoming.picks);
      data = incoming;

      if (before !== after && currentTab() === "picks") renderPicks();
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
