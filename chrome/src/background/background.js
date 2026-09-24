/**
 * Background Service Worker - Direct Media Support
 * Ensures content script is injected on direct media file URLs (mp4, mp3, etc.)
 * Chrome does not auto-inject content scripts on media documents, so we handle it here.
 * Also provides fallback shortcut handling for media documents.
 */

'use strict';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/** Media file extensions that should trigger direct injection */
const MEDIA_EXTENSIONS = /\.(mp4|webm|ogg|ogv|mp3|wav|flac|m4a|aac|opus|mov|avi|mkv|3gp|m3u8|mpd|wav|wma)$/i;

/**
 * Check if a URL is a direct media file.
 * Includes file:// URLs (requires file access permission).
 */
function isDirectMediaUrl(url) {
  if (!url) return false;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) return false;
  if (url.startsWith('file://')) return true;

  try {
    const u = new URL(url);
    if (MEDIA_EXTENSIONS.test(u.pathname)) return true;
    if (u.protocol === 'blob:' && MEDIA_EXTENSIONS.test(url)) return true;
  } catch (e) {
    if (MEDIA_EXTENSIONS.test(url)) return true;
  }
  return false;
}

/**
 * Inject content scripts and fallback handler for direct media URLs.
 * Uses multiple delayed attempts to handle slow loading media documents.
 */
