(() => {
  'use strict';

  /* Approved finished rail artwork assets. Preserve the artwork pixels exactly;
   * the browser only places/scales these files and adds no poster reconstruction. */

  const rails = {
    left: {
      image: './media/ive/ive-left-final.svg?v=3',
      width: 724,
      height: 2172
    },
    right: {
      image: './media/ive/ive-right-final.png?v=4',
      width: 684,
      height: 2048
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
