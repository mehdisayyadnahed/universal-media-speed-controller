/**
 * Direct Media Handler - MAIN world
 * Handles direct media file URLs (mp4, mp3, etc.) and file:// URLs
 * Runs in MAIN world to bypass browser's native media key handling
 *
 * This script ensures shortcuts work even when browser's built-in media player
 * would normally intercept keyboard events.
 */

(function () {
  'use strict';

  // Prevent duplicate injection (allow re-injection for file:// to ensure handlers)
  const isFile = location.href.startsWith('file://');
  if (window._uvsDirectMainInjected && !isFile) return;
  if (window._uvsDirectMainInjected && isFile && window._uvsDirectMainHandlersSetup) return;
  window._uvsDirectMainInjected = true;
  window._uvsDirectMainHandlersSetup = true;

  // ---------------------------------------------------------------------------
  // Detection: Is this a direct media page?
  // ---------------------------------------------------------------------------

  function isDirectMediaPage() {
    try {
      const href = location.href;

      // file:// URLs: treat as direct media if URL looks like media or has video/audio
      if (href.startsWith('file://')) {
        if (href.match(/\.(mp4|webm|ogg|ogv|mp3|wav|flac|m4a|aac|opus|mov|avi|mkv|3gp|m3u8|mpd|wma)(\?|#|$)/i)) return true;
        if (document.querySelector('video, audio')) return true;
        if (document.body && document.body.children.length <= 2) return true;
      }

      if (href.match(/\.(mp4|webm|ogg|ogv|mp3|wav|flac|m4a|aac|opus|mov|avi|mkv|3gp|m3u8|mpd|wma)(\?|#|$)/i)) return true;
      if (document.contentType && (document.contentType.startsWith('video/') || document.contentType.startsWith('audio/'))) return true;

      if (document.body && document.body.children.length <= 2) {
        const hasVideo = document.querySelector('video, audio');
        if (hasVideo) {
          const text = document.body.innerText ? document.body.innerText.trim() : '';
          if (text.length < 100) return true;
        }
      }

      const videos = document.getElementsByTagName('video');
      if (videos.length === 1 && document.body && document.body.children.length === 1) return true;
      if (href.startsWith('file://') && videos.length >= 1) return true;
    } catch (e) {}
    return false;
  }

  const isDirect = isDirectMediaPage();
  const url = location.href;
  const isFileUrl = url.startsWith('file://');
  const isMediaUrl = url.match(/\.(mp4|webm|ogg|mp3|wav|m4a|mov|avi|mkv)$/i) || isFileUrl;
  const shouldActivate = isDirect || isMediaUrl || isFileUrl;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let speed = 1.0;
  let speedWasSet = false;
  let bindings = null;

  // Configurable hold speed (2x - 16x)
  let holdSpeedValue = 16;
  function getHoldSpeed() {
    return Number(holdSpeedValue) || 16;
  }

  let holdActive = false;
  let savedSpeedBeforeHold = 1.0;
  let holdEnforceInterval = null;

  let reverseHoldActive = false;
  let savedStates = new Map();
  let reverseRafId = null;
  let lastReverseTime = 0;

  let HOLD_MAX = 16; // Legacy variable, updated via holdSpeedValue
  let REWIND_SPEED = 16;

  const defaultBindings = {
    'skip-forward':  { key: ']',  code: 'BracketRight', ctrl: true, alt: false, shift: false, meta: false },
    'skip-backward': { key: '[',  code: 'BracketLeft',  ctrl: true, alt: false, shift: false, meta: false },
    'speed-up':      { key: ';',  code: 'Semicolon',    ctrl: true, alt: false, shift: false, meta: false },
    'slow-down':     { key: "'",  code: 'Quote',        ctrl: true, alt: false, shift: false, meta: false },
    'big-speed-up':  { key: '.',  code: 'Period',       ctrl: true, alt: false, shift: false, meta: false },
    'big-slow-down': { key: ',',  code: 'Comma',        ctrl: true, alt: false, shift: false, meta: false },
    'reset-speed':   { key: '/',  code: 'Slash',        ctrl: true, alt: false, shift: false, meta: false },
    'pause':         { key: 'y',  code: 'KeyY',         ctrl: true, alt: false, shift: false, meta: false },
    'hold-speed':    { key: 'q',  code: 'KeyQ',         ctrl: true, alt: false, shift: false, meta: false },
    'hold-reverse':  { key: '`',  code: 'Backquote',    ctrl: true, alt: false, shift: false, meta: false },
  };

  // ---------------------------------------------------------------------------
  // Media Helpers
  // ---------------------------------------------------------------------------

  function getAllMedia() {
    let media = [];
    try {
      media.push(...document.querySelectorAll('video, audio'));
      if (document.body) {
        media.push(...document.body.querySelectorAll('video, audio'));
        media.push(...document.body.getElementsByTagName('video'));
        media.push(...document.body.getElementsByTagName('audio'));
      }
      media.push(...document.getElementsByTagName('video'));
      media.push(...document.getElementsByTagName('audio'));
      if (isFileUrl) {
        media.push(...document.querySelectorAll('video'));
      }
    } catch (e) {}
    return [...new Set(media.filter((m) => m))];
  }

  function getHostname() {
    try {
      if (location.protocol === 'file:') return 'file:///';
      return location.hostname.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function getSiteSpeedForHost(host, siteSpeeds) {
    if (!host || !siteSpeeds) return null;
    try {
      if (host === 'file:///' || host.startsWith('file://')) {
        if (siteSpeeds['file:///'] != null) return Number(siteSpeeds['file:///']);
        if (siteSpeeds['file://'] != null) return Number(siteSpeeds['file://']);
        return null;
      }
      host = host.toLowerCase();
      const hostNoWww = host.replace(/^www\./, '');
      if (siteSpeeds[host] != null) return Number(siteSpeeds[host]);
      if (siteSpeeds[hostNoWww] != null) return Number(siteSpeeds[hostNoWww]);
      for (let domain in siteSpeeds) {
        const d = domain.toLowerCase().trim();
        const dNoWww = d.replace(/^www\./, '');
        if (host === d || host === dNoWww || hostNoWww === d || hostNoWww === dNoWww) {
          return Number(siteSpeeds[domain]);
        }
        if (host.endsWith('.' + d) || host.endsWith('.' + dNoWww) || hostNoWww.endsWith('.' + d) || hostNoWww.endsWith('.' + dNoWww)) {
          return Number(siteSpeeds[domain]);
        }
      }
    } catch (e) {}
    return null;
  }

  let siteSpeedsCache = {};
  let defaultSpeedCache = 1;

  function isAnyMediaAtHoldSpeed() {
    try {
      const all = getAllMedia();
      return all.some((m) => {
        try {
          return Math.abs(m.playbackRate - getHoldSpeed()) < 0.15;
        } catch (e) {
          return false;
        }
      });
    } catch (e) {
      return false;
    }
  }

  function isHoldInProgress() {
    return holdActive || reverseHoldActive || isAnyMediaAtHoldSpeed();
  }

  function applySpeed(s, force = false) {
    // Never override hold speed during active hold
    if (isHoldInProgress() && Math.abs(s - getHoldSpeed()) > 0.15) return;

    speed = s;
    getAllMedia().forEach((m) => {
      try {
        if (Math.abs(m.playbackRate - getHoldSpeed()) < 0.15 && isHoldInProgress() && Math.abs(s - getHoldSpeed()) > 0.15) return;
        if (force || Math.abs(m.playbackRate - s) > 0.01) m.playbackRate = s;
        if (shouldActivate) {
          try {
            m.controls = true;
          } catch (e) {}
        }
      } catch (e) {}
    });
  }

  function keyMatches(event, binding) {
    if (!binding) return false;
    if (typeof binding === 'string') {
      return event.key === binding || event.key.toLowerCase() === binding.toLowerCase();
    }
    if (typeof binding === 'object' && (binding.key || binding.code)) {
      if (!!binding.ctrl !== event.ctrlKey) return false;
      if (!!binding.alt !== event.altKey) return false;
      if (!!binding.shift !== event.shiftKey) return false;
      if (!!binding.meta !== event.metaKey) return false;
      if (binding.code && event.code === binding.code) return true;
      if (binding.key) {
        if (binding.key.length === 1) {
          if (event.key.toLowerCase() === binding.key.toLowerCase()) return true;
        } else {
          if (event.key === binding.key) return true;
        }
      }
      if (binding.code && event.code === binding.code) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Status Popup
  // ---------------------------------------------------------------------------

  let activeSpeedKeys = new Set();

  function showStatus(text, type = 'normal') {
    let child = document.querySelector('.uvs-show-status-popup');
    if (!child) {
      child = document.createElement('div');
      child.className = 'uvs-show-status-popup';
      child.style.cssText =
        'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#fff;border:2px solid #111827;border-radius:10px;padding:8px 16px;font-family:monospace;font-weight:700;font-size:14px;color:#000;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,0.15);';
      try {
        document.documentElement.appendChild(child);
      } catch (e) {
        try {
          document.body.appendChild(child);
        } catch (e2) {}
      }
    }
    if (!child) return;
    child.removeAttribute('hidden');

    if (type === 'hold') {
      child.textContent = `HOLD: ${Number(text).toFixed(2)}x ▶▶ - Release`;
      child.style.borderColor = '#10b981';
      child.style.background = '#f9fafb';
    } else if (type === 'rewind') {
      child.textContent = `REWIND: ${Number(text).toFixed(0)}x ◀◀ - Release`;
      child.style.borderColor = '#10b981';
      child.style.background = '#f9fafb';
    } else if (type === 'speed-up') {
      child.textContent = `Speed: ${Number(text).toFixed(2)}x ▲ - Holding`;
      child.style.borderColor = '#3b82f6';
      child.style.background = '#eff6ff';
    } else if (type === 'slow-down') {
      child.textContent = `Speed: ${Number(text).toFixed(2)}x ▼ - Holding`;
      child.style.borderColor = '#3b82f6';
      child.style.background = '#eff6ff';
    } else if (type === 'big-speed-up') {
      child.textContent = `Speed: ${Number(text).toFixed(2)}x ▲▲ - Holding`;
      child.style.borderColor = '#8b5cf6';
      child.style.background = '#f5f3ff';
    } else if (type === 'big-slow-down') {
      child.textContent = `Speed: ${Number(text).toFixed(2)}x ▼▼ - Holding`;
      child.style.borderColor = '#8b5cf6';
      child.style.background = '#f5f3ff';
    } else if (type === 'skip-forward') {
      child.textContent = `→ Skip +${text}s ▶▶`;
      child.style.borderColor = '#111827';
      child.style.background = '#ffffff';
    } else if (type === 'skip-backward') {
      child.textContent = `◀◀ Skip -${text}s ◀`;
      child.style.borderColor = '#111827';
      child.style.background = '#ffffff';
    } else {
      child.textContent = `Speed: ${Number(text).toFixed(2)}x`;
      child.style.borderColor = '#111827';
      child.style.background = '#fff';
    }

    clearTimeout(child._timeout);
    const isHolding = activeSpeedKeys.size > 0 || holdActive || reverseHoldActive;
    if (isHolding || type === 'hold' || type === 'rewind') {
      const keepAlive = () => {
        const stillHolding = activeSpeedKeys.size > 0 || holdActive || reverseHoldActive;
        if (stillHolding) {
          child._timeout = setTimeout(keepAlive, 300);
        } else {
          child._timeout = setTimeout(() => child.setAttribute('hidden', 'true'), 600);
        }
      };
      child._timeout = setTimeout(keepAlive, 300);
    } else {
      child._timeout = setTimeout(() => child.setAttribute('hidden', 'true'), 950);
    }
  }

  // ---------------------------------------------------------------------------
  // Load Settings
  // ---------------------------------------------------------------------------

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(
        { 'uvs-default-speed': 1, 'uvs-site-speeds': {}, 'uvs-hold-speed': 16, ...defaultBindings },
        (items) => {
          let defaultSpeed = Number(items['uvs-default-speed']) || 1;
          defaultSpeedCache = defaultSpeed;
          siteSpeedsCache = items['uvs-site-speeds'] || {};
          const host = getHostname();
          const siteSpeed = getSiteSpeedForHost(host, siteSpeedsCache);
          speed = siteSpeed != null ? siteSpeed : defaultSpeed;
          speedWasSet = false;
          bindings = items;

          try {
            const hs = Number(items['uvs-hold-speed']);
            if (!isNaN(hs) && hs >= 2 && hs <= 16) {
              holdSpeedValue = hs;
              HOLD_MAX = hs;
              REWIND_SPEED = hs;
            }
          } catch (e) {}

          if (shouldActivate && !isHoldInProgress()) applySpeed(speed, true);
        }
      );

      // Listen for changes (site speeds, default speed, hold speed)
      try {
        if (chrome.storage && chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes['uvs-site-speeds']) {
              siteSpeedsCache = changes['uvs-site-speeds'].newValue || {};
              const host = getHostname();
              const siteSpeed = getSiteSpeedForHost(host, siteSpeedsCache);
              if (!isHoldInProgress() && !speedWasSet) {
                speed = siteSpeed != null ? siteSpeed : defaultSpeedCache || 1;
                applySpeed(speed, true);
              }
            }
            if (area === 'sync' && changes['uvs-hold-speed']) {
              try {
                const nh = Number(changes['uvs-hold-speed'].newValue) || 16;
                if (!isNaN(nh) && nh >= 2 && nh <= 16) {
                  holdSpeedValue = nh;
                  HOLD_MAX = nh;
                  REWIND_SPEED = nh;
                }
              } catch (e) {}
            }
            if (area === 'sync' && changes['uvs-default-speed']) {
              defaultSpeedCache = Number(changes['uvs-default-speed'].newValue) || 1;
              if (!speedWasSet && !isHoldInProgress()) {
                const host = getHostname();
                const siteSpeed = getSiteSpeedForHost(host, siteSpeedsCache);
                if (siteSpeed == null) {
                  speed = defaultSpeedCache;
                  applySpeed(speed, true);
                }
              }
            }
          });
        }
      } catch (e) {}
    } else {
      bindings = defaultBindings;
    }
  } catch (e) {
    bindings = defaultBindings;
  }

  // Initial enforcement for direct media files
  if (shouldActivate) {
    let count = 0;
    const interval = setInterval(() => {
      if (isHoldInProgress()) return;
      if (speedWasSet) return; // Don't override manual changes
      count++;
      const media = getAllMedia();
      if (media.length > 0) applySpeed(speed, count < 5);
      if (count > 15) clearInterval(interval);
    }, 500);
  }

  // ---------------------------------------------------------------------------
  // Keyboard Handlers (MAIN world - bypass native player)
  // ---------------------------------------------------------------------------

  function handleKeyDown(event) {
    if (!bindings) bindings = defaultBindings;
    const mediaList = getAllMedia();
    if (mediaList.length === 0 && !shouldActivate) return;

    // Ignore typing in inputs (except for direct media pages)
    if (!isFileUrl && !isDirect) {
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase() || '';
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return;
    }

    // Prevent repeat during hold
    if (
      event.repeat &&
      ((keyMatches(event, bindings['hold-speed']) && holdActive) ||
        (keyMatches(event, bindings['hold-reverse']) && reverseHoldActive))
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    // Hold forward
    if (keyMatches(event, bindings['hold-speed']) && !holdActive && !reverseHoldActive) {
      savedSpeedBeforeHold = mediaList[0] ? mediaList[0].playbackRate : speed;
      holdActive = true;
      mediaList.forEach((m) => {
        try {
          if (m.paused) m.play().catch(() => {});
          m.playbackRate = getHoldSpeed();
        } catch (e) {}
      });
      if (mediaList.length === 0) applySpeed(getHoldSpeed(), true);
      showStatus(getHoldSpeed(), 'hold');

      if (holdEnforceInterval) clearInterval(holdEnforceInterval);
      holdEnforceInterval = setInterval(() => {
        if (!holdActive) {
          clearInterval(holdEnforceInterval);
          holdEnforceInterval = null;
          return;
        }
        getAllMedia().forEach((m) => {
          try {
            if (Math.abs(m.playbackRate - getHoldSpeed()) > 0.01) m.playbackRate = getHoldSpeed();
            if (m.paused) m.play().catch(() => {});
          } catch (e) {}
        });
      }, 50);

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      return;
    }

    // Hold reverse (rewind)
    if (keyMatches(event, bindings['hold-reverse']) && !reverseHoldActive && !holdActive) {
      reverseHoldActive = true;
      savedStates.clear();
      lastReverseTime = performance.now();
      mediaList.forEach((m) => {
        try {
          savedStates.set(m, { speed: m.playbackRate, paused: m.paused });
          if (!m.paused) m.pause();
        } catch (e) {}
      });
      showStatus(getHoldSpeed(), 'rewind');

      function rewindLoop(now) {
        if (!reverseHoldActive) return;
        const delta = (now - lastReverseTime) / 1000;
        lastReverseTime = now;
        getAllMedia().forEach((media) => {
          try {
            if (media.readyState >= 1) {
              let newTime = media.currentTime - getHoldSpeed() * delta;
              if (newTime < 0) newTime = 0;
              if (Math.abs(media.currentTime - newTime) > 0.01) media.currentTime = newTime;
            }
          } catch (e) {}
        });
        reverseRafId = requestAnimationFrame(rewindLoop);
      }
      reverseRafId = requestAnimationFrame(rewindLoop);

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      return;
    }

    if (holdActive || reverseHoldActive) return;

    let handled = false;
    let skipHandled = false;
    let speedHandled = false;
    let speedType = 'normal';
    let newSpeedForStatus = null;

    mediaList.forEach((media) => {
      if (!media) return;
      if (keyMatches(event, bindings['skip-forward'])) {
        const skipAmount = (10 * media.playbackRate).toFixed(1);
        try {
          media.currentTime += 10 * media.playbackRate;
        } catch (e) {}
        if (!skipHandled) {
          activeSpeedKeys.add('skip-forward');
          showStatus(skipAmount, 'skip-forward');
          skipHandled = true;
        }
        handled = true;
      } else if (keyMatches(event, bindings['skip-backward'])) {
        const skipAmount = (10 * media.playbackRate).toFixed(1);
        try {
          media.currentTime -= 10 * media.playbackRate;
        } catch (e) {}
        if (!skipHandled) {
          activeSpeedKeys.add('skip-backward');
          showStatus(skipAmount, 'skip-backward');
          skipHandled = true;
        }
        handled = true;
      } else if (keyMatches(event, bindings['pause'])) {
        try {
          if (media.paused) media.play().catch(() => {});
          else media.pause();
        } catch (e) {}
        handled = true;
      } else if (keyMatches(event, bindings['reset-speed'])) {
        speed = 1;
        applySpeed(1, true);
        showStatus(1);
        handled = true;
      } else {
        let delta = 0;
        let currentType = 'normal';
        if (keyMatches(event, bindings['speed-up'])) {
          delta = 0.1;
          currentType = 'speed-up';
        } else if (keyMatches(event, bindings['slow-down'])) {
          delta = -0.1;
          currentType = 'slow-down';
        } else if (keyMatches(event, bindings['big-speed-up'])) {
          delta = 1;
          currentType = 'big-speed-up';
        } else if (keyMatches(event, bindings['big-slow-down'])) {
          delta = -1;
          currentType = 'big-slow-down';
        }
        if (delta !== 0) {
          const newRate = (media.playbackRate || speed) + delta;
          if (newRate >= 0.1 && newRate <= 16) {
            speed = newRate;
            applySpeed(newRate, true);
            if (!speedHandled) {
              activeSpeedKeys.add(currentType);
              showStatus(newRate, currentType);
              speedHandled = true;
              newSpeedForStatus = newRate;
              speedType = currentType;
            }
            handled = true;
          }
        }
      }
    });

    // Handle pages where media not yet found but shouldActivate
    if (!handled && shouldActivate) {
      let delta = 0;
      let currentType = 'normal';
      if (keyMatches(event, bindings['speed-up'])) {
        delta = 0.1;
        currentType = 'speed-up';
      } else if (keyMatches(event, bindings['slow-down'])) {
        delta = -0.1;
        currentType = 'slow-down';
      } else if (keyMatches(event, bindings['big-speed-up'])) {
        delta = 1;
        currentType = 'big-speed-up';
      } else if (keyMatches(event, bindings['big-slow-down'])) {
        delta = -1;
        currentType = 'big-slow-down';
      } else if (keyMatches(event, bindings['reset-speed'])) {
        speed = 1;
        applySpeed(1, true);
        showStatus(1);
        handled = true;
      } else if (keyMatches(event, bindings['pause'])) {
        const ml = getAllMedia();
        ml.forEach((m) => {
          try {
            if (m.paused) m.play().catch(() => {});
            else m.pause();
          } catch (e) {}
        });
        handled = ml.length > 0;
      }
      if (delta !== 0) {
        const newRate = speed + delta;
        if (newRate >= 0.1 && newRate <= 16) {
          speed = newRate;
          applySpeed(newRate, true);
          activeSpeedKeys.add(currentType);
          showStatus(newRate, currentType);
          handled = true;
          newSpeedForStatus = newRate;
          speedType = currentType;
        }
      }
    }

    if (event.repeat && (skipHandled || speedHandled) && newSpeedForStatus !== null) {
      showStatus(newSpeedForStatus, speedType);
    }

    if (handled) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  }

  function handleKeyUp(event) {
    if (!bindings) return;

    if (keyMatches(event, bindings['skip-forward'])) activeSpeedKeys.delete('skip-forward');
    if (keyMatches(event, bindings['skip-backward'])) activeSpeedKeys.delete('skip-backward');
    if (keyMatches(event, bindings['speed-up'])) activeSpeedKeys.delete('speed-up');
    if (keyMatches(event, bindings['slow-down'])) activeSpeedKeys.delete('slow-down');
    if (keyMatches(event, bindings['big-speed-up'])) activeSpeedKeys.delete('big-speed-up');
    if (keyMatches(event, bindings['big-slow-down'])) activeSpeedKeys.delete('big-slow-down');

    if (activeSpeedKeys.size === 0 && !holdActive && !reverseHoldActive) {
      const child = document.querySelector('.uvs-show-status-popup');
      if (child) {
        clearTimeout(child._timeout);
        child._timeout = setTimeout(() => child.setAttribute('hidden', 'true'), 600);
      }
    }

    if (keyMatches(event, bindings['hold-speed']) && holdActive) {
      holdActive = false;
      if (holdEnforceInterval) {
        clearInterval(holdEnforceInterval);
        holdEnforceInterval = null;
      }
      const restoreSpeed = savedSpeedBeforeHold;
      speed = restoreSpeed;
      getAllMedia().forEach((m) => {
        try {
          m.playbackRate = restoreSpeed;
        } catch (e) {}
      });
      showStatus(restoreSpeed);
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    if (keyMatches(event, bindings['hold-reverse']) && reverseHoldActive) {
      reverseHoldActive = false;
      if (reverseRafId) {
        cancelAnimationFrame(reverseRafId);
        reverseRafId = null;
      }
      savedStates.forEach((state, media) => {
        try {
          media.playbackRate = state.speed;
          if (!state.paused) media.play().catch(() => {});
        } catch (e) {}
      });
      savedStates.clear();
      showStatus(speed);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  // Attach listeners in all possible scopes to bypass native player
  try {
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    if (document.body) document.body.addEventListener('keydown', handleKeyDown, true);
    document.documentElement.addEventListener('keydown', handleKeyDown, true);
  } catch (e) {}

  try {
    window.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('keyup', handleKeyUp, true);
    if (document.body) document.body.addEventListener('keyup', handleKeyUp, true);
  } catch (e) {}

  window.addEventListener('blur', () => {
    activeSpeedKeys.clear();
    const popup = document.querySelector('.uvs-show-status-popup');
    if (popup) {
      clearTimeout(popup._timeout);
      popup.setAttribute('hidden', 'true');
    }
    if (holdActive) {
      holdActive = false;
      if (holdEnforceInterval) {
        clearInterval(holdEnforceInterval);
        holdEnforceInterval = null;
      }
      const restoreSpeed = savedSpeedBeforeHold;
      speed = restoreSpeed;
      getAllMedia().forEach((m) => {
        try {
          m.playbackRate = restoreSpeed;
        } catch (e) {}
      });
    }
    if (reverseHoldActive) {
      reverseHoldActive = false;
      if (reverseRafId) cancelAnimationFrame(reverseRafId);
      savedStates.forEach((s, m) => {
        try {
          m.playbackRate = s.speed;
          if (!s.paused) m.play().catch(() => {});
        } catch (e) {}
      });
      savedStates.clear();
    }
  });

  // Attach to existing media elements
  setTimeout(() => {
    getAllMedia().forEach((m) => {
      try {
        m.addEventListener('keydown', handleKeyDown, true);
        m.addEventListener('keyup', handleKeyUp, true);
      } catch (e) {}
    });
  }, 500);

  // Observe new media elements
  try {
    let lastRun = 0;
    const observer = new MutationObserver(() => {
      try {
        const now = Date.now();
        if (now - lastRun < 500) return;
        lastRun = now;
        getAllMedia().forEach((m) => {
          try {
            if (!m._uvsDirectHandler) {
              m.addEventListener('keydown', handleKeyDown, true);
              m._uvsDirectHandler = true;
            }
          } catch (e) {}
        });
      } catch (e) {}
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
