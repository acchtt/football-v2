(() => {
  'use strict';

  function buildCorner(position) {
    const corner = document.createElement('aside');
    corner.className = 'iveCorner iveCorner--' + position;
    corner.setAttribute('aria-hidden', 'true');
    const composition = document.createElement('span');
    composition.className = 'iveCornerPhoto';
    const photo = document.createElement('img');
    photo.className = 'iveCornerArtwork';
    photo.src = './media/ive/sources/ive-group-black.jpeg';
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
    buildCorner('top');
    buildCorner('bottom');
    updateMode();
    window.addEventListener('hashchange', updateMode);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
