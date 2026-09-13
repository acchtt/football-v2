// SlipTrace Matchday Desk — editorial sports operations layout.
(() => {
  const FINISHED = new Set(["finished", "ft", "full time", "full_time", "fulltime", "ended", "complete", "completed"]);
  const LIVE = new Set(["live", "inplay", "in play", "1h", "2h", "ht", "halftime", "half time"]);
  const STORE = {
    scheduleBucket: "sliptrace.schedule.bucket",
    picksBucket: "sliptrace.picks.bucket",
    scheduleFilters: "sliptrace.matchday.schedule.filters",
    picksFilters: "sliptrace.matchday.picks.filters",
  };

  const read = (key, fallback) => {
    try { return JSON.parse(sessionStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  };
  const write = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const readText = (key, fallback) => { try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; } };
  const writeText = (key, value) => { try { sessionStorage.setItem(key, value); } catch {} };
  const ts = (row) => Date.parse(row?.displayKickoff || row?.kickoff || 0) || 0;

  function liveEvent(row) {
    try { return typeof findLive === "function" ? findLive(row?.match || "") : null; }
    catch { return null; }
  }

  function stateOf(row) {
    if (row?.manualScore) return "ended";
    const event = liveEvent(row);
    const status = String(event?.status || row?.bsd?.status || "").toLowerCase();
    if (FINISHED.has(status)) return "ended";
    if (LIVE.has(status)) return "live";
    if (event && (event.currentMinute !== undefined || event.minute !== undefined) && event.homeScore !== undefined) return "live";
    return "upcoming";
  }

  function scoreFor(row) {
    try {
      const score = resolvedScore(row);
      if (!score) return { value: "—", meta: stateOf(row) === "ended" ? "FT" : "" };
      const state = stateOf(row);
      return {
        value: `${score.home}–${score.away}`,
        meta: state === "ended" ? "FT" : state === "live" ? (score.label || "LIVE") : "",
      };
    } catch {
      return { value: "—", meta: "" };
    }
  }

  function matchTeams(match) {
    const teams = splitMatch(match || "");
    return { home: teams.home || match || "Unknown", away: teams.away || "" };
  }

  function gradeTone(grade) {
    const g = String(grade || "");
    return g.startsWith("A") ? "grade-a" : g.startsWith("B") ? "grade-b" : "";
  }

  function detail(row, type) {
    const items = [];
    if (type === "schedule") {
      if (row.structure) items.push(["Structure", row.structure]);
      items.push(["XI", row.xiStatus || "—"]);
      items.push(["Market", row.marketStatus || "—"]);
      if (row.coverageStatus) items.push(["Coverage", row.coverageStatus]);
    } else {
      items.push(["Stake", `${row.stake ?? "—"}u`]);
      items.push(["Recorded", fmtDateTime(row.recordedAt || row.kickoff)]);
      if (row.modelVersion) items.push(["Model", row.modelVersion]);
      if (row.source) items.push(["Source", row.source]);
    }

    const note = type === "schedule"
      ? [row.frozenPreSummary && `<div class="deskNote"><span>PRE</span><p>${esc(row.frozenPreSummary)}</p></div>`, row.coverageNotes && `<div class="deskNote"><span>Notes</span><p>${esc(row.coverageNotes)}</p></div>`].filter(Boolean).join("")
      : row.reason ? `<div class="deskNote"><span>Decision</span><p>${esc(row.reason)}</p></div>` : "";

    return `<div class="deskDetail"><dl>${items.map(([k,v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${note}${typeof manualEditor === "function" ? manualEditor(row) : ""}</div>`;
  }

  function scheduleRow(row) {
    const teams = matchTeams(row.match);
    const state = stateOf(row);
    const score = scoreFor(row);
    return `<details class="deskRow deskFixture ${row.tier === "FOCUS" ? "is-focus" : ""} ${state === "live" ? "is-live" : ""}">
      <summary>
        <div class="deskTime"><strong>${esc(fmtTime(row.displayKickoff || row.kickoff))}</strong><span>ICT</span></div>
        <div class="deskMatch">
          <div class="deskTeam">${esc(teams.home)}</div>
          <div class="deskTeam">${esc(teams.away)}</div>
          <div class="deskCompetition">${esc(row.competition || "")}${state === "live" ? ` <b>LIVE</b>` : ""}</div>
        </div>
        <div class="deskSignals"><span class="${gradeTone(row.grade)}">${esc(row.grade || "—")}</span><span class="tier-${String(row.tier || "").toLowerCase()}">${esc(row.tier === "WATCHLIST" ? "WATCH" : row.tier || "—")}</span></div>
        <div class="deskScore"><strong>${esc(score.value)}</strong><span>${esc(score.meta)}</span></div>
        <span class="deskChevron">⌄</span>
      </summary>
      ${detail(row, "schedule")}
    </details>`;
  }

  function resultClass(result) {
    const r = String(result || "PENDING").toUpperCase();
    if (["WIN", "HALF WIN"].includes(r)) return "win";
    if (["LOSS", "HALF LOSS"].includes(r)) return "loss";
    if (["PUSH", "VOID"].includes(r)) return "push";
    return "pending";
  }

  function pickRow(row) {
    const teams = matchTeams(row.match);
    const result = String(row.result || "PENDING").toUpperCase();
    const score = scoreFor(row);
    const tone = resultClass(result);
    return `<details class="deskRow deskPick result-${tone}">
      <summary>
        <div class="deskPickDate"><strong>${esc(fmtTime(row.displayKickoff || row.kickoff))}</strong><span>${esc(dateKey(row.kickoff))}</span></div>
        <div class="deskMatch">
          <div class="deskTeam">${esc(teams.home)}</div>
          <div class="deskTeam">${esc(teams.away)}</div>
          <div class="deskCompetition">${esc(row.competition || "")}</div>
        </div>
        <div class="deskBet"><span>Over ${esc(row.line ?? "—")}</span><strong>@ ${esc(row.odds ?? "—")}</strong></div>
        <div class="deskScore"><strong>${esc(score.value)}</strong><span>${esc(score.meta)}</span></div>
        <div class="deskResult ${tone}"><strong>${esc(result)}</strong><span>${units(row.pl)}</span></div>
        <span class="deskChevron">⌄</span>
      </summary>
      ${detail(row, "picks")}
    </details>`;
  }

  function unique(rows, field) {
    return [...new Set(rows.map((r) => r?.[field]).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b)));
  }

  function scheduleTools(rows, state) {
    return `<form class="deskTools" id="deskScheduleTools">
      <input aria-label="Search matches" name="q" type="search" placeholder="Search team or competition…" value="${esc(state.q || "")}">
      <select aria-label="Tier" name="tier"><option value="ALL">Tier: All</option><option value="FOCUS" ${state.tier === "FOCUS" ? "selected" : ""}>Focus</option><option value="WATCHLIST" ${state.tier === "WATCHLIST" ? "selected" : ""}>Watchlist</option></select>
      <select aria-label="Grade" name="grade"><option value="ALL">Grade: All</option>${unique(rows,"grade").map((v)=>`<option value="${esc(v)}" ${state.grade===v?"selected":""}>${esc(v)}</option>`).join("")}</select>
      <select aria-label="Competition" name="competition"><option value="ALL">Competition: All</option>${unique(rows,"competition").map((v)=>`<option value="${esc(v)}" ${state.competition===v?"selected":""}>${esc(v)}</option>`).join("")}</select>
      <button type="button" class="deskReset">Reset</button>
    </form>`;
  }

  function pickTools(rows, state) {
    return `<form class="deskTools" id="deskPickTools">
      <input aria-label="Search picks" name="q" type="search" placeholder="Search match or competition…" value="${esc(state.q || "")}">
      <input aria-label="Match date" name="date" type="date" value="${esc(state.date || "")}">
      <select aria-label="Model" name="model"><option value="ALL">Model: All</option>${unique(rows,"modelVersion").reverse().map((v)=>`<option value="${esc(v)}" ${state.model===v?"selected":""}>${esc(v)}</option>`).join("")}</select>
      <select aria-label="Competition" name="competition"><option value="ALL">Competition: All</option>${unique(rows,"competition").map((v)=>`<option value="${esc(v)}" ${state.competition===v?"selected":""}>${esc(v)}</option>`).join("")}</select>
      <button type="button" class="deskReset">Reset</button>
    </form>`;
  }

  function applySchedule(rows, state) {
    const q = norm(state.q || "");
    return rows.filter((row) => {
      if (state.tier !== "ALL" && row.tier !== state.tier) return false;
      if (state.grade !== "ALL" && row.grade !== state.grade) return false;
      if (state.competition !== "ALL" && row.competition !== state.competition) return false;
      return !q || norm(`${row.match} ${row.competition}`).includes(q);
    });
  }

  function applyPicks(rows, state) {
    const q = norm(state.q || "");
    return rows.filter((row) => {
      if (state.date && dateKey(row.kickoff) !== state.date) return false;
      if (state.model !== "ALL" && row.modelVersion !== state.model) return false;
      if (state.competition !== "ALL" && row.competition !== state.competition) return false;
      return !q || norm(`${row.match} ${row.competition} ${row.reason || ""}`).includes(q);
    });
  }

  function bindTools(form, state, key, draw) {
    if (!form) return;
    form.addEventListener("input", () => {
      const fd = new FormData(form);
      state.q = String(fd.get("q") || "");
      if ("tier" in state) state.tier = String(fd.get("tier") || "ALL");
      if ("grade" in state) state.grade = String(fd.get("grade") || "ALL");
      if ("date" in state) state.date = String(fd.get("date") || "");
      if ("model" in state) state.model = String(fd.get("model") || "ALL");
      state.competition = String(fd.get("competition") || "ALL");
      write(key, state);
      draw();
    });
    form.querySelector(".deskReset")?.addEventListener("click", () => {
      Object.assign(state, "tier" in state ? { q:"",tier:"ALL",grade:"ALL",competition:"ALL" } : { q:"",date:"",model:"ALL",competition:"ALL" });
      write(key, state);
      if (currentTab() === "schedule") renderSchedule(data.schedule); else renderPicks(data.picks);
    });
  }

  function section(title, rows, cls = "") {
    if (!rows.length) return "";
    return `<section class="deskSection ${cls}"><div class="deskSectionHead"><span>${esc(title)}</span><b>${rows.length}</b></div><div class="deskRows">${rows.map(scheduleRow).join("")}</div></section>`;
  }

  function scheduleRail(todayRows) {
    const live = todayRows.filter((r) => stateOf(r) === "live");
    const next = todayRows.filter((r) => stateOf(r) === "upcoming").sort((a,b)=>ts(a)-ts(b)).slice(0,4);
    const pending = (data.picks || []).filter((r) => String(r.result || "PENDING").toUpperCase() === "PENDING").slice(0,4);
    const miniMatch = (r) => { const t = matchTeams(r.match); return `<li><time>${esc(fmtTime(r.kickoff))}</time><span>${esc(t.home)}<br>${esc(t.away)}</span></li>`; };
    return `<aside class="deskRail">
      <div class="railBlock"><h3>Live</h3>${live.length ? `<ul>${live.slice(0,4).map(miniMatch).join("")}</ul>` : `<p>None right now</p>`}</div>
      <div class="railBlock"><h3>Next</h3>${next.length ? `<ul>${next.map(miniMatch).join("")}</ul>` : `<p>No more fixtures</p>`}</div>
      <div class="railBlock"><h3>Active bets</h3><strong class="railNumber">${pending.length}</strong>${pending.length ? `<p>${esc(matchTeams(pending[0].match).home)}${pending.length > 1 ? ` +${pending.length-1} more` : ""}</p>` : `<p>No pending exposure</p>`}</div>
    </aside>`;
  }

  renderSchedule = function renderMatchdaySchedule(rows = data.schedule) {
    const today = dateKey(new Date());
    const todayRows = (Array.isArray(rows) ? rows : data.schedule || []).filter((r) => r.slateDate === today).sort((a,b)=>ts(a)-ts(b));
    const state = read(STORE.scheduleFilters, { q:"",tier:"ALL",grade:"ALL",competition:"ALL" });
    let bucket = readText(STORE.scheduleBucket, "upcoming");
    if (!["upcoming","ended"].includes(bucket)) bucket = "upcoming";
    const focus = todayRows.filter((r)=>r.tier === "FOCUS").length;
    const watch = todayRows.filter((r)=>r.tier === "WATCHLIST").length;
    const liveCountNow = todayRows.filter((r)=>stateOf(r)==="live").length;
    const upcomingCount = todayRows.filter((r)=>stateOf(r)!=="ended").length;
    const endedCount = todayRows.filter((r)=>stateOf(r)==="ended").length;

    app.innerHTML = `<div class="deskShell"><main class="deskMain">
      <header class="deskPageHead"><div><h1>Schedule</h1><p>${esc(fmtDate(today))} · ICT</p></div><div class="deskCounts"><span><b>${focus}</b> Focus</span><span><b>${watch}</b> Watchlist</span><span class="liveCount"><b>${liveCountNow}</b> Live</span></div></header>
      <div class="deskTabs" role="tablist"><button class="${bucket==="upcoming"?"active":""}" data-desk-bucket="upcoming">Upcoming / Live <span>${upcomingCount}</span></button><button class="${bucket==="ended"?"active":""}" data-desk-bucket="ended">Ended <span>${endedCount}</span></button></div>
      ${scheduleTools(todayRows,state)}
      <div id="deskScheduleList"></div>
    </main>${scheduleRail(todayRows)}</div>`;

    const list = document.getElementById("deskScheduleList");
    const draw = () => {
      const filtered = applySchedule(todayRows,state).sort((a,b)=>ts(a)-ts(b));
      const now = Date.now();
      let visible;
      let html = "";
      if (bucket === "upcoming") {
        visible = filtered.filter((r)=>stateOf(r)!=="ended");
        const live = visible.filter((r)=>stateOf(r)==="live");
        const near = visible.filter((r)=>stateOf(r)==="upcoming" && ts(r) <= now + 60*60*1000);
        const later = visible.filter((r)=>stateOf(r)==="upcoming" && ts(r) > now + 60*60*1000);
        html = section("Live now", live, "liveSection") + section("Next 60 minutes", near) + section("Later today", later);
      } else {
        visible = filtered.filter((r)=>stateOf(r)==="ended");
        const recent = visible.filter((r)=>now - ts(r) <= 3*60*60*1000);
        const earlier = visible.filter((r)=>now - ts(r) > 3*60*60*1000);
        html = section("Just finished", recent) + section("Earlier today", earlier);
      }
      list.innerHTML = `<div class="deskResultCount">${visible.length} matches</div>${html || `<div class="deskEmpty">No matches in this view.</div>`}`;
      if (typeof bindScoreForms === "function") bindScoreForms();
    };

    document.querySelectorAll("[data-desk-bucket]").forEach((button)=>button.addEventListener("click",()=>{ writeText(STORE.scheduleBucket,button.dataset.deskBucket); renderSchedule(data.schedule); }));
    bindTools(document.getElementById("deskScheduleTools"),state,STORE.scheduleFilters,draw);
    draw();
  };

  function picksRail(allRows) {
    const pending = allRows.filter((r)=>String(r.result||"PENDING").toUpperCase()==="PENDING");
    const settled = allRows.filter((r)=>String(r.result||"PENDING").toUpperCase()!=="PENDING");
    const pl = settled.reduce((s,r)=>s+(Number(r.pl)||0),0);
    const stake = settled.reduce((s,r)=>s+(Number(r.stake)||0),0);
    const roi = stake ? pl/stake*100 : 0;
    return `<aside class="deskRail"><div class="railBlock"><h3>Active exposure</h3><strong class="railNumber">${pending.length}</strong><p>pending bets</p></div><div class="railBlock"><h3>Performance</h3><strong class="railNumber ${pl<0?"negative":""}">${units(pl)}</strong><p>${roi>=0?"+":""}${roi.toFixed(1)}% ROI</p></div><div class="railBlock"><h3>Settled</h3><strong class="railNumber">${settled.length}</strong><p>${allRows.length} total picks</p></div></aside>`;
  }

  renderPicks = function renderMatchdayPicks(rows = data.picks) {
    const allRows = (Array.isArray(rows) ? rows : data.picks || []).slice().sort((a,b)=>(Date.parse(b.recordedAt||b.kickoff)||0)-(Date.parse(a.recordedAt||a.kickoff)||0));
    const state = read(STORE.picksFilters,{q:"",date:"",model:"ALL",competition:"ALL"});
    const pending = allRows.filter((r)=>String(r.result||"PENDING").toUpperCase()==="PENDING");
    const settled = allRows.filter((r)=>String(r.result||"PENDING").toUpperCase()!=="PENDING");
    let bucket = readText(STORE.picksBucket,pending.length?"active":"settled");
    if (!["active","settled","all"].includes(bucket)) bucket = "active";

    app.innerHTML = `<div class="deskShell"><main class="deskMain"><header class="deskPageHead"><div><h1>Picks</h1><p>Official exposure and settled results</p></div></header>
      <div class="deskTabs" role="tablist"><button class="${bucket==="active"?"active":""}" data-pick-bucket="active">Active <span>${pending.length}</span></button><button class="${bucket==="settled"?"active":""}" data-pick-bucket="settled">Settled <span>${settled.length}</span></button><button class="${bucket==="all"?"active":""}" data-pick-bucket="all">All <span>${allRows.length}</span></button></div>
      ${pickTools(allRows,state)}<div id="deskPickList"></div></main>${picksRail(allRows)}</div>`;

    const list = document.getElementById("deskPickList");
    const draw = () => {
      const filtered = applyPicks(allRows,state);
      let visible = filtered;
      if (bucket==="active") visible = filtered.filter((r)=>String(r.result||"PENDING").toUpperCase()==="PENDING");
      if (bucket==="settled") visible = filtered.filter((r)=>String(r.result||"PENDING").toUpperCase()!=="PENDING");
      list.innerHTML = `<div class="deskResultCount">${visible.length} picks</div>${visible.length ? `<div class="deskRows">${visible.map(pickRow).join("")}</div>` : `<div class="deskEmpty">No picks in this view.</div>`}`;
      if (typeof bindScoreForms === "function") bindScoreForms();
    };

    document.querySelectorAll("[data-pick-bucket]").forEach((button)=>button.addEventListener("click",()=>{ writeText(STORE.picksBucket,button.dataset.pickBucket); renderPicks(data.picks); }));
    bindTools(document.getElementById("deskPickTools"),state,STORE.picksFilters,draw);
    draw();
  };
})();
