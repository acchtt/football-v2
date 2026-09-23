(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const TZ = window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh';
  const root = document.getElementById('app');
  if (!root) return;

  const state = {
    route: '',
    live: [],
    today: [],
    date: todayKey(),
    board: null,
    error: '',
    lastSync: 0,
    refreshTick: 0,
    statusFilter: readStore('sliptrace.statusFilter.v3', 'all', sessionStorage),
    signalFilter: readStore('sliptrace.signalFilter.v3', 'all', localStorage),
    pickFilter: readStore('sliptrace.pickFilter.v3', 'open', sessionStorage),
    matchClockAnchor: new Map(),
    matchdayCache: new Map(),
    matchdayRequest: 0,
    boardPromise: null,
    clockTimer: null,
    liveTimer: null
  };

  function readStore(key, fallback, storage) {
    try { return storage.getItem(key) || fallback; } catch { return fallback; }
  }
  function writeStore(key, value, storage) {
    try { storage.setItem(key, value); } catch {}
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
    });
  }
  function arr(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value && value.results)) return value.results;
    if (Array.isArray(value && value.events)) return value.events;
    return [];
  }
  function obj(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
  function num(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  function pick() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = arguments[i];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }
  function todayKey(offset) {
    const d = new Date(Date.now() + (offset || 0) * 86400000);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const get = function (type) {
      const hit = parts.find(function (part) { return part.type === type; });
      return hit ? hit.value : '';
    };
    return get('year') + '-' + get('month') + '-' + get('day');
  }
  function formatTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(d);
  }
  function formatDate(value, long) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: long ? 'long' : 'short',
      month: long ? 'long' : 'short',
      day: 'numeric'
    }).format(d);
  }
  function teamObj(event, side) {
    return obj(event && pick(event[side + '_team'], event[side]));
  }
  function teamName(event, side) {
    const team = teamObj(event, side);
    return pick(
      team.name, team.short_name,
      event && event[side + '_team_name'],
      event && typeof event[side + '_team'] === 'string' ? event[side + '_team'] : null,
      event && event[side + '_name'],
      event && typeof event[side] === 'string' ? event[side] : null,
      side.toUpperCase()
    );
  }
  function teamId(event, side) {
    const team = teamObj(event, side);
    return num(pick(team.id, event && event[side + '_team_id'], event && event[side + '_id']));
  }
  function eventId(event) {
    return num(pick(event && event.id, event && event.event_id));
  }
  function leagueObj(event) {
    return obj(event && event.league);
  }
  function leagueId(event) {
    return num(pick(event && event.league_id, leagueObj(event).id));
  }
  function leagueName(event) {
    return pick(leagueObj(event).name, event && event.league_name, event && event.competition_name, 'Competition');
  }
  function eventKickoff(event) {
    return pick(
      event && event.event_date,
      event && event.kickoff,
      event && event.kickoff_at,
      event && event.date,
      event && event.time && event.time.kickoff_at
    );
  }
  function score(event) {
    const nested = obj(event && event.score);
    return {
      home: num(pick(event && event.home_score, nested.home, nested.home_score)),
      away: num(pick(event && event.away_score, nested.away, nested.away_score))
    };
  }
  function eventTime(event) {
    return obj(event && event.time);
  }
  function eventStatus(event) {
    const value = String(pick(event && event.status, eventTime(event).status, 'upcoming')).toLowerCase();
    if (['ended','complete','completed','final','ft'].includes(value)) return 'finished';
    if (['inprogress','in_progress','playing','ongoing'].includes(value)) return 'live';
    return value;
  }
  function statusKey(event) {
    if (eventStatus(event) === 'live') return 'live';
    if (['finished','ft','ended','complete','completed'].includes(eventStatus(event))) return 'finished';
    return 'upcoming';
  }
  function isLive(event) { return statusKey(event) === 'live'; }
  function isFinished(event) { return statusKey(event) === 'finished'; }
  function image(type, id, transparent) {
    if (!id) return '';
    return 'https://sports.bzzoiro.com/img/' + type + '/' + id + '/' + (transparent === false ? '' : '?bg=transparent');
  }
  function unwrap(payload) {
    return payload && payload.data !== undefined ? payload.data : payload;
  }
  function rows(payload) {
    return arr(unwrap(payload));
  }
  async function api(path, options) {
    const response = await fetch(API + path, Object.assign({cache:'no-store'}, options || {}));
    const payload = await response.json().catch(function () { return null; });
    if (!response.ok || (payload && payload.ok === false)) {
      throw new Error(pick(payload && payload.error, payload && payload.detail, 'HTTP ' + response.status));
    }
    return payload;
  }

  function normalizeName(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function splitMatch(value) {
    const text = String(value || '');
    const patterns = [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/, /\s+-\s+/];
    for (let i = 0; i < patterns.length; i += 1) {
      const parts = text.split(patterns[i]).map(function (item) { return item.trim(); }).filter(Boolean);
      if (parts.length === 2) return {home: parts[0], away: parts[1]};
    }
    return {home: text, away: ''};
  }
  function nameScore(a, b) {
    const left = normalizeName(a);
    const right = normalizeName(b);
    if (!left || !right) return 0;
    if (left === right) return 6;
    if (left.includes(right) || right.includes(left)) return 4;
    const aa = new Set(left.split(' '));
    const bb = new Set(right.split(' '));
    let overlap = 0;
    aa.forEach(function (token) { if (bb.has(token)) overlap += 1; });
    const ratio = overlap / Math.max(aa.size, bb.size);
    return ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : 0;
  }
  function boardRowFor(event) {
    const rows = state.board && Array.isArray(state.board.schedule) ? state.board.schedule : [];
    return rows.map(function (row) {
      const teams = splitMatch(row.match);
      return {
        row: row,
        score: nameScore(teams.home, teamName(event, 'home')) + nameScore(teams.away, teamName(event, 'away'))
      };
    }).filter(function (item) {
      return item.score >= 6;
    }).sort(function (a, b) {
      return b.score - a.score;
    })[0]?.row || null;
  }
  function picksFor(event) {
    const picks = state.board && Array.isArray(state.board.picks) ? state.board.picks : [];
    return picks.filter(function (row) {
      const teams = splitMatch(row.match);
      return nameScore(teams.home, teamName(event, 'home')) + nameScore(teams.away, teamName(event, 'away')) >= 6;
    });
  }
  function eventForBoardRow(row) {
    const teams = splitMatch(row.match);
    return state.today.find(function (event) {
      return nameScore(teams.home, teamName(event, 'home')) + nameScore(teams.away, teamName(event, 'away')) >= 6;
    }) || null;
  }

  function routeName() {
    const hash = location.hash || '#board';
    if (/^#match\//.test(hash)) return 'match';
    if (/^#league\//.test(hash)) return 'league';
    if (/^#team\//.test(hash)) return 'team';
    if (/^#search\//.test(hash)) return 'search';
    return hash.slice(1) || 'board';
  }
  function routeGroup(route) {
    if (route === 'board' || route === 'today' || route === 'match') return 'board';
    if (route === 'picks') return 'picks';
    return 'explore';
  }
  function navigationIcon(name) {
    const icons = {
      board: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10.5V20h13v-9.5"></path><path d="M9.5 20v-5.5h5V20"></path>',
      picks: '<path d="M5 19V9"></path><path d="M12 19V5"></path><path d="M19 19v-7"></path><path d="m4 6 4-3 4 3 5-4 3 2"></path>',
      leagues: '<path d="M8 4h8v3.5a4 4 0 0 1-8 0V4Z"></path><path d="M8 6H4v1.5A4.5 4.5 0 0 0 8.5 12"></path><path d="M16 6h4v1.5a4.5 4.5 0 0 1-4.5 4.5"></path><path d="M12 12v4"></path><path d="M8 20h8"></path><path d="M9 16h6v4H9z"></path>',
      teams: '<circle cx="9" cy="8" r="3"></circle><circle cx="17" cy="9" r="2.5"></circle><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13a5.5 5.5 0 0 1 5.5 5.5V20"></path><path d="M14.5 14.5A4.5 4.5 0 0 1 21 18.5V20"></path>'
    };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (icons[name] || icons.board) + '</svg>';
  }
  function navItem(route, label, href, icon) {
    const active = route === 'board' ? routeGroup(state.route) === 'board' :
      route === 'picks' ? state.route === 'picks' :
      route === 'leagues' ? (state.route === 'leagues' || state.route === 'league') :
      route === 'teams' ? (state.route === 'teams' || state.route === 'team') : false;
    return '<a class="navItem ' + (active ? 'active' : '') + '" href="' + href + '"' +
      (active ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + navigationIcon(icon) +
      '</span><b>' + label + '</b></a>';
  }
  function navigation(className) {
    return '<nav class="' + className + '" aria-label="Primary navigation">' +
      navItem('board', 'Board', '#board', 'board') +
      navItem('picks', 'Picks', '#picks', 'picks') +
      navItem('leagues', 'Competitions', '#leagues', 'leagues') +
      navItem('teams', 'Teams', '#teams', 'teams') +
      '</nav>';
  }
  function header() {
    const menu = '<details class="siteMenu"><summary><span>Browse</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg></summary>' +
      '<div class="siteMenuPanel"><form id="globalSearch" class="siteMenuSearch" role="search">' +
      '<input type="search" autocomplete="off" aria-label="Search teams or competitions" placeholder="Search teams or competitions">' +
      '<button type="submit">Search</button></form>' + navigation('headerMenuNav') +
      '<button type="button" class="siteMenuAction" data-open-alerts>Alerts</button></div></details>';
    return '<header class="appHeader"><div class="headerInner">' +
      '<a class="brand" href="#board"><span class="brandMark"><img src="./icons/arc-xi-transparent-512.png?v=2" alt=""></span><span class="brandWords"><b>ARC XI</b><small>Live football · Match intelligence</small></span></a>' +
      menu + '</div></header>';
  }
  function shell(content, context, className) {
    return header() + '<div class="appFrame ' + esc(className || '') + '">' +
      '<div class="contentFrame"><main class="mainView">' + content + '</main>' +
      (context ? '<aside class="contextRail">' + context + '</aside>' : '') +
      '</div></div>' + navigation('mobileNav');
  }
  function pageTitle(eyebrow, title, description, actions) {
    return '<div class="pageTop"><div><span class="eyebrow">' + esc(eyebrow) + '</span><h1>' + esc(title) +
      '</h1>' + (description ? '<p>' + esc(description) + '</p>' : '') + '</div>' +
      (actions ? '<div class="pageActions">' + actions + '</div>' : '') + '</div>';
  }
  function matchdayHero() {
    return '<section class="matchdayHero" aria-label="IVE × Football campaign artwork">' +
      '<img src="./media/ive/matchday-hero-v4.avif?v=1" alt="" aria-hidden="true" width="1916" height="821" fetchpriority="high"></section>';
  }
  function sectionHead(title, meta, actions) {
    return '<div class="sectionHead"><div><h2>' + esc(title) + '</h2>' +
      (meta ? '<span>' + esc(meta) + '</span>' : '') + '</div>' +
      (actions || '') + '</div>';
  }
  function boardDateCount(date) {
    return (state.board && Array.isArray(state.board.schedule) ? state.board.schedule : []).filter(function (row) {
      const tier = String(row.tier || '').toUpperCase();
      return row.slateDate === date && (tier === 'FOCUS' || tier === 'WATCHLIST');
    }).length;
  }
  function dateStrip() {
    let html = '<div class="dateStrip" aria-label="Match date">';
    [-3,-2,-1,0,1,2,3].forEach(function (offset) {
      const date = todayKey(offset);
      const d = new Date(date + 'T12:00:00Z');
      const weekday = offset === 0 ? 'Today' : new Intl.DateTimeFormat('en-US', {weekday:'short',timeZone:'UTC'}).format(d);
      const count = boardDateCount(date);
      const active = state.date === date;
      const unavailable = count === 0 && !active;
      const label = weekday + ' ' + d.getUTCDate() + ' ' +
        new Intl.DateTimeFormat('en-US', {month:'short',timeZone:'UTC'}).format(d);
      html += '<button type="button" class="dateBtn ' + (active ? 'active ' : '') + (unavailable ? 'unavailable' : '') +
        '" data-date="' + date + '" aria-label="' + esc(label + (count ? ', ' + count + ' board matches' : ', no ranked board matches')) +
        '" aria-pressed="' + active + '"' + (unavailable ? ' disabled' : '') + '><small>' + weekday + '</small><strong>' +
        d.getUTCDate() + '</strong><span>' + new Intl.DateTimeFormat('en-US', {month:'short',timeZone:'UTC'}).format(d) +
        '</span>' + (count ? '<b class="dateCount">' + count + '</b>' : '') + '</button>';
    });
    return html + '</div>';
  }

  function anchorClock(event) {
    const id = eventId(event);
    if (!id) return null;
    const time = eventTime(event);
    const minute = num(pick(time.minute, event.minute, event.current_minute));
    const second = num(pick(time.second, event.second, event.current_second)) || 0;
    if (minute === null) return null;
    const key = String(id);
    const signature = minute + ':' + second + ':' + eventStatus(event) + ':' + pick(time.period, event.period, '');
    const current = state.matchClockAnchor.get(key);
    if (!current || current.signature !== signature) {
      state.matchClockAnchor.set(key, {minute:minute, second:second, at:Date.now(), signature:signature});
    }
    return state.matchClockAnchor.get(key);
  }
  function statusLabel(event) {
    if (isFinished(event)) return 'FT';
    if (isLive(event)) {
      const time = eventTime(event);
      return pick(time.display, time.minute !== undefined ? time.minute + '′' : null, 'LIVE');
    }
    const status = eventStatus(event);
    if (status === 'postponed') return 'PP';
    if (status === 'cancelled' || status === 'canceled') return 'CANC';
    return formatTime(eventKickoff(event));
  }
  function liveClock(event) {
    if (!isLive(event)) return statusLabel(event);
    const anchor = anchorClock(event);
    if (!anchor) return statusLabel(event);
    const total = anchor.minute * 60 + anchor.second + Math.max(0, Math.floor((Date.now() - anchor.at) / 1000));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  function scoreText(event) {
    const current = score(event);
    if (current.home !== null && current.away !== null) return current.home + '–' + current.away;
    return 'VS';
  }
  function signalClass(grade) {
    const value = String(grade || '').toUpperCase();
    if (value.startsWith('A')) return 'gradeA';
    if (value.startsWith('B')) return 'gradeB';
    if (value.startsWith('C')) return 'gradeC';
    return 'gradeNeutral';
  }
  function crest(type, id, name, transparent) {
    if (!id) return '<span class="crestFallback" aria-hidden="true">' + esc(String(name || '?').slice(0, 1)) + '</span>';
    return '<img src="' + image(type, id, transparent) + '" alt="" loading="lazy">';
  }
  function matchRow(event) {
    const id = eventId(event);
    const board = boardRowFor(event);
    const tier = String(board && board.tier || '').toUpperCase();
    const grade = board && board.grade || '—';
    const status = statusKey(event);
    const href = id ? '#match/' + id : '#board';
    const period = pick(eventTime(event).period, event.round_label, '');
    return '<a class="matchRow is-' + status + '-row" href="' + href + '" data-live-event="' + (id || '') +
      '" data-match-status="' + status + '" data-signal-tier="' + esc(tier) + '">' +
      '<div class="matchTime">' +
        (status === 'live' ? '<span class="liveLabel"><i></i>LIVE</span>' : '<strong>' + esc(formatTime(eventKickoff(event))) + '</strong>') +
        '<small>' + esc(period) + '</small></div>' +
      '<div class="teams">' +
        '<div class="teamLine">' + crest('team', teamId(event, 'home'), teamName(event, 'home')) + '<span>' + esc(teamName(event, 'home')) + '</span></div>' +
        '<div class="teamLine">' + crest('team', teamId(event, 'away'), teamName(event, 'away')) + '<span>' + esc(teamName(event, 'away')) + '</span></div>' +
        '<div class="matchCompetition">' + esc(leagueName(event)) + '</div></div>' +
      '<div class="matchMeta">' +
        (board ? '<span class="signalBadge ' + signalClass(grade) + '"><b>' + esc(grade) + '</b><small>' + esc(tier || 'MODEL') + '</small></span>' :
          event.websocket_plus ? '<span class="sourceBadge">WS+</span>' : '<span class="sourceBadge muted">BSD</span>') +
      '</div>' +
      '<div class="matchScore"><strong>' + esc(scoreText(event)) + '</strong><small data-clock data-clock-id="' + (id || '') + '">' +
        esc(isLive(event) ? liveClock(event) : statusLabel(event)) + '</small></div></a>';
  }
  function boardStatus(row) {
    const event = eventForBoardRow(row);
    if (event) return statusKey(event);
    const declared = String(row && (row.status || row.matchStatus) || '').toLowerCase();
    if (['finished','ft','ended','complete','completed','final'].includes(declared)) return 'finished';
    const kickoff = Date.parse(row && (row.kickoff || row.displayKickoff));
    if (Number.isFinite(kickoff) && Date.now() > kickoff + 3 * 60 * 60 * 1000) return 'finished';
    return 'upcoming';
  }
  function boardKickoff(row) {
    const event = eventForBoardRow(row);
    return event ? eventKickoff(event) : row && (row.kickoff || row.displayKickoff);
  }
  function boardMatchBlock(row, index) {
    const event = eventForBoardRow(row);
    const id = event && eventId(event);
    const unsupported = !id;
    const status = event ? statusKey(event) : boardStatus(row);
    const tier = String(row.tier || 'WATCHLIST').toUpperCase();
    const tierClass = tier === 'FOCUS' ? 'tier-focus' : 'tier-watchlist';
    const grade = row.grade || '—';
    const teams = event ? {
      home: teamName(event, 'home'),
      away: teamName(event, 'away')
    } : splitMatch(row.match);
    const kickoff = boardKickoff(row);
    const competition = row.competition || (event && leagueName(event)) || 'Competition';
    const lid = event && leagueId(event);
    const hasManualScore = unsupported && row.manualScore &&
      Number.isInteger(Number(row.manualScore.home)) && Number.isInteger(Number(row.manualScore.away));
    const finished = status === 'finished';
    const primary = hasManualScore ? Number(row.manualScore.home) + '–' + Number(row.manualScore.away) :
      finished && !unsupported ? scoreText(event) : finished ? '—' : status === 'live' ? scoreText(event) : formatTime(kickoff);
    const secondary = hasManualScore ? (finished ? 'Manual FT' : 'Manual score') :
      finished ? (unsupported ? 'Score needed' : 'Full time') : status === 'live' ? liveClock(event) : unsupported ? 'No BSD feed' : 'ICT kickoff';
    const statusName = hasManualScore ? 'Custom' : finished ? 'FT' : status === 'live' ? 'LIVE' : 'PRE';
    const statusClass = hasManualScore ? 'manual' : status;
    const manualKey = encodeURIComponent(String(row.match || '') + '||' + String(row.kickoff || row.displayKickoff || ''));
    const attrs = 'class="matchRow boardFixture is-' + status + '-row ' + (unsupported ? 'boardPendingRow' : '') + '" ' +
      (id ? 'href="#match/' + id + '" ' : '') +
      'data-live-event="' + (id || '') + '" data-match-status="' + status + '" data-signal-tier="' + esc(tier) + '"';
    const open = id ? '<a ' + attrs + '>' : '<div ' + attrs + '>';
    const close = id ? '</a>' : '</div>';
    const stateIcon = hasManualScore ?
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 4 4 12-12-4-4L4 16Z"></path><path d="m13 7 4 4M4 20l5-1"></path></svg>' :
      finished ?
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"></path><path d="M6 5h11l-2 4 2 4H6"></path></svg>' :
      status === 'live' ?
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"></path></svg>' :
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v5l3 2"></path></svg>';
    const manualControl = unsupported ?
      '<button type="button" class="manualScoreButton" data-manual-score="' + esc(manualKey) + '">' +
      (hasManualScore ? 'Edit score' : 'Add score') + '</button>' : '';
    return '<article class="boardMatchCard ' + tierClass + '">' + open +
      '<div class="fixtureMatch"><div class="fixtureTeams"><div class="teamLine home">' +
      crest('team', event && teamId(event, 'home'), teams.home || 'Home') + '<span>' + esc(teams.home || 'Home') + '</span></div>' +
      '<div class="fixtureState"><span class="fixtureStatus ' + statusClass + '">' + stateIcon + esc(statusName) + '</span>' +
      '<strong>' + esc(primary) + '</strong><small data-clock data-clock-id="' + (id || '') + '">' + esc(secondary) + '</small>' +
      manualControl + '</div>' +
      '<div class="teamLine away">' +
      crest('team', event && teamId(event, 'away'), teams.away || 'Away') + '<span>' + esc(teams.away || 'Away') + '</span></div></div>' +
      '<span class="fixtureCompetition">' + (lid ? '<img src="' + image('league', lid) + '" alt="" loading="lazy">' : '') +
      '<b>' + esc(competition) + '</b></span></div>' +
      '<div class="fixtureSignal"><small>' + esc(tier) + '</small><strong>' + esc(grade) + '</strong><span>MODEL</span></div>' +
      (id ? '<span class="fixtureArrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></span>' : '') +
      close + '</article>';
  }
  function boardMatchList(boardRows) {
    const groups = new Map();
    boardRows.forEach(function (row) {
      const event = eventForBoardRow(row);
      const name = row.competition || (event && leagueName(event)) || 'Competition';
      const id = event && leagueId(event);
      const key = String(id || '') + ':' + name;
      if (!groups.has(key)) groups.set(key, {name:name, id:id, event:event, rows:[]});
      groups.get(key).rows.push(row);
    });
    return '<div class="boardCompetitionList">' + Array.from(groups.values()).map(function (group) {
      return '<section class="boardCompetitionGroup"><header class="boardCompetitionHead">' +
        (group.id ? '<img src="' + image('league', group.id) + '" alt="" loading="lazy">' : '<span class="competitionMark" aria-hidden="true">◆</span>') +
        '<strong>' + esc(group.name) + '</strong><span>' + group.rows.length + ' match' + (group.rows.length === 1 ? '' : 'es') + '</span>' +
        (group.id ? '<a href="#league/' + group.id + '">View league <span aria-hidden="true">›</span></a>' : '') + '</header>' +
        '<div class="matchList boardMatchList chronologicalBoardList">' +
        group.rows.map(function (row, index) { return boardMatchBlock(row, index); }).join('') + '</div></section>';
    }).join('') + '</div>';
  }

  function groupedMatches(events) {
    const groups = new Map();
    events.forEach(function (event) {
      const key = (leagueId(event) || 0) + ':' + leagueName(event);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(event);
    });
    let html = '';
    groups.forEach(function (group) {
      const event = group[0];
      const lid = leagueId(event);
      html += '<section class="competitionGroup"><header class="competitionHead">' +
        (lid ? '<img src="' + image('league', lid) + '" alt="" loading="lazy">' : '') +
        '<div><strong>' + esc(leagueName(event)) + '</strong><span>' + group.length + ' match' + (group.length === 1 ? '' : 'es') + '</span></div>' +
        (lid ? '<a href="#league/' + lid + '">Competition</a>' : '') + '</header>' +
        '<div class="matchList">' + group.map(matchRow).join('') + '</div></section>';
    });
    return html;
  }

  function boardRowsForDate() {
    return (state.board && Array.isArray(state.board.schedule) ? state.board.schedule : []).filter(function (row) {
      return row.slateDate === state.date;
    });
  }
  function currentFollowed() {
    try { return Object.values(JSON.parse(localStorage.getItem('sliptrace.followedMatches.v2') || '{}') || {}); }
    catch { return []; }
  }
  function countdownText(value) {
    const kickoff = Date.parse(value);
    if (!Number.isFinite(kickoff)) return 'Kickoff pending';
    const minutes = Math.max(0, Math.ceil((kickoff - Date.now()) / 60000));
    if (minutes < 1) return 'Starting now';
    if (minutes < 60) return 'Starts in ' + minutes + 'm';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return 'Starts in ' + hours + 'h' + (rest ? ' ' + rest + 'm' : '');
    return 'Starts in ' + Math.floor(hours / 24) + 'd';
  }
  function contextClock(counts) {
    const now = new Date();
    const safeCounts = counts || {live:0,upcoming:0,finished:0};
    return '<section class="contextClock"><div><span data-context-date>' + esc(new Intl.DateTimeFormat('en-US', {
      timeZone:TZ, weekday:'short', month:'short', day:'numeric', year:'numeric'
    }).format(now)) + '</span><strong data-context-clock>' + esc(new Intl.DateTimeFormat('en-GB', {
      timeZone:TZ, hour:'2-digit', minute:'2-digit', hour12:false
    }).format(now)) + '</strong><small>ICT · GMT+7 · BSD ' + (state.error ? 'DELAYED' : 'LIVE') + '</small></div>' +
      '<i aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"></path></svg></i>' +
      '<div class="railPulse" aria-label="Slate status"><span><b>' + safeCounts.live + '</b> live</span><span><b>' +
      safeCounts.upcoming + '</b> upcoming</span><span><b>' + safeCounts.finished + '</b> FT</span></div></section>';
  }
  function priorityBoardRow(boardRows) {
    const rows = Array.isArray(boardRows) ? boardRows : [];
    const choose = function (status, tier) {
      return rows.find(function (row) {
        return boardStatus(row) === status && String(row.tier || '').toUpperCase() === tier;
      });
    };
    return choose('live','FOCUS') || choose('live','WATCHLIST') ||
      choose('upcoming','FOCUS') || choose('upcoming','WATCHLIST') || null;
  }
  function matchdayDecision(boardRows) {
    const row = priorityBoardRow(boardRows);
    if (!row) {
      return '<section class="railDecision railDecisionEmpty"><header><span>Next decision</span><b>Slate clear</b></header>' +
        '<p>No live or upcoming ranked match on this date.</p></section>';
    }
    const event = eventForBoardRow(row);
    const id = event && eventId(event);
    const status = event ? statusKey(event) : boardStatus(row);
    const tier = String(row.tier || 'WATCHLIST').toUpperCase();
    const grade = row.grade || '—';
    const teams = event ? {home:teamName(event,'home'),away:teamName(event,'away')} : splitMatch(row.match);
    const kickoff = boardKickoff(row);
    const competition = row.competition || (event && leagueName(event)) || 'Competition';
    const live = status === 'live';
    const primary = live && event ? scoreText(event) : formatTime(kickoff);
    const secondary = live && event ? liveClock(event) : countdownText(kickoff);
    const label = live ? 'Live priority' : tier === 'FOCUS' ? 'Next focus' : 'Next watchlist';
    const body = '<header><span>' + esc(label) + '</span><b class="' + (tier === 'FOCUS' ? 'focus' : 'watch') + '">' +
      esc(tier) + ' · ' + esc(grade) + '</b></header><div class="railDecisionCompetition">' + esc(competition) + '</div>' +
      '<div class="railDecisionTeams"><div>' + crest('team', event && teamId(event,'home'), teams.home || 'Home') +
      '<span>' + esc(teams.home || 'Home') + '</span></div><div>' + crest('team', event && teamId(event,'away'), teams.away || 'Away') +
      '<span>' + esc(teams.away || 'Away') + '</span></div></div>' +
      '<div class="railDecisionState"><strong>' + esc(primary) + '</strong><span data-countdown="' + esc(kickoff || '') + '">' +
      esc(secondary) + '</span></div><footer>' + (id ? 'Open match' : 'Ranked slate') +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg></footer>';
    return '<section class="railDecision">' + (id ? '<a href="#match/' + id + '">' + body + '</a>' : body) + '</section>';
  }
  function matchdayMedia() {
    return '<section class="railMedia"><button type="button" data-open-youtube>' +
      '<span class="railMediaIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5V7Z"></path></svg></span>' +
      '<span class="railMediaCopy"><small>Matchday mix</small><strong>Official IVE playlist</strong><em>Open the player below the board</em></span>' +
      '<svg class="railMediaArrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>' +
      '</button></section>';
  }
  function matchdayContext(boardRows, counts) {
    return '<div class="matchIntelligenceRail">' + contextClock(counts) + matchdayDecision(boardRows) + matchdayMedia() + '</div>';
  }
  function renderMatchday() {
    state.route = 'board';
    const boardRows = boardRowsForDate().filter(function (row) {
      const tier = String(row.tier || '').toUpperCase();
      return tier === 'FOCUS' || tier === 'WATCHLIST';
    }).sort(function (a, b) {
      const left = Date.parse(boardKickoff(a));
      const right = Date.parse(boardKickoff(b));
      if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
      if (!Number.isFinite(left)) return 1;
      if (!Number.isFinite(right)) return -1;
      return left - right;
    });
    const counts = {
      all: boardRows.length,
      live: boardRows.filter(function (row) { return boardStatus(row) === 'live'; }).length,
      upcoming: boardRows.filter(function (row) { return boardStatus(row) === 'upcoming'; }).length,
      finished: boardRows.filter(function (row) { return boardStatus(row) === 'finished'; }).length
    };
    const filtered = boardRows.filter(function (row) {
      if (state.statusFilter !== 'all' && boardStatus(row) !== state.statusFilter) return false;
      const tier = String(row.tier || '').toUpperCase();
      if (state.signalFilter === 'focus') return tier === 'FOCUS';
      if (state.signalFilter === 'watchlist') return tier === 'WATCHLIST';
      return true;
    });
    const statusButton = function (key, label) {
      return '<button type="button" class="' + (state.statusFilter === key ? 'active' : '') + '" data-status-filter="' + key +
        '" aria-pressed="' + (state.statusFilter === key) + '"><span>' + label + '</span><b>' + counts[key] + '</b></button>';
    };
    const signalButton = function (key, label) {
      return '<button type="button" class="' + (state.signalFilter === key ? 'active' : '') + '" data-signal-filter="' + key +
        '" aria-pressed="' + (state.signalFilter === key) + '"><span>' + label + '</span>' +
        (state.signalFilter === key ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"></path></svg>' : '') + '</button>';
    };
    const signalLabel = state.signalFilter === 'focus' ? 'Focus' : state.signalFilter === 'watchlist' ? 'Watchlist' : 'All signals';
    const controls = '<div class="filterBar"><div class="statusFilters" role="group" aria-label="Match status">' +
      statusButton('all','All') + statusButton('live','Live') + statusButton('upcoming','Upcoming') + statusButton('finished','FT') +
      '</div><div class="filterActions"><details class="modelFilter"><summary><span>Model</span><b>' + signalLabel +
      '</b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg></summary>' +
      '<div class="modelFilterMenu" role="group" aria-label="Model signal">' +
      signalButton('all','All signals') + signalButton('focus','Focus') + signalButton('watchlist','Watchlist') +
      '<p><b>Focus</b> is the strongest ranked slate. <b>Watchlist</b> keeps secondary candidates visible.</p></div></details>' +
      '<button class="syncBoardButton" id="refreshToday" type="button" aria-label="Sync board">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5"></path><path d="M19 12a7 7 0 1 0-2 5"></path></svg><span>Sync</span></button></div></div>';
    const boardBody = state.error && !boardRows.length ?
      '<div class="emptyState connectionEmpty"><strong>Board data unavailable</strong><span>Live football data could not be confirmed. ARC XI will retry without treating this as a zero-match day.</span></div>' :
      filtered.length ? boardMatchList(filtered) : boardRows.length ?
        '<div class="emptyState"><strong>No matches for this filter</strong><span>Reset the filters to return to the full ranked slate.</span>' +
        '<button type="button" class="emptyAction" data-reset-board-filters>Show all matches</button></div>' :
        '<div class="emptyState"><strong>No ranked Board matches</strong><span>No Focus or Watchlist entries were added for this date.</span></div>';
    const content = matchdayHero() +
      (state.error ? '<div class="statusBanner"><b>Board data delayed.</b><span>' + esc(state.error) + '</span></div>' : '') +
      dateStrip() + controls + '<section class="matchSection">' + sectionHead('Board matches', filtered.length + ' shown') +
      boardBody + '</section>';
    root.innerHTML = shell(content, matchdayContext(boardRows, counts), 'boardHomeRoute');
    bindGlobal();
  }

  function skeleton(route, title) {
    state.route = route;
    const rows = Array.from({length:6}, function () { return '<div class="skeletonRow"></div>'; }).join('');
    root.innerHTML = shell(pageTitle('Loading', title || 'ARC XI', 'Retrieving the latest football data.'), '<section class="railSection"><div class="skeletonBlock"></div></section>', 'loadingRoute') +
      '';
    const host = root.querySelector('.mainView');
    if (host) host.insertAdjacentHTML('beforeend', '<section class="matchSection">' + rows + '</section>');
    bindGlobal();
  }
  async function loadBoard(force) {
    if (state.board && !force) return state.board;
    if (state.boardPromise && !force) return state.boardPromise;
    const request = api('/api/dashboard-data' + (force ? '?refresh=' + Date.now() : ''));
    state.boardPromise = request;
    try {
      state.board = await request;
      return state.board;
    } catch {
      return state.board;
    } finally {
      if (state.boardPromise === request) state.boardPromise = null;
    }
  }
  async function loadMatchday(date, silent, force) {
    const requestedDate = date || state.date;
    const requestId = ++state.matchdayRequest;
    const cached = state.matchdayCache.get(requestedDate);
    const cacheAge = cached ? Date.now() - cached.loadedAt : Infinity;
    const cacheTtl = requestedDate === todayKey() ? 60000 : 600000;
    const fresh = cached && cacheAge < cacheTtl;

    state.date = requestedDate;
    state.error = '';
    state.today = cached ? cached.events.slice() : [];
    if (requestedDate !== todayKey()) state.live = [];

    if (!silent && !state.today.length && !state.board) {
      skeleton('board', 'Loading decision board');
    } else if (routeName() === 'board') {
      renderMatchday();
    }

    if (fresh && !force) {
      if (!state.board) await loadBoard(false);
      if (routeName() === 'board' && state.date === requestedDate) renderMatchday();
      return state.today;
    }

    try {
      const results = await Promise.all([
        api('/api/bsd/events?date_from=' + encodeURIComponent(requestedDate) + '&date_to=' + encodeURIComponent(requestedDate) + '&limit=200'),
        requestedDate === todayKey() ? api('/api/bsd/live').catch(function () { return state.live; }) : Promise.resolve([]),
        loadBoard(Boolean(force))
      ]);
      const events = rows(results[0]);
      state.matchdayCache.set(requestedDate, {events:events.slice(), loadedAt:Date.now()});
      if (requestId !== state.matchdayRequest || state.date !== requestedDate) return events;
      state.today = events;
      state.live = rows(results[1]);
      state.lastSync = Date.now();
    } catch (error) {
      if (requestId !== state.matchdayRequest || state.date !== requestedDate) return [];
      state.error = error.message || String(error);
    }
    if (routeName() === 'board' && state.date === requestedDate) renderMatchday();
    return state.today;
  }

  function parseStats(raw) {
    const data = obj(raw);
    let home = obj(data.home || data.home_stats);
    let away = obj(data.away || data.away_stats);
    if (!Object.keys(home).length && obj(data.stats).home) {
      home = obj(data.stats.home);
      away = obj(data.stats.away);
    }
    return {home:home, away:away};
  }
  const statDefs = [
    ['Possession',['possession','ball_possession'],'%'],
    ['Shots',['shots_total','total_shots','shots'],''],
    ['On target',['shots_on_target','shots_ontarget','shots_on_goal'],''],
    ['Corners',['corners','corner_kicks'],''],
    ['xG',['xg','expected_goals'],''],
    ['Dangerous attacks',['dangerous_attacks'],'']
  ];
  function valueFor(source, aliases) {
    for (let i = 0; i < aliases.length; i += 1) {
      if (source && source[aliases[i]] !== undefined && source[aliases[i]] !== null) {
        return num(String(source[aliases[i]]).replace('%',''));
      }
    }
    return null;
  }
  function statsHtml(raw) {
    const parsed = parseStats(raw);
    const content = statDefs.map(function (definition) {
      const home = valueFor(parsed.home, definition[1]);
      const away = valueFor(parsed.away, definition[1]);
      if (home === null && away === null) return '';
      const total = Math.max(1, (home || 0) + (away || 0));
      const position = (home || 0) / total * 100;
      return '<div class="statItem"><div><strong>' + (home === null ? '—' : home + definition[2]) +
        '</strong><span>' + esc(definition[0]) + '</span><strong>' + (away === null ? '—' : away + definition[2]) +
        '</strong></div><div class="statBar"><i style="width:' + position + '%"></i></div></div>';
    }).join('');
    return content || '<div class="emptyState"><span>BSD has not published match statistics.</span></div>';
  }
  function normalizePlayers(side) {
    const source = obj(side);
    const all = arr(source.players || source.lineup || source.squad);
    let starters = arr(source.starting_xi || source.starters || source.starting);
    let subs = arr(source.substitutes || source.subs || source.bench);
    if (!starters.length && all.length) {
      starters = all.filter(function (player) { return player.starter !== false; }).slice(0, 11);
      subs = all.filter(function (player) { return player.starter === false; });
      if (!subs.length) subs = all.slice(11);
    }
    return {starters:starters, subs:subs, formation:pick(source.formation, source.formation_name, source.shape, '')};
  }
  function lineupSides(raw) {
    const source = obj(raw);
    return {
      home: normalizePlayers(source.home || source.home_team || source.home_lineup || obj(source.lineups).home),
      away: normalizePlayers(source.away || source.away_team || source.away_lineup || obj(source.lineups).away)
    };
  }
  function playerName(player) {
    const source = obj(player.player || player);
    return pick(source.name, source.full_name, source.short_name, player.player_name, player.name, 'Unknown');
  }
  function playerRow(player) {
    const source = obj(player.player || player);
    return '<div class="playerRow"><b>' + esc(pick(player.number, player.shirt_number, source.number, source.shirt_number, '·')) +
      '</b><span>' + esc(playerName(player)) + '</span><small>' + esc(pick(player.position, source.position, '')) + '</small></div>';
  }
  function lineupsHtml(raw, event) {
    const sides = lineupSides(raw);
    const side = function (name, data) {
      return '<section class="lineupSide"><header><strong>' + esc(name) + '</strong><span>' + esc(data.formation || '—') +
        '</span></header>' + (data.starters.length ? data.starters.map(playerRow).join('') : '<div class="emptyState"><span>No XI published.</span></div>') +
        (data.subs.length ? '<details><summary>Substitutes (' + data.subs.length + ')</summary>' + data.subs.map(playerRow).join('') + '</details>' : '') + '</section>';
    };
    return '<div class="lineups">' + side(teamName(event,'home'), sides.home) + side(teamName(event,'away'), sides.away) + '</div>';
  }
  function incidentsHtml(raw) {
    const items = arr(raw);
    if (!items.length) return '<div class="emptyState"><span>No incidents available.</span></div>';
    return '<div class="timeline">' + items.slice().sort(function (a,b) {
      return (num(a.minute) || 0) - (num(b.minute) || 0);
    }).map(function (item) {
      return '<div class="incident"><time>' + esc(pick(item.minute, item.time, '•')) + (item.minute !== undefined ? '′' : '') +
        '</time><i></i><div><strong>' + esc(String(pick(item.type, item.incident_type, item.name, 'Event')).replace(/_/g,' ')) +
        '</strong><span>' + esc(pick(item.player?.name, item.player_name, item.team?.name, item.team_name, '')) + '</span></div></div>';
    }).join('') + '</div>';
  }
  function oddsKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s.\/-]+/g, '_').replace(/_+/g, '_');
  }
  function oddsText(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
  }
  function oddsOutcomeLabel(value) {
    const key = oddsKey(value);
    const labels = {
      '1':'Home', home:'Home', home_win:'Home',
      'x':'Draw', draw:'Draw',
      '2':'Away', away:'Away', away_win:'Away',
      yes:'Yes', no:'No', btts_yes:'Yes', btts_no:'No'
    };
    if (labels[key]) return labels[key];
    const total = key.match(/(?:^|_)(over|under)_?(\d+)(?:_(\d+))?(?:_goals?)?$/);
    if (total) {
      const line = total[3] ? total[2] + '.' + total[3] :
        (/^\d+5$/.test(total[2]) && total[2].length > 1 ? total[2].slice(0, -1) + '.' + total[2].slice(-1) : total[2]);
      return (total[1] === 'over' ? 'Over ' : 'Under ') + line;
    }
    return oddsText(value || 'Selection');
  }
  function oddsMarketLabel(market, outcome) {
    const marketKey = oddsKey(market);
    const outcomeKey = oddsKey(outcome);
    if (/^(1x2|match_result|full_time_result)$/.test(marketKey) || /^(1|x|2|home|draw|away|home_win|away_win)$/.test(outcomeKey)) return 'Match result';
    if (marketKey.indexOf('btts') >= 0 || marketKey.indexOf('both_teams') >= 0 || outcomeKey.indexOf('btts_') === 0) return 'Both teams to score';
    if (marketKey.indexOf('total') >= 0 || marketKey.indexOf('over_under') >= 0 || marketKey.indexOf('goals') >= 0 || /^(over|under)_/.test(outcomeKey)) return 'Total goals';
    return marketKey === 'odds' || !marketKey ? 'Market odds' : oddsText(market);
  }
  function oddsHtml(raw) {
    let items = arr(raw);
    if (!items.length && raw && typeof raw === 'object') {
      const flattened = [];
      Object.entries(raw).forEach(function (market) {
        if (market[1] && typeof market[1] === 'object') {
          Object.entries(market[1]).forEach(function (outcome) {
            if (typeof outcome[1] === 'number') flattened.push({market:market[0],outcome:outcome[0],decimal_odds:outcome[1]});
          });
        }
      });
      items = flattened;
    }
    if (!items.length) return '<div class="emptyState"><span>No current odds returned by BSD.</span></div>';
    const groups = new Map();
    items.slice(0, 18).forEach(function (odd) {
      const outcome = pick(odd.outcome_name, odd.outcome, 'Selection');
      const label = oddsMarketLabel(odd.market, outcome);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ odd:odd, outcome:outcome });
    });
    return '<div class="oddsGrid">' + Array.from(groups.entries()).map(function (group) {
      return '<section class="oddsMarket"><h3>' + esc(group[0]) + '</h3><div class="oddsMarketGrid">' + group[1].map(function (item) {
        return '<div class="oddCard"><span>' + esc(oddsOutcomeLabel(item.outcome)) + '</span><strong>' +
          esc(pick(item.odd.decimal_odds, item.odd.odds, '—')) + '</strong><em>' +
          esc(pick(item.odd.bookmaker_name, item.odd.bookmaker_slug, 'Consensus')) + '</em></div>';
      }).join('') + '</div></section>';
    }).join('') + '</div>';
  }
  function h2hHtml(raw) {
    const items = arr(raw);
    return items.length ? groupedMatches(items.slice(0, 10)) : '<div class="emptyState"><span>No head-to-head history returned.</span></div>';
  }
  function predictionHtml(raw) {
    const markets = obj(obj(raw).markets);
    const result = obj(markets.match_result);
    const overUnder = obj(markets.over_under);
    const xg = obj(markets.expected_goals);
    return '<div class="predictionGrid"><div><span>Projected result</span><strong>' + esc(pick(result.predicted, '—')) +
      '</strong></div><div><span>Home</span><strong>' + esc(pick(result.prob_home, '—')) + '%</strong></div>' +
      '<div><span>Draw</span><strong>' + esc(pick(result.prob_draw, '—')) + '%</strong></div>' +
      '<div><span>Away</span><strong>' + esc(pick(result.prob_away, '—')) + '%</strong></div>' +
      '<div><span>Expected goals</span><strong>' + esc(pick(xg.home, '—')) + ' – ' + esc(pick(xg.away, '—')) +
      '</strong></div><div><span>Over 2.5</span><strong>' + esc(pick(overUnder.prob_over_25, '—')) + '%</strong></div></div>';
  }
  function unavailable(section, label) {
    if (section && section.ok === false) return '<div class="emptyState"><strong>' + esc(label) + ' unavailable</strong><span>' + esc(section.error || 'Not available for this match.') + '</span></div>';
    return '';
  }
  function modelPanel(event) {
    const row = boardRowFor(event);
    const official = picksFor(event);
    if (!row && !official.length) return '';
    return '<section class="modelSpotlight"><div class="modelIdentity"><span>ARC XI decision model</span><strong>' +
      esc(row?.grade || 'Tracked') + '</strong><small>' + esc(row?.tier || 'OFFICIAL PICK') + '</small></div>' +
      (row ? '<div class="modelFacts"><div><span>Structure</span><b>' + esc(row.structure || '—') +
        '</b></div><div><span>Starting XI</span><b>' + esc(row.xiStatus || '—') +
        '</b></div><div><span>Market</span><b>' + esc(row.marketStatus || '—') +
        '</b></div><div><span>Coverage</span><b>' + esc(row.coverageStatus || '—') + '</b></div></div>' : '') +
      (row?.frozenPreSummary ? '<p><b>Frozen PRE</b>' + esc(row.frozenPreSummary) + '</p>' : '') +
      (official.length ? '<div class="officialPicks"><b>Official picks</b>' + official.map(function (item) {
        return '<span>Over ' + esc(item.line || '—') + ' @ ' + esc(item.odds || '—') + ' · ' + esc(item.result || 'PENDING') + '</span>';
      }).join('') + '</div>' : '') + '</section>';
  }
  async function matchPage(id) {
    state.route = 'match';
    skeleton('match', 'Loading match');
    try {
      const results = await Promise.all([api('/api/bsd/match/' + id), loadBoard()]);
      const data = unwrap(results[0]);
      const event = data.event;
      state.lastSync = Date.now();
      const currentScore = score(event);
      const scoreDisplay = currentScore.home !== null && currentScore.away !== null ?
        currentScore.home + ' – ' + currentScore.away : formatTime(eventKickoff(event));
      const hero = '<a class="backLink" href="#board">← Board</a><section class="matchHero">' +
        '<div class="matchContext"><a href="' + (leagueId(event) ? '#league/' + leagueId(event) : '#board') + '">' +
        esc(leagueName(event)) + '</a><span>' + esc(pick(event.round_label, event.stage_name, 'Match')) + '</span></div>' +
        '<div class="matchHeroMain"><div class="heroTeam">' + crest('team', teamId(event,'home'), teamName(event,'home')) +
        '<span>' + esc(teamName(event,'home')) + '</span></div><div class="heroScore"><strong>' + esc(scoreDisplay) +
        '</strong><span id="heroClock" data-clock-id="' + id + '">' + esc(liveClock(event)) + '</span></div>' +
        '<div class="heroTeam away">' + crest('team', teamId(event,'away'), teamName(event,'away')) +
        '<span>' + esc(teamName(event,'away')) + '</span></div></div>' +
        '<div class="heroFoot"><span>' + esc(formatDate(eventKickoff(event), true)) + '</span><span>' +
        esc(formatTime(eventKickoff(event))) + ' ICT</span><span>' + esc(pick(event.venue?.name, event.venue_name, 'Venue TBA')) +
        '</span><span>BSD #' + esc(id) + '</span></div></section>';
      const tabButton = function (key, label, active) {
        return '<button class="tabBtn ' + (active ? 'active' : '') + '" id="match-tab-' + key + '" role="tab" data-tab="' + key +
          '" aria-selected="' + active + '" aria-controls="match-panel-' + key + '" tabindex="' + (active ? '0' : '-1') + '">' + label + '</button>';
      };
      const tabPane = function (key, content, active) {
        return '<div class="' + (active ? '' : 'hidden') + '" id="match-panel-' + key + '" role="tabpanel" data-pane="' + key +
          '" aria-labelledby="match-tab-' + key + '" tabindex="0">' + content + '</div>';
      };
      const tabs = '<section class="detailPanel"><div class="tabs" role="tablist" aria-label="Match details">' +
        tabButton('overview','Overview',true) + tabButton('stats','Stats',false) + tabButton('lineups','Lineups',false) +
        tabButton('odds','Odds',false) + tabButton('h2h','H2H',false) + '</div><div class="tabBody" id="matchTab">' +
        tabPane('overview', data.incidents?.ok ? incidentsHtml(data.incidents.data) : unavailable(data.incidents,'Timeline'), true) +
        tabPane('stats', data.stats?.ok ? statsHtml(data.stats.data) : unavailable(data.stats,'Statistics'), false) +
        tabPane('lineups', data.lineups?.ok ? lineupsHtml(data.lineups.data,event) : unavailable(data.lineups,'Lineups'), false) +
        tabPane('odds', data.odds?.ok ? oddsHtml(data.odds.data) : unavailable(data.odds,'Odds'), false) +
        tabPane('h2h', data.h2h?.ok ? h2hHtml(data.h2h.data) : unavailable(data.h2h,'Head-to-head'), false) + '</div></section>';
      const side = '<section class="railSection">' + sectionHead('Match state', isLive(event) ? 'Live feed' : 'BSD') +
        '<div class="stateList"><div><span>Status</span><b>' + esc(eventStatus(event).toUpperCase()) +
        '</b></div><div><span>Period</span><b>' + esc(pick(eventTime(event).period,'—')) +
        '</b></div><div><span>Referee</span><b>' + esc(pick(event.referee?.name,event.referee_name,'—')) +
        '</b></div><div><span>WS+</span><b>' + (event.websocket_plus ? 'YES' : 'NO') + '</b></div></div></section>' +
        (data.prediction?.ok ? '<section class="railSection">' + sectionHead('BSD prediction','Statistical feed') + predictionHtml(data.prediction.data) + '</section>' : '');
      root.innerHTML = shell(hero + modelPanel(event) + tabs, side, 'matchRoute');
      bindGlobal();
    } catch (error) {
      renderError('match', error);
    }
  }

  function exploreTabs(active) {
    return '<div class="subNav"><a class="' + (active === 'leagues' ? 'active' : '') + '" href="#leagues">Competitions</a>' +
      '<a class="' + (active === 'teams' ? 'active' : '') + '" href="#teams">Teams</a></div>';
  }
  function entityCard(item, type) {
    const id = item.id;
    const name = item.name || (type === 'league' ? 'Competition' : 'Team');
    const country = pick(item.country?.name, item.country_name, item.country_code, '');
    return '<a class="entityCard" href="#' + type + '/' + id + '">' + crest(type, id, name) +
      '<div><h3>' + esc(name) + '</h3><p>' + esc(country) + '</p></div><span aria-hidden="true">→</span></a>';
  }
  async function leaguesPage() {
    state.route = 'leagues';
    skeleton('leagues','Loading competitions');
    try {
      const payload = await api('/api/bsd/leagues?limit=200');
      const items = rows(payload);
      const content = pageTitle('Explore','Competitions','Standings, fixtures, seasons and leaders from BSD.') +
        exploreTabs('leagues') + '<div class="entityGrid">' + items.map(function (item) { return entityCard(item,'league'); }).join('') + '</div>';
      root.innerHTML = shell(content, '<section class="railSection">' + sectionHead('Coverage', items.length + ' competitions') +
        '<p class="railCopy">Open a competition for its current table, fixtures, results, and leading scorers.</p></section>', 'exploreRoute');
      bindGlobal();
    } catch (error) { renderError('leagues', error); }
  }
  async function teamsPage() {
    state.route = 'teams';
    skeleton('teams','Loading teams');
    try {
      const payload = await api('/api/bsd/teams?limit=60');
      const items = rows(payload);
      const content = pageTitle('Explore','Teams','Browse the BSD catalogue or search for a specific club or player.') +
        exploreTabs('teams') + '<div class="entityGrid">' + items.map(function (item) { return entityCard(item,'team'); }).join('') + '</div>';
      root.innerHTML = shell(content, '<section class="railSection">' + sectionHead('Search tip','Global catalogue') +
        '<p class="railCopy">Use the search field above to find teams and players beyond this sample.</p></section>', 'exploreRoute');
      bindGlobal();
    } catch (error) { renderError('teams', error); }
  }
  function standingsTable(items) {
    if (!items.length) return '<div class="emptyState"><span>No standings returned for this season.</span></div>';
    return '<div class="tableWrap"><table class="dataTable"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>' +
      items.map(function (row, index) {
        const team = obj(row.team);
        const id = num(pick(team.id,row.team_id));
        return '<tr><td>' + esc(pick(row.position,row.rank,index+1)) + '</td><td><a class="tableTeam" href="' +
          (id ? '#team/' + id : '#') + '">' + (id ? '<img src="' + image('team',id) + '" alt="">' : '') +
          '<span>' + esc(pick(team.name,row.team_name,'Team')) + '</span></a></td><td>' + esc(pick(row.played,row.matches_played,'—')) +
          '</td><td>' + esc(pick(row.won,row.wins,'—')) + '</td><td>' + esc(pick(row.drawn,row.draws,'—')) +
          '</td><td>' + esc(pick(row.lost,row.losses,'—')) + '</td><td>' + esc(pick(row.goals_for,row.gf,'—')) +
          '</td><td>' + esc(pick(row.goals_against,row.ga,'—')) + '</td><td>' + esc(pick(row.goal_difference,row.gd,'—')) +
          '</td><td><b>' + esc(pick(row.points,'—')) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  async function leaguePage(id) {
    state.route = 'league';
    skeleton('league','Loading competition');
    try {
      let payload = await api('/api/bsd/league/' + id);
      let data = unwrap(payload);
      let league = data.league?.data || {};
      const seasons = arr(data.seasons?.data);
      const season = pick(league.current_season?.id, league.current_season_id, seasons[0]?.id);
      if (season) {
        payload = await api('/api/bsd/league/' + id + '?season_id=' + encodeURIComponent(season));
        data = unwrap(payload);
        league = data.league?.data || league;
      }
      const standings = arr(data.standings?.data);
      const events = arr(data.events?.data);
      const scorers = arr(data.scorers?.data);
      const profile = '<a class="backLink" href="#leagues">← Competitions</a><section class="profileHead">' +
        crest('league',id,league.name) + '<div><span>Competition</span><h1>' + esc(pick(league.name,'Competition')) +
        '</h1><p>' + esc(pick(league.country?.name,league.country_name,'')) + '</p></div></section>';
      const content = profile + '<section class="contentSection">' + sectionHead('Standings', String(season || 'Current season')) +
        standingsTable(standings) + '</section><section class="contentSection">' + sectionHead('Fixtures & results', events.length + ' matches') +
        (events.length ? groupedMatches(events.slice(0,30)) : '<div class="emptyState"><span>No fixtures returned.</span></div>') + '</section>';
      const context = '<section class="railSection">' + sectionHead('Top scorers','Season leaders') +
        (scorers.length ? scorers.slice(0,10).map(function (item,index) {
          return '<div class="rankItem"><span>' + (index+1) + '</span><div><strong>' + esc(pick(item.player?.name,item.player_name,'Player')) +
            '</strong><small>' + esc(pick(item.team?.name,item.team_name,'')) + '</small></div><b>' + esc(pick(item.goals,item.value,'—')) + '</b></div>';
        }).join('') : '<div class="railEmpty">No leaderboard data.</div>') + '</section>';
      root.innerHTML = shell(content, context, 'entityRoute');
      bindGlobal();
    } catch (error) { renderError('league', error); }
  }
  async function teamPage(id) {
    state.route = 'team';
    skeleton('team','Loading team');
    try {
      const payload = await api('/api/bsd/team/' + id);
      const data = unwrap(payload);
      const team = data.team?.data || {};
      const squad = arr(data.squad?.data);
      const fixtures = arr(data.fixtures?.data);
      const transfers = arr(data.transfers?.data);
      const profile = '<a class="backLink" href="#teams">← Teams</a><section class="profileHead">' +
        crest('team',id,team.name) + '<div><span>Team</span><h1>' + esc(pick(team.name,'Team')) + '</h1><p>' +
        esc(pick(team.country?.name,team.country_name,'')) + (team.venue?.name ? ' · ' + esc(team.venue.name) : '') + '</p></div></section>';
      const squadHtml = squad.length ? '<div class="squadGrid">' + squad.map(function (player) {
        const source = obj(player.player || player);
        const pid = num(pick(source.id,player.player_id));
        return '<div class="playerCard">' + crest('player',pid,playerName(player),false) + '<div><strong>' +
          esc(playerName(player)) + '</strong><span>' + esc(pick(player.position,source.position,'')) + '</span></div></div>';
      }).join('') + '</div>' : '<div class="emptyState"><span>No squad data.</span></div>';
      const content = profile + '<section class="contentSection">' + sectionHead('Fixtures', fixtures.length + ' matches') +
        (fixtures.length ? groupedMatches(fixtures.slice(0,25)) : '<div class="emptyState"><span>No fixtures returned.</span></div>') +
        '</section><section class="contentSection">' + sectionHead('Squad', squad.length + ' players') + squadHtml + '</section>';
      const context = '<section class="railSection">' + sectionHead('Recent transfers','Latest movement') +
        (transfers.length ? transfers.slice(0,12).map(function (item) {
          return '<div class="transferItem"><strong>' + esc(pick(item.player?.name,item.player_name,'Player')) +
            '</strong><span>' + esc(pick(item.from_team?.name,item.from_team_name,'?')) + ' → ' +
            esc(pick(item.to_team?.name,item.to_team_name,'?')) + '</span><b>' + esc(pick(item.fee,item.transfer_fee,'')) + '</b></div>';
        }).join('') : '<div class="railEmpty">No transfers returned.</div>') + '</section>';
      root.innerHTML = shell(content, context, 'entityRoute');
      bindGlobal();
    } catch (error) { renderError('team', error); }
  }
  async function searchPage(query) {
    state.route = 'search';
    skeleton('search','Searching');
    try {
      const payload = await api('/api/bsd/search?q=' + encodeURIComponent(query));
      const data = unwrap(payload);
      const teams = arr(data.teams?.data);
      const players = arr(data.players?.data);
      const playerCards = players.map(function (player) {
        return '<div class="entityCard static">' + crest('player',player.id,player.name,false) + '<div><h3>' +
          esc(player.name || 'Player') + '</h3><p>' + esc(pick(player.team?.name,player.team_name,player.nationality_name,'')) + '</p></div></div>';
      }).join('');
      const content = pageTitle('Search','Results for “' + query + '”',(teams.length + players.length) + ' results from BSD.') +
        '<section class="contentSection">' + sectionHead('Teams',teams.length + ' results') +
        '<div class="entityGrid">' + (teams.map(function (team) { return entityCard(team,'team'); }).join('') || '<div class="emptyState"><span>No teams found.</span></div>') +
        '</div></section><section class="contentSection">' + sectionHead('Players',players.length + ' results') +
        '<div class="entityGrid">' + (playerCards || '<div class="emptyState"><span>No players found.</span></div>') + '</div></section>';
      root.innerHTML = shell(content, '<section class="railSection">' + sectionHead('Search','Teams and players') +
        '<p class="railCopy">Search is powered by the BSD catalogue.</p></section>', 'searchRoute');
      bindGlobal();
    } catch (error) { renderError('search', error); }
  }

  function resultState(value) {
    const result = String(value || 'PENDING').toUpperCase();
    if (['PENDING','OPEN',''].includes(result)) return 'open';
    if (['WIN','WON','W'].includes(result)) return 'win';
    if (['LOSS','LOST','L'].includes(result)) return 'loss';
    if (['PUSH','VOID'].includes(result)) return 'push';
    return 'settled';
  }
  function picksPage() {
    state.route = 'picks';
    const all = state.board && Array.isArray(state.board.picks) ? state.board.picks : [];
    const open = all.filter(function (item) { return resultState(item.result) === 'open'; });
    const settled = all.filter(function (item) { return resultState(item.result) !== 'open'; });
    const wins = settled.filter(function (item) { return resultState(item.result) === 'win'; }).length;
    const totalPL = settled.reduce(function (sum,item) { return sum + (num(item.pl) || 0); }, 0);
    const filtered = all.filter(function (item) {
      if (state.pickFilter === 'open') return resultState(item.result) === 'open';
      if (state.pickFilter === 'settled') return resultState(item.result) !== 'open';
      return true;
    });
    const filterButton = function (key,label,count) {
      return '<button type="button" class="' + (state.pickFilter === key ? 'active' : '') + '" data-pick-filter="' + key +
        '" aria-pressed="' + (state.pickFilter === key) + '">' + label + '<b>' + count + '</b></button>';
    };
    const rowsHtml = filtered.map(function (item) {
      const result = String(item.result || 'PENDING').toUpperCase();
      const pl = num(item.pl);
      return '<div class="pickRow"><div class="pickDate"><strong>' + esc(formatDate(item.kickoff)) + '</strong><span>' +
        esc(formatTime(item.kickoff)) + ' ICT</span></div><div class="pickMatch"><strong>' + esc(item.match || 'Match') +
        '</strong><span>' + esc(item.competition || '') + '</span></div><div class="pickMarket"><span>Selection</span><b>Over ' +
        esc(item.line || '—') + ' @ ' + esc(item.odds || '—') + '</b></div><div class="pickResult ' + resultState(result) +
        '"><strong>' + esc(result) + '</strong><span>' + (pl === null ? '—' : (pl > 0 ? '+' : '') + pl.toFixed(2) + 'u') + '</span></div></div>';
    }).join('');
    const content = pageTitle('Decision record','Official picks','Open positions and settled ARC XI model history.') +
      '<div class="performanceGrid"><div><span>Total P/L</span><strong class="' + (totalPL >= 0 ? 'positive' : 'negative') + '">' +
      (totalPL > 0 ? '+' : '') + totalPL.toFixed(2) + 'u</strong></div><div><span>Win rate</span><strong>' +
      (settled.length ? Math.round(wins / settled.length * 100) : 0) + '%</strong></div><div><span>Open</span><strong>' +
      open.length + '</strong></div><div><span>Settled</span><strong>' + settled.length + '</strong></div></div>' +
      '<div class="pickFilters" role="group" aria-label="Pick settlement status">' + filterButton('open','Open',open.length) + filterButton('settled','Settled',settled.length) +
      filterButton('all','All',all.length) + '</div><section class="contentSection">' + sectionHead('Pick ledger',filtered.length + ' shown') +
      (rowsHtml || '<div class="emptyState"><strong>No picks in this view</strong><span>Choose another settlement filter.</span></div>') + '</section>';
    root.innerHTML = shell(content, '<section class="railSection">' + sectionHead('Record notes','Model ledger') +
      '<p class="railCopy">P/L and hit rate are calculated from the existing settled pick records. Pending selections remain neutral.</p></section>', 'picksRoute');
    bindGlobal();
  }

  function manualScoreRow(key) {
    return boardRowsForDate().find(function (row) {
      return encodeURIComponent(String(row.match || '') + '||' + String(row.kickoff || row.displayKickoff || '')) === key;
    });
  }
  function closeManualScoreEditor() {
    const sheet = document.querySelector('.manualScoreSheet');
    if (sheet) sheet.remove();
    document.body.classList.remove('manualScoreOpen');
  }
  function openManualScoreEditor(key) {
    const row = manualScoreRow(key);
    if (!row || eventId(eventForBoardRow(row))) return;
    closeManualScoreEditor();
    const teams = splitMatch(row.match);
    const existing = row.manualScore &&
      Number.isInteger(Number(row.manualScore.home)) && Number.isInteger(Number(row.manualScore.away));
    const sheet = document.createElement('div');
    sheet.className = 'manualScoreSheet';
    sheet.innerHTML = '<section class="manualScoreDialog" role="dialog" aria-modal="true" aria-labelledby="manualScoreTitle">' +
      '<header><div><span>Unsupported match</span><h2 id="manualScoreTitle">Custom score</h2></div>' +
      '<button type="button" class="manualScoreClose" aria-label="Close score editor">×</button></header>' +
      '<p class="manualScoreIntro">This match has no live data feed. Add its score manually to keep your board current.</p>' +
      '<form><div class="manualScoreTeams">' +
      '<label><span>' + esc(teams.home || 'Home') + '</span><input name="home" type="number" min="0" max="99" step="1" inputmode="numeric" required value="' +
      (existing ? esc(Number(row.manualScore.home)) : '') + '" aria-label="' + esc((teams.home || 'Home') + ' score') + '"></label>' +
      '<b aria-hidden="true">–</b>' +
      '<label><span>' + esc(teams.away || 'Away') + '</span><input name="away" type="number" min="0" max="99" step="1" inputmode="numeric" required value="' +
      (existing ? esc(Number(row.manualScore.away)) : '') + '" aria-label="' + esc((teams.away || 'Away') + ' score') + '"></label>' +
      '</div><p class="manualScoreNote">Manual entries are labelled <strong>Custom</strong> and never replace supported live scores.</p>' +
      '<p class="manualScoreError" role="alert" aria-live="assertive"></p>' +
      '<footer>' + (existing ? '<button type="button" class="manualScoreClear">Clear score</button>' : '<span></span>') +
      '<div><button type="button" class="manualScoreCancel">Cancel</button><button type="submit" class="manualScoreSave">Save score</button></div>' +
      '</footer></form></section>';
    document.body.appendChild(sheet);
    document.body.classList.add('manualScoreOpen');
    const form = sheet.querySelector('form');
    const errorNode = sheet.querySelector('.manualScoreError');
    const close = function () {
      document.removeEventListener('keydown', onKey);
      closeManualScoreEditor();
    };
    const onKey = function (event) { if (event.key === 'Escape') close(); };
    const setBusy = function (busy) {
      sheet.classList.toggle('is-busy', busy);
      sheet.querySelectorAll('button,input').forEach(function (control) { control.disabled = busy; });
    };
    const persist = async function (action) {
      errorNode.textContent = '';
      const payload = {
        match: row.match,
        kickoff: row.kickoff || row.displayKickoff,
        action: action
      };
      if (action !== 'clear') {
        const home = Number(form.elements.home.value);
        const away = Number(form.elements.away.value);
        if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
          errorNode.textContent = 'Enter a whole number from 0 to 99 for both teams.';
          return;
        }
        payload.home = home;
        payload.away = away;
      }
      setBusy(true);
      try {
        await api('/api/manual-score', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
        close();
        await loadMatchday(state.date, true, true);
      } catch (error) {
        setBusy(false);
        errorNode.textContent = error.message || 'Could not save this score. Try again.';
      }
    };
    form.addEventListener('submit', function (event) { event.preventDefault(); persist('save'); });
    sheet.querySelector('.manualScoreClear')?.addEventListener('click', function () { persist('clear'); });
    sheet.querySelector('.manualScoreClose').addEventListener('click', close);
    sheet.querySelector('.manualScoreCancel').addEventListener('click', close);
    sheet.addEventListener('click', function (event) { if (event.target === sheet) close(); });
    document.addEventListener('keydown', onKey);
    setTimeout(function () { form.elements.home.focus(); }, 0);
  }

  function bindGlobal() {
    const search = document.getElementById('globalSearch');
    if (search) search.addEventListener('submit', function (event) {
      event.preventDefault();
      const input = search.querySelector('input');
      const query = input ? input.value.trim() : '';
      if (query.length >= 2) location.hash = '#search/' + encodeURIComponent(query);
    });
    root.querySelectorAll('[data-date]').forEach(function (button) {
      button.addEventListener('click', function () {
        const nextDate = button.dataset.date;
        if (nextDate === state.date) return;
        state.statusFilter = nextDate < todayKey() ? 'finished' : 'all';
        writeStore('sliptrace.statusFilter.v3', state.statusFilter, sessionStorage);
        loadMatchday(nextDate, true);
      });
    });
    root.querySelectorAll('[data-status-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.statusFilter = button.dataset.statusFilter;
        writeStore('sliptrace.statusFilter.v3', state.statusFilter, sessionStorage);
        renderMatchday();
      });
    });
    root.querySelectorAll('[data-signal-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.signalFilter = button.dataset.signalFilter;
        writeStore('sliptrace.signalFilter.v3', state.signalFilter, localStorage);
        renderMatchday();
      });
    });
    root.querySelectorAll('[data-reset-board-filters]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.statusFilter = 'all';
        state.signalFilter = 'all';
        writeStore('sliptrace.statusFilter.v3', state.statusFilter, sessionStorage);
        writeStore('sliptrace.signalFilter.v3', state.signalFilter, localStorage);
        renderMatchday();
      });
    });
    root.querySelectorAll('[data-pick-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.pickFilter = button.dataset.pickFilter;
        writeStore('sliptrace.pickFilter.v3', state.pickFilter, sessionStorage);
        picksPage();
      });
    });
    document.getElementById('refreshToday')?.addEventListener('click', function () {
      loadMatchday(state.date, true, true);
    });
    const activateTab = function (button, moveFocus) {
      root.querySelectorAll('.tabBtn').forEach(function (item) {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      root.querySelectorAll('[data-pane]').forEach(function (pane) {
        pane.classList.toggle('hidden', pane.dataset.pane !== button.dataset.tab);
      });
      if (moveFocus) button.focus();
    };
    root.querySelectorAll('.tabBtn').forEach(function (button) {
      button.addEventListener('click', function () { activateTab(button, false); });
      button.addEventListener('keydown', function (event) {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const tabs = Array.from(root.querySelectorAll('.tabBtn'));
        const current = tabs.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
          (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        activateTab(tabs[next], true);
      });
    });
    root.querySelectorAll('[data-open-alerts]').forEach(function (button) {
      button.addEventListener('click', function () { window.SlipTraceAlerts?.open?.(); });
    });
    root.querySelectorAll('[data-open-youtube]').forEach(function (button) {
      button.addEventListener('click', function () {
        window.dispatchEvent(new CustomEvent('arcxi:open-media'));
      });
    });
    root.querySelectorAll('[data-manual-score]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openManualScoreEditor(button.dataset.manualScore);
      });
    });
  }
  function renderError(route, error) {
    state.route = route;
    root.innerHTML = shell(pageTitle('Connection issue','Data unavailable','ARC XI could not retrieve this view.') +
      '<div class="statusBanner"><b>' + esc(error.message || String(error)) + '</b><span>Check the connection and try again.</span></div>' +
      '<button class="primaryButton" type="button" onclick="location.reload()">Retry</button>',
      '<section class="railSection"><p class="railCopy">The installed shell remains available while live data reconnects.</p></section>', 'errorRoute');
    bindGlobal();
  }
  async function render() {
    const hash = location.hash || '#board';
    state.route = routeName();
    if (hash === '#today' || hash === '#schedule' || hash === '#') {
      location.hash = '#board';
      return;
    }
    if (hash === '#board') {
      if (!state.today.length || !state.board) await loadMatchday(state.date, false);
      else renderMatchday();
      return;
    }
    if (hash === '#picks') {
      if (!state.board) await loadBoard();
      picksPage();
      return;
    }
    if (hash === '#leagues') { leaguesPage(); return; }
    if (hash === '#teams') { teamsPage(); return; }
    let match = hash.match(/^#match\/(\d+)$/);
    if (match) { matchPage(match[1]); return; }
    match = hash.match(/^#league\/(\d+)$/);
    if (match) { leaguePage(match[1]); return; }
    match = hash.match(/^#team\/(\d+)$/);
    if (match) { teamPage(match[1]); return; }
    match = hash.match(/^#search\/(.+)$/);
    if (match) {
      let query = '';
      try { query = decodeURIComponent(match[1]); } catch {}
      searchPage(query);
      return;
    }
    location.hash = '#board';
  }
  async function refreshLive() {
    if (document.visibilityState === 'hidden') return;
    if (routeName() === 'board' && state.date !== todayKey()) return;
    state.refreshTick += 1;
    try {
      if (state.refreshTick % 6 === 0 && routeName() === 'board' && state.date === todayKey()) {
        await loadMatchday(state.date, true, true);
        return;
      }
      const payload = await api('/api/bsd/live');
      const liveRows = rows(payload);
      state.live = liveRows;
      state.lastSync = Date.now();
      const byId = new Map(liveRows.map(function (event) { return [String(eventId(event)), event]; }));
      state.today = state.today.map(function (event) {
        const current = byId.get(String(eventId(event)));
        return current ? Object.assign({}, event, current, {status:'live'}) : event;
      });
      if (state.date === todayKey()) {
        state.matchdayCache.set(state.date, {events:state.today.slice(), loadedAt:Date.now()});
      }
      if (routeName() === 'board') renderMatchday();
    } catch (error) {
      state.error = error.message || String(error);
      if (routeName() === 'board') renderMatchday();
    }
  }
  function tickClocks() {
    const now = new Date();
    root.querySelectorAll('[data-context-clock]').forEach(function (node) {
      node.textContent = new Intl.DateTimeFormat('en-GB', {timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
    });
    root.querySelectorAll('[data-clock-id]').forEach(function (node) {
      const id = String(node.dataset.clockId || '');
      const event = state.today.concat(state.live).find(function (item) { return String(eventId(item)) === id; });
      if (event && isLive(event)) node.textContent = liveClock(event);
    });
    root.querySelectorAll('[data-countdown]').forEach(function (node) {
      node.textContent = countdownText(node.dataset.countdown);
    });
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('sliptrace:board-refresh', function (event) {
    const next = event?.detail?.board;
    if (!next || !Array.isArray(next.schedule) || !Array.isArray(next.picks)) return;
    state.board = next;
    if (routeName() === 'board') renderMatchday();
    else if (routeName() === 'picks') picksPage();
  });
  window.addEventListener('sliptrace:followed-changed', function () {
    if (routeName() === 'board') renderMatchday();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshLive();
  });
  state.clockTimer = setInterval(tickClocks, 1000);
  state.liveTimer = setInterval(refreshLive, 10000);
  loadMatchday(state.date, false).catch(render);
})();
