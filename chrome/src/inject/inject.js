/**
 * Universal Media Speed Controller v1.2
 * Content script injected into all pages (MAIN world isolation)
 *
 * Features:
 * - Controls <video> and <audio> on any website, including shadow DOM and iframes
 * - Supports direct media files (mp4, mp3, webm, etc.) opened directly
 * - Per-site custom speeds with global default fallback
 * - Hold shortcuts for fast forward/rewind with configurable speed (2x - 16x)
 * - Keyboard shortcuts with code-based matching (language independent)
 * - Status popup that stays visible while holding keys
 */

'use strict';

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

/** Convert array-like collection to real array */
function toArray(collection) {
  return Array.from(collection || []);
}

// -----------------------------------------------------------------------------
// Constants & Storage Keys
// -----------------------------------------------------------------------------

/** Helper to build success responses for messaging */
const successKeys = (reason) => ({ from: 'uvs', ok: true, reason });

/** Valid message origins (legacy compatibility) */
const VALID_FROM = ['uvs', 'cas', 'cys'];

/** Default quick preset values */
const defaultPresets = ['1', '1.25', '1.5', '1.75', '2', '2.5', '3', '4'];

/** Default keybindings (Ctrl + key) */
const defaultOptions = {
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

/** Storage keys used in chrome.storage.sync */
class StorageKeys {
  static USER_PRESETS = 'uvs-user-presets';
  static DEFAULT_SPEED = 'uvs-default-speed';
  static SITE_SPEEDS = 'uvs-site-speeds';
  static HOLD_SPEED = 'uvs-hold-speed';
  static LISTEN_KEY = 'uvs-key-listen-key';
  static PREV_DEF = 'prevdef';
  static STOP_PROP = 'stopprop';
  static ALLOW_IN_TEXT = 'allowintext';
  static LEGACY_PRESETS = 'cas-user-presets';
  static LEGACY_SPEED = 'cas-default-speed';
  static LEGACY_LISTEN = 'cas-key-listen-key';
}

// -----------------------------------------------------------------------------
// State Variables
// -----------------------------------------------------------------------------

let prevdef = true;        // Prevent default key behavior
let stopprop = true;       // Stop propagation of shortcut events
let allowintext = true;    // Allow shortcuts inside input/textarea
let speedSetting = 1.0;     // Current applied speed for this tab
let speedWasSet = false;    // True if user manually changed speed in this tab (temporary override)
let listening = true;       // Whether shortcuts are enabled

let child = null;           // Status popup element
let timeout = null;         // Timeout for hiding status popup
let bindings = null;        // Loaded keybindings
let enforceInterval = null; // Interval to re-enforce speed
let directMediaInterval = null;

// Hold forward (16x) state
let holdActive = false;
let savedSpeedBeforeHold = 1.0;
let HOLD_MAX_SPEED = 16;         // Legacy variable, kept for compatibility
let holdEnforceInterval = null;

// Hold reverse (rewind) state
let reverseHoldActive = false;
let savedStatesBeforeReverse = new Map();
let reverseRafId = null;
let lastReverseTime = 0;
let REWIND_SPEED = 16;           // Legacy variable, kept for compatibility

// Configurable hold speed (2x - 16x)
let holdSpeedValue = 16;

/** Get current configured hold speed */
function getHoldSpeed() {
  return Number(holdSpeedValue) || 16;
}

// Per-site speed caches
let siteSpeedsCache = {};   // Map domain -> speed
let currentSiteSpeed = null;
let defaultSpeedCache = 1;

// Track active hold keys to keep status visible
let activeSpeedKeys = new Set();

// -----------------------------------------------------------------------------
// Helper: Boolean conversion
// -----------------------------------------------------------------------------

function boolOrStringToBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return !!value;
}

// -----------------------------------------------------------------------------
// Media Helpers
// -----------------------------------------------------------------------------

function togglePause(media) {
  if (media.paused) media.play().catch(() => {});
  else media.pause();
}

function killEvent(event) {
  if (stopprop) event.stopImmediatePropagation();
  if (prevdef) event.preventDefault();
}

/**
 * Check if a keyboard event matches a stored binding.
 * Supports both legacy string bindings and object bindings with ctrl/alt/shift/meta + code.
 */
function keybind_matches(event, binding) {
  if (!binding) return false;

  // Legacy string binding
  if (typeof binding === 'string') {
    if (event.key === binding) return true;
    if (event.key.toLowerCase() === binding.toLowerCase()) return true;
    if (event.code && event.code.toLowerCase().includes(binding.toLowerCase())) return true;
    return false;
  }

  // Object binding
  if (typeof binding === 'object' && (binding.key || binding.code)) {
    const ctrl = !!binding.ctrl;
    const alt = !!binding.alt;
    const shift = !!binding.shift;
    const meta = !!binding.meta;
    if (event.ctrlKey !== ctrl) return false;
    if (event.altKey !== alt) return false;
    if (event.metaKey !== meta) return false;
    if (event.shiftKey !== shift) return false;

    let keyMatch = false;
    if (binding.code && event.code && event.code === binding.code) keyMatch = true;

    if (!keyMatch && binding.key) {
      const storedKey = binding.key;
      if (storedKey.length === 1) {
        if (event.key.toLowerCase() === storedKey.toLowerCase()) keyMatch = true;
        if (!keyMatch && binding.code && event.code === binding.code) keyMatch = true;
      } else {
        if (event.key === storedKey) keyMatch = true;
      }
    }
    if (!keyMatch && binding.code && event.code === binding.code) keyMatch = true;
    return keyMatch;
  }
  return false;
}

/**
 * Collect all video/audio elements from document, shadow DOM, and iframes.
 * Handles direct media file pages where browser creates video element in body.
 */
