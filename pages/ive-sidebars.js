(() => {
  'use strict';

  function updateMode() {
    const hash = location.hash || '#board';
    document.documentElement.classList.toggle('scheduleCornerMode',
      hash === '#board' || hash === '#today' || hash === '#schedule' || hash === '#');
  }

  function init() {
    document.querySelectorAll('.iveRailDecor,.iveEditorialRail,.iveReferenceRail,.iveArtRail').forEach(node => node.remove());
    updateMode();
    window.addEventListener('hashchange', updateMode);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
