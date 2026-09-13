(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const TZ = window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh';
  let syncing = false;
  let lastStatusById = new Map();

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
    const s = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
    if (['live','inprogress','in_progress','playing','ongoing'].includes(s)) return 'live';
    if (['finished','ended','complete','completed','final','ft'].includes(s)) return 'finished';
    if (['postponed','cancelled','canceled','abandoned'].includes(s)) return s;
    return 'upcoming';
  }

  function eventId(event) {
    return String(pick(event?.id, event?.event_id, event?.eventId) ?? '');
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
    return String(pick(event?.time?.period, event?.current_period, event?.period, event?.round_label, '') || '').replace(/_/g, ' ');
  }

  function liveClock(event) {
    const minute = finite(pick(event?.time?.minute, event?.current_minute, event?.minute));
    const display = pick(event?.time?.display, event?.display);
    if (display && !/^0?\d{1,2}:\d{2}$/.test(String(display))) return String(display);
    return minute !== null ? `${minute}′` : 'LIVE';
  }

  function updateRow(row, event) {
    const status = normalizeStatus(pick(event?.status, event?.time?.status));
    const sc = score(event);
    const scoreNode = row.querySelector('.matchScore strong');
    const clockNode = row.querySelector('.matchScore [data-clock]');
    const timeNode = row.querySelector('.matchTime');

    if (scoreNode && sc.home !== null && sc.away !== null) scoreNode.textContent = `${sc.home}–${sc.away}`;

    if (status === 'finished') {
      if (clockNode) clockNode.textContent = 'FT';
      if (timeNode) timeNode.innerHTML = `${formatTime(kickoff(event))}<small>Full time</small>`;
      row.dataset.matchStatus = 'ft';
      row.classList.remove('is-live-row');
      row.classList.add('is-ft-row');
      return;
    }

    if (status === 'live') {
      if (clockNode) clockNode.textContent = liveClock(event);
      if (timeNode) timeNode.innerHTML = `<span class="tag live"><i class="dot bad"></i>LIVE</span><small>${periodLabel(event)}</small>`;
      row.dataset.matchStatus = 'live';
      row.classList.add('is-live-row');
      row.classList.remove('is-ft-row');
      return;
    }

    if (clockNode) clockNode.textContent = formatTime(kickoff(event));
    if (timeNode) timeNode.innerHTML = `${formatTime(kickoff(event))}<small>${periodLabel(event)}</small>`;
    row.dataset.matchStatus = 'scheduled';
    row.classList.remove('is-live-row', 'is-ft-row');
  }

  function refreshKpis() {
    document.querySelectorAll('.kpi').forEach(kpi => {
      const label = kpi.querySelector('span')?.textContent?.trim().toLowerCase();
      const value = kpi.querySelector('strong');
      if (!value) return;
      if (label === 'live') value.textContent = String(document.querySelectorAll('.matchRow[data-match-status="live"]').length);
      if (label === 'matches') value.textContent = String(document.querySelectorAll('.matchRow').length);
    });
  }

  function reassertFinishedRows() {
    document.querySelectorAll('.matchRow[data-live-event]').forEach(row => {
      const status = lastStatusById.get(String(row.dataset.liveEvent || ''));
      if (status !== 'finished') return;
      const clock = row.querySelector('.matchScore [data-clock]');
      if (clock && clock.textContent.trim().toUpperCase() !== 'FT') clock.textContent = 'FT';
      row.dataset.matchStatus = 'ft';
      row.classList.remove('is-live-row');
      row.classList.add('is-ft-row');
      const time = row.querySelector('.matchTime');
      if (time?.querySelector('.tag.live')) time.innerHTML = '<span>FT</span><small>Full time</small>';
    });
  }

  async function syncStatuses() {
    if (syncing || !document.querySelector('.matchRow[data-live-event]')) return;
    syncing = true;
    try {
      const date = selectedDate();
      const response = await fetch(`${API}/api/bsd/events?date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}&limit=200&status_sync=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      const source = payload?.data?.results || payload?.data?.events || [];
      if (!Array.isArray(source)) return;

      const byId = new Map();
      const statuses = new Map();
      for (const event of source) {
        const id = eventId(event);
        if (!id) continue;
        byId.set(id, event);
        statuses.set(id, normalizeStatus(pick(event?.status, event?.time?.status)));
      }
      lastStatusById = statuses;

      document.querySelectorAll('.matchRow[data-live-event]').forEach(row => {
        const event = byId.get(String(row.dataset.liveEvent || ''));
        if (event) updateRow(row, event);
      });
      refreshKpis();
    } catch {
      // Keep the last good board mounted if BSD briefly fails.
    } finally {
      syncing = false;
    }
  }

  const observer = new MutationObserver(() => {
    if (!lastStatusById.size) return;
    queueMicrotask(reassertFinishedRows);
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

  setTimeout(syncStatuses, 1200);
})();