function getAllMedia(root = document) {
  let media = [];

  function collectFromNode(node) {
    if (!node) return;
    try {
      if (node.querySelectorAll) {
        media.push(...node.querySelectorAll('video, audio'));
      }
      if (node.shadowRoot) {
        collectFromNode(node.shadowRoot);
      }
      if (node.children) {
        for (let child of node.children) {
          if (child.shadowRoot) collectFromNode(child.shadowRoot);
          if (child.tagName === 'VIDEO' || child.tagName === 'AUDIO') {
            media.push(child);
          }
        }
      }
    } catch (e) {}
  }

  try {
    collectFromNode(root);
    media.push(...toArray(document.getElementsByTagName('video')));
    media.push(...toArray(document.getElementsByTagName('audio')));

    if (document.body) {
      media.push(...toArray(document.body.getElementsByTagName('video')));
      media.push(...toArray(document.body.getElementsByTagName('audio')));
      if (document.body.firstElementChild) {
        const first = document.body.firstElementChild;
        if (first.tagName === 'VIDEO' || first.tagName === 'AUDIO') media.push(first);
        if (first.querySelectorAll) {
          media.push(...toArray(first.querySelectorAll('video, audio')));
        }
      }
    }

    if (document.documentElement) {
      media.push(...toArray(document.documentElement.getElementsByTagName('video')));
      media.push(...toArray(document.documentElement.getElementsByTagName('audio')));
    }

    try {
      media.push(...toArray(document.querySelectorAll('video')));
      media.push(...toArray(document.querySelectorAll('audio')));
    } catch (e) {}
  } catch (e) {}

  try {
    toArray(document.getElementsByTagName('iframe')).forEach((iframe) => {
      try {
        if (iframe.contentDocument) {
          media.push(...toArray(iframe.contentDocument.getElementsByTagName('video')));
          media.push(...toArray(iframe.contentDocument.getElementsByTagName('audio')));
          collectFromNode(iframe.contentDocument);
        }
      } catch (e) {}
    });
  } catch (e) {}

  return [...new Set(media.filter((m) => m != null))];
}

