(() => {
  'use strict';

  /* Finished artwork assets built from real photographs by
   * scripts/build-ive-artwork.py. No browser-generated poster layers. */

  const rails = {
    left: {
      image: './media/ive/wonyoung-left-art.webp?v=1',
      width: 1400,
      height: 2100
    },
    right: {
      image: './media/ive/ive-right-art.webp?v=1',
      width: 1400,
      height: 2100
    }
  };

  function buildRail(side) {
    const rail = document.createElement('aside');
    rail.className = `iveArtRail iveArtRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');

    const photo = document.createElement('img');
    photo.className = 'iveArtwork';
    photo.src = rails[side].image;
    photo.alt = '';
    photo.width = rails[side].width;
    photo.height = rails[side].height;
    photo.decoding = 'async';
    photo.fetchPriority = 'high';
    rail.appendChild(photo);

    document.body.appendChild(rail);
  }

  function init() {
    document.querySelectorAll('.iveRailDecor,.iveEditorialRail,.iveReferenceRail,.iveArtRail').forEach(node => node.remove());
    buildRail('left');
    buildRail('right');

    const root = document.getElementById('app');
    const updateVisibility = () => {
      const text = root?.textContent || '';
      const busy = !root?.children.length ||
        Boolean(root.querySelector('.skeletonRow')) ||
        /Loading (?:decision board|matchday|picks|competitions|teams)/i.test(text);
      document.documentElement.classList.toggle('iveRailsReady', !busy);
    };

    updateVisibility();
    if (root) {
      new MutationObserver(updateVisibility).observe(root, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    window.addEventListener('hashchange', updateVisibility);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
