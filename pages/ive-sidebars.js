(() => {
  'use strict';

  function buildCorner() {
    const corner = document.createElement('aside');
    corner.className = 'iveCorner iveCorner--bottom';
    corner.setAttribute('aria-hidden', 'true');
    const composition = document.createElement('span');
    composition.className = 'iveCornerPhoto';
    const photo = document.createElement('img');
    photo.className = 'iveCornerArtwork';
    photo.src = './media/ive/wonyoung-liz-bottom-right.webp?v=1';
    photo.alt = '';
    photo.decoding = 'async';
    composition.appendChild(photo);
    corner.appendChild(composition);
    document.body.appendChild(corner);
  }

  function updateMode() {
    const hash = location.hash || '#board';
    document.documentElement.classList.toggle('scheduleCornerMode',
      hash === '#board' || hash === '#today' || hash === '#schedule' || hash === '#');
  }

  function init() {
    document.querySelectorAll('.iveRailDecor,.iveEditorialRail,.iveReferenceRail,.iveArtRail,.iveCorner').forEach(node => node.remove());
    buildCorner();
    updateMode();
    window.addEventListener('hashchange', updateMode);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
