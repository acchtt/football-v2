// SlipTrace control-board UX v2: operational hierarchy, persistent tabs/filters, and clearer status.
(() => {
  const STORE = {
    scheduleBucket: "sliptrace.schedule.bucket",
    picksBucket: "sliptrace.picks.bucket",
    scheduleFilters: "sliptrace.schedule.filters",
    picksFilters: "sliptrace.picks.filters",
  };
  const finishedStatuses = new Set(["finished", "ft", "full time", "full_time", "fulltime", "ended", "complete", "completed"]);
  const liveStatuses = new Set(["live", "inplay", "in play", "1h", "2h", "ht", "halftime", "half time"]);
  let lastDashboardSuccess = 0;
  let lastLiveSuccess = 0;
  let lastLiveFailure = 0;

  function readJson(key, fallback) {
    try {
      const value = sessionStorage.getItem(key);
      return value ? { ...fallback, ...JSON.parse(value) } : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function readString(key, fallback) {
    try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; }
  }

  function writeString(key, value) {
    try { sessionStorage.setItem(key, value); } catch {}
  }

  function optionList(rows, field) {
    return [...new Set((rows || []).map((row) => row?.[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }

  function eventFor(row) {
    try { return typeof findLive === "function" ? findLive(row?.match || "") : null; }
    catch { return null; }
  }

  function eventStatus(row) {
    const live = eventFor(row);
    return String(live?.status || row?.bsd?.status || "").trim().toLowerCase();
  }

  function isEnded(row) {
    if (row?.manualScore) return true;
    return finishedStatuses.has(eventStatus(row));
  }

  function isLive(row) {
    if (isEnded(row)) return false;
    const live = eventFor(row);
    const status = eventStatus(row);
    if (liveStatuses.has(status)) return true;
    if (live && (live.currentMinute !== undefined || live.minute !== undefined) && live.homeScore !== undefined) return true;
    return String(row?.bsd?.status || "").toLowerCase() === "live";
  }

  function kickoffMs(row) {
    const value = row?.displayKickoff || row?.kickoff;
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function scoreMarkup(row) {
    let score = null;
    try { score = typeof resolvedScore === "function" ? resolvedScore(row) : null; } catch {}
    const cls = score?.cls || "pending";
    const label = score?.label || (isLive(row) ? "LIVE" : isEnded(row) ? "FT" : "SCORE");
    const value = score ? `${score.home}–${score.away}` : "—";
    return `<div class="v2Score ${esc(cls)}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function detailMarkup(row, type) {
    const items = [];
    if (type === "schedule") {
      if (row.structure) items.push(["STRUCTURE", row.structure]);
      items.push(["XI", row.xiStatus || "—"]);
      items.push(["MARKET", row.marketStatus || "—"]);
      if (row.coverageStatus) items.push(["COVERAGE", row.coverageStatus]);
    } else {
      items.push(["STAKE", `${row.stake ?? "—"}u`]);
      items.push(["RECORDED", fmtDateTime(row.recordedAt || row.kickoff)]);
      if (row.source) items.push(["SOURCE", row.source]);
    }
    if (row.bsd?.eventId) items.push(["BSD EVENT", `#${row.bsd.eventId}`]);

    const notes = type === "schedule"
      ? `${row.frozenPreSummary ? `<div class="detailNote"><div class="label">FROZEN PRE</div><p>${esc(row.frozenPreSummary)}</p></div>` : ""}${row.coverageNotes ? `<div class="detailNote"><div class="label">COVERAGE NOTES</div><p>${esc(row.coverageNotes)}</p></div>` : ""}`
      : `${row.reason ? `<div class="detailNote"><div class="label">DECISION REASON</div><p>${esc(row.reason)}</p></div>` : ""}`;

    return `<div class="detail v2Detail"><div class="detailStrip">${items.map(([label, value]) => `<span><small>${esc(label)}</small><strong>${esc(value)}</strong></span>`).join("")}</div>${typeof manualEditor === "function" ? manualEditor(row) : ""}${notes}</div>`;
  }

  function scheduleCardV2(row) {
    const teams = splitMatch(row.match || "");
    const live = isLive(row);
    const ended = isEnded(row);
    const stateClass = live ? "is-live" : ended ? "is-ended" : "is-upcoming";
    const stateLabel = live ? "LIVE" : ended ? "ENDED" : "UPCOMING";
    return `<details class="card v2MatchCard ${stateClass}">
      <summary class="v2MatchSummary">
        <div class="v2Kickoff"><strong>${esc(fmtTime(row.displayKickoff || row.kickoff))}</strong><span>ICT</span></div>
        <div class="v2Teams">
          <div class="v2TeamLine"><strong>${esc(teams.home || row.match)}</strong></div>
          <div class="v2TeamLine"><strong>${esc(teams.away || "")}</strong></div>
          <div class="v2Meta">${esc(row.competition || "")}${live ? ` · <span class="liveText">${stateLabel}</span>` : ""}</div>
        </div>
        ${scoreMarkup(row)}
        <div class="v2Signals">
          ${row.grade ? `<span class="badge ${String(row.grade).startsWith("A") ? "lime" : "amber"}">${esc(row.grade)}</span>` : ""}
          ${row.tier ? `<span class="badge ${row.tier === "FOCUS" ? "red" : "cyan"}">${esc(row.tier)}</span>` : ""}
        </div>
        <span class="matchChevron" aria-hidden="true">⌄</span>
      </summary>
      ${detailMarkup(row, "schedule")}
    </details>`;
  }

  function resultToneV2(result) {
    const r = String(result || "PENDING").toUpperCase();
    if (r === "WIN" || r === "HALF WIN") return "win";
    if (r === "LOSS" || r === "HALF LOSS") return "loss";
    if (r === "PUSH" || r === "VOID") return "push";
    return "pending";
  }

  function pickCardV2(row) {
    const teams = splitMatch(row.match || "");
    const result = String(row.result || "PENDING").toUpperCase();
    const tone = resultToneV2(result);
    return `<details class="card v2PickCard outcome-${tone}">
      <summary class="v2PickSummary">
        <div class="v2PickMain">
          <div class="v2Meta">${esc(fmtDateTime(row.displayKickoff || row.kickoff))} · ${esc(row.competition || "")}</div>
          <div class="v2Teams compact">
            <div class="v2TeamLine"><strong>${esc(teams.home || row.match)}</strong></div>
            <div class="v2TeamLine"><strong>${esc(teams.away || "")}</strong></div>
          </div>
          <div class="v2PickTags">${row.modelVersion ? `<span>${esc(row.modelVersion)}</span>` : ""}${row.autoSettled ? `<span>AUTO SETTLED</span>` : ""}</div>
        </div>
        ${scoreMarkup(row)}
        <div class="v2Selection">
          <small>SELECTION</small>
          <strong>O${esc(row.line ?? "—")} <em>@ ${esc(row.odds ?? "—")}</em></strong>
          <div class="v2Outcome ${tone}"><span>${esc(result)}</span><b>${units(row.pl)}</b></div>
        </div>
        <span class="matchChevron" aria-hidden="true">⌄</span>
      </summary>
      ${detailMarkup(row, "picks")}
    </details>`;
  }

  function filterToggleHtml(open) {
    return `<button type="button" class="v2FilterToggle" aria-expanded="${open}" aria-controls="advancedFilters"><span>Filters</span><b aria-hidden="true">${open ? "−" : "+"}</b></button>`;
  }

  function bindTabKeyboard(container, onActivate) {
    if (!container) return;
    container.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const buttons = [...container.querySelectorAll('[role="tab"]')];
      const current = Math.max(0, buttons.indexOf(document.activeElement));
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = buttons[(current + delta + buttons.length) % buttons.length];
      event.preventDefault();
      next.focus();
      onActivate(next);
    });
  }

  function setupFilterPanel(form, state, onChange, storageKey) {
    const toggle = form.querySelector(".v2FilterToggle");
    const panel = form.querySelector(".v2AdvancedFilters");
    if (toggle && panel) {
      toggle.addEventListener("click", () => {
        state.filtersOpen = !state.filtersOpen;
        panel.hidden = !state.filtersOpen;
        toggle.setAttribute("aria-expanded", String(state.filtersOpen));
        toggle.querySelector("b").textContent = state.filtersOpen ? "−" : "+";
        writeJson(storageKey, state);
      });
    }
    form.addEventListener("input", () => {
      const fd = new FormData(form);
      state.q = String(fd.get("q") || "");
      state.competition = String(fd.get("competition") || "ALL");
      if ("tier" in state) state.tier = String(fd.get("tier") || "ALL");
      if ("grade" in state) state.grade = String(fd.get("grade") || "ALL");
      if ("model" in state) state.model = String(fd.get("model") || "ALL");
      if ("date" in state) state.date = String(fd.get("date") || "");
      writeJson(storageKey, state);
      onChange();
    });
    const reset = form.querySelector(".v2FilterReset");
    if (reset) reset.addEventListener("click", () => {
      form.reset();
      state.q = "";
      state.competition = "ALL";
      if ("tier" in state) state.tier = "ALL";
      if ("grade" in state) state.grade = "ALL";
      if ("model" in state) state.model = "ALL";
      if ("date" in state) state.date = "";
      writeJson(storageKey, state);
      onChange();
    });
  }

  function scheduleFilterForm(rows, state) {
    const competitions = optionList(rows, "competition");
    const grades = optionList(rows, "grade");
    return `<form class="v2Filters" id="scheduleFilters">
      <label class="v2Search" for="scheduleSearch"><span>Search</span><input id="scheduleSearch" name="q" type="search" value="${esc(state.q)}" placeholder="Search match or competition…" autocomplete="off"></label>
      ${filterToggleHtml(state.filtersOpen)}
      <div class="v2AdvancedFilters" id="advancedFilters" ${state.filtersOpen ? "" : "hidden"}>
        <label for="scheduleTier"><span>Tier</span><select id="scheduleTier" name="tier"><option value="ALL">All tiers</option><option value="FOCUS" ${state.tier === "FOCUS" ? "selected" : ""}>FOCUS</option><option value="WATCHLIST" ${state.tier === "WATCHLIST" ? "selected" : ""}>WATCHLIST</option></select></label>
        <label for="scheduleGrade"><span>PRE grade</span><select id="scheduleGrade" name="grade"><option value="ALL">All grades</option>${grades.map((grade) => `<option ${state.grade === grade ? "selected" : ""}>${esc(grade)}</option>`).join("")}</select></label>
        <label for="scheduleCompetition"><span>Competition</span><select id="scheduleCompetition" name="competition"><option value="ALL">All competitions</option>${competitions.map((competition) => `<option ${state.competition === competition ? "selected" : ""}>${esc(competition)}</option>`).join("")}</select></label>
        <button type="button" class="v2FilterReset">Reset</button>
      </div>
    </form>`;
  }

  function pickFilterForm(rows, state) {
    const competitions = optionList(rows, "competition");
    const models = optionList(rows, "modelVersion").reverse();
    return `<form class="v2Filters" id="pickFilters">
      <label class="v2Search" for="pickSearch"><span>Search</span><input id="pickSearch" name="q" type="search" value="${esc(state.q)}" placeholder="Search match, league or reason…" autocomplete="off"></label>
      ${filterToggleHtml(state.filtersOpen)}
      <div class="v2AdvancedFilters" id="advancedFilters" ${state.filtersOpen ? "" : "hidden"}>
        <label for="pickDate"><span>Match date</span><input id="pickDate" name="date" type="date" value="${esc(state.date)}"></label>
        <label for="pickModel"><span>Model</span><select id="pickModel" name="model"><option value="ALL">All models</option>${models.map((model) => `<option ${state.model === model ? "selected" : ""}>${esc(model)}</option>`).join("")}</select></label>
        <label for="pickCompetition"><span>Competition</span><select id="pickCompetition" name="competition"><option value="ALL">All competitions</option>${competitions.map((competition) => `<option ${state.competition === competition ? "selected" : ""}>${esc(competition)}</option>`).join("")}</select></label>
        <button type="button" class="v2FilterReset">Reset</button>
      </div>
    </form>`;
  }

  function applyScheduleFilters(rows, state) {
    const query = norm(state.q || "");
    return rows.filter((row) => {
      if (state.tier !== "ALL" && row.tier !== state.tier) return false;
      if (state.grade !== "ALL" && row.grade !== state.grade) return false;
      if (state.competition !== "ALL" && row.competition !== state.competition) return false;
      if (query && !norm(`${row.match} ${row.competition}`).includes(query)) return false;
      return true;
    });
  }

  function applyPickFilters(rows, state) {
    const query = norm(state.q || "");
    return rows.filter((row) => {
      if (state.date && dateKey(row.kickoff) !== state.date) return false;
      if (state.model !== "ALL" && row.modelVersion !== state.model) return false;
      if (state.competition !== "ALL" && row.competition !== state.competition) return false;
      if (query && !norm(`${row.match} ${row.competition} ${row.reason || ""}`).includes(query)) return false;
      return true;
    });
  }

  renderSchedule = function renderScheduleV2(rows = data.schedule) {
    const today = dateKey(new Date());
    const todayRows = (Array.isArray(rows) ? rows : data.schedule || [])
      .filter((row) => row.slateDate === today)
      .sort((a, b) => kickoffMs(a) - kickoffMs(b));
    const state = readJson(STORE.scheduleFilters, { q: "", tier: "ALL", grade: "ALL", competition: "ALL", filtersOpen: false });
    let bucket = readString(STORE.scheduleBucket, "upcoming");
    if (!["upcoming", "ended"].includes(bucket)) bucket = "upcoming";

    const focus = todayRows.filter((row) => row.tier === "FOCUS").length;
    const watch = todayRows.filter((row) => row.tier === "WATCHLIST").length;
    const liveNow = todayRows.filter(isLive).length;

    app.innerHTML = `<div class="v2PageHead">
        <div><div class="eyebrow">TODAY · CONTROL BOARD</div><h1>Schedule</h1><p class="sub">${esc(fmtDate(today))} · ICT</p></div>
        <div class="v2HeadlineStats"><span><small>FOCUS</small><b>${focus}</b></span><span><small>WATCH</small><b>${watch}</b></span><span class="liveMetric"><small>LIVE</small><b>${liveNow}</b></span></div>
      </div>
      <div class="v2StatusTabs" role="tablist" aria-label="Schedule status">
        <button type="button" role="tab" data-schedule-bucket="upcoming" aria-selected="${bucket === "upcoming"}" class="${bucket === "upcoming" ? "active" : ""}">Upcoming / Live <span>${todayRows.filter((row) => !isEnded(row)).length}</span></button>
        <button type="button" role="tab" data-schedule-bucket="ended" aria-selected="${bucket === "ended"}" class="${bucket === "ended" ? "active" : ""}">Ended <span>${todayRows.filter(isEnded).length}</span></button>
      </div>
      ${scheduleFilterForm(todayRows, state)}
      <div id="v2ScheduleList" class="v2List" role="tabpanel"></div>`;

    const list = document.getElementById("v2ScheduleList");
    const form = document.getElementById("scheduleFilters");

    const draw = () => {
      const filtered = applyScheduleFilters(todayRows, state).sort((a, b) => kickoffMs(a) - kickoffMs(b));
      const ended = filtered.filter(isEnded);
      const active = filtered.filter((row) => !isEnded(row));
      const visible = bucket === "ended" ? ended : active;
      let body = "";

      if (bucket === "upcoming") {
        const live = visible.filter(isLive);
        const next = visible.filter((row) => !isLive(row));
        if (live.length) body += `<section class="v2Section"><div class="v2SectionTitle live"><span>LIVE NOW</span><b>${live.length}</b></div>${live.map(scheduleCardV2).join("")}</section>`;
        if (next.length) body += `<section class="v2Section"><div class="v2SectionTitle"><span>NEXT UP</span><b>${next.length}</b></div>${next.map(scheduleCardV2).join("")}</section>`;
        if (!live.length && !next.length) body = `<div class="empty">No upcoming matches match the current filters.</div>`;
      } else {
        body = visible.length
          ? `<section class="v2Section"><div class="v2SectionTitle"><span>ENDED TODAY</span><b>${visible.length}</b></div>${visible.map(scheduleCardV2).join("")}</section>`
          : `<div class="empty">No ended matches match the current filters.</div>`;
      }

      list.innerHTML = `<div class="v2ResultLine"><span>${visible.length} shown</span><span>${filtered.length} matched by filters</span></div>${body}`;
      if (typeof bindScoreForms === "function") bindScoreForms();
    };

    document.querySelectorAll("[data-schedule-bucket]").forEach((button) => {
      button.addEventListener("click", () => {
        bucket = button.dataset.scheduleBucket;
        writeString(STORE.scheduleBucket, bucket);
        renderScheduleV2(data.schedule);
      });
    });
    bindTabKeyboard(document.querySelector('.v2StatusTabs'), (button) => button.click());
    setupFilterPanel(form, state, draw, STORE.scheduleFilters);
    draw();
  };

  renderPicks = function renderPicksV2(rows = data.picks) {
    const allRows = (Array.isArray(rows) ? rows : data.picks || []).slice().sort((a, b) => {
      const aTime = Date.parse(a.recordedAt || a.kickoff || 0) || 0;
      const bTime = Date.parse(b.recordedAt || b.kickoff || 0) || 0;
      return bTime - aTime;
    });
    const state = readJson(STORE.picksFilters, { q: "", competition: "ALL", model: "ALL", date: "", filtersOpen: false });
    let bucket = readString(STORE.picksBucket, "");
    const pendingAll = allRows.filter((row) => String(row.result || "PENDING").toUpperCase() === "PENDING");
    const settledAll = allRows.filter((row) => String(row.result || "PENDING").toUpperCase() !== "PENDING");
    if (!["active", "settled", "all"].includes(bucket)) bucket = pendingAll.length ? "active" : "settled";

    const stake = settledAll.reduce((sum, row) => sum + (Number(row.stake) || 0), 0);
    const profit = settledAll.reduce((sum, row) => sum + (Number(row.pl) || 0), 0);
    const roi = stake ? (profit / stake) * 100 : 0;

    app.innerHTML = `<div class="v2PageHead picksHead">
        <div><div class="eyebrow cyan">OFFICIAL EXPOSURE</div><h1>Picks</h1><p class="sub">Track active exposure first, then settled performance.</p></div>
        <div class="v2HeadlineStats picksMetrics"><span><small>P/L</small><b>${units(profit)}</b></span><span><small>ROI</small><b>${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%</b></span><span class="pendingMetric"><small>PENDING</small><b>${pendingAll.length}</b></span></div>
      </div>
      <div class="v2SecondaryLine">${settledAll.length} settled · ${allRows.length} total picks</div>
      <div class="v2StatusTabs picksTabs" role="tablist" aria-label="Pick status">
        <button type="button" role="tab" data-pick-bucket="active" aria-selected="${bucket === "active"}" class="${bucket === "active" ? "active" : ""}">Active <span>${pendingAll.length}</span></button>
        <button type="button" role="tab" data-pick-bucket="settled" aria-selected="${bucket === "settled"}" class="${bucket === "settled" ? "active" : ""}">Settled <span>${settledAll.length}</span></button>
        <button type="button" role="tab" data-pick-bucket="all" aria-selected="${bucket === "all"}" class="${bucket === "all" ? "active" : ""}">All <span>${allRows.length}</span></button>
      </div>
      ${pickFilterForm(allRows, state)}
      <div id="v2PickList" class="v2List" role="tabpanel"></div>`;

    const list = document.getElementById("v2PickList");
    const form = document.getElementById("pickFilters");

    const draw = () => {
      const filtered = applyPickFilters(allRows, state);
      let visible = filtered;
      if (bucket === "active") visible = filtered.filter((row) => String(row.result || "PENDING").toUpperCase() === "PENDING");
      if (bucket === "settled") visible = filtered.filter((row) => String(row.result || "PENDING").toUpperCase() !== "PENDING");
      const title = bucket === "active" ? "ACTIVE EXPOSURE" : bucket === "settled" ? "SETTLED" : "ALL PICKS";
      list.innerHTML = `<div class="v2ResultLine"><span>${visible.length} shown</span><span>${filtered.length} matched by filters</span></div>${visible.length ? `<section class="v2Section"><div class="v2SectionTitle"><span>${title}</span><b>${visible.length}</b></div>${visible.map(pickCardV2).join("")}</section>` : `<div class="empty">No picks match this view.</div>`}`;
      if (typeof bindScoreForms === "function") bindScoreForms();
    };

    document.querySelectorAll("[data-pick-bucket]").forEach((button) => {
      button.addEventListener("click", () => {
        bucket = button.dataset.pickBucket;
        writeString(STORE.picksBucket, bucket);
        renderPicksV2(data.picks);
      });
    });
    bindTabKeyboard(document.querySelector('.picksTabs'), (button) => button.click());
    setupFilterPanel(form, state, draw, STORE.picksFilters);
    draw();
  };

  function installControlStatus() {
    const navin = document.querySelector(".navin");
    if (!navin || document.getElementById("controlStatus")) return;
    const status = document.createElement("div");
    status.id = "controlStatus";
    status.className = "controlStatus";
    status.setAttribute("aria-live", "polite");
    const tabs = navin.querySelector(".tabs");
    navin.insertBefore(status, tabs || null);
  }

  function ageLabel(timestamp) {
    if (!timestamp) return "waiting";
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  function renderControlStatus() {
    installControlStatus();
    const node = document.getElementById("controlStatus");
    if (!node) return;
    if (!lastDashboardSuccess && ((data?.schedule?.length || 0) + (data?.picks?.length || 0) > 0)) lastDashboardSuccess = Date.now();
    if (!lastLiveSuccess && typeof liveCount !== "undefined" && liveCount !== null && !liveError) lastLiveSuccess = Date.now();
    const bsdBad = Boolean((typeof liveError !== "undefined" && liveError) || (lastLiveFailure > lastLiveSuccess));
    const freshAt = Math.max(lastDashboardSuccess, lastLiveSuccess);
    node.innerHTML = `<span class="sourcePill ${bsdBad ? "bad" : lastLiveSuccess ? "ok" : "idle"}"><i></i>BSD <b>${bsdBad ? "ERROR" : lastLiveSuccess ? "LIVE" : "…"}</b></span><span class="sourcePill ${lastDashboardSuccess ? "ok" : "idle"}"><i></i>Airtable <b>${lastDashboardSuccess ? "SYNCED" : "…"}</b></span><span class="sourceAge">Updated ${ageLabel(freshAt)}</span>`;
  }

  function observeFetches() {
    if (window.__sliptraceFetchObserved) return;
    window.__sliptraceFetchObserved = true;
    const baseFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input?.url || "";
      try {
        const response = await baseFetch(input, init);
        const now = Date.now();
        if (url.includes("/api/dashboard-data") && response.ok) lastDashboardSuccess = now;
        if (url.includes("/api/live-scores")) {
          if (response.ok) lastLiveSuccess = now;
          else lastLiveFailure = now;
        }
        renderControlStatus();
        return response;
      } catch (error) {
        if (url.includes("/api/live-scores")) lastLiveFailure = Date.now();
        renderControlStatus();
        throw error;
      }
    };
  }

  function syncTopNavA11y() {
    document.querySelectorAll("[data-tab]").forEach((link) => {
      const active = typeof currentTab === "function" && link.dataset.tab === currentTab();
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  observeFetches();
  installControlStatus();
  renderControlStatus();
  syncTopNavA11y();
  window.addEventListener("hashchange", syncTopNavA11y);
  setInterval(renderControlStatus, 1000);
})();