/** Detect if current page is a direct media file (video.mp4, audio.mp3, etc.) */
function isDirectMediaFile() {
  try {
    const url = location.href;
    const mediaExt = /\.(mp4|webm|ogg|ogv|mp3|wav|flac|m4a|aac|opus|mov|avi|mkv|3gp|m3u8|mpd)(\?|#|$)/i;
    if (mediaExt.test(url)) return true;

    if (document.contentType) {
      if (document.contentType.startsWith('video/') || document.contentType.startsWith('audio/')) {
        return true;
      }
    }

    if (document.body && document.body.children.length === 1) {
      const child = document.body.children[0];
      if (child.tagName === 'VIDEO' || child.tagName === 'AUDIO') return true;
      if (child.querySelector && child.querySelector('video, audio')) {
        const v = child.querySelector('video, audio');
        if (v && document.body.textContent.trim() === '') return true;
      }
    }

    const videos = document.getElementsByTagName('video');
    const audios = document.getElementsByTagName('audio');
    if ((videos.length === 1 || audios.length === 1) && document.body) {
      const bodyText = document.body.innerText ? document.body.innerText.trim() : '';
      if (bodyText === '' || bodyText.length < 50) {
        if (url.includes('.mp4') || url.includes('.mp3') || url.includes('.webm') || url.includes('.ogg')) {
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

// -----------------------------------------------------------------------------
// Site Speed Logic
// -----------------------------------------------------------------------------

/** Get current hostname, with special handling for file:// URLs */
function getHostname() {
  try {
    if (location.protocol === 'file:') return 'file:///';
    return location.hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

/**
 * Find custom speed for a host.
 * Supports exact match, www-stripped match, and suffix match (subdomain).
 * Special handling for file:/// -> looks for file:/// key.
 */
function getSiteSpeedForHost(host, siteSpeeds) {
  if (!host || !siteSpeeds) return null;
  try {
    if (host === 'file:///' || host.startsWith('file://')) {
      if (siteSpeeds['file:///'] != null) return Number(siteSpeeds['file:///']);
      if (siteSpeeds['file://'] != null) return Number(siteSpeeds['file://']);
      if (siteSpeeds['file'] != null) return Number(siteSpeeds['file']);
      return null;
    }

    host = host.toLowerCase();
    const hostNoWww = host.replace(/^www\./, '');

    if (siteSpeeds[host] != null) return Number(siteSpeeds[host]);
    if (siteSpeeds[hostNoWww] != null) return Number(siteSpeeds[hostNoWww]);

    for (let domain in siteSpeeds) {
      if (!siteSpeeds.hasOwnProperty(domain)) continue;
      const d = domain.toLowerCase().trim();
      const dNoWww = d.replace(/^www\./, '');
      if (host === d || host === dNoWww || hostNoWww === d || hostNoWww === dNoWww) {
        return Number(siteSpeeds[domain]);
      }
      if (
        host.endsWith('.' + d) ||
        host.endsWith('.' + dNoWww) ||
        hostNoWww.endsWith('.' + d) ||
        hostNoWww.endsWith('.' + dNoWww)
      ) {
        return Number(siteSpeeds[domain]);
      }
    }
  } catch (e) {}
  return null;
}

// -----------------------------------------------------------------------------
// Speed Control
// -----------------------------------------------------------------------------

function notifyPresetButtons() {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  storage.get(
    {
      [StorageKeys.USER_PRESETS]: defaultPresets,
      [StorageKeys.LEGACY_PRESETS]: null,
    },
    (items) => {
      let presets = items[StorageKeys.USER_PRESETS];
      if (items[StorageKeys.LEGACY_PRESETS] && (!presets || presets === defaultPresets)) {
        presets = items[StorageKeys.LEGACY_PRESETS];
      }
      try {
        chrome.runtime.sendMessage(
          {
            ...successKeys('user-presets-load'),
            presets: { [StorageKeys.USER_PRESETS]: presets },
          },
          () => {}
        );
      } catch (e) {}
    }
  );
}

/** Check if any media is currently at hold speed (to prevent cross-world reset) */
function isAnyMediaAtHoldSpeed() {
  try {
    const all = getAllMedia();
    const hs = getHoldSpeed();
    return all.some((m) => {
      try {
        return Math.abs(m.playbackRate - hs) < 0.15;
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

/**
 * Apply speed to all media elements.
 * @param {number} speed - Target playbackRate
 * @param {boolean} force - Force apply even if close
 * @param {boolean} isTemporary - If true, don't update speedSetting (used for hold)
 */
function setMediaSpeed(speed, force = false, isTemporary = false) {
  if (!isTemporary) {
    speedSetting = speed;
  }

  const allMedia = getAllMedia();
  const hs = getHoldSpeed();

  allMedia.forEach((media) => {
    if (!media) return;
    const target = isTemporary ? speed : speedSetting;

    // Never override hold speed during active hold (cross-world safety)
    try {
      if (Math.abs(media.playbackRate - hs) < 0.15 && !isTemporary) {
        if (isHoldInProgress()) return;
      }
    } catch (e) {}

    if (force || Math.abs(media.playbackRate - target) > 0.01) {
      try {
        media.playbackRate = target;
      } catch (e) {}
    }

    // Attach listeners once per media element
    if (!media._uvsListenerAdded) {
      media.addEventListener('play', () => {
        if (isHoldInProgress()) return;
        if (media.playbackRate !== speedSetting && speedSetting !== 1) {
          try {
            media.playbackRate = speedSetting;
          } catch (e) {}
        }
      });

      media.addEventListener('ratechange', () => {
        if (isHoldInProgress()) return;
        try {
          if (Math.abs(media.playbackRate - getHoldSpeed()) < 0.15) return;
        } catch (e) {}
        if (speedWasSet && Math.abs(media.playbackRate - speedSetting) > 0.01) {
          setTimeout(() => {
            if (!isHoldInProgress() && Math.abs(media.playbackRate - speedSetting) > 0.01) {
              try {
                if (Math.abs(media.playbackRate - getHoldSpeed()) < 0.15) return;
                media.playbackRate = speedSetting;
              } catch (e) {}
            }
          }, 150);
        }
      });

      if (isDirectMediaFile()) {
        try {
          media.controls = true;
        } catch (e) {}
      }
      media._uvsListenerAdded = true;
    }
  });

  return allMedia.length;
}

function setTemporarySpeed(speed) {
  getAllMedia().forEach((media) => {
    if (!media) return;
    try {
      media.playbackRate = speed;
    } catch (e) {}
  });
}

/** User manually changed speed in this tab - mark as temporary override */
function userOverrideSpeed(speed) {
  speedWasSet = true;
  setMediaSpeed(speed, true, false);
}

/** Notify popup about loaded speed (only if not manually overridden) */
function reportLoaded() {
  try {
    if (speedWasSet) return; // Prevent flicker in popup
    chrome.runtime.sendMessage(
      {
        ...successKeys('options-loaded'),
        speed: speedSetting,
      },
      () => {}
    );
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// Load Settings
// -----------------------------------------------------------------------------

/** Load default speed and per-site speeds, apply appropriate speed for current host */
function _loadUserDefaultSpeed() {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  storage.get(
    {
      [StorageKeys.DEFAULT_SPEED]: 1,
      [StorageKeys.SITE_SPEEDS]: {},
      [StorageKeys.LEGACY_SPEED]: null,
    },
    (items) => {
      let defaultSpeed = Number(items[StorageKeys.DEFAULT_SPEED]);
      if (items[StorageKeys.LEGACY_SPEED] && (!defaultSpeed || defaultSpeed === 1)) {
        defaultSpeed = Number(items[StorageKeys.LEGACY_SPEED]) || 1;
      }
      defaultSpeed = defaultSpeed || 1;
      defaultSpeedCache = defaultSpeed;
      siteSpeedsCache = items[StorageKeys.SITE_SPEEDS] || {};

      const host = getHostname();
      const siteSpeed = getSiteSpeedForHost(host, siteSpeedsCache);
      currentSiteSpeed = siteSpeed;

      let speedToUse = siteSpeed != null ? siteSpeed : defaultSpeed;
      if (!speedWasSet) speedSetting = speedToUse;

      const apply = () => {
        if (!holdActive && !reverseHoldActive) {
          let finalSpeed;
          if (speedWasSet) {
            finalSpeed = speedSetting; // Keep manual override
          } else {
            const currentHost = getHostname();
            const currentSiteSpd = getSiteSpeedForHost(currentHost, siteSpeedsCache);
            if (currentSiteSpd != null) {
              finalSpeed = currentSiteSpd;
              speedSetting = finalSpeed;
              currentSiteSpeed = currentSiteSpd;
            } else {
              finalSpeed = speedToUse;
              speedSetting = finalSpeed;
            }
          }
          setMediaSpeed(finalSpeed, true, false);
        }
        reportLoaded();
      };

      // Apply immediately and with delays to handle SPA navigation and late media
      apply();
      setTimeout(apply, 400);
      setTimeout(apply, 1200);
      setTimeout(apply, 2500);

      if (isDirectMediaFile()) {
        setTimeout(() => {
          if (!holdActive && !reverseHoldActive) apply();
        }, 100);
        setTimeout(() => {
          if (!holdActive && !reverseHoldActive) apply();
        }, 300);
        setTimeout(() => {
          if (!holdActive && !reverseHoldActive) apply();
        }, 800);
        setTimeout(() => {
          if (!holdActive && !reverseHoldActive) apply();
        }, 2000);
      }
    }
  );
}

/** Load general preferences, keybindings, and hold speed */
function loadUserSettings() {
  const storage = chrome.storage?.sync || chrome.storage?.local;
  storage.get(
    {
      [StorageKeys.PREV_DEF]: true,
      [StorageKeys.STOP_PROP]: true,
      [StorageKeys.ALLOW_IN_TEXT]: true,
      [StorageKeys.LISTEN_KEY]: true,
      [StorageKeys.HOLD_SPEED]: 16,
      [StorageKeys.LEGACY_PRESETS]: null,
      [StorageKeys.LEGACY_SPEED]: null,
      [StorageKeys.LEGACY_LISTEN]: null,
      ...defaultOptions,
    },
    (items) => {
      prevdef = boolOrStringToBool(items[StorageKeys.PREV_DEF]);
      stopprop = boolOrStringToBool(items[StorageKeys.STOP_PROP]);
      allowintext = boolOrStringToBool(items[StorageKeys.ALLOW_IN_TEXT]);
      listening = boolOrStringToBool(items[StorageKeys.LISTEN_KEY]);
      if (items[StorageKeys.LEGACY_LISTEN] !== null && items[StorageKeys.LISTEN_KEY] === true) {
        listening = boolOrStringToBool(items[StorageKeys.LEGACY_LISTEN]);
      }
      bindings = items;

      try {
        const hs = Number(items[StorageKeys.HOLD_SPEED]);
        if (!isNaN(hs) && hs >= 2 && hs <= 16) {
          holdSpeedValue = hs;
          HOLD_MAX_SPEED = hs;
          REWIND_SPEED = hs;
        }
      } catch (e) {}
    }
  );

  _loadUserDefaultSpeed();

  // Early load of hold speed for faster apply
  try {
    storage.get({ [StorageKeys.HOLD_SPEED]: 16 }, (items) => {
      try {
        const hs = Number(items[StorageKeys.HOLD_SPEED]);
        if (!isNaN(hs) && hs >= 2 && hs <= 16) {
          holdSpeedValue = hs;
          HOLD_MAX_SPEED = hs;
          REWIND_SPEED = hs;
        }
      } catch (e) {}
    });
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// Status Popup (in-page overlay)
// -----------------------------------------------------------------------------

function showStatus(status, type = 'normal') {
  if (!child) {
    child = document.createElement('div');
    child.classList.add('uvs-show-status-popup');
    document.documentElement.appendChild(child);
  }
  if (timeout) clearTimeout(timeout);
  child.removeAttribute('hidden');

  // Style based on type - unified colors for hold and rewind
  if (type === 'hold') {
    child.textContent = `HOLD: ${Number(status).toFixed(2)}x ▶▶ - Release to restore`;
    child.style.borderColor = '#10b981';
    child.style.background = '#f9fafb';
  } else if (type === 'rewind') {
    child.textContent = `REWIND: ${Number(status).toFixed(0)}x ◀◀ - Release to restore`;
    child.style.borderColor = '#10b981';
    child.style.background = '#f9fafb';
  } else if (type === 'speed-up') {
    child.textContent = `Speed: ${Number(status).toFixed(2)}x ▲ - Holding`;
    child.style.borderColor = '#3b82f6';
    child.style.background = '#eff6ff';
  } else if (type === 'slow-down') {
    child.textContent = `Speed: ${Number(status).toFixed(2)}x ▼ - Holding`;
    child.style.borderColor = '#3b82f6';
    child.style.background = '#eff6ff';
  } else if (type === 'big-speed-up') {
    child.textContent = `Speed: ${Number(status).toFixed(2)}x ▲▲ - Holding`;
    child.style.borderColor = '#8b5cf6';
    child.style.background = '#f5f3ff';
  } else if (type === 'big-slow-down') {
    child.textContent = `Speed: ${Number(status).toFixed(2)}x ▼▼ - Holding`;
    child.style.borderColor = '#8b5cf6';
    child.style.background = '#f5f3ff';
  } else if (type === 'skip-forward') {
    child.textContent = `→ Skip +${status}s ▶▶`;
    child.style.borderColor = '#111827';
    child.style.background = '#ffffff';
  } else if (type === 'skip-backward') {
    child.textContent = `◀◀ Skip -${status}s ◀`;
    child.style.borderColor = '#111827';
    child.style.background = '#ffffff';
  } else {
    child.textContent = `Speed: ${Number(status).toFixed(2)}x`;
    child.style.borderColor = '';
    child.style.background = '';
  }

  // Keep visible while any key is held
  const isHolding = activeSpeedKeys.size > 0 || holdActive || reverseHoldActive;
  if (isHolding || type === 'hold' || type === 'rewind') {
    const keepAlive = () => {
      const stillHolding = activeSpeedKeys.size > 0 || holdActive || reverseHoldActive;
      if (stillHolding) {
        timeout = setTimeout(keepAlive, 300);
      } else {
        timeout = setTimeout(() => {
          child.setAttribute('hidden', 'true');
          timeout = null;
        }, 600);
      }
    };
    timeout = setTimeout(keepAlive, 300);
  } else {
    timeout = setTimeout(() => {
      child.setAttribute('hidden', 'true');
      timeout = null;
    }, 950);
  }
}

function isTypingElement() {
  const active = document.activeElement;
  const tag = active?.tagName?.toLowerCase() || '';
  if (isDirectMediaFile()) return false;
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    active?.isContentEditable ||
    active?.hasAttribute?.('contenteditable')
  );
}

// -----------------------------------------------------------------------------
// Hold Reverse (Rewind) Logic
// -----------------------------------------------------------------------------

function startReverseHold() {
  if (reverseHoldActive) return;
  if (holdActive) return;

  const mediaList = getAllMedia();
  if (mediaList.length === 0) return;

  reverseHoldActive = true;
  savedStatesBeforeReverse.clear();
  lastReverseTime = performance.now();

  mediaList.forEach((media) => {
    try {
      savedStatesBeforeReverse.set(media, {
        speed: media.playbackRate,
        paused: media.paused,
        time: media.currentTime,
      });
      if (!media.paused) media.pause();
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
          if (newTime > media.duration) newTime = media.duration;
          if (Math.abs(media.currentTime - newTime) > 0.01) {
            media.currentTime = newTime;
          }
        }
      } catch (e) {}
    });

    reverseRafId = requestAnimationFrame(rewindLoop);
  }

  reverseRafId = requestAnimationFrame(rewindLoop);
}

function stopReverseHold() {
  if (!reverseHoldActive) return;
  reverseHoldActive = false;

  if (reverseRafId) {
    cancelAnimationFrame(reverseRafId);
    reverseRafId = null;
  }

  savedStatesBeforeReverse.forEach((state, media) => {
    try {
      if (media) {
        media.playbackRate = state.speed;
        if (!state.paused) media.play().catch(() => {});
      }
    } catch (e) {}
  });

  savedStatesBeforeReverse.clear();
  const first = getAllMedia()[0];
  showStatus(first ? first.playbackRate : speedSetting, 'normal');
}

// -----------------------------------------------------------------------------
// Keyboard Handler
// -----------------------------------------------------------------------------

function setHandler() {
  // Keydown: handle all shortcuts
  document.addEventListener(
    'keydown',
    (event) => {
      if (!bindings) bindings = defaultOptions;
      if (!listening) return;

      // Prevent repeat firing during hold
      if (event.repeat) {
        if (keybind_matches(event, bindings['hold-speed']) && holdActive) {
          killEvent(event);
          return;
        }
        if (keybind_matches(event, bindings['hold-reverse']) && reverseHoldActive) {
          killEvent(event);
          return;
        }
      }

      const mediaList = getAllMedia();
      if (mediaList.length === 0) return;
      if (!allowintext && isTypingElement()) return;

      // Hold forward: set to configured hold speed and enforce every 50ms
      if (keybind_matches(event, bindings['hold-speed']) && !holdActive && !reverseHoldActive) {
        const firstMedia = mediaList[0];
        savedSpeedBeforeHold = firstMedia ? firstMedia.playbackRate : speedSetting;
        holdActive = true;

        mediaList.forEach((m) => {
          try {
            if (m.paused) m.play().catch(() => {});
            m.playbackRate = getHoldSpeed();
          } catch (e) {}
        });

        setTemporarySpeed(getHoldSpeed());
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
              if (Math.abs(m.playbackRate - getHoldSpeed()) > 0.01) {
                m.playbackRate = getHoldSpeed();
              }
              if (m.paused) m.play().catch(() => {});
            } catch (e) {}
          });
        }, 50);

        killEvent(event);
        return;
      }

      // Hold reverse: start rewind loop
      if (keybind_matches(event, bindings['hold-reverse']) && !reverseHoldActive && !holdActive) {
        startReverseHold();
        killEvent(event);
        return;
      }

      if (holdActive || reverseHoldActive) return;

      // Other shortcuts
      let skipHandled = false;
      let speedHandled = false;
      let speedType = 'normal';
      let newSpeedForStatus = null;

      mediaList.forEach((media) => {
        if (!media) return;

        if (keybind_matches(event, bindings['skip-forward'])) {
          const skipAmount = (10 * media.playbackRate).toFixed(1);
          media.currentTime += 10 * media.playbackRate;
          if (!skipHandled) {
            activeSpeedKeys.add('skip-forward');
            showStatus(skipAmount, 'skip-forward');
            skipHandled = true;
          }
          killEvent(event);
        } else if (keybind_matches(event, bindings['skip-backward'])) {
          const skipAmount = (10 * media.playbackRate).toFixed(1);
          media.currentTime -= 10 * media.playbackRate;
          if (!skipHandled) {
            activeSpeedKeys.add('skip-backward');
            showStatus(skipAmount, 'skip-backward');
            skipHandled = true;
          }
          killEvent(event);
        } else if (keybind_matches(event, bindings['pause'])) {
          togglePause(media);
          killEvent(event);
        } else if (keybind_matches(event, bindings['reset-speed'])) {
          userOverrideSpeed(1);
          try {
            media.playbackRate = 1;
          } catch (e) {}
          showStatus(1);
          killEvent(event);
        }

        let delta = 0;
        let currentType = 'normal';
        if (keybind_matches(event, bindings['speed-up'])) {
          delta = 0.1;
          currentType = 'speed-up';
        } else if (keybind_matches(event, bindings['slow-down'])) {
          delta = -0.1;
          currentType = 'slow-down';
        } else if (keybind_matches(event, bindings['big-speed-up'])) {
          delta = 1;
          currentType = 'big-speed-up';
        } else if (keybind_matches(event, bindings['big-slow-down'])) {
          delta = -1;
          currentType = 'big-slow-down';
        }

        if (delta !== 0) {
          const newRate = media.playbackRate + delta;
          if (newRate >= 0.1 && newRate <= 16) {
            userOverrideSpeed(newRate);
            if (!speedHandled) {
              activeSpeedKeys.add(currentType);
              showStatus(newRate, currentType);
              speedHandled = true;
              newSpeedForStatus = newRate;
              speedType = currentType;
            }
          }
          killEvent(event);
        }
      });

      if (event.repeat && (skipHandled || speedHandled)) {
        if (speedHandled && newSpeedForStatus !== null) {
          showStatus(newSpeedForStatus, speedType);
        }
      }
    },
    true
  );

  // Keyup: release hold and clear active keys
  document.addEventListener(
    'keyup',
    (event) => {
      if (!bindings) return;
      if (!listening) return;

      if (!allowintext && isTypingElement()) {
        if (keybind_matches(event, bindings['skip-forward'])) activeSpeedKeys.delete('skip-forward');
        if (keybind_matches(event, bindings['skip-backward'])) activeSpeedKeys.delete('skip-backward');
        if (keybind_matches(event, bindings['speed-up'])) activeSpeedKeys.delete('speed-up');
        if (keybind_matches(event, bindings['slow-down'])) activeSpeedKeys.delete('slow-down');
        if (keybind_matches(event, bindings['big-speed-up'])) activeSpeedKeys.delete('big-speed-up');
        if (keybind_matches(event, bindings['big-slow-down'])) activeSpeedKeys.delete('big-slow-down');
        return;
      }

      if (keybind_matches(event, bindings['skip-forward'])) {
        activeSpeedKeys.delete('skip-forward');
        if (activeSpeedKeys.size === 0 && child && !holdActive && !reverseHoldActive) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            child.setAttribute('hidden', 'true');
            timeout = null;
          }, 600);
        }
      }
      if (keybind_matches(event, bindings['skip-backward'])) {
        activeSpeedKeys.delete('skip-backward');
        if (activeSpeedKeys.size === 0 && child && !holdActive && !reverseHoldActive) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            child.setAttribute('hidden', 'true');
            timeout = null;
          }, 600);
        }
      }
      if (keybind_matches(event, bindings['speed-up'])) {
        activeSpeedKeys.delete('speed-up');
        if (activeSpeedKeys.size === 0 && child && !holdActive && !reverseHoldActive) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            child.setAttribute('hidden', 'true');
            timeout = null;
          }, 800);
        }
      }
      if (keybind_matches(event, bindings['slow-down'])) {
        activeSpeedKeys.delete('slow-down');
        if (activeSpeedKeys.size === 0 && child && !holdActive && !reverseHoldActive) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            child.setAttribute('hidden', 'true');
            timeout = null;
          }, 800);
        }
      }
      if (keybind_matches(event, bindings['big-speed-up'])) {
        activeSpeedKeys.delete('big-speed-up');
        if (activeSpeedKeys.size === 0 && child && !holdActive && !reverseHoldActive) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            child.setAttribute('hidden', 'true');
            timeout = null;
          }, 800);
        }
      }
      if (keybind_matches(event, bindings['big-slow-down'])) {
        activeSpeedKeys.delete('big-slow-down');
        if (activeSpeedKeys.size === 0 && child && !holdActive && !reverseHoldActive) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            child.setAttribute('hidden', 'true');
            timeout = null;
          }, 800);
        }
      }

      // Release hold forward - restore directly bypassing hold guard
      if (keybind_matches(event, bindings['hold-speed']) && holdActive) {
        holdActive = false;
        if (holdEnforceInterval) {
          clearInterval(holdEnforceInterval);
          holdEnforceInterval = null;
        }
        const restoreSpeed = savedSpeedBeforeHold;
        speedSetting = restoreSpeed;
        getAllMedia().forEach((m) => {
          try {
            m.playbackRate = restoreSpeed;
          } catch (e) {}
        });
        showStatus(restoreSpeed, 'normal');
        killEvent(event);
      }

      if (keybind_matches(event, bindings['hold-reverse']) && reverseHoldActive) {
        stopReverseHold();
        killEvent(event);
      }
    },
    true
  );

  // Blur and visibility change: always release hold
  window.addEventListener('blur', () => {
    activeSpeedKeys.clear();
    if (child) {
      if (timeout) clearTimeout(timeout);
      child.setAttribute('hidden', 'true');
      timeout = null;
    }
    if (holdActive) {
      holdActive = false;
      if (holdEnforceInterval) {
        clearInterval(holdEnforceInterval);
        holdEnforceInterval = null;
      }
      const restoreSpeed = savedSpeedBeforeHold;
      speedSetting = restoreSpeed;
      getAllMedia().forEach((m) => {
        try {
          m.playbackRate = restoreSpeed;
        } catch (e) {}
      });
      showStatus(restoreSpeed, 'normal');
    }
    if (reverseHoldActive) stopReverseHold();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (holdActive) {
        holdActive = false;
        if (holdEnforceInterval) {
          clearInterval(holdEnforceInterval);
          holdEnforceInterval = null;
        }
        const restoreSpeed = savedSpeedBeforeHold;
        speedSetting = restoreSpeed;
        getAllMedia().forEach((m) => {
          try {
            m.playbackRate = restoreSpeed;
          } catch (e) {}
        });
      }
      if (reverseHoldActive) stopReverseHold();
    }
  });
}

