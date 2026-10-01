(() => {
  'use strict';

  const corners = {
    top: {
      image: './media/ive/ive-left-final.svg?v=3',
      width: 724,
      height: 2172
    },
    bottom: {
      image: './media/ive/ive-right-final.png?v=5',
      width: 724,
      height: 2172
    }
  };

  function buildCorner(position) {
    const corner = document.createElement('aside');
    corner.className = 'iveCorner iveCorner--' + position;
    corner.setAttribute('aria-hidden', 'true');
    const photo = document.createElement('img');
    photo.className = 'iveCornerArtwork';
    photo.src = corners[position].image;
    photo.alt = '';
    photo.width = corners[position].width;
    photo.height = corners[position].height;
    photo.decoding = 'async';
    corner.appendChild(photo);
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