async function injectForDirectMedia(tabId, url) {
  if (!isDirectMediaUrl(url)) return;
  if (!tabId) return;

  // Three attempts: immediate, 800ms, 2000ms
  const attempts = [0, 800, 2000];

  for (let delay of attempts) {
    setTimeout(async () => {
      try {
        if (!tabId) return;

        // Inject CSS for status popup
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['src/inject/inject.css'],
          });
          if (chrome.runtime.lastError) return;
        } catch (e) {
          if (chrome.runtime.lastError) return;
        }

        // Inject main content script
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['src/inject/inject.js'],
          });
          if (chrome.runtime.lastError) return;
        } catch (e) {
          if (chrome.runtime.lastError) return;
        }

        // Fallback: full shortcut handling for media documents that block normal injection
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              // Prevent duplicate injection
              if (window._uvsDirectInjected) return;
              window._uvsDirectInjected = true;

              // -----------------------------------------------------------------
              // Fallback State (mirrors inject.js but simplified for background)
              // -----------------------------------------------------------------
              let speed = 1.0;
              let speedWasSet = false;
              let bindings = null;

              // Configurable hold speed
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

              let HOLD_MAX = 16;
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
                } catch (e) {}
                return [...new Set(media.filter((m) => m))];
              }

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
                if (isHoldInProgress() && Math.abs(s - getHoldSpeed()) > 0.15) return;
                speed = s;
                getAllMedia().forEach((m) => {
                  try {
                    if (Math.abs(m.playbackRate - getHoldSpeed()) < 0.15 && isHoldInProgress() && Math.abs(s - getHoldSpeed()) > 0.15) return;
                    if (force || Math.abs(m.playbackRate - s) > 0.01) m.playbackRate = s;
                    m.controls = true;
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
                  if (binding.key && binding.key.length === 1) {
                    if (event.key.toLowerCase() === binding.key.toLowerCase()) return true;
                  } else if (binding.key && event.key === binding.key) return true;
                  if (binding.code && event.code === binding.code) return true;
                }
                return false;
              }

              let activeSpeedKeys = new Set();

              function showStatus(text, type = 'normal') {
                let child = document.querySelector('.uvs-show-status-popup');
                if (!child) {
                  child = document.createElement('div');
                  child.classList.add('uvs-show-status-popup');
                  try {
                    document.documentElement.appendChild(child);
                  } catch (e) {
                    document.body.appendChild(child);
                  }
                }
                child.removeAttribute('hidden');

                if (type === 'hold') {
                  child.textContent = `HOLD: ${Number(text).toFixed(2)}x ▶▶ - Release`;
                  child.style.borderColor = '#10b981';
                  child.style.background = '#f9fafb';
                } else if (type === 'rewind') {
                  child.textContent = `REWIND: ${Number(text).toFixed(0)}x ◀◀ - Release`;
                  child.style.borderColor = '#f59e0b';
                  child.style.background = '#fffbeb';
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
                  child.style.borderColor = '';
                  child.style.background = '';
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

              // Load settings
              try {
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
                    if (!isAnyMediaAtHoldSpeed()) applySpeed(speed, true);
                  }
                );

                // Listen for storage changes
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
              } catch (e) {
                bindings = defaultBindings;
              }

              // Keyboard handlers for direct media documents
              document.addEventListener(
                'keydown',
                (event) => {
                  if (!bindings) bindings = defaultBindings;
                  if (
                    event.repeat &&
                    ((keyMatches(event, bindings['hold-speed']) && holdActive) ||
                      (keyMatches(event, bindings['hold-reverse']) && reverseHoldActive))
                  ) {
                    event.preventDefault();
                    return;
                  }

                  const mediaList = getAllMedia();
                  if (mediaList.length === 0) return;

                  if (keyMatches(event, bindings['hold-speed']) && !holdActive && !reverseHoldActive) {
                    savedSpeedBeforeHold = mediaList[0] ? mediaList[0].playbackRate : speed;
                    holdActive = true;
                    mediaList.forEach((m) => {
                      try {
                        if (m.paused) m.play().catch(() => {});
                        m.playbackRate = getHoldSpeed();
                      } catch (e) {}
                    });
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
                    return;
                  }

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
                    return;
                  }

                  if (holdActive || reverseHoldActive) return;

                  let skipHandled = false;
                  let speedHandled = false;
                  let speedType = 'normal';
                  let newSpeedForStatus = null;

                  mediaList.forEach((media) => {
                    if (!media) return;
                    if (keyMatches(event, bindings['skip-forward'])) {
                      const skipAmount = (10 * media.playbackRate).toFixed(1);
                      media.currentTime += 10 * media.playbackRate;
                      if (!skipHandled) {
                        activeSpeedKeys.add('skip-forward');
                        showStatus(skipAmount, 'skip-forward');
                        skipHandled = true;
                      }
                      event.preventDefault();
                    } else if (keyMatches(event, bindings['skip-backward'])) {
                      const skipAmount = (10 * media.playbackRate).toFixed(1);
                      media.currentTime -= 10 * media.playbackRate;
                      if (!skipHandled) {
                        activeSpeedKeys.add('skip-backward');
                        showStatus(skipAmount, 'skip-backward');
                        skipHandled = true;
                      }
                      event.preventDefault();
                    } else if (keyMatches(event, bindings['pause'])) {
                      if (media.paused) media.play().catch(() => {});
                      else media.pause();
                      event.preventDefault();
                    } else if (keyMatches(event, bindings['reset-speed'])) {
                      speed = 1;
                      applySpeed(1, true);
                      showStatus(1);
                      event.preventDefault();
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
                        const newRate = media.playbackRate + delta;
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
                        }
                        event.preventDefault();
                      }
                    }
                  });

                  if (event.repeat && (skipHandled || speedHandled) && newSpeedForStatus !== null) {
                    showStatus(newSpeedForStatus, speedType);
                  }
                },
                true
              );

              document.addEventListener(
                'keyup',
                (event) => {
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
                    event.preventDefault();
                  }
                },
                true
              );

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

              // Message handling for popup
              try {
                chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                  if (request.from === 'uvs' || request.from === 'cas' || request.from === 'cys') {
                    if (request.message === 'speed-change') {
                      speed = Number(request.speed);
                      speedWasSet = true;
                      applySpeed(speed, true);
                      sendResponse({ from: 'uvs', ok: true });
                      return true;
                    }
                    if (request.message === 'site-speed-set') {
                      try {
                        if (request.speed != null) {
                          speed = Number(request.speed);
                          speedWasSet = false;
                          applySpeed(speed, true);
                        } else {
                          speedWasSet = false;
                          chrome.storage.sync.get(
                            { 'uvs-default-speed': 1, 'uvs-site-speeds': {}, ...defaultBindings },
                            (items) => {
                              let defaultSpeed = Number(items['uvs-default-speed']) || 1;
                              siteSpeedsCache = items['uvs-site-speeds'] || {};
                              const host = getHostname();
                              const siteSpeed = getSiteSpeedForHost(host, siteSpeedsCache);
                              speed = siteSpeed != null ? siteSpeed : defaultSpeed;
                              applySpeed(speed, true);
                            }
                          );
                        }
                      } catch (e) {}
                      sendResponse({ from: 'uvs', ok: true });
                      return true;
                    }
                    if (request.message === 'speed-query') {
                      const media = getAllMedia();
                      const first = media[0];
                      sendResponse({
                        from: 'uvs',
                        ok: true,
                        'current-speed': first ? first.playbackRate : speed,
                        'is-direct-media': true,
                        'media-count': media.length,
                      });
                      return true;
                    }
                    if (request.message === 'presets-query') {
                      chrome.storage.sync.get(
                        { 'uvs-user-presets': ['1', '1.25', '1.5', '1.75', '2', '2.5', '3', '4'] },
                        (items) => {
                          sendResponse({ from: 'uvs', ok: true, presets: items['uvs-user-presets'] });
                        }
                      );
                      return true;
                    }
                  }
                  return true;
                });
              } catch (e) {}

              // Enforce speed for direct media
              let count = 0;
              const interval = setInterval(() => {
                if (isHoldInProgress()) return;
                if (speedWasSet) return;
                count++;
                applySpeed(speed, count < 5);
                if (count > 15) clearInterval(interval);
              }, 600);
            },
          });
        } catch (e) {}
      } catch (e) {}
    }, delay);
  }
}

// -----------------------------------------------------------------------------
// Tab & Navigation Listeners
// -----------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || (tab && tab.url);
  if (url && (changeInfo.status === 'loading' || changeInfo.status === 'complete' || changeInfo.url)) {
    await injectForDirectMedia(tabId, url);
  }
});

if (chrome.webNavigation) {
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId === 0) await injectForDirectMedia(details.tabId, details.url);
  });
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId === 0) await injectForDirectMedia(details.tabId, details.url);
  });
}

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.url) await injectForDirectMedia(tab.id, tab.url);
});
