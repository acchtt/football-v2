(() => {
  'use strict';

  const members = {
    left: [
      ['YUJIN', './media/ive/yujin.jpg'],
      ['LIZ', './media/ive/liz.jpg'],
      ['REI', './media/ive/rei.jpg']
    ],
    right: [
      ['WONYOUNG', './media/ive/wonyoung.jpg'],
      ['GAEUL', './media/ive/gaeul.jpg'],
      ['LEESEO', './media/ive/leeseo.jpg']
    ]
  };
  const roster = ['YUJIN','GAEUL','REI','WONYOUNG','LIZ','LEESEO'];

  function portrait(name, url, index) {
    const node = document.createElement('div');
    node.className = `ivePortrait ivePortrait--${index + 1}`;
    node.dataset.member = name;
    node.style.setProperty('--ive-photo', `url("${url}")`);
    return node;
  }

  function build(side, entries) {
    const rail = document.createElement('aside');
    rail.className = `iveEditorialRail iveEditorialRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');
    entries.forEach(([name, url], index) => rail.appendChild(portrait(name, url, index)));

    if (side === 'left') {
      const names = document.createElement('div');
      names.className = 'iveRailNames';
      names.innerHTML = roster.map(name => `<span>${name}</span>`).join('');
      rail.appendChild(names);

      const mark = document.createElement('div');
      mark.className = 'iveRailMark';
      mark.innerHTML = '<strong>IVE</strong><span>SIX DREAMS · ONE BIGGER TOMORROW</span><i class="iveRailRule"></i>';
      rail.appendChild(mark);
    } else {
      const feature = document.createElement('div');
      feature.className = 'iveRailFeature';
      feature.innerHTML = '<span class="kicker">Music unites people</span><strong>IVE</strong><small>Always more<br>than a game</small>';
      rail.appendChild(feature);

      const footer = document.createElement('div');
      footer.className = 'iveRailFooter';
      footer.innerHTML = 'Anyplace · anytime<br>together';
      rail.appendChild(footer);
    }

    document.body.appendChild(rail);
  }

  function init() {
    document.querySelectorAll('.iveRailDecor,.iveEditorialRail').forEach(node => node.remove());
    build('left', members.left);
    build('right', members.right);
    document.documentElement.classList.add('iveRailsReady');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
