(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const TZ = window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh';
  let syncing = false;
  let lastResolved = new Map();

  const finite = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const pick = (...v) => v.find(x => x !== undefined && x !== null && x !== '') ?? null;

  function todayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function selectedDate() {
    return document.querySelector('.dateBtn.active')?.dataset?.date || todayKey();
  }

  function normalizeStatus(raw) {
    const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    if ([
      'live','inprogress','in_progress','playing','ongoing',
      'ht','halftime','half_time','break','paused',
      'extra_time','extra_time_first_half','extra_time_second_half',
      'penalties','penalty_shootout'
    ].includes(s)) return 'live';
    if ([
      'finished','ended','complete','completed','final','ft',
      'aet','after_extra_time','after_penalties','penalties_finished'
    ].includes(s)) return 'finished';
    if (['postponed','cancelled','canceled','abandoned','suspended'].includes(s)) return s;
    return 'upcoming';
  }

  function eventStatus(event) {
    return normalizeStatus(pick(event?.status, event?.time?.status));
  }

  function eventId(event) {
    return String(pick(event?.id, event?.event_id, event?.eventId) ?? '');
  }

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function eventTeamName(event, side) {
    const team = event?.[`${side}_team`] || event?.[side] || event?.teams?.[side] || {};
    return String(pick(
      team?.name, team?.team_name, team?.display_name, team?.short_name,
      event?.[`${side}_team_name`], event?.[`${side}_name`],
      typeof event?.[side] === 'string' ? event[side] : null,
      ''
    ) || '');
  }

  function eventTeamKey(event) {
    const home = norm(eventTeamName(event, 'home'));
    const away = norm(eventTeamName(event, 'away'));
    return home && away ? `${home}|${away}` : '';
  }

  function rowTeamKey(row) {
    const names = [...row.querySelectorAll('.teamLine span')].map(n => norm(n.textContent)).filter(Boolean);
    return names.length >= 2 ? `${names[0]}|${names[1]}` : '';
  }

  function score(event) {
    const nested = event?.score && typeof event.score === 'object' ? event.score : {};
    return {
      home: finite(pick(event?.home_score, nested.home, nested.home_score)),
      away: finite(pick(event?.away_score, nested.away, nested.away_score)),
    };
  }

  function kickoff(event) {
    return pick(event?.event_date, event?.kickoff_at, event?.kickoff, event?.start_time, event?.time?.kickoff_at);
  }

  function formatTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d);
  }

  function periodLabel(event) {
    const raw = String(pick(event?.time?.period, event?.current_period, event?.period, event?.round_label, '') || '').replace(/_/g, ' ');
    const lower = raw.toLowerCase();
    if (lower === '1' || lower === 'first half') return '1st half';
    if (lower === '2' || lower === 'second half') return '2nd half';
    if (['ht','halftime','half time'].includes(lower)) return 'Halftime';
    return raw;
  }

  function liveClock(event) {
    const minute = finite(pick(event?.time?.minute, event?.current_minute, event?.minute));
    const display = pick(event?.time?.display, event?.display);
    if (display && !/^0?\d{1,2}:\d{2}$/.test(String(display))) return String(display);
    return minute !== null ? `${minute}′` : 'LIVE';
  }

  function currentRowStatus(row) {
    const clock = row.querySelector('.matchScore [data-clock]')?.textContent?.trim().toUpperCase() || '';
    if (/^FT\b/.test(clock) || row.dataset.matchStatus === 'ft' || row.classList.contains('is-ft-row')) return 'finished';
    if (row.querySelector('.matchTime .tag.live') || row.dataset.matchStatus === 'live') return 'live';
    return 'upcoming';
  }

  function livePanelFor(row) {
    const panel = row.closest('.panel');
    const title = panel?.querySelector('.panelHead h2')?.textContent?.trim().toLowerCase() || '';
    return title === 'live now' ? panel : null;
  }

  function removeFinishedFromLivePanel(row) {
    const panel = livePanelFor(row);
    if (!panel) return;
    row.remove();
    const remaining = panel.querySelectorAll('.matchRow').length;
    const countNode = panel.querySelector('.panelHead > span');
    if (countNode) countNode.textContent = String(remaining);
    if (!remaining) panel.remove();
  }

  function updateScore(row, event) {
    const sc = score(event);
    const scoreNode = row.querySelector('.matchScore strong');
    if (scoreNode && sc.home !== null && sc.away !== null) scoreNode.textContent = `${sc.home}–${sc.away}`;
  }

  function applyFinished(row, event) {
    updateScore(row, event);
    const clockNode = row.querySelector('.matchScore [data-clock]');
    const timeNode = row.querySelector('.matchTime');
    if (clockNode && clockNode.textContent.trim().toUpperCase() !== 'FT') clockNode.textContent = 'FT';
    if (timeNode && (timeNode.querySelector('.tag.live') || !/full time/i.test(timeNode.textContent))) {
      timeNode.innerHTML = `${formatTime(kickoff(event))}<small>Full time</small>`;
    }
    row.dataset.matchStatus = 'ft';
    row.classList.remove('is-live-row');
    row.classList.add('is-ft-row');
    removeFinishedFromLivePanel(row);
  }

  function applyLive(row, event) {
    // A stale item can briefly remain in the provider's live collection after FT.
    // Never turn it back into LIVE when the event payload itself says it is finished.
    if (eventStatus(event) === 'finished') {
      applyFinished(row, event);
      return;
    }

    updateScore(row, event);
    const clockNode = row.querySelector('.matchScore [data-clock]');
    const timeNode = row.querySelector('.matchTime');
    const clock = liveClock(event);
    const period = periodLabel(event);
    if (clockNode && clockNode.textContent.trim() !== clock) clockNode.textContent = clock;
    if (timeNode && !timeNode.querySelector('.tag.live')) {
      timeNode.innerHTML = `<span class="tag live"><i class="dot bad"></i>LIVE</span><small>${period}</small>`;
    } else if (timeNode) {
      const small = timeNode.querySelector('small');
      if (small && small.textContent !== period) small.textContent = period;
    }
    row.dataset.matchStatus = 'live';
    row.classList.add('is-live-row');
    row.classList.remove('is-ft-row');
  }

  function applyScheduled(row, event) {
    // Never regress a row that has already been observed live or finished.
    const current = currentRowStatus(row);
    if (current === 'live' || current === 'finished') return;
    updateScore(row, event);
    const clockNode = row.querySelector('.matchScore [data-clock]');
    const timeNode = row.querySelector('.matchTime');
    const time = formatTime(kickoff(event));
    if (clockNode && clockNode.textContent.trim() !== time) clockNode.textContent = time;
    if (timeNode) timeNode.innerHTML = `${time}<small>${periodLabel(event)}</small>`;
    row.dataset.matchStatus = 'scheduled';
    row.classList.remove('is-live-row', 'is-ft-row');
  }

  function refreshKpis() {
    const liveIds = new Set();
    document.querySelectorAll('.matchRow[data-match-status="live"]').forEach(row => {
      liveIds.add(String(row.dataset.liveEvent || rowTeamKey(row) || Math.random()));
    });
    document.querySelectorAll('.kpi').forEach(kpi => {
      const label = kpi.querySelector('span')?.textContent?.trim().toLowerCase();
      const value = kpi.querySelector('strong');
      if (!value) return;
      if (label === 'live') value.textContent = String(liveIds.size);
      if (label === 'matches') value.textContent = String(document.querySelectorAll('.mainCol .panel:not(:first-child) .matchRow').length || document.querySelectorAll('.matchRow').length);
    });
  }

  function indexEvents(source) {
    const byId = new Map();
    const byTeams = new Map();
    for (const event of source) {
      const id = eventId(event);
      const key = eventTeamKey(event);
      if (id) byId.set(id, event);
      if (key) byTeams.set(key, event);
    }
    return { byId, byTeams };
  }

  function lookup(index, row) {
    const id = String(row.dataset.liveEvent || '');
    if (id && index.byId.has(id)) return index.byId.get(id);
    const key = rowTeamKey(row);
    return key ? index.byTeams.get(key) || null : null;
  }

  function rowsFrom(payload) {
    const data = payload?.data ?? payload;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.events)) return data.events;
    return [];
  }

  function reassertResolvedRows() {
    document.querySelectorAll('.matchRow[data-live-event]').forEach(row => {
      const id = String(row.dataset.liveEvent || '');
      const resolved = lastResolved.get(id) || lastResolved.get(rowTeamKey(row));
      if (!resolved) return;
      if (resolved.status === 'finished' && currentRowStatus(row) !== 'finished') applyFinished(row, resolved.event);
      if (resolved.status === 'live' && currentRowStatus(row) !== 'live') applyLive(row, resolved.event);
    });
    refreshKpis();
  }

  async function syncStatuses() {
    if (syncing || !document.querySelector('.matchRow[data-live-event]')) return;
    syncing = true;
    try {
      const date = selectedDate();
      const stamp = Date.now();
      const [liveResult, dayResult] = await Promise.allSettled([
        fetch(`${API}/api/bsd/live?status_sync=${stamp}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`live ${r.status}`))),
        fetch(`${API}/api/bsd/events?date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}&limit=200&status_sync=${stamp}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`events ${r.status}`)))
      ]);

      const liveRows = liveResult.status === 'fulfilled' ? rowsFrom(liveResult.value) : [];
      const dayRows = dayResult.status === 'fulfilled' ? rowsFrom(dayResult.value) : [];
      const liveIndex = indexEvents(liveRows);
      const dayIndex = indexEvents(dayRows);
      const nextResolved = new Map(lastResolved);

      document.querySelectorAll('.matchRow[data-live-event]').forEach(row => {
        const id = String(row.dataset.liveEvent || '');
        const key = rowTeamKey(row);
        const liveEvent = lookup(liveIndex, row);
        const dayEvent = lookup(dayIndex, row);
        const previous = lastResolved.get(id) || lastResolved.get(key);

        // Source precedence:
        // 1) A BSD live-feed item is LIVE only when its own status is live.
        // 2) A finished status from either feed wins immediately.
        // 3) Day feed may provide the current status when the live feed omits a fixture.
        // 4) Stale UPCOMING responses never downgrade a previously strong LIVE/FT state.
        if (liveEvent) {
          const liveStatus = eventStatus(liveEvent);
          if (liveStatus === 'finished') {
            applyFinished(row, liveEvent);
            const resolved = { status: 'finished', event: liveEvent };
            if (id) nextResolved.set(id, resolved);
            if (key) nextResolved.set(key, resolved);
            return;
          }
          if (liveStatus === 'live') {
            applyLive(row, liveEvent);
            const resolved = { status: 'live', event: liveEvent };
            if (id) nextResolved.set(id, resolved);
            if (key) nextResolved.set(key, resolved);
            return;
          }
        }

        if (dayEvent) {
          const dayStatus = eventStatus(dayEvent);
          if (dayStatus === 'finished') {
            applyFinished(row, dayEvent);
            const resolved = { status: 'finished', event: dayEvent };
            if (id) nextResolved.set(id, resolved);
            if (key) nextResolved.set(key, resolved);
            return;
          }
          if (dayStatus === 'live') {
            applyLive(row, dayEvent);
            const resolved = { status: 'live', event: dayEvent };
            if (id) nextResolved.set(id, resolved);
            if (key) nextResolved.set(key, resolved);
            return;
          }

          if (previous?.status === 'live' || previous?.status === 'finished' || currentRowStatus(row) !== 'upcoming') {
            // Preserve the stronger previously observed state while BSD's day list catches up.
            if (previous?.status === 'finished') applyFinished(row, previous.event);
            else if (previous?.status === 'live') applyLive(row, previous.event);
            return;
          }

          applyScheduled(row, dayEvent);
          return;
        }

        // If one source temporarily omits the fixture, preserve the last strong state.
        if (previous?.status === 'finished') applyFinished(row, previous.event);
        else if (previous?.status === 'live') applyLive(row, previous.event);
      });

      lastResolved = nextResolved;
      refreshKpis();
    } catch {
      reassertResolvedRows();
    } finally {
      syncing = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (!lastResolved.size) return;
    queueMicrotask(reassertResolvedRows);
  });
  observer.observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncStatuses();
  });
  window.addEventListener('focus', syncStatuses);
  window.addEventListener('hashchange', () => setTimeout(syncStatuses, 0));
  document.addEventListener('click', event => {
    if (event.target.closest('.dateBtn')) setTimeout(syncStatuses, 0);
  });

  setInterval(() => {
    if (document.visibilityState === 'visible' && selectedDate() === todayKey()) syncStatuses();
  }, 10000);

  setTimeout(syncStatuses, 900);
})();
