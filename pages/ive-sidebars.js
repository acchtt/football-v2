(() => {
  'use strict';

  const corners = {
    bottom: {
      image: './media/ive/ive-right-approved.webp?v=1',
      width: 912,
      height: 1621
    }
  };

  function buildCorner(position) {
    const corner = document.createElement('aside');
    corner.className = 'iveCorner iveCorner--' + position;
    corner.setAttribute('aria-hidden', 'true');
    if (position === 'bottom') {
      const photo = document.createElement('img');
      photo.className = 'iveCornerArtwork';
      photo.src = corners[position].image;
      photo.alt = '';
      photo.decoding = 'async';
      corner.appendChild(photo);
    }
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
