(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const TZ = window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh';
  let syncing = false;
  let resolved = new Map();

  const pick = (...values) => values.find(v => v !== undefined && v !== null && v !== '') ?? null;
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

  function normalizeStatus(raw) {
    const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['live','inprogress','in_progress','playing','ongoing','ht','halftime','half_time','break','paused','extra_time','penalties','penalty_shootout'].includes(value)) return 'live';
    if (['finished','ended','complete','completed','final','ft','aet','after_extra_time','after_penalties','penalties_finished'].includes(value)) return 'finished';
    if (['postponed','cancelled','canceled','abandoned','suspended'].includes(value)) return value;
    return 'upcoming';
  }

  function eventStatus(event) {
    return normalizeStatus(pick(event?.status, event?.time?.status));
  }

  function eventId(event) {
    return String(pick(event?.id, event?.event_id, event?.eventId) ?? '');
  }

  function norm(value = '') {
    return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function teamName(event, side) {
    const team = event?.[`${side}_team`] || event?.[side] || event?.teams?.[side] || {};
    return String(pick(team?.name, team?.short_name, event?.[`${side}_team_name`], event?.[`${side}_name`], typeof event?.[side] === 'string' ? event[side] : null, '') || '');
  }

  function eventTeamKey(event) {
    const home = norm(teamName(event, 'home'));
    const away = norm(teamName(event, 'away'));
    return home && away ? `${home}|${away}` : '';
  }

  function rowTeamKey(row) {
    const names = [...row.querySelectorAll('.teamLine span')].map(node => norm(node.textContent)).filter(Boolean);
    return names.length >= 2 ? `${names[0]}|${names[1]}` : '';
  }

  function rowsFrom(payload) {
    const data = payload?.data ?? payload;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.events)) return data.events;
    return [];
  }

  function indexEvents(events) {
    const byId = new Map();
    const byTeams = new Map();
    for (const event of events) {
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

  function selectedDate() {
    const active = document.querySelector('.dateBtn.active')?.dataset?.date;
    if (active) return active;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function periodLabel(event) {
    const raw = String(pick(event?.time?.period, event?.current_period, event?.period, '') || '').replace(/_/g, ' ');
    if (raw === '1') return '1st half';
    if (raw === '2') return '2nd half';
    return raw;
  }

  function updateScore(row, event) {
    const current = score(event);
    const node = row.querySelector('.matchScore strong');
    if (node && current.home !== null && current.away !== null) node.textContent = `${current.home}–${current.away}`;
  }

  function livePanel(row) {
    const panel = row.closest('.panel');
    return panel?.querySelector('.panelHead h2')?.textContent?.trim().toLowerCase() === 'live now' ? panel : null;
  }

  function removeFromLivePanel(row) {
    const panel = livePanel(row);
    if (!panel) return false;
    row.remove();
    const remaining = panel.querySelectorAll('.matchRow').length;
    const count = panel.querySelector('.panelHead > span');
    if (count && count.textContent !== String(remaining)) count.textContent = String(remaining);
    if (!remaining) panel.remove();
    return true;
  }

  function applyFinished(row, event) {
    updateScore(row, event);
    const clock = row.querySelector('.matchScore [data-clock]');
    const time = row.querySelector('.matchTime');
    if (clock && clock.textContent.trim().toUpperCase() !== 'FT') clock.textContent = 'FT';
    if (time && !/full time/i.test(time.textContent)) time.innerHTML = `${formatTime(kickoff(event))}<small>Full time</small>`;
    row.dataset.matchStatus = 'ft';
    row.classList.remove('is-live-row');
    row.classList.add('is-ft-row');
    removeFromLivePanel(row);
  }

  function applyLive(row, event) {
    if (eventStatus(event) !== 'live') return;
    updateScore(row, event);
    const minute = finite(pick(event?.time?.minute, event?.current_minute, event?.minute));
    const display = pick(event?.time?.display, event?.display);
    const clockText = display || (minute !== null ? `${minute}′` : 'LIVE');
    const clock = row.querySelector('.matchScore [data-clock]');
    const time = row.querySelector('.matchTime');
    if (clock && clock.textContent !== String(clockText)) clock.textContent = String(clockText);
    if (time) time.innerHTML = `<span class="tag live"><i class="dot bad"></i>LIVE</span><small>${periodLabel(event)}</small>`;
    row.dataset.matchStatus = 'live';
    row.classList.add('is-live-row');
    row.classList.remove('is-ft-row');
  }

  function applyNotLive(row, event) {
    if (livePanel(row)) {
      removeFromLivePanel(row);
      return;
    }
    if (row.dataset.matchStatus === 'ft' || row.classList.contains('is-ft-row')) return;
    updateScore(row, event);
    const clock = row.querySelector('.matchScore [data-clock]');
    const time = row.querySelector('.matchTime');
    const kickoffText = formatTime(kickoff(event));
    if (clock && clock.textContent !== kickoffText) clock.textContent = kickoffText;
    if (time) time.innerHTML = `${kickoffText}<small>Status syncing</small>`;
    row.dataset.matchStatus = 'syncing';
    row.classList.remove('is-live-row', 'is-ft-row');
  }

  function refreshLiveKpi() {
    const panel = [...document.querySelectorAll('.panel')].find(item => item.querySelector('.panelHead h2')?.textContent?.trim().toLowerCase() === 'live now');
    const count = panel ? panel.querySelectorAll('.matchRow').length : 0;
    document.querySelectorAll('.kpi').forEach(kpi => {
      if (kpi.querySelector('span')?.textContent?.trim().toLowerCase() !== 'live') return;
      const value = kpi.querySelector('strong');
      if (value && value.textContent !== String(count)) value.textContent = String(count);
    });
  }

  function remember(row, status, event, next) {
    const id = String(row.dataset.liveEvent || '');
    const key = rowTeamKey(row);
    const value = { status, event };
    if (id) next.set(id, value);
    if (key) next.set(key, value);
  }

  function reassert() {
    document.querySelectorAll('.matchRow[data-live-event]').forEach(row => {
      const state = resolved.get(String(row.dataset.liveEvent || '')) || resolved.get(rowTeamKey(row));
      if (!state) return;
      if (state.status === 'finished') applyFinished(row, state.event);
      else if (state.status === 'live') applyLive(row, state.event);
      else if (state.status === 'syncing') applyNotLive(row, state.event);
    });
    refreshLiveKpi();
  }

  async function sync() {
    if (syncing || !document.querySelector('.matchRow[data-live-event]')) return;
    syncing = true;
    try {
      const stamp = Date.now();
      const date = selectedDate();
      const [liveResult, dayResult] = await Promise.allSettled([
        fetch(`${API}/api/bsd/live?status_sync=${stamp}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`live ${r.status}`))),
        fetch(`${API}/api/bsd/events?date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}&limit=200&status_sync=${stamp}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : Promise.reject(new Error(`events ${r.status}`)))
      ]);

      const liveOk = liveResult.status === 'fulfilled';
      const liveIndex = indexEvents(liveOk ? rowsFrom(liveResult.value) : []);
      const dayIndex = indexEvents(dayResult.status === 'fulfilled' ? rowsFrom(dayResult.value) : []);
      const next = new Map(resolved);

      document.querySelectorAll('.matchRow[data-live-event]').forEach(row => {
        const liveEvent = lookup(liveIndex, row);
        const dayEvent = lookup(dayIndex, row);

        if (liveEvent) {
          const status = eventStatus(liveEvent);
          if (status === 'finished') {
            applyFinished(row, liveEvent);
            remember(row, 'finished', liveEvent, next);
            return;
          }
          if (status === 'live') {
            applyLive(row, liveEvent);
            remember(row, 'live', liveEvent, next);
            return;
          }
        }

        // A successful /live response is authoritative for membership in the Live now panel.
        if (liveOk && livePanel(row) && !liveEvent) {
          removeFromLivePanel(row);
          return;
        }

        if (!dayEvent) return;
        const dayStatus = eventStatus(dayEvent);
        if (dayStatus === 'finished') {
          applyFinished(row, dayEvent);
          remember(row, 'finished', dayEvent, next);
          return;
        }
        if (dayStatus === 'live') {
          if (liveOk && !liveEvent) {
            applyNotLive(row, dayEvent);
            remember(row, 'syncing', dayEvent, next);
          } else {
            applyLive(row, dayEvent);
            remember(row, 'live', dayEvent, next);
          }
        }
      });

      resolved = next;
      refreshLiveKpi();
    } finally {
      syncing = false;
    }
  }

  const app = document.getElementById('app');
  if (!app) return;

  new MutationObserver(() => {
    if (resolved.size) queueMicrotask(reassert);
  }).observe(app, { childList: true, subtree: true, characterData: true });

  window.addEventListener('focus', sync);
  window.addEventListener('hashchange', () => setTimeout(sync, 0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync();
  });
  document.addEventListener('click', event => {
    if (event.target.closest('.dateBtn')) setTimeout(sync, 0);
  });

  setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, 10000);

  setTimeout(sync, 900);
})();
