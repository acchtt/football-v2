(() => {
  'use strict';

  const rails = {
    left: {
      image: './media/ive/ive-left-approved.webp',
      slogan: 'Six dreams<br>one bigger tomorrow'
    },
    right: {
      image: './media/ive/ive-right-approved.webp',
      slogan: 'Always more<br>than a game',
      footer: 'Anyplace · Anytime<br>Together'
    }
  };

  function buildRail(side) {
    const rail = document.createElement('aside');
    rail.className = `iveArtRail iveArtRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');
    rail.style.setProperty('--ive-art', `url("${rails[side].image}")`);

    const copy = document.createElement('div');
    copy.className = 'iveArtCopy';
    copy.innerHTML = `<strong>IVE</strong><span>${rails[side].slogan}</span>`;
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
