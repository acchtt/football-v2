(() => {
  'use strict';

  // Replace this single value to use a different public YouTube playlist.
  const YOUTUBE_PLAYLIST_ID = 'PLPhtNKiHTFyqVEtWNjX8zFLEBsQwYYYS8';
  const FALLBACK_VIDEO_ID = '6ZUIwj3FgUY';
  const SHUFFLE_STORAGE_KEY = 'arc-xi.youtube.shuffle.v1';
  const API_SCRIPT_ID = 'arcXiYouTubeIframeApi';
  const mount = document.getElementById('youtubeHubMount');
  const app = document.getElementById('app');
  if (!mount) return;

  let player = null;
  let playerReady = false;
  let playlist = [];
  let currentIndex = -1;
  let expanded = false;
  let loadingPlayer = false;
  let shuffleEnabled = false;
  let readinessTimer = 0;
  let fallbackAttempted = false;
  const knownTitles = new Map();

  try {
    shuffleEnabled = sessionStorage.getItem(SHUFFLE_STORAGE_KEY) === '1';
  } catch {}

  mount.innerHTML = '<div class="youtubeHubShell"><section class="youtubePlaylistPlayer" aria-labelledby="youtubeHubTitle">' +
    '<button type="button" class="youtubeHubToggle" aria-expanded="false" aria-controls="youtubeHubBody">' +
      '<span class="youtubeHubLabel">MEDIA</span><span class="youtubeHubHeading"><strong id="youtubeHubTitle">YouTube</strong>' +
      '<small>Official IVE playlist · Player opens below the match board</small></span>' +
      '<svg class="youtubeHubChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>' +
    '</button>' +
    '<div class="youtubeHubBody" id="youtubeHubBody" hidden>' +
      '<div class="youtubeHubGrid"><div class="youtubePlayerColumn">' +
        '<div class="youtubePlayerFrame"><div id="arcXiYoutubePlayer"></div>' +
          '<button type="button" class="youtubeStart" hidden>Start playlist</button>' +
          '<div class="youtubePlayerStatus" role="status" aria-live="polite"></div></div>' +
        '<div class="youtubeNowPlaying"><span>Now playing</span><strong data-youtube-title>Ready when you are</strong>' +
          '<small data-youtube-position>Playlist not started</small></div>' +
        '<div class="youtubeControls" role="group" aria-label="YouTube playlist controls">' +
          '<button type="button" class="youtubeControl" data-youtube-previous aria-label="Previous video" disabled>Previous</button>' +
          '<button type="button" class="youtubeControl" data-youtube-shuffle aria-label="Shuffle playlist" aria-pressed="' + shuffleEnabled + '" disabled>' +
            (shuffleEnabled ? 'Shuffle on' : 'Shuffle off') + '</button>' +
          '<button type="button" class="youtubeControl" data-youtube-next aria-label="Next video" disabled>Next</button>' +
        '</div></div>' +
        '<aside class="youtubeQueue" aria-labelledby="youtubeQueueTitle"><header class="youtubeQueueHeader">' +
          '<strong id="youtubeQueueTitle">Queue</strong><span data-youtube-count>Waiting</span></header>' +
          '<div><ol class="youtubeQueueList" data-youtube-queue></ol>' +
          '<p class="youtubeQueueNote">YouTube supplies the playlist order. Titles update as each video loads.</p>' +
          '<a class="youtubeQueueLink" href="https://www.youtube.com/playlist?list=' + encodeURIComponent(YOUTUBE_PLAYLIST_ID) + '" target="_blank" rel="noopener">Open playlist on YouTube</a></div>' +
        '</aside></div>' +
    '</div></section></div>';

  const toggle = mount.querySelector('.youtubeHubToggle');
  const body = mount.querySelector('.youtubeHubBody');
  const startButton = mount.querySelector('.youtubeStart');
  const previousButton = mount.querySelector('[data-youtube-previous]');
  const shuffleButton = mount.querySelector('[data-youtube-shuffle]');
  const nextButton = mount.querySelector('[data-youtube-next]');
  const titleNode = mount.querySelector('[data-youtube-title]');
  const positionNode = mount.querySelector('[data-youtube-position]');
  const countNode = mount.querySelector('[data-youtube-count]');
  const queueNode = mount.querySelector('[data-youtube-queue]');
  const statusNode = mount.querySelector('.youtubePlayerStatus');

  function removeLegacyPlayer() {
    document.querySelectorAll('.contextRail .youtubeRailPlayer').forEach(node => node.remove());
  }

  function setStatus(message) {
    statusNode.textContent = message || '';
  }

  function setControlsEnabled(enabled) {
    previousButton.disabled = !enabled;
    shuffleButton.disabled = !enabled;
    nextButton.disabled = !enabled;
  }

  function loadIframeApi() {
    if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
    if (window.__arcXiYouTubeApiPromise) return window.__arcXiYouTubeApiPromise;

    window.__arcXiYouTubeApiPromise = new Promise((resolve, reject) => {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReady === 'function') {
          try { previousReady(); } catch (error) { console.warn('Existing YouTube callback failed', error); }
        }
        if (window.YT && typeof window.YT.Player === 'function') resolve(window.YT);
        else reject(new Error('YouTube IFrame API did not initialize.'));
      };

      let script = document.getElementById(API_SCRIPT_ID);
      if (!script) {
        script = document.createElement('script');
        script.id = API_SCRIPT_ID;
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        script.onerror = () => reject(new Error('YouTube IFrame API could not be loaded.'));
        document.head.appendChild(script);
      }
    });
    return window.__arcXiYouTubeApiPromise;
  }

  function currentVideoTitle(index) {
    const data = playerReady && player && typeof player.getVideoData === 'function' ? player.getVideoData() : null;
    const title = String(data && data.title || '').trim();
    if (title && index >= 0 && playlist[index]) knownTitles.set(playlist[index], title);
    return title || (index >= 0 ? knownTitles.get(playlist[index]) : '') || 'YouTube playlist';
  }

  function renderQueue() {
    queueNode.innerHTML = '';
    countNode.textContent = playlist.length ? playlist.length + ' videos' : 'Waiting';
    playlist.forEach((videoId, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'youtubeQueueItem';
      button.dataset.youtubeIndex = String(index);
      button.disabled = !playerReady;
      if (index === currentIndex) button.setAttribute('aria-current', 'true');
      const number = document.createElement('span');
      number.className = 'youtubeQueueNumber';
      number.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.className = 'youtubeQueueTitle';
      label.textContent = knownTitles.get(videoId) || (index === currentIndex ? currentVideoTitle(index) : 'Video ' + (index + 1));
      button.setAttribute('aria-label', 'Play ' + label.textContent + ', item ' + (index + 1) + ' of ' + playlist.length);
      button.append(number, label);
      item.appendChild(button);
      queueNode.appendChild(item);
    });
  }

  function syncPlayerState(announce) {
    if (!playerReady || !player) return;
    try {
      const activePlaylist = player.getPlaylist();
      if (Array.isArray(activePlaylist) && activePlaylist.length) playlist = activePlaylist.slice();
      currentIndex = Number(player.getPlaylistIndex());
      if (!Number.isInteger(currentIndex) || currentIndex < 0) currentIndex = playlist.length ? 0 : -1;
      const title = currentVideoTitle(currentIndex);
      titleNode.textContent = title;
      positionNode.textContent = playlist.length && currentIndex >= 0 ?
        'Video ' + (currentIndex + 1) + ' of ' + playlist.length : 'Playlist ready';
      renderQueue();
      if (announce && playlist.length && currentIndex >= 0) {
        setStatus('Video ' + (currentIndex + 1) + ' of ' + playlist.length + ': ' + title);
      }
    } catch (error) {
      console.warn('YouTube playlist state unavailable', error);
    }
  }

  function onPlayerReady(event) {
    window.clearTimeout(readinessTimer);
    playerReady = true;
    setControlsEnabled(true);
    startButton.hidden = false;
    setStatus('Loading playlist…');
    window.setTimeout(() => {
      try { event.target.setShuffle(shuffleEnabled); } catch {}
      syncPlayerState(false);
      setStatus('Playlist ready. Press Start playlist or use the YouTube play control.');
    }, 250);
  }

  function onPlayerStateChange(event) {
    if (!window.YT || !window.YT.PlayerState) return;
    if (event.data === window.YT.PlayerState.PLAYING) {
      startButton.hidden = true;
      syncPlayerState(true);
      return;
    }
    if (event.data === window.YT.PlayerState.CUED) syncPlayerState(false);
    if (event.data === window.YT.PlayerState.ENDED) window.setTimeout(() => syncPlayerState(true), 150);
  }

  function onPlayerError() {
    if (fallbackAttempted) {
      setStatus('This video is unavailable here. Open the official playlist on YouTube to continue.');
      return;
    }
    fallbackAttempted = true;
    setStatus('The playlist could not be played. Loading the existing official I AM video instead.');
    try { player.cueVideoById(FALLBACK_VIDEO_ID); } catch {}
  }

  async function ensurePlayer() {
    if (player || loadingPlayer) return;
    loadingPlayer = true;
    setStatus('Loading the official YouTube player…');
    const placeholder = document.getElementById('arcXiYoutubePlayer');
    const frame = document.createElement('iframe');
    frame.id = 'arcXiYoutubePlayer';
    frame.title = 'Official IVE YouTube playlist';
    frame.loading = 'eager';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.src = 'https://www.youtube-nocookie.com/embed/videoseries?list=' + encodeURIComponent(YOUTUBE_PLAYLIST_ID) +
      '&enablejsapi=1&playsinline=1&rel=0&modestbranding=1&origin=' + encodeURIComponent(window.location.origin);
    if (placeholder) placeholder.replaceWith(frame);
    readinessTimer = window.setTimeout(() => {
      if (!playerReady) setStatus('Use the YouTube controls in the player. Extra playlist controls are still connecting.');
    }, 8000);
    try {
      const YT = await loadIframeApi();
      player = new YT.Player(frame, {
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    } catch (error) {
      setStatus('The official playlist is available above. Extra playlist controls could not connect.');
      console.warn(error && error.message ? error.message : 'YouTube controls could not be loaded.');
    } finally {
      loadingPlayer = false;
    }
  }

  toggle.addEventListener('click', () => {
    expanded = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    body.hidden = !expanded;
    if (expanded) ensurePlayer();
  });

  window.addEventListener('arcxi:open-media', () => {
    if (!expanded) toggle.click();
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mount.scrollIntoView({behavior:reduceMotion ? 'auto' : 'smooth', block:'start'});
    window.setTimeout(() => toggle.focus({preventScroll:true}), reduceMotion ? 0 : 350);
  });

  startButton.addEventListener('click', () => {
    if (!playerReady || !player) return;
    setStatus('Starting playlist…');
    try { player.playVideo(); } catch {}
  });

  previousButton.addEventListener('click', () => {
    if (!playerReady || !player) return;
    try { player.previousVideo(); } catch {}
  });

  nextButton.addEventListener('click', () => {
    if (!playerReady || !player) return;
    try { player.nextVideo(); } catch {}
  });

  shuffleButton.addEventListener('click', () => {
    if (!playerReady || !player) return;
    shuffleEnabled = !shuffleEnabled;
    shuffleButton.setAttribute('aria-pressed', String(shuffleEnabled));
    shuffleButton.textContent = shuffleEnabled ? 'Shuffle on' : 'Shuffle off';
    try { sessionStorage.setItem(SHUFFLE_STORAGE_KEY, shuffleEnabled ? '1' : '0'); } catch {}
    try { player.setShuffle(shuffleEnabled); } catch {}
    setStatus(shuffleEnabled ? 'Shuffle is on.' : 'Shuffle is off.');
    window.setTimeout(() => syncPlayerState(false), 100);
  });

  queueNode.addEventListener('click', event => {
    const button = event.target.closest('[data-youtube-index]');
    if (!button || !playerReady || !player) return;
    const index = Number(button.dataset.youtubeIndex);
    if (!Number.isInteger(index)) return;
    try { player.playVideoAt(index); } catch {}
  });

  renderQueue();

  removeLegacyPlayer();
  if (app) new MutationObserver(removeLegacyPlayer).observe(app, {childList:true, subtree:true});

  window.addEventListener('pagehide', () => {
    window.clearTimeout(readinessTimer);
    if (player && typeof player.destroy === 'function') {
      try { player.destroy(); } catch {}
      player = null;
      playerReady = false;
    }
  }, {once:true});
})();
