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
    if (syncing) return { ok: false, reason: 'busy' };
    syncing = true;
    try {
      if (window.SlipTracePWA?.syncPushSelection) return await window.SlipTracePWA.syncPushSelection();
      const sub = await subscription();
      if (!sub) return { ok: false, reason: 'no-subscription' };
      const response = await fetch(`${API}/api/push/sync`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON ? sub.toJSON() : sub,
          matches: ids(),
          settings: settings(),
        }),
      });
      if (!response.ok) throw new Error(`Push sync HTTP ${response.status}`);
      return { ok: true };
    } catch (error) {
      console.warn('Slate XI alert settings sync failed', error);
      return { ok: false, reason: 'sync', error };
    } finally {
      syncing = false;
    }
  }
  function scheduleSync() {
    if (window.SlipTracePWA?.syncPushSelection) return;
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

  function labelFor(item, id) { return String(item?.title || `Match ${id}`); }
  function safeHref(item, id) {
    const value = String(item?.href || '');
    return /^#match\/\d+$/.test(value) ? value : `#match/${id}`;
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(value) { return escapeHtml(value); }
  function renderMatchRows() {
    const all = followed();
    const entries = Object.entries(all).filter(([id]) => /^\d+$/.test(id));
    if (!entries.length) return '<div class="alertsEmpty"><strong>No followed matches</strong><span>Tap the bell on a match first, then enable device alerts here.</span></div>';
    return entries.map(([id, item]) => `
      <div class="alertsMatch" data-alert-match="${id}">
        <a href="${safeHref(item, id)}" data-open-match>${escapeHtml(labelFor(item, id))}</a>
        <button type="button" data-remove-match="${id}" aria-label="Remove alerts for ${escapeAttr(labelFor(item, id))}">Remove</button>
      </div>`).join('');
  }

  function preferenceRow(key, title, note) {
    const enabled = settings()[key] !== false;
    return `<label class="alertsPref"><span><strong>${title}</strong><small>${note}</small></span><input type="checkbox" data-alert-pref="${key}" ${enabled ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
  }

  async function readStatus() {
    try {
      const d = await window.SlipTracePWA?.diagnostics?.();
      if (!d) return { d: null, text: 'PWA status unavailable', tone: 'bad' };
      if (d.subscription && d.backend) return { d, text: 'Background push connected', tone: 'ok' };
      if (d.notificationPermission === 'denied') return { d, text: 'Notifications blocked by browser', tone: 'bad' };
      if (!d.pushApi) return { d, text: 'Web Push unsupported in this browser', tone: 'bad' };
      if (!d.backend) return { d, text: 'Push backend unavailable', tone: 'bad' };
      return { d, text: 'Push ready — enable it on this device', tone: 'warn' };
    } catch { return { d: null, text: 'Could not read push status', tone: 'bad' }; }
  }

  function renderSetup(status) {
    const d = status.d;
    if (d?.subscription && d?.backend) {
      return '<div class="alertsSetup is-active"><div><strong>Device alerts are active</strong><small>Slate XI can notify you even when the app is closed.</small></div><span aria-hidden="true">✓</span></div>';
    }
    let text = 'Enable alerts on this device';
    let note = 'Followed matches will receive the alert types selected below.';
    let disabled = false;
    if (!ids().length) { text = 'Follow a match first'; note = 'Choose at least one match before creating a push subscription.'; disabled = true; }
    else if (d?.notificationPermission === 'denied') { text = 'Notifications are blocked'; note = 'Allow notifications for Slate XI in your browser or site settings.'; disabled = true; }
    else if (d && !d.pushApi) { text = 'Web Push unsupported'; note = 'Open Slate XI in a browser that supports Web Push.'; disabled = true; }
    else if (d && !d.backend) { text = 'Push service unavailable'; note = 'The server is not ready for subscriptions right now.'; disabled = true; }
    return `<div class="alertsSetup"><div><strong>Background alerts</strong><small>${escapeHtml(note)}</small></div><button type="button" data-enable-push ${disabled ? 'disabled' : ''}>${escapeHtml(text)}</button></div>`;
  }

  function enableFailureMessage(result) {
    if (!result) return 'Could not enable alerts.';
    if (result.reason === 'ios-install') return 'Install Slate XI to your Home Screen, open the installed app, then enable alerts.';
    if (result.reason === 'denied') return 'Notification permission is blocked in the browser.';
    if (result.reason === 'unsupported') return 'This browser does not support Web Push.';
    if (result.reason === 'backend') return 'The push backend is not ready.';
    return result.detail || 'Could not enable alerts on this device.';
  }

  async function openCenter() {
    let sheet = $('.alertsCenterSheet');
    if (!sheet) {
      sheet = document.createElement('div');
      sheet.className = 'alertsCenterSheet hidden';
      document.body.appendChild(sheet);
    }
    const status = await readStatus();
    const d = status.d || {};
    sheet.innerHTML = `
      <div class="alertsCenterCard" role="dialog" aria-modal="true" aria-labelledby="alertsCenterTitle">
        <div class="alertsCenterHead">
          <div><span class="alertsEyebrow">MATCH ALERTS</span><h3 id="alertsCenterTitle">Notification center</h3></div>
          <button type="button" class="alertsClose" data-alert-close aria-label="Close notification center">×</button>
        </div>
        <div class="alertsConnection is-${status.tone}"><span class="alertsStatusDot"></span><strong>${escapeHtml(status.text)}</strong><button type="button" data-push-status>Details</button></div>
        ${renderSetup(status)}
        <div class="alertsInlineStatus" role="status" aria-live="polite"></div>
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
          <button type="button" class="primary" data-test-push ${d.subscription && d.backend ? '' : 'disabled'}>Send test push</button>
          <button type="button" class="danger" data-clear-alerts ${ids().length ? '' : 'disabled'}>Clear followed</button>
        </div>
      </div>`;

    sheet.classList.remove('hidden');
    $('[data-alert-close]', sheet)?.focus();

    sheet.onclick = async event => {
      if (event.target === sheet || event.target.closest('[data-alert-close]')) { sheet.classList.add('hidden'); return; }
      const remove = event.target.closest('[data-remove-match]');
      if (remove) {
        const all = followed(); delete all[remove.dataset.removeMatch]; saveFollowed(all); scheduleSync(); await openCenter(); return;
      }
      if (event.target.closest('[data-clear-alerts]')) {
        saveFollowed({}); scheduleSync(); await syncNow(); await openCenter(); return;
      }
      if (event.target.closest('[data-push-status]')) {
        window.SlipTracePWA?.showStatus?.(); return;
      }
      const enable = event.target.closest('[data-enable-push]');
      if (enable) {
        const output = $('.alertsInlineStatus', sheet);
        enable.disabled = true; enable.textContent = 'Enabling…';
        if (output) output.textContent = 'Requesting notification permission and registering this device…';
        try {
          const result = await window.SlipTracePWA?.enablePush?.();
          if (result?.ok) {
            await syncNow();
            if (output) output.textContent = 'Background alerts are connected.';
            await openCenter();
          } else {
            enable.disabled = false; enable.textContent = 'Try again';
            if (output) output.textContent = enableFailureMessage(result);
          }
        } catch (error) {
          enable.disabled = false; enable.textContent = 'Try again';
          if (output) output.textContent = error?.message || 'Could not enable alerts.';
        }
        return;
      }
      const test = event.target.closest('[data-test-push]');
      if (test) {
        const output = $('.alertsInlineStatus', sheet);
        test.disabled = true; test.textContent = 'Sending…';
        try {
          await window.SlipTracePWA?.sendTestNotification?.();
          test.textContent = 'Test sent';
          if (output) output.textContent = 'Test push sent. It should appear as a system notification.';
        } catch (error) {
          test.disabled = false; test.textContent = 'Send test push';
          if (output) output.textContent = error?.message || 'Test push was unavailable.';
        }
        return;
      }
      const open = event.target.closest('[data-open-match]');
      if (open) sheet.classList.add('hidden');
    };

    $$('[data-alert-pref]', sheet).forEach(input => input.addEventListener('change', () => {
      const next = settings(); next[input.dataset.alertPref] = input.checked; saveSettings(next); scheduleSync();
    }));
  }

  function refresh() { ensureButton(); }
  window.addEventListener('sliptrace:followed-changed', refresh);
  window.addEventListener('hashchange', refresh);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
  const app = document.getElementById('app');
  if (app) new MutationObserver(() => requestAnimationFrame(refresh)).observe(app, { childList: true, subtree: true });

  window.SlipTraceAlerts = { open: openCenter, settings, sync: syncNow };
  requestAnimationFrame(refresh);
})();
