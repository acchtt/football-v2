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
      image: './media/ive/portraits/wonyoung.webp?v=1',
      width: 720,
      height: 1280,
      label: 'IVE',
      slogan: 'Same Passion,<br>Different Stadiums.',
      note: 'MUSIC<br>CONNECTS<br>PEOPLE.<br>FOOTBALL<br>DOES TOO.',
      signature: 'Wonyoung',
      footer: 'IVE<br>FOR A BIGGER<br>TOMORROW'
    },
    right: {
      image: './media/ive/ive-right-current.webp?v=2',
      width: 600,
      height: 1800,
      label: 'Always more<br>than a game ♡',
      footer: 'IVE × FOOTBALL<br><br>GOOD PEOPLE<br>GREAT MATCHES<br>BRIGHTER DAYS'
    }
  };

  function buildRail(side) {
    const rail = document.createElement('aside');
    rail.className = `iveArtRail iveArtRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');

    const photo = document.createElement('img');
    photo.className = `iveRailPhoto iveRailPhoto--${side}`;
    photo.src = rails[side].image;
    photo.alt = '';
    photo.width = rails[side].width;
    photo.height = rails[side].height;
    photo.decoding = 'async';
    photo.fetchPriority = 'high';
    rail.appendChild(photo);

    const overlay = document.createElement('div');
    overlay.className = 'iveRailOverlay';
    rail.appendChild(overlay);

    const copy = document.createElement('div');
    copy.className = `iveArtCopy iveArtCopy--${side}`;
    copy.innerHTML = `<strong>${rails[side].label}</strong>${rails[side].slogan ? `<span>${rails[side].slogan}</span>` : ''}${rails[side].note ? `<small>${rails[side].note}</small>` : ''}`;
    rail.appendChild(copy);

    if (rails[side].signature) {
      const signature = document.createElement('div');
      signature.className = 'iveArtSignature';
      signature.textContent = rails[side].signature;
      rail.appendChild(signature);
    }

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
