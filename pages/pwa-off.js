(() => {
  'use strict';

  const reloadKey = 'arcxi.pwa.disabled.reload.v1';

  async function disablePwa() {
    let controlled = false;

    try {
      controlled = Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      }
    } catch {}

    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter(key => /^arc-xi-|^sliptrace-/i.test(key))
            .map(key => caches.delete(key))
        );
      }
    } catch {}

    if (!controlled) return;

    try {
      if (sessionStorage.getItem(reloadKey) === '1') return;
      sessionStorage.setItem(reloadKey, '1');
      location.reload();
    } catch {}
  }

  disablePwa();
})();
