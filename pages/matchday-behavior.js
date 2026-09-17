(() => {
  'use strict';

  const STATUS_KEY = 'sliptrace.statusFilter.v3';
  const DEFAULT_MIGRATION_KEY = 'sliptrace.statusDefaultUpcoming.v1';
  const AUTO_FT_MS = 135 * 60 * 1000;
  const TIMELINE_POLL_MS = 5000;
  const originalFetch = window.fetch.bind(window);

  let scheduleSnapshot = [];
  let lastTimelineSignature = '';

  function setUpcomingDefault() {
    try {
      const hasStatus = Boolean(sessionStorage.getItem(STATUS_KEY));
      const migrated = localStorage.getItem(DEFAULT_MIGRATION_KEY) === '1';
      if (!hasStatus || !migrated) {
        sessionStorage.setItem(STATUS_KEY, 'upcoming');
        localStorage.setItem(DEFAULT_MIGRATION_KEY, '1');
      }
    } catch {}
  }

  function norm(value = '') {
    return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function splitMatch(value = '') {
    const text = String(value || '');
    for (const re of [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/, /\s+-\s+/]) {
      const parts = text.split(re).map((part) => part.trim()).filter(Boolean);
      if (parts.length === 2) return { home: parts[0], away: parts[1] };
    }
    return { home: text, away: '' };
  }

  function nameScore(a, b) {
    const left = norm(a), right = norm(b);
    if (!left || !right) return 0;
    if (left === right) return 6;
    if (left.includes(right) || right.includes(left)) return 4;
    const aa = new Set(left.split(' ')), bb = new Set(right.split(' '));
    let shared = 0;
    aa.forEach((token) => { if (bb.has(token)) shared += 1; });
    const ratio = shared / Math.max(aa.size, bb.size);
    return ratio >= .75 ? 4 : ratio >= .5 ? 3 : 0;
  }

  function eventTeamName(event, side) {
    const team = event?.[`${side}_team`] || event?.[side] || event?.teams?.[side] || {};
    return String(team?.name || team?.short_name || event?.[`${side}_team_name`] || event?.[`${side}_name`] ||
      (typeof event?.[side] === 'string' ? event[side] : '') || '');
  }

  function eventMatchesRow(event, row) {
    const teams = splitMatch(row?.match || '');
    return nameScore(teams.home, eventTeamName(event, 'home')) +
      nameScore(teams.away, eventTeamName(event, 'away')) >= 6;
  }

  function declaredStatus(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['finished','ended','complete','completed','final','ft','aet','full_time','fulltime'].includes(raw)) return 'finished';
    if (['live','inprogress','in_progress','playing','ongoing','ht','halftime','half_time','break','paused','extra_time','penalties'].includes(raw)) return 'live';
    if (['postponed','cancelled','canceled','abandoned','suspended'].includes(raw)) return raw;
    return 'upcoming';
  }

  function timelineStatus(row, now = Date.now()) {
    const declared = declaredStatus(row?.status || row?.matchStatus);
    if (declared === 'finished' || declared === 'postponed' || declared === 'cancelled' ||
        declared === 'canceled' || declared === 'abandoned' || declared === 'suspended') return declared;
    const kickoff = Date.parse(row?.kickoff || row?.displayKickoff || '');
    if (!Number.isFinite(kickoff)) return declared === 'live' ? 'live' : 'upcoming';
    if (now >= kickoff + AUTO_FT_MS) return 'finished';
    if (now >= kickoff) return 'live';
    return 'upcoming';
  }

  function applyTimelineToDashboard(payload) {
    if (!payload || !Array.isArray(payload.schedule)) return payload;
    const now = Date.now();
    payload.schedule = payload.schedule.map((row) => {
      if (!row) return row;
      const status = timelineStatus(row, now);
      const kickoff = Date.parse(row.kickoff || row.displayKickoff || '');
      if (status === 'finished' && Number.isFinite(kickoff)) {
        return Object.assign({}, row, {
          status: 'finished', matchStatus: 'finished', autoFt: true,
          autoFtAt: new Date(kickoff + AUTO_FT_MS).toISOString()
        });
      }
      if (status === 'live' && Number.isFinite(kickoff)) {
        return Object.assign({}, row, {
          status: 'live', matchStatus: 'live', autoLive: true,
          autoLiveAt: new Date(kickoff).toISOString()
        });
      }
      return row;
    });
    scheduleSnapshot = payload.schedule.map((row) => Object.assign({}, row));
    return payload;
  }

  function rowsContainer(payload) {
    if (Array.isArray(payload)) return { rows: payload, set: (rows) => rows };
    if (Array.isArray(payload?.data)) return { rows: payload.data, set: (rows) => Object.assign({}, payload, { data: rows }) };
    if (Array.isArray(payload?.results)) return { rows: payload.results, set: (rows) => Object.assign({}, payload, { results: rows }) };
    if (Array.isArray(payload?.events)) return { rows: payload.events, set: (rows) => Object.assign({}, payload, { events: rows }) };
    if (Array.isArray(payload?.data?.results)) {
      return { rows: payload.data.results, set: (rows) => Object.assign({}, payload, { data: Object.assign({}, payload.data, { results: rows }) }) };
    }
    if (Array.isArray(payload?.data?.events)) {
      return { rows: payload.data.events, set: (rows) => Object.assign({}, payload, { data: Object.assign({}, payload.data, { events: rows }) }) };
    }
    return null;
  }

  function requestedDate(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      const url = new URL(raw, location.href);
      return url.searchParams.get('date_from') || '';
    } catch { return ''; }
  }

  function rawEventStatus(event) {
    return declaredStatus(event?.status || event?.time?.status || event?.time?.period || event?.period);
  }

  function syntheticEvent(row, status) {
    const teams = splitMatch(row.match || '');
    const live = status === 'live';
    return {
      status: live ? 'inprogress' : 'ft',
      event_date: row.kickoff || row.displayKickoff,
      kickoff: row.kickoff || row.displayKickoff,
      home_team_name: teams.home,
      away_team_name: teams.away,
      league_name: row.competition || 'Competition',
      competition_name: row.competition || 'Competition',
      source: 'board-clock-fallback',
      time: {
        status: live ? 'inprogress' : 'ft',
        display: live ? 'LIVE' : 'FT',
        period: live ? 'Clock fallback' : 'FT'
      }
    };
  }

  function applyTimelineToEvents(payload, input) {
    const container = rowsContainer(payload);
    if (!container || !scheduleSnapshot.length) return payload;

    const date = requestedDate(input);
    const now = Date.now();
    const rows = container.rows.map((event) => {
      const boardRow = scheduleSnapshot.find((row) => (!date || row.slateDate === date) && eventMatchesRow(event, row));
      if (!boardRow) return event;

      const timed = timelineStatus(boardRow, now);
      const actual = rawEventStatus(event);
      if (['finished','postponed','cancelled','canceled','abandoned','suspended'].includes(actual)) return event;

      if (timed === 'finished') {
        return Object.assign({}, event, {
          status: 'ft',
          time: Object.assign({}, event.time || {}, { status: 'ft', display: 'FT', period: 'FT' }),
          clockFallback: true
        });
      }
      if (timed === 'live' && actual === 'upcoming') {
        return Object.assign({}, event, {
          status: 'inprogress',
          time: Object.assign({}, event.time || {}, { status: 'inprogress', display: 'LIVE', period: 'Clock fallback' }),
          clockFallback: true
        });
      }
      return event;
    });

    for (const boardRow of scheduleSnapshot) {
      if (date && boardRow.slateDate !== date) continue;
      const timed = timelineStatus(boardRow, now);
      if (timed !== 'live' && timed !== 'finished') continue;
      if (rows.some((event) => eventMatchesRow(event, boardRow))) continue;
      rows.push(syntheticEvent(boardRow, timed));
    }

    return container.set(rows);
  }

  function requestKind(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return '';
      const path = new URL(raw, location.href).pathname;
      if (path.endsWith('/api/dashboard-data')) return 'dashboard';
      if (path.endsWith('/api/bsd/events')) return 'events';
      return '';
    } catch { return ''; }
  }

  window.fetch = async function(input, init) {
    const response = await originalFetch(input, init);
    const kind = requestKind(input);
    if (!kind || !response.ok) return response;
    try {
      let payload = await response.clone().json();
      payload = kind === 'dashboard' ? applyTimelineToDashboard(payload) : applyTimelineToEvents(payload, input);
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(payload), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return response;
    }
  };

  function todayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function selectUpcomingAfterDateChange(button) {
    const nextDate = String(button?.dataset?.date || '');
    if (!nextDate || nextDate < todayKey()) return;
    try { sessionStorage.setItem(STATUS_KEY, 'upcoming'); } catch {}

    const started = Date.now();
    const timer = setInterval(() => {
      const upcoming = document.querySelector('[data-status-filter="upcoming"]');
      if (upcoming) {
        clearInterval(timer);
        if (!upcoming.classList.contains('active')) upcoming.click();
      } else if (Date.now() - started > 2000) {
        clearInterval(timer);
      }
    }, 40);
  }

  function timelineSignature() {
    if (!scheduleSnapshot.length) return '';
    const now = Date.now();
    return scheduleSnapshot.map((row) => `${row.id || row.match}:${timelineStatus(row, now)}`).join('|');
  }

  function refreshOnTimelineChange() {
    const signature = timelineSignature();
    if (!signature || signature === lastTimelineSignature) return;
    const refresh = document.getElementById('refreshToday');
    if (!refresh) return;
    lastTimelineSignature = signature;
    refresh.click();
  }

  document.addEventListener('click', (event) => {
    const dateButton = event.target.closest('.dateBtn[data-date]');
    if (dateButton) setTimeout(() => selectUpcomingAfterDateChange(dateButton), 0);
  });

  setUpcomingDefault();
  setInterval(refreshOnTimelineChange, TIMELINE_POLL_MS);
})();