// -----------------------------------------------------------------------------
// Messaging: Handle requests from popup and options page
// -----------------------------------------------------------------------------

class EventResponder {
  constructor(sendResponse) {
    this.sendResponse = sendResponse;
  }

  updatePresetButtons(presets) {
    const storage = chrome.storage?.sync || chrome.storage?.local;
    storage.set({ [StorageKeys.USER_PRESETS]: presets }, () => {
      this.sendResponse({ ...successKeys(), presets });
    });
    return true;
  }

  saveSpeed() {
    const media = getAllMedia()[0];
    const speed = media ? media.playbackRate : speedSetting;
    const storage = chrome.storage?.sync || chrome.storage?.local;
    storage.set({ [StorageKeys.DEFAULT_SPEED]: Number(speed) }, () => {
      this.sendResponse({ ...successKeys(), speed });
    });
    return true;
  }

  gotQueryPresets() {
    const storage = chrome.storage?.sync || chrome.storage?.local;
    storage.get(
      { [StorageKeys.USER_PRESETS]: defaultPresets, [StorageKeys.LEGACY_PRESETS]: null },
      (items) => {
        let presets = items[StorageKeys.USER_PRESETS];
        if (items[StorageKeys.LEGACY_PRESETS] && presets === defaultPresets) {
          presets = items[StorageKeys.LEGACY_PRESETS];
        }
        this.sendResponse({ ...successKeys(), presets });
      }
    );
    return true;
  }

