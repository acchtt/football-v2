(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const FOLLOW_STORE = 'sliptrace.followedMatches.v2';
  const SETTINGS_STORE = 'sliptrace.pushSettings.v1';
  const DEFAULTS = { kickoff: true, goal: true, ht: true, ft: true };
  let syncing = false;
  let syncTimer = 0;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
    catch { return fallback; }
  }
  function followed() { return readJson(FOLLOW_STORE, {}); }
  function settings() { return { ...DEFAULTS, ...readJson(SETTINGS_STORE, DEFAULTS) }; }
  function saveFollowed(value) {
    localStorage.setItem(FOLLOW_STORE, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('sliptrace:followed-changed', { detail: value }));
  }
  function saveSettings(value) {
    const next = { ...DEFAULTS, ...value };
    localStorage.setItem(SETTINGS_STORE, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('sliptrace:alert-settings-changed', { detail: next }));
    return next;
  }
  function ids() { return Object.keys(followed()).filter(id => /^\d+$/.test(id)); }

  async function subscription() {
    try {
      if (!('serviceWorker' in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.pushManager?.getSubscription?.() || null;
    } catch { return null; }
  }
  async function syncNow() {
    if (syncing) return;
    const sub = await subscription();
    if (!sub) return;
    syncing = true;
    try {
      await fetch(`${API}/api/push/sync`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON ? sub.toJSON() : sub,
          matches: ids(),
          settings: settings(),
        }),
      });
    } catch (error) {
      console.warn('SlipTrace alert settings sync failed', error);
    } finally {
      syncing = false;
    }
  }
  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 250);
  }

  function ensureButton() {
    const host = $('.headerInner');
    if (!host) return;
    let btn = $('.alertsCenterBtn', host);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'alertsCenterBtn';
      btn.setAttribute('aria-label', 'Open match alert settings');
      btn.innerHTML = '<span class="alertsBell" aria-hidden="true">●</span><span>Alerts</span><b class="alertsCount">0</b>';
      btn.addEventListener('click', () => openCenter());
      const install = $('.pwaInstallBtn', host);
      if (install) host.insertBefore(btn, install);
      else host.appendChild(btn);
    }
    const count = ids().length;
    $('.alertsCount', btn).textContent = String(count);
    btn.classList.toggle('hasAlerts', count > 0);
  }

  function labelFor(item, id) {
    return String(item?.title || `Match ${id}`);
  }
  function renderMatchRows() {
    const all = followed();
    const entries = Object.entries(all).filter(([id]) => /^\d+$/.test(id));
    if (!entries.length) return '<div class="alertsEmpty"><strong>No followed matches</strong><span>Use the bell on a match to add it here.</span></div>';
    return entries.map(([id, item]) => `
      <div class="alertsMatch" data-alert-match="${id}">
        <a href="${item?.href || `#match/${id}`}" data-open-match>${escapeHtml(labelFor(item, id))}</a>
        <button type="button" data-remove-match="${id}" aria-label="Remove alerts for ${escapeAttr(labelFor(item, id))}">Remove</button>
      </div>`).join('');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  function preferenceRow(key, title, note) {
    const enabled = settings()[key] !== false;
    return `<label class="alertsPref"><span><strong>${title}</strong><small>${note}</small></span><input type="checkbox" data-alert-pref="${key}" ${enabled ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
  }

  async function statusText() {
    try {
      const d = await window.SlipTracePWA?.diagnostics?.();
      if (!d) return 'PWA status unavailable';
      if (d.subscription && d.backend) return 'Background push connected';
      if (d.notificationPermission === 'denied') return 'Notifications blocked by browser';
      if (!d.backend) return 'Push backend unavailable';
      return 'Push not enabled on this device';
    } catch { return 'Could not read push status'; }
  }

  async function openCenter() {
    let sheet = $('.alertsCenterSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'alertsCenterSheet hidden';
      document.body.appendChild(sheet);
    }
    const st = await statusText();
    sheet.innerHTML = `
      <div class="alertsCenterCard" role="dialog" aria-modal="true" aria-labelledby="alertsCenterTitle">
        <div class="alertsCenterHead">
          <div><span class="alertsEyebrow">MATCH ALERTS</span><h3 id="alertsCenterTitle">Notification center</h3></div>
          <button type="button" class="alertsClose" data-alert-close aria-label="Close notification center">×</button>
        </div>
        <div class="alertsConnection"><span class="alertsStatusDot"></span><strong>${escapeHtml(st)}</strong><button type="button" data-push-status>Details</button></div>
        <section class="alertsSection">
          <div class="alertsSectionTitle"><strong>Followed matches</strong><span>${ids().length}</span></div>
          <div class="alertsMatches">${renderMatchRows()}</div>
        </section>
        <section class="alertsSection">
          <div class="alertsSectionTitle"><strong>Alert types</strong><span>Per device</span></div>
          <div class="alertsPrefs">
            ${preferenceRow('kickoff', 'Kickoff', 'Alert when a followed match starts')}
            ${preferenceRow('goal', 'Goals', 'Alert on score changes')}
            ${preferenceRow('ht', 'Half-time', 'Alert at the half-time transition')}
            ${preferenceRow('ft', 'Full-time', 'Alert when the match finishes')}
          </div>
        </section>
        <div class="alertsActions">
          <button type="button" data-test-push>Send test</button>
          <button type="button" class="danger" data-clear-alerts ${ids().length ? '' : 'disabled'}>Clear followed</button>
        </div>
      </div>`;

    sheet.classList.remove('hidden');
    $('[data-alert-close]', sheet)?.focus();

    sheet.onclick = async event => {
      if (event.target === sheet || event.target.closest('[data-alert-close]')) { sheet.classList.add('hidden'); return; }
      const remove = event.target.closest('[data-remove-match]');
      if (remove) {
        const all = followed(); delete all[remove.dataset.removeMatch]; saveFollowed(all); scheduleSync(); openCenter(); return;
      }
      if (event.target.closest('[data-clear-alerts]')) {
        saveFollowed({}); scheduleSync(); openCenter(); return;
      }
      if (event.target.closest('[data-push-status]')) {
        window.SlipTracePWA?.showStatus?.(); return;
      }
      const test = event.target.closest('[data-test-push]');
      if (test) {
        test.disabled = true; test.textContent = 'Sending…';
        try { await window.SlipTracePWA?.sendTestNotification?.(); test.textContent = 'Test sent'; }
        catch { test.textContent = 'Unavailable'; }
      }
      const open = event.target.closest('[data-open-match]');
      if (open) sheet.classList.add('hidden');
    };

    $$('[data-alert-pref]', sheet).forEach(input => input.addEventListener('change', () => {
      const next = settings(); next[input.dataset.alertPref] = input.checked; saveSettings(next); scheduleSync();
    }));
  }

  function refresh() { ensureButton(); }
  window.addEventListener('sliptrace:followed-changed', () => { refresh(); scheduleSync(); });
  window.addEventListener('sliptrace:alert-settings-changed', scheduleSync);
  window.addEventListener('hashchange', refresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh(); scheduleSync(); } });
  const app = document.getElementById('app');
  if (app) new MutationObserver(() => requestAnimationFrame(refresh)).observe(app, { childList: true, subtree: true });

  window.SlipTraceAlerts = { open: openCenter, settings, sync: syncNow };
  requestAnimationFrame(refresh);
  scheduleSync();
})();
