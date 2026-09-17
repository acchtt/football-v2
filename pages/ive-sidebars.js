(() => {
  'use strict';

  const members = {
    left: [
      ['YUJIN', 'https://img.uhdpaper.com/wallpaper/yujin-ive-4th-fan-concert-311%405%40n-phone-4k.jpg'],
      ['LIZ', 'https://img.uhdpaper.com/wallpaper/liz-ive-4th-fan-concert-295%405%40n-phone-4k.jpg'],
      ['REI', 'https://img.uhdpaper.com/wallpaper/rei-ive-4th-fan-concert-309%405%40n-phone-4k.jpg']
    ],
    right: [
      ['WONYOUNG', 'https://img.uhdpaper.com/wallpaper/wonyoung-ive-4th-fan-concert-310%405%40n-phone-4k.jpg'],
      ['GAEUL', 'https://img.uhdpaper.com/wallpaper/gaeul-ive-4th-fan-concert-292%405%40n-phone-4k.jpg'],
      ['LEESEO', 'https://img.uhdpaper.com/wallpaper/leeseo-ive-4th-fan-concert-294%405%40n-phone-4k.jpg']
    ]
  };

  function build(side, entries) {
    const rail = document.createElement('aside');
    rail.className = `iveRailDecor iveRailDecor--${side}`;
    rail.setAttribute('aria-hidden', 'true');

    entries.forEach(([name, url], index) => {
      const portrait = document.createElement('div');
      portrait.className = `ivePortrait ivePortrait--${index + 1}`;
      portrait.dataset.member = name;
      portrait.style.setProperty('--ive-photo', `url("${url}")`);
      rail.appendChild(portrait);
    });

    const mark = document.createElement('div');
    mark.className = 'iveRailMark';
    mark.innerHTML = side === 'left'
      ? '<strong>IVE</strong><span>YUJIN · GAEUL · REI · WONYOUNG · LIZ · LEESEO</span>'
      : '<strong>IVE</strong><span>ANYPLACE · ANYTIME · TOGETHER</span>';
    rail.appendChild(mark);

    document.body.appendChild(rail);
  }

  function init() {
    if (document.querySelector('.iveRailDecor')) return;
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