  gotQuerySpeed() {
    const media = getAllMedia()[0];
    const host = getHostname();
    const siteSpeed = getSiteSpeedForHost(host, siteSpeedsCache);
    this.sendResponse({
      ...successKeys(),
      'current-speed': media ? media.playbackRate : speedSetting,
      'is-direct-media': isDirectMediaFile(),
      'media-count': getAllMedia().length,
      'site-speed': siteSpeed,
      hostname: host,
      'site-speeds': siteSpeedsCache,
      'speed-was-set': speedWasSet,
      'default-speed': defaultSpeedCache,
    });
    return true;
  }

  gotQuerySiteSpeeds() {
    const storage = chrome.storage?.sync || chrome.storage?.local;
    storage.get({ [StorageKeys.SITE_SPEEDS]: {} }, (items) => {
      this.sendResponse({ ...successKeys(), 'site-speeds': items[StorageKeys.SITE_SPEEDS] || {} });
    });
    return true;
  }

  /**
   * Set or clear per-site speed.
   * Immediately updates cache and applies speed to avoid flicker,
   * then persists to storage.sync.
   */
  setSiteSpeed(domain, speed) {
    const storage = chrome.storage?.sync || chrome.storage?.local;

    if (speed == null) {
      // Clear: remove from cache immediately and restore default
      siteSpeedsCache = siteSpeedsCache || {};
      delete siteSpeedsCache[domain];
      delete siteSpeedsCache['www.' + domain];
      for (let key in siteSpeedsCache) {
        const kNorm = key.toLowerCase().replace(/^www\./, '');
        const dNorm = domain.toLowerCase().replace(/^www\./, '');
        if (kNorm === dNorm) delete siteSpeedsCache[key];
      }
      speedWasSet = false;
      const restoreSpeed = defaultSpeedCache || 1;
      speedSetting = restoreSpeed;
      currentSiteSpeed = null;
      setMediaSpeed(restoreSpeed, true, false);
    } else {
      // Set: update cache and apply immediately
      siteSpeedsCache = siteSpeedsCache || {};
      siteSpeedsCache[domain] = Number(speed);
      speedWasSet = false;
      speedSetting = Number(speed);
      currentSiteSpeed = Number(speed);
      setMediaSpeed(Number(speed), true, false);
    }

    storage.get({ [StorageKeys.SITE_SPEEDS]: {} }, (items) => {
      let siteSpeeds = items[StorageKeys.SITE_SPEEDS] || {};
      if (speed == null) {
        delete siteSpeeds[domain];
        delete siteSpeeds['www.' + domain];
        for (let key in siteSpeeds) {
          const kNorm = key.toLowerCase().replace(/^www\./, '');
          const dNorm = domain.toLowerCase().replace(/^www\./, '');
          if (kNorm === dNorm) delete siteSpeeds[key];
        }
      } else {
        siteSpeeds[domain] = Number(speed);
      }
      storage.set({ [StorageKeys.SITE_SPEEDS]: siteSpeeds }, () => {
        siteSpeedsCache = siteSpeeds;
        if (speed != null) {
          speedWasSet = false;
          speedSetting = Number(speed);
          currentSiteSpeed = Number(speed);
          setMediaSpeed(Number(speed), true, false);
        } else {
          speedWasSet = false;
          const restoreSpeed = defaultSpeedCache || 1;
          speedSetting = restoreSpeed;
          currentSiteSpeed = null;
          setMediaSpeed(restoreSpeed, true, false);
        }
        this.sendResponse({ ...successKeys(), 'site-speeds': siteSpeeds });
      });
    });
    return true;
  }

