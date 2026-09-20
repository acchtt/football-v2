(() => {
  'use strict';

  /*
   * IVE IMAGE POLICY
   *
   * All visible IVE member images must be real photographs
   * stored as local repository assets.
   *
   * Never use AI-generated people or generated faces.
   *
   * Allowed:
   * crop, resize, object-fit, gradients, opacity,
   * masks and non-generative color grading.
   */

  const rails = {
    left: {
      image: './media/ive/wonyoung-left-current.webp',
      label: 'IVE',
      slogan: 'Same Passion,<br>Different Stadiums.',
      note: 'MUSIC CONNECTS PEOPLE.<br>FOOTBALL DOES TOO.'
    },
    right: {
      image: './media/ive/ive-right-current.webp?v=2',
      label: 'Always more<br>than a game ♡',
      slogan: 'IVE × FOOTBALL',
      footer: 'IVE × FOOTBALL<br><br>GOOD PEOPLE<br>GREAT MATCHES<br>BRIGHTER DAYS'
    }
  };

  function buildRail(side) {
    const rail = document.createElement('aside');
    rail.className = `iveArtRail iveArtRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');
    rail.style.setProperty('--ive-art', `url("${rails[side].image}")`);

    const copy = document.createElement('div');
    copy.className = 'iveArtCopy';
    copy.innerHTML = `<strong>${rails[side].label}</strong><span>${rails[side].slogan}</span>${rails[side].note ? `<small>${rails[side].note}</small>` : ''}`;
    rail.appendChild(copy);

    if (rails[side].footer) {
      const footer = document.createElement('div');
      footer.className = 'iveArtFooter';
      footer.innerHTML = rails[side].footer;
      rail.appendChild(footer);
    }

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
