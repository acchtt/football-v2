(() => {
  'use strict';

  function init() {
    document.querySelectorAll('.iveRailDecor,.iveEditorialRail,.iveReferenceRail').forEach(node => node.remove());

    ['left','right'].forEach(side => {
      const rail = document.createElement('aside');
      rail.className = `iveReferenceRail iveReferenceRail--${side}`;
      rail.setAttribute('aria-hidden','true');
      document.body.appendChild(rail);
    });

    document.documentElement.classList.add('iveRailsReady');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',init,{once:true});
  } else {
    init();
  }
})();
