// Schedule front page: ICT today only, split into ended and upcoming/live sections.
(() => {
  const endedStatuses = new Set(["finished", "ft", "full time", "full_time", "fulltime"]);

  function isEndedMatch(row) {
    if (row?.manualScore) return true;

    const live = findLive(row?.match || "");
    if (live && endedStatuses.has(String(live.status || "").toLowerCase())) return true;

    const bsdStatus = String(row?.bsd?.status || "").toLowerCase();
    return endedStatuses.has(bsdStatus);
  }

  function kickoffAsc(a, b) {
    return new Date(a?.displayKickoff || a?.kickoff || 0).getTime() - new Date(b?.displayKickoff || b?.kickoff || 0).getTime();
  }

  renderSchedule = function renderTodaySchedule(rows = data.schedule) {
    const today = dateKey(new Date());
    const todayRows = (rows || []).filter((row) => row.slateDate === today).sort(kickoffAsc);
    const focus = todayRows.filter((row) => row.tier === "FOCUS").length;

    app.innerHTML = `<div class="top"><div><div class="eyebrow">LIVE CONTROL BOARD</div><h1>Schedule</h1><p class="sub">${esc(fmtDate(today))} · ICT. Today only.</p></div><div class="stats"><div class="stat"><small>FOCUS</small><strong>${focus}</strong></div><div class="stat"><small>WATCHLIST</small><strong>${todayRows.length - focus}</strong></div><div class="stat"><small>TIMEZONE</small><strong style="font-size:17px">ICT · GMT+7</strong></div></div></div>${filtersHtml("schedule", todayRows)}<div id="list"></div>`;

    const form = document.getElementById("filters");
    const list = document.getElementById("list");

    const draw = (filtered) => {
      const ordered = [...filtered].sort(kickoffAsc);
      const ended = ordered.filter(isEndedMatch);
      const upcoming = ordered.filter((row) => !isEndedMatch(row));

      const endedHtml = ended.length
        ? `<section><div class="sectionTitle">ENDED MATCHES · ${ended.length}</div>${ended.map(scheduleCard).join("")}</section>`
        : `<section><div class="sectionTitle">ENDED MATCHES · 0</div><div class="empty">No ended matches yet.</div></section>`;

      const upcomingHtml = upcoming.length
        ? `<section><div class="sectionTitle">UPCOMING / LIVE · ${upcoming.length}</div>${upcoming.map(scheduleCard).join("")}</section>`
        : `<section><div class="sectionTitle">UPCOMING / LIVE · 0</div><div class="empty">No upcoming matches today.</div></section>`;

      list.innerHTML = `<div class="resultCount">Showing ${ordered.length} of ${todayRows.length} fixtures ${statusBadge()}</div>` + endedHtml + upcomingHtml;
      bindScoreForms();
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      draw(filterRows("schedule", todayRows, form));
    });

    form.querySelector(".filterReset").onclick = () => {
      form.reset();
      draw(todayRows);
    };

    draw(todayRows);
  };
})();
