// Keep Picks clean: only use Decision States as a forward-sync bridge, and auto-settle finished Over bets.
(() => {
  const finishedStatuses = new Set(["finished", "ft", "full time", "full_time", "fulltime", "ended", "complete", "completed"]);

  function ts(value) {
    const n = value ? Date.parse(value) : NaN;
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeResult(value) {
    const result = String(value || "PENDING").trim().toUpperCase();
    if (["WIN", "HALF WIN", "PUSH", "HALF LOSS", "LOSS", "VOID", "PENDING"].includes(result)) return result;
    return result || "PENDING";
  }

  function finalScore(row) {
    if (row?.manualScore && Number.isFinite(Number(row.manualScore.home)) && Number.isFinite(Number(row.manualScore.away))) {
      return { home: Number(row.manualScore.home), away: Number(row.manualScore.away), source: "MANUAL" };
    }

    const event = typeof findLive === "function" ? findLive(row?.match || "") : null;
    const eventStatus = String(event?.status || "").toLowerCase();
    if (event && finishedStatuses.has(eventStatus) && event.homeScore !== undefined && event.awayScore !== undefined) {
      return { home: Number(event.homeScore), away: Number(event.awayScore), source: "BSD" };
    }

    const bsdStatus = String(row?.bsd?.status || "").toLowerCase();
    if (row?.bsd && finishedStatuses.has(bsdStatus) && row.bsd.home !== undefined && row.bsd.away !== undefined) {
      return { home: Number(row.bsd.home), away: Number(row.bsd.away), source: "BSD" };
    }

    return null;
  }

  function settleLeg(total, line) {
    if (total > line) return "WIN";
    if (total < line) return "LOSS";
    return "PUSH";
  }

  function settleOver(row, score) {
    const line = Number(row?.line);
    if (!Number.isFinite(line)) return null;

    const total = Number(score.home) + Number(score.away);
    const fraction = ((Math.round(line * 100) % 100) + 100) % 100;
    const legs = (fraction === 25 || fraction === 75) ? [line - 0.25, line + 0.25] : [line];
    const outcomes = legs.map((leg) => settleLeg(total, leg));

    let result;
    if (outcomes.every((x) => x === "WIN")) result = "WIN";
    else if (outcomes.every((x) => x === "LOSS")) result = "LOSS";
    else if (outcomes.every((x) => x === "PUSH")) result = "PUSH";
    else if (outcomes.includes("WIN") && outcomes.includes("PUSH")) result = "HALF WIN";
    else if (outcomes.includes("LOSS") && outcomes.includes("PUSH")) result = "HALF LOSS";
    else return null;

    const stake = Number.isFinite(Number(row?.stake)) ? Number(row.stake) : 1;
    const odds = Number(row?.odds);
    let pl;
    if (Number.isFinite(odds)) {
      const legStake = stake / legs.length;
      pl = outcomes.reduce((sum, outcome) => {
        if (outcome === "WIN") return sum + legStake * (odds - 1);
        if (outcome === "LOSS") return sum - legStake;
        return sum;
      }, 0);
      pl = Math.round(pl * 1000) / 1000;
    }

    return { result, pl, autoSettled: true, finalScore: score };
  }

  function cleanAndSettlePicks(rows) {
    const sourceRows = Array.isArray(rows) ? rows : [];
    const latestWebsitePick = sourceRows
      .filter((row) => row?.source === "Website Picks")
      .reduce((latest, row) => Math.max(latest, ts(row.recordedAt || row.kickoff)), 0);

    const bridgeFloor = latestWebsitePick || (Date.now() - 48 * 60 * 60 * 1000);

    return sourceRows
      .filter((row) => row?.source !== "Decision States" || ts(row.recordedAt || row.kickoff) > bridgeFloor)
      .map((row) => {
        const normalized = normalizeResult(row?.result);
        if (normalized !== "PENDING") return { ...row, result: normalized };

        const score = finalScore(row);
        if (!score) return { ...row, result: "PENDING" };

        const settlement = settleOver(row, score);
        return settlement ? { ...row, ...settlement } : { ...row, result: "PENDING" };
      })
      .sort((a, b) => ts(b.recordedAt || b.kickoff) - ts(a.recordedAt || a.kickoff));
  }

  // Finished events returned by the BSD polling feed should render as FT, not LIVE.
  if (typeof resolvedScore === "function") {
    const baseResolvedScore = resolvedScore;
    resolvedScore = function resolvedScoreWithFinishedStatus(row) {
      if (row?.manualScore) {
        return { home: row.manualScore.home, away: row.manualScore.away, label: "MANUAL", cls: "manual" };
      }

      const event = typeof findLive === "function" ? findLive(row?.match || "") : null;
      if (event && event.homeScore !== undefined && event.awayScore !== undefined) {
        const status = String(event.status || "").toLowerCase();
        if (finishedStatuses.has(status)) {
          return { home: event.homeScore, away: event.awayScore, label: "FT", cls: "final" };
        }
      }

      return baseResolvedScore(row);
    };
  }

  if (typeof renderPicks === "function") {
    const baseRenderPicks = renderPicks;
    renderPicks = function renderCleanPicks(rows) {
      data.picks = cleanAndSettlePicks(data?.picks || []);
      const wanted = Array.isArray(rows) && rows !== data.picks
        ? cleanAndSettlePicks(rows)
        : data.picks;
      return baseRenderPicks(wanted);
    };
  }

  function refreshSettlements() {
    if (!data?.picks?.length) return;
    const before = data.picks.map((row) => `${row.id}|${row.result}|${row.pl ?? ""}`).join("\n");
    data.picks = cleanAndSettlePicks(data.picks);
    const after = data.picks.map((row) => `${row.id}|${row.result}|${row.pl ?? ""}`).join("\n");
    if (before !== after && typeof currentTab === "function" && currentTab() === "picks" && typeof renderPicks === "function") {
      renderPicks(data.picks);
    }
  }

  setInterval(refreshSettlements, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSettlements();
  });
  setTimeout(refreshSettlements, 1000);
})();