  changeSpeedTo(speed) {
    if (holdActive) {
      savedSpeedBeforeHold = speed;
      this.sendResponse({ ...successKeys() });
      return true;
    }
    if (reverseHoldActive) {
      savedStatesBeforeReverse.forEach((state) => {
        state.speed = speed;
      });
      speedSetting = speed;
      this.sendResponse({ ...successKeys() });
      return true;
    }
    userOverrideSpeed(speed);
    const list = getAllMedia();
    if (list.length === 0) speedSetting = speed;
    else setMediaSpeed(speed, true, false);
    this.sendResponse({ ...successKeys() });
    return true;
  }

  toggleListening() {
    listening = !listening;
    const storage = chrome.storage?.sync || chrome.storage?.local;
    storage.set({ [StorageKeys.LISTEN_KEY]: listening }, () => {
      this.sendResponse({ ...successKeys('Toggled listening'), listening });
    });
    return true;
  }

  gotQueryListening() {
    this.sendResponse({ ...successKeys('Listening status'), listening });
    return true;
  }
}

// -----------------------------------------------------------------------------
// Observers & Lifecycle
// -----------------------------------------------------------------------------

function setupObservers() {
  // MutationObserver: watch for new video/audio added (SPA navigation)
  let observerTimeout = null;
  let lastObserverRun = 0;

  const observer = new MutationObserver((mutations) => {
    try {
      const now = Date.now();
      if (now - lastObserverRun < 300) return;
      let found = false;
      for (let m of mutations) {
        if (!m.addedNodes || m.addedNodes.length === 0) continue;
        for (let node of m.addedNodes) {
          try {
            if (!node) continue;
            if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
              found = true;
              break;
            }
            if (node.getElementsByTagName) {
              if (
                node.getElementsByTagName('video').length > 0 ||
                node.getElementsByTagName('audio').length > 0
              ) {
                found = true;
                break;
              }
            }
            if (node.shadowRoot) {
              found = true;
              break;
            }
          } catch (e) {}
        }
        if (found) break;
      }
      if (found) {
        lastObserverRun = now;
        if (observerTimeout) clearTimeout(observerTimeout);
        observerTimeout = setTimeout(() => {
          try {
            if (!isHoldInProgress()) setMediaSpeed(speedSetting, true, false);
            else if (holdActive || isAnyMediaAtHoldSpeed()) setTemporarySpeed(getHoldSpeed());
          } catch (e) {}
        }, 150);
      }
    } catch (e) {}
  });

  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    try {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    } catch (e2) {}
  }

  // Enforce speed every 1.5s (in case site resets it)
  if (enforceInterval) clearInterval(enforceInterval);
  enforceInterval = setInterval(() => {
    try {
      if (isHoldInProgress()) return;
      const list = getAllMedia();
      if (list.length > 0 && speedSetting !== 1) {
        list.forEach((m) => {
          try {
            if (Math.abs(m.playbackRate - getHoldSpeed()) < 0.15) return;
            if (Math.abs(m.playbackRate - speedSetting) > 0.01) {
              m.playbackRate = speedSetting;
            }
          } catch (e) {}
        });
      }
    } catch (e) {}
  }, 1500);

  // Direct media files need more aggressive checking initially
  if (isDirectMediaFile()) {
    let directChecks = 0;
    if (directMediaInterval) clearInterval(directMediaInterval);
    directMediaInterval = setInterval(() => {
      try {
        if (isHoldInProgress()) return;
        directChecks++;
        const count = setMediaSpeed(speedSetting, true, false);
        if (count > 0 && directChecks > 5) {
          if (directChecks > 15) {
            clearInterval(directMediaInterval);
            directMediaInterval = null;
          }
        }
        if (directChecks > 25) {
          clearInterval(directMediaInterval);
          directMediaInterval = null;
        }
      } catch (e) {}
    }, 500);
  }

  // Detect SPA navigation (URL change without reload)
  let lastUrl = location.href;
  setInterval(() => {
    try {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        speedWasSet = false;
        holdActive = false;
        activeSpeedKeys.clear();
        if (reverseHoldActive) stopReverseHold();
        setTimeout(() => {
          try {
            _loadUserDefaultSpeed();
            notifyPresetButtons();
          } catch (e) {}
        }, 800);
      }
    } catch (e) {}
  }, 1500);

  // React to storage changes (per-site speeds, default speed, hold speed)
  try {
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes[StorageKeys.SITE_SPEEDS]) {
          try {
            const newSiteSpeeds = changes[StorageKeys.SITE_SPEEDS].newValue || {};
            siteSpeedsCache = newSiteSpeeds;
            const host = getHostname();
            const siteSpeed = getSiteSpeedForHost(host, newSiteSpeeds);
            currentSiteSpeed = siteSpeed;
            if (!holdActive && !reverseHoldActive && !speedWasSet) {
              if (siteSpeed != null) {
                speedSetting = siteSpeed;
                setMediaSpeed(siteSpeed, true, false);
              } else {
                const restoreSpeed = defaultSpeedCache || 1;
                speedSetting = restoreSpeed;
                setMediaSpeed(restoreSpeed, true, false);
              }
            }
          } catch (e) {}
        }

        if (area === 'sync' && changes[StorageKeys.DEFAULT_SPEED]) {
          try {
            const newDefault = Number(changes[StorageKeys.DEFAULT_SPEED].newValue) || 1;
            defaultSpeedCache = newDefault;
            if (!speedWasSet && currentSiteSpeed == null && !holdActive && !reverseHoldActive) {
              speedSetting = newDefault;
              setMediaSpeed(newDefault, true, false);
            }
          } catch (e) {}
        }

        if (area === 'sync' && changes[StorageKeys.HOLD_SPEED]) {
          try {
            const newHold = Number(changes[StorageKeys.HOLD_SPEED].newValue) || 16;
            if (!isNaN(newHold) && newHold >= 2 && newHold <= 16) {
              holdSpeedValue = newHold;
              HOLD_MAX_SPEED = newHold;
              REWIND_SPEED = newHold;
            }
          } catch (e) {}
        }
      });
    }
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// Initialization
// -----------------------------------------------------------------------------

