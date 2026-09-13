(() => {
  'use strict';

  const root = document.getElementById('app');
  if (!root) return;

  let queued = false;

  function gradeClass(value = '') {
    const g = String(value).trim().toUpperCase();
    if (/^A/.test(g)) return 'grade-a';
    if (/^B/.test(g)) return 'grade-b';
    if (/^C/.test(g)) return 'grade-c';
    return 'grade-neutral';
  }

  function decorateSignalBadges(scope = document) {
    scope.querySelectorAll('.matchMeta .tag').forEach(tag => {
      const raw = String(tag.textContent || '').trim();
      if (!raw.includes('·')) return;
      const parts = raw.split('·').map(v => v.trim()).filter(Boolean);
      if (parts.length < 2) return;

      const grade = parts[0];
      const tier = parts.slice(1).join(' · ').toUpperCase();
      tag.dataset.grade = grade;
      tag.dataset.tier = tier;
      tag.classList.add('signalBadge');
      tag.classList.remove('grade-a', 'grade-b', 'grade-c', 'grade-neutral');
      tag.classList.add(gradeClass(grade));

      const row = tag.closest('.matchRow');
      if (row) {
        row.dataset.signalTier = tier;
        row.dataset.signalGrade = grade;
      }
    });
  }

  function decorateCompetitionLabels(scope = document) {
    scope.querySelectorAll('.matchCompetition').forEach(label => {
      const text = String(label.textContent || '').trim();
      if (!text) return;
      label.dataset.competition = text;
    });

    scope.querySelectorAll('.leagueTitle').forEach(title => {
      const name = String(title.querySelector('strong')?.textContent || '').trim();
      if (name) title.dataset.competition = name;
    });
  }

  function decorateHero(scope = document) {
    const hero = scope.querySelector('.matchHero');
    if (!hero) return;

    const score = String(hero.querySelector('.heroScore .score')?.textContent || '').trim();
    hero.classList.toggle('heroHasScore', /\d\s*[–-]\s*\d/.test(score));

    const clock = hero.querySelector('.heroScore .clock');
    const clockText = String(clock?.textContent || '').trim().toUpperCase();
    hero.classList.toggle('heroFinished', /^FT\b/.test(clockText));

    const cells = [...scope.querySelectorAll('.modelPanel .modelCell')];
    const readCell = label => {
      const cell = cells.find(item => String(item.querySelector('span')?.textContent || '').trim().toLowerCase() === label);
      return String(cell?.querySelector('strong')?.textContent || '').trim();
    };
    const grade = readCell('pre grade');
    const tier = readCell('tier').toUpperCase();
    if (grade) hero.dataset.grade = grade;
    if (tier) hero.dataset.tier = tier;
  }

  function decoratePanels(scope = document) {
    scope.querySelectorAll('.panelHead').forEach(head => {
      const title = String(head.querySelector('h2,h3')?.textContent || '').trim();
      if (title) head.dataset.panelTitle = title;
    });
  }

  function run() {
    queued = false;
    decorateSignalBadges(root);
    decorateCompetitionLabels(root);
    decorateHero(root);
    decoratePanels(root);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }

  const observer = new MutationObserver(records => {
    if (!records.length) return;
    schedule();
  });
  observer.observe(root, { childList: true, subtree: true });

  window.addEventListener('hashchange', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });

  schedule();
})();
