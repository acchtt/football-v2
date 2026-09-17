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

  function build(side, entries) {
    const rail = document.createElement('aside');
    rail.className = `iveEditorialRail iveEditorialRail--${side}`;
    rail.setAttribute('aria-hidden', 'true');

    entries.forEach(([name, url], index) => {
      const portrait = document.createElement('div');
      portrait.className = `ivePortrait ivePortrait--${index + 1}`;
      portrait.dataset.member = name;
      portrait.style.setProperty('--ive-photo', `url("${url}")`);
      rail.appendChild(portrait);
    });

    const names = document.createElement('div');
    names.className = 'iveRailNames';
    names.innerHTML = entries.map(([name]) => `<span>${name}</span>`).join('');
    rail.appendChild(names);

    const mark = document.createElement('div');
    mark.className = 'iveRailMark';
    mark.innerHTML = side === 'left'
      ? '<strong>IVE</strong><span>SIX DREAMS · ONE BIGGER TOMORROW</span><i class="iveRailRule"></i>'
      : '<strong>IVE</strong><span>ANYPLACE · ANYTIME · TOGETHER</span><i class="iveRailRule"></i>';
    rail.appendChild(mark);

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