(function init() {
  // Prevent double injection
  if (window._uvsInjected) return;
  window._uvsInjected = true;

  setHandler();

  // For direct media files, try to apply speed ASAP
  if (isDirectMediaFile()) {
    setTimeout(() => setMediaSpeed(speedSetting, true, false), 50);
    setTimeout(() => setMediaSpeed(speedSetting, true, false), 200);
    setTimeout(() => setMediaSpeed(speedSetting, true, false), 500);
  }

  const readyCheck = setInterval(() => {
    if (
      document.readyState === 'complete' ||
      document.readyState === 'interactive' ||
      isDirectMediaFile()
    ) {
      clearInterval(readyCheck);
      loadUserSettings();
      notifyPresetButtons();
      setupObservers();

      if (isDirectMediaFile()) {
        setTimeout(() => setMediaSpeed(speedSetting, true, false), 100);
        setTimeout(() => _loadUserDefaultSpeed(), 300);
      }

      // Message listener for popup/options
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (VALID_FROM.includes(request.from)) {
          const r = new EventResponder(sendResponse);
          if (request.message === 'is-listening') return r.gotQueryListening();
          if (request.message === 'toggle-listening') return r.toggleListening();
          if (request.message === 'speed-change') return r.changeSpeedTo(Number(request.speed));
          if (request.message === 'speed-query') return r.gotQuerySpeed();
          if (request.message === 'presets-query') return r.gotQueryPresets();
          if (request.message === 'speed-save') return r.saveSpeed();
          if (request.message === 'update-presets') return r.updatePresetButtons(request.presets);
          if (request.message === 'site-speeds-query') return r.gotQuerySiteSpeeds();
          if (request.message === 'site-speed-set')
            return r.setSiteSpeed(
              request.domain,
              request.speed != null ? Number(request.speed) : null
            );
        }
        return true;
      });
    }
  }, 50);

  // Fallback init if readyState never reaches complete
  setTimeout(() => {
    try {
      loadUserSettings();
      setupObservers();
    } catch (e) {}
  }, 2000);
})();
