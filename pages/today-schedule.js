// Schedule front page: ICT today only, split into ended and upcoming/live tabs.
(() => {
  const endedStatuses = new Set(["finished", "ft", "full time", "full_time", "fulltime"]);
  let activeBucket = "upcoming";
  let bucketInitialized = false;

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

      if (!bucketInitialized) {
        activeBucket = upcoming.length ? "upcoming" : "ended";
        bucketInitialized = true;
      }

      const visible = activeBucket === "ended" ? ended : upcoming;
      const emptyText = activeBucket === "ended" ? "No ended matches yet." : "No upcoming matches today.";
      const sectionLabel = activeBucket === "ended" ? "ENDED MATCHES" : "UPCOMING / LIVE";

      list.innerHTML = `
        <div class="resultCount">Showing ${ordered.length} of ${todayRows.length} fixtures ${statusBadge()}</div>
        <div class="scheduleSubtabs" role="tablist" aria-label="Match status">
          <button type="button" class="scheduleSubtab ${activeBucket === "upcoming" ? "active" : ""}" data-schedule-bucket="upcoming" role="tab" aria-selected="${activeBucket === "upcoming"}">Upcoming / Live <span>${upcoming.length}</span></button>
          <button type="button" class="scheduleSubtab ${activeBucket === "ended" ? "active" : ""}" data-schedule-bucket="ended" role="tab" aria-selected="${activeBucket === "ended"}">Ended <span>${ended.length}</span></button>
        </div>
        <section>
          <div class="sectionTitle">${sectionLabel} · ${visible.length}</div>
          ${visible.length ? visible.map(scheduleCard).join("") : `<div class="empty">${emptyText}</div>`}
        </section>`;

      document.querySelectorAll("[data-schedule-bucket]").forEach((button) => {
        button.addEventListener("click", () => {
          activeBucket = button.dataset.scheduleBucket;
          draw(filtered);
        });
      });

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
