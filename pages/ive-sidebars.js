(() => {
  'use strict';

  const members = {
    left: [
      ['Yujin', './media/ive/portraits/yujin.webp'],
      ['Liz', './media/ive/portraits/liz.webp'],
      ['Rei', './media/ive/portraits/rei.webp']
    ],
    right: [
      ['Wonyoung', './media/ive/portraits/wonyoung.webp'],
      ['Gaeul', './media/ive/portraits/gaeul.webp'],
      ['Leeseo', './media/ive/portraits/leeseo.webp']
    ]
  };

  const copy = {
    left: {
      slogan: 'Six dreams<br>one bigger tomorrow',
      members: 'Yujin · Gaeul · Rei<br>Wonyoung · Liz · Leeseo'
    },
    right: {
      slogan: 'Always more<br>than a game',
      members: 'Anyplace · Anytime<br>Together'
    }
  };

  function buildRail(side) {
    const rail = document.createElement('aside');
    rail.className = `iveEditorialRail iveEditorialRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');

    members[side].forEach(([name, image], index) => {
      const portrait = document.createElement('figure');
      portrait.className = `ivePortrait ivePortrait--${index + 1}`;
      portrait.style.setProperty('--ive-photo', `url("${image}")`);

      const label = document.createElement('figcaption');
      label.textContent = name;
      portrait.appendChild(label);
      rail.appendChild(portrait);
    });

    const mark = document.createElement('div');
    mark.className = 'iveRailWordmark';
    mark.textContent = 'IVE';
    rail.appendChild(mark);

    const slogan = document.createElement('div');
    slogan.className = 'iveRailSlogan';
    slogan.innerHTML = copy[side].slogan;
    rail.appendChild(slogan);

    const names = document.createElement('div');
    names.className = 'iveRailMembers';
    names.innerHTML = copy[side].members;
    rail.appendChild(names);

    document.body.appendChild(rail);
  }

  function init() {
    document.querySelectorAll('.iveRailDecor,.iveEditorialRail,.iveReferenceRail').forEach(node => node.remove());
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
