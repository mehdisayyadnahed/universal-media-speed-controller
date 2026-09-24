/**
 * Universal Media Speed Controller - Popup Logic
 * Handles speed slider, presets, per-site speeds, and communication with content scripts.
 * All comments and code are in English.
 */

'use strict';

// ----------------------------------------------------------------------------
// Theme Handling - Auto follows browser, manual override via settings
// -----------------------------------------------------------------------------

function applyPopupTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  if (theme === 'dark') html.classList.add('dark');
  else if (theme === 'light') html.classList.add('light');
  else {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) html.classList.add('dark');
    else html.classList.add('light');
  }
  try { localStorage.setItem('uvs-theme', theme); } catch (e) {}
}

try {
  chrome.storage.sync.get({ 'uvs-theme': 'auto' }, (items) => {
    applyPopupTheme(items['uvs-theme'] || 'auto');
  });
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes['uvs-theme']) {
        applyPopupTheme(changes['uvs-theme'].newValue || 'auto');
      }
    });
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      chrome.storage.sync.get({ 'uvs-theme': 'auto' }, (items) => {
        if ((items['uvs-theme'] || 'auto') === 'auto') applyPopupTheme('auto');
      });
    });
  }
} catch (e) {
  applyPopupTheme('auto');
}

// Prevent unhandled errors from breaking popup
window.addEventListener('error', (e) => {
  console.log('UVS popup error:', e.message);
  e.preventDefault();
});
window.addEventListener('unhandledrejection', (e) => {
  console.log('UVS rejection:', e.reason);
  e.preventDefault();
});

// -----------------------------------------------------------------------------
// DOM Elements
// -----------------------------------------------------------------------------

const speedBarElement = document.getElementById('cys-speedRange');
const presetButtons = document.getElementsByClassName('btn-preset');
const saveButton = document.getElementById('btn-save-speed');
const disableKeysButton = document.getElementById('btn-disable-keys');
const keysButton = document.getElementById('btn-keybindings');
const changePresetButton = document.getElementById('change-presets-button');
const presetFields = document.getElementsByClassName('preset-field');
const submitPresetsButton = document.getElementById('submit-presets');

let showingChangePreset = false;
const MSG_FROM = 'uvs';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function responseCheckOk(response) {
  if (chrome.runtime.lastError) return false;
  if (!response) return false;
  if (!response.ok) return false;
  return true;
}

function showStatus(text, isError = false) {
  try {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.textContent = text;
    el.className = isError ? 'status-error' : 'status-success';
    setTimeout(() => {
      try {
        if (el) {
          el.textContent = '...';
          el.className = 'status-idle';
        }
      } catch (e) {}
    }, 2500);
  } catch (e) {}
}

function updateActivePreset(currentSpeed) {
  try {
    const speedNum = Number(currentSpeed);
    for (let btn of presetButtons) {
      const btnSpeed = Number(btn.dataset.speed || btn.value.replace('x', ''));
      if (Math.abs(btnSpeed - speedNum) < 0.01) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// Navigation & Preset Edit
// -----------------------------------------------------------------------------

keysButton.onclick = () => {
  try {
    chrome.runtime.openOptionsPage();
  } catch (e) {}
};

changePresetButton.onclick = function () {
  try {
    if (showingChangePreset) {
      document.getElementById('edit-preset-span').setAttribute('hidden', true);
      changePresetButton.textContent = 'Edit';
      showingChangePreset = false;
      return;
    }
    showingChangePreset = true;
    document.getElementById('edit-preset-span').removeAttribute('hidden');
    changePresetButton.textContent = 'Close';
    let idx = 0;
    for (let button of presetButtons) {
      if (presetFields[idx]) {
        const val = button.dataset.speed || button.value.replace('x', '');
        presetFields[idx].value = val;
      }
      idx++;
    }
  } catch (e) {}
};

// -----------------------------------------------------------------------------
// Direct Media Fallback (for pages where content script is not injected)
// -----------------------------------------------------------------------------

async function directMediaGetSpeed(tabId) {
  if (!tabId) return null;
  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          try {
            const media = document.querySelectorAll('video, audio');
            if (media.length === 0) {
              if (document.body) {
                const bodyMedia = document.body.querySelectorAll('video, audio');
                if (bodyMedia.length > 0) return { speed: bodyMedia[0].playbackRate, count: bodyMedia.length, direct: true };
              }
              const all = document.getElementsByTagName('video');
              if (all.length > 0) return { speed: all[0].playbackRate, count: all.length, direct: true };
              const allA = document.getElementsByTagName('audio');
              if (allA.length > 0) return { speed: allA[0].playbackRate, count: allA.length, direct: true };
              return null;
            }
            return {
              speed: media[0].playbackRate,
              count: media.length,
              direct: location.href.match(/\.(mp4|webm|mp3|ogg|wav|m4a|mov)$/i) ? true : false,
            };
          } catch (e) {
            return null;
          }
        },
      });
      if (chrome.runtime.lastError) return null;
      for (let r of results) if (r && r.result) return r.result;
    }
  } catch (e) {}
  return null;
}

async function directMediaSetSpeed(tabId, speed) {
  if (!tabId) return false;
  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (s) => {
          try {
            document.querySelectorAll('video, audio').forEach((m) => {
              try {
                m.playbackRate = s;
              } catch (e) {}
            });
            if (document.body) {
              document.body.querySelectorAll('video, audio').forEach((m) => {
                try {
                  m.playbackRate = s;
                } catch (e) {}
              });
            }
            const allV = document.getElementsByTagName('video');
            for (let v of allV) {
              try {
                v.playbackRate = s;
              } catch (e) {}
            }
            const allA = document.getElementsByTagName('audio');
            for (let a of allA) {
              try {
                a.playbackRate = s;
              } catch (e) {}
            }
          } catch (e) {}
        },
        args: [speed],
      });
      if (chrome.runtime.lastError) return false;
      return true;
    }
  } catch (e) {}
  return false;
}

// -----------------------------------------------------------------------------
// Preset Save & Default Speed Save
// -----------------------------------------------------------------------------

submitPresetsButton.onclick = function () {
  try {
    let idx = 0;
    let presets = [];
    for (let presetField of presetFields) {
      let preset = presetField.value.trim();
      if (preset && !isNaN(preset)) {
        presets[idx] = preset;
        if (presetButtons[idx]) {
          presetButtons[idx].value = preset + 'x';
          presetButtons[idx].textContent = preset + 'x';
          presetButtons[idx].dataset.speed = preset;
        }
      }
      idx++;
    }
    document.getElementById('edit-preset-span').setAttribute('hidden', true);
    changePresetButton.textContent = 'Edit';
    showingChangePreset = false;

    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
      if (chrome.runtime.lastError) return;
      let tab = tabs[0];
      if (!tab) return;
      try {
        chrome.tabs.sendMessage(tab.id, { from: MSG_FROM, message: 'update-presets', presets: presets }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Presets saved!');
            return;
          }
          showStatus('Presets saved!');
        });
      } catch (e) {
        showStatus('Presets saved!');
      }
    });
  } catch (e) {
    showStatus('Presets saved!');
  }
};

saveButton.onclick = () => {
  try {
    const sliderSpeed = Number(contentCache.curSpeed != null ? contentCache.curSpeed : (speedBarElement.value || getFinalSliderSpeed() || 1));
    // Always save slider value as default - works for file:// even without content script
    try {
      chrome.storage.sync.set({ 'uvs-default-speed': sliderSpeed }, () => {
        if (!chrome.runtime.lastError) {
          storageCache.defaultSpeed = sliderSpeed;
          contentCache.defaultSpeed = sliderSpeed;
          contentCache.wasSet = false;
          renderAll();
          showStatus(`Default saved: ${sliderSpeed.toFixed(2)}x for all sites`);
        }
      });
    } catch (e) {
      showStatus(`Default saved: ${sliderSpeed.toFixed(2)}x for all sites`);
    }

    chrome.tabs.query({ currentWindow: true, active: true }, async function (tabs) {
      if (chrome.runtime.lastError) return;
      if (!tabs[0]) return;
      const tabId = tabs[0].id;
      try {
        chrome.tabs.sendMessage(tabId, { from: MSG_FROM, message: 'speed-save' }, async function (response) {
          if (chrome.runtime.lastError) {
            // Fallback for direct media / file:// - try to set speed via scripting
            try {
              await directMediaSetSpeed(tabId, sliderSpeed);
            } catch (e) {}
            return;
          }
          if (responseCheckOk(response)) {
            // Already saved above, but sync cache from response
            if (response.speed != null) {
              storageCache.defaultSpeed = Number(response.speed);
              contentCache.defaultSpeed = Number(response.speed);
              renderAll();
            }
          } else {
            try {
              await directMediaSetSpeed(tabId, sliderSpeed);
            } catch (e) {}
          }
        });
      } catch (e) {
        try {
          await directMediaSetSpeed(tabId, sliderSpeed);
        } catch (e2) {}
      }
    });
  } catch (e) {
    try {
      const fallbackSpeed = Number(speedBarElement.value || 1);
      showStatus(`Default saved: ${fallbackSpeed.toFixed(2)}x for all sites`);
    } catch (e2) {}
  }
};

// -----------------------------------------------------------------------------
// Keys Toggle
// -----------------------------------------------------------------------------

function updateKeysEnabled(response) {
  try {
    if (!responseCheckOk(response)) return;
    const isListening = response.listening;
    if (disableKeysButton) disableKeysButton.textContent = isListening ? 'Shortcut Keys ON' : 'Shortcut Keys OFF';
  } catch (e) {}
}

disableKeysButton.onclick = () => {
  try {
    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
      if (chrome.runtime.lastError) return;
      let tab = tabs[0];
      if (!tab) return;
      try {
        chrome.tabs.sendMessage(tab.id, { from: MSG_FROM, message: 'toggle-listening' }, (response) => {
          if (chrome.runtime.lastError) return;
          if (responseCheckOk(response)) {
            updateKeysEnabled(response);
            showStatus(response.listening ? 'Shortcut Keys enabled' : 'Shortcut Keys disabled');
          } else showStatus('Shortcut Keys toggled', false);
        });
      } catch (e) {}
    });
  } catch (e) {}
};

// -----------------------------------------------------------------------------
// Slider & Preset Interaction (with anti-flicker guard)
// -----------------------------------------------------------------------------

let isSliderDragging = false;
let dragTimeout = null;

speedBarElement.oninput = () => {
  try {
    // Guard to prevent external messages from overriding while dragging
    isSliderDragging = true;
    if (dragTimeout) clearTimeout(dragTimeout);
    dragTimeout = setTimeout(() => {
      isSliderDragging = false;
    }, 1200);

    const val = Number(speedBarElement.value);
    const speedDiv = document.getElementById('cys-speedDiv');
    if (speedDiv) speedDiv.textContent = val.toFixed(2);
    updateActivePreset(val);
    updateSiteButtonText(val);

    // Mark as temporary override for this tab
    contentCache.curSpeed = val;
    contentCache.wasSet = true;

    chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
      if (chrome.runtime.lastError) return;
      if (!tabs[0]) return;
      try {
        chrome.tabs.sendMessage(tabs[0].id, { from: MSG_FROM, message: 'speed-change', speed: val }, async (response) => {
          if (chrome.runtime.lastError) return;
          if (!responseCheckOk(response)) {
            try {
              const direct = await directMediaGetSpeed(tabs[0].id);
              if (!direct) await directMediaSetSpeed(tabs[0].id, val);
            } catch (e) {}
          }
        });
      } catch (e) {}
    });
  } catch (e) {}
};

speedBarElement.onchange = () => {
  try {
    if (dragTimeout) clearTimeout(dragTimeout);
    dragTimeout = setTimeout(() => {
      isSliderDragging = false;
    }, 500);
  } catch (e) {}
};

for (let button of presetButtons) {
  button.onclick = () => {
    try {
      isSliderDragging = true;
      if (dragTimeout) clearTimeout(dragTimeout);
      dragTimeout = setTimeout(() => {
        isSliderDragging = false;
      }, 1000);

      const btnValue = Number(button.dataset.speed || button.value.replace('x', ''));
      const speedDiv = document.getElementById('cys-speedDiv');
      if (speedDiv) speedDiv.textContent = btnValue.toFixed(2);
      speedBarElement.value = btnValue;
      updateActivePreset(btnValue);
      updateSiteButtonText(btnValue);

      contentCache.curSpeed = btnValue;
      contentCache.wasSet = true;

      chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
        if (chrome.runtime.lastError) return;
        if (!tabs[0]) return;
        try {
          chrome.tabs.sendMessage(tabs[0].id, { from: MSG_FROM, message: 'speed-change', speed: btnValue }, async (response) => {
            if (chrome.runtime.lastError) return;
            if (!responseCheckOk(response)) {
              try {
                const direct = await directMediaGetSpeed(tabs[0].id);
                if (!direct) await directMediaSetSpeed(tabs[0].id, btnValue);
              } catch (e) {}
            }
          });
        } catch (e) {}
      });
    } catch (e) {}
  };
}

// -----------------------------------------------------------------------------
// Core Logic: Determine Final Slider Speed
// - If tab has temporary override (wasSet), show current tab speed
// - Else if site has custom speed, show site custom
// - Else show global default
// -----------------------------------------------------------------------------

let storageCache = {
  defaultSpeed: 1,
  siteSpeed: null,
  hostname: null,
  loaded: false,
};

let contentCache = {
  curSpeed: null,
  siteSpeed: null,
  wasSet: false,
  defaultSpeed: null,
  hostname: null,
  mediaCount: 0,
  isDirectMedia: false,
  loaded: false,
};

function getFinalSliderSpeed() {
  if (contentCache.wasSet && contentCache.curSpeed != null) {
    return Number(contentCache.curSpeed);
  }
  if (contentCache.siteSpeed != null) {
    return Number(contentCache.siteSpeed);
  }
  if (storageCache.siteSpeed != null) {
    return Number(storageCache.siteSpeed);
  }
  if (contentCache.curSpeed != null) {
    return Number(contentCache.curSpeed);
  }
  if (contentCache.defaultSpeed != null) {
    return Number(contentCache.defaultSpeed);
  }
  return Number(storageCache.defaultSpeed || 1);
}

function renderAll() {
  try {
    const finalSpeed = getFinalSliderSpeed();
    const siteSpeed = contentCache.siteSpeed != null ? contentCache.siteSpeed : storageCache.siteSpeed;
    const defaultSpeed = contentCache.defaultSpeed != null ? contentCache.defaultSpeed : storageCache.defaultSpeed;
    const hostname = contentCache.hostname || storageCache.hostname || currentHostname;

    if (!isSliderDragging) {
      if (speedBarElement) speedBarElement.value = finalSpeed;
      const speedDiv = document.getElementById('cys-speedDiv');
      if (speedDiv) speedDiv.textContent = finalSpeed.toFixed(2);
      updateActivePreset(finalSpeed);
      updateSiteButtonText(finalSpeed);
    }

    if (hostname) {
      updateSiteSection(hostname, siteSpeed, defaultSpeed, finalSpeed);
    }

    const countEl = document.getElementById('media-count');
    if (countEl && contentCache.loaded) {
      if (contentCache.isDirectMedia) {
        countEl.textContent = 'Direct media file - controlling speed';
        countEl.className = 'media-status detected';
      } else if (contentCache.mediaCount && contentCache.mediaCount > 1) {
        countEl.textContent = `${contentCache.mediaCount} media detected - controlling`;
        countEl.className = 'media-status detected';
      } else if (contentCache.mediaCount && contentCache.mediaCount > 0) {
        countEl.textContent = 'Media detected - controlling speed';
        countEl.className = 'media-status detected';
      }
    }
  } catch (e) {
    console.log('renderAll error', e);
  }
}

function optionsDidLoad(speed) {
  try {
    if (isSliderDragging) return;
    if (contentCache.wasSet) return; // Don't override temporary manual change
    speed = Number(speed);
    contentCache.curSpeed = speed;
    renderAll();
  } catch (e) {}
}

// Listen for options-loaded messages from content script
try {
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    try {
      if (
        (request.from === 'uvs' || request.from === 'cas' || request.from === 'cys') &&
        request.reason === 'options-loaded'
      ) {
        optionsDidLoad(request.speed);
        sendResponse({ ok: true });
        return true;
      }
    } catch (e) {}
    return true;
  });
} catch (e) {}

// -----------------------------------------------------------------------------
// Hold Key Display (shows current bindings and hold speed)
// -----------------------------------------------------------------------------

function formatHoldBinding(binding) {
  try {
    if (!binding) return '';
    if (typeof binding === 'string') return binding.toUpperCase();
    if (typeof binding === 'object' && binding.key) {
      let parts = [];
      if (binding.ctrl) parts.push('CTRL');
      if (binding.alt) parts.push('ALT');
      if (binding.shift) parts.push('SHIFT');
      if (binding.meta) parts.push('META');
      let k = binding.key;
      if (k === ' ') k = 'Space';
      else if (k === '`') k = '`';
      else if (k.length === 1) k = k.toUpperCase();
      parts.push(k);
      return parts.join('+');
    }
    return '';
  } catch (e) {
    return '';
  }
}

function updateHoldDisplays() {
  try {
    chrome.storage.sync.get(
      {
        'hold-speed': { key: 'q', code: 'KeyQ', ctrl: true, alt: false, shift: false, meta: false },
        'hold-reverse': { key: '`', code: 'Backquote', ctrl: true, alt: false, shift: false, meta: false },
        'uvs-hold-speed': 16,
      },
      (items) => {
        if (chrome.runtime.lastError) return;
        try {
          const holdEl = document.getElementById('hold-key-display');
          if (holdEl && items['hold-speed']) holdEl.textContent = formatHoldBinding(items['hold-speed']);
          const rewindEl = document.getElementById('rewind-key-display');
          if (rewindEl && items['hold-reverse']) rewindEl.textContent = formatHoldBinding(items['hold-reverse']);

          const holdSpeed = Number(items['uvs-hold-speed']) || 16;
          const holdInfoBoxes = document.querySelectorAll('.hold-desc');
          if (holdInfoBoxes && holdInfoBoxes.length >= 2) {
            holdInfoBoxes.forEach((box) => {
              try {
                const strong = box.querySelector('strong');
                if (strong) strong.textContent = holdSpeed.toFixed(holdSpeed % 1 === 0 ? 0 : 1) + 'x';
              } catch (e) {}
            });
          }

          const rewindBox = document.getElementById('rewind-info-box');
          const holdBox = document.getElementById('hold-info-box');
          if (rewindBox) rewindBox.title = `Hold ${formatHoldBinding(items['hold-reverse'])} for ${holdSpeed}x rewind`;
          if (holdBox) holdBox.title = `Hold ${formatHoldBinding(items['hold-speed'])} for ${holdSpeed}x forward`;
        } catch (e) {}
      }
    );
  } catch (e) {}
}

try {
  updateHoldDisplays();
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      try {
        if (area === 'sync' && (changes['hold-speed'] || changes['hold-reverse'] || changes['uvs-hold-speed'])) {
          updateHoldDisplays();
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// -----------------------------------------------------------------------------
// Per-Site Speeds
// -----------------------------------------------------------------------------

let currentTabId = null;
let currentHostname = null;
let currentSiteSpeed = null;
let currentDefaultSpeed = 1;

function extractHostname(url) {
  try {
    if (!url) return null;
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('edge://')
    )
      return null;
    if (url.startsWith('file://')) return 'file:///';
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host && u.protocol === 'file:') return 'file:///';
    return host;
  } catch (e) {
    return null;
  }
}

function normalizeDomainForDisplay(host) {
  if (!host) return '';
  if (host === 'file:///' || host.startsWith('file://')) return 'file:///';
  return host.replace(/^www\./, '');
}

function updateSiteButtonText(speed) {
  try {
    const btn = document.getElementById('btn-set-site-speed');
    if (btn && (currentHostname || storageCache.hostname || contentCache.hostname)) {
      const host = currentHostname || storageCache.hostname || contentCache.hostname;
      const displayHost = normalizeDomainForDisplay(host);
      btn.textContent = `Set ${Number(speed).toFixed(2)}x for ${displayHost}`;
    }
  } catch (e) {}
}

function updateSiteSection(hostname, siteSpeed, defaultSpeed, finalSliderSpeed) {
  try {
    const hostEl = document.getElementById('site-host');
    const displayEl = document.getElementById('site-speed-display');
    const badgeEl = document.getElementById('site-badge');
    const setBtn = document.getElementById('btn-set-site-speed');
    const clearBtn = document.getElementById('btn-clear-site-speed');
    const siteSection = document.getElementById('site-section');

    if (!hostname) {
      if (siteSection) siteSection.style.display = 'none';
      return;
    }

    if (siteSection) siteSection.style.display = 'flex';
    currentHostname = hostname;
    storageCache.hostname = hostname;

    if (siteSpeed != null) currentSiteSpeed = siteSpeed;
    else if (hostname && siteSpeed === null) currentSiteSpeed = null;

    currentDefaultSpeed = defaultSpeed || 1;
    if (siteSpeed != null) storageCache.siteSpeed = siteSpeed;
    else if (siteSpeed === null && storageCache.hostname === hostname) {
      if (contentCache.siteSpeed == null) storageCache.siteSpeed = null;
    }

    const isFileUrl = hostname === 'file:///' || hostname.startsWith('file://');

    if (hostEl) {
      hostEl.textContent = isFileUrl ? 'file:///' : normalizeDomainForDisplay(hostname);
    }

    if (setBtn) {
      const speedToShow = finalSliderSpeed != null ? finalSliderSpeed : Number(speedBarElement.value || 1);
      const displayHost = isFileUrl ? 'file:///' : normalizeDomainForDisplay(hostname);
      setBtn.textContent = `Set ${Number(speedToShow).toFixed(2)}x for ${displayHost}`;
    }

    // Hide legacy display element (Custom: ...x text removed per design)
    if (displayEl) {
      displayEl.style.display = 'none';
      displayEl.textContent = '';
    }

    // Handle file:// URLs and normal sites - both support custom speeds
    if (isFileUrl) {
      if (siteSpeed != null) {
        if (badgeEl) {
          badgeEl.textContent = `${Number(siteSpeed).toFixed(2)}x`;
          badgeEl.className = 'site-badge has-custom';
          badgeEl.style.display = 'inline-block';
        }
        if (clearBtn) clearBtn.style.display = 'inline-flex';
        if (setBtn) setBtn.style.display = 'inline-flex';
      } else {
        if (badgeEl) {
          badgeEl.textContent = 'Not Set';
          badgeEl.className = 'site-badge has-custom';
          badgeEl.style.display = 'inline-block';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        if (setBtn) setBtn.style.display = 'inline-flex';
      }
      const actionsRow = document.querySelector('.site-actions');
      if (actionsRow) actionsRow.style.display = 'flex';
    } else if (siteSpeed != null) {
      if (badgeEl) {
        badgeEl.textContent = `${Number(siteSpeed).toFixed(2)}x`;
        badgeEl.className = 'site-badge has-custom';
        badgeEl.style.display = 'inline-block';
      }
      if (clearBtn) clearBtn.style.display = 'inline-flex';
      if (setBtn) setBtn.style.display = 'inline-flex';
      const actionsRow = document.querySelector('.site-actions');
      if (actionsRow) actionsRow.style.display = 'flex';
    } else {
      if (badgeEl) {
        badgeEl.textContent = 'Not Set';
        badgeEl.className = 'site-badge has-custom';
        badgeEl.style.display = 'inline-block';
      }
      if (clearBtn) clearBtn.style.display = 'none';
      if (setBtn) setBtn.style.display = 'inline-flex';
      const actionsRow = document.querySelector('.site-actions');
      if (actionsRow) actionsRow.style.display = 'flex';
    }
  } catch (e) {}
}

// Set custom speed for current site
document.getElementById('btn-set-site-speed').onclick = () => {
  try {
    const hostForSet = currentHostname || storageCache.hostname || contentCache.hostname;
    if (!hostForSet) return;
    const speed = Number(contentCache.curSpeed != null ? contentCache.curSpeed : (speedBarElement.value || getFinalSliderSpeed() || 1));
    const domain = normalizeDomainForDisplay(hostForSet);

    chrome.storage.sync.get({ 'uvs-site-speeds': {} }, (items) => {
      if (chrome.runtime.lastError) return;
      let siteSpeeds = items['uvs-site-speeds'] || {};
      siteSpeeds[domain] = speed;
      chrome.storage.sync.set({ 'uvs-site-speeds': siteSpeeds }, () => {
        if (chrome.runtime.lastError) return;
        storageCache.siteSpeed = speed;
        contentCache.siteSpeed = speed;
        contentCache.wasSet = false;
        contentCache.curSpeed = speed;
        renderAll();
        showStatus(`Set ${speed.toFixed(2)}x for ${domain}`);

        chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
          if (chrome.runtime.lastError) return;
          if (!tabs[0]) return;
          try {
            chrome.tabs.sendMessage(tabs[0].id, { from: MSG_FROM, message: 'site-speed-set', domain: domain, speed: speed }, () => {
              if (chrome.runtime.lastError) {}
            });
          } catch (e) {}
        });
      });
    });
  } catch (e) {}
};

// Remove site from custom list
const clearBtnEl = document.getElementById('btn-clear-site-speed');
if (clearBtnEl) {
  clearBtnEl.onclick = () => {
    try {
      const hostForClear = currentHostname || storageCache.hostname || contentCache.hostname;
      if (!hostForClear) return;
      const domain = normalizeDomainForDisplay(hostForClear);

      chrome.storage.sync.get({ 'uvs-site-speeds': {} }, (items) => {
        if (chrome.runtime.lastError) return;
        let siteSpeeds = items['uvs-site-speeds'] || {};
        delete siteSpeeds[domain];
        delete siteSpeeds[hostForClear];
        delete siteSpeeds['www.' + domain];
        for (let key in siteSpeeds) {
          const kNorm = key.toLowerCase().replace(/^www\./, '');
          const dNorm = domain.toLowerCase().replace(/^www\./, '');
          if (kNorm === dNorm) delete siteSpeeds[key];
        }
        chrome.storage.sync.set({ 'uvs-site-speeds': siteSpeeds }, () => {
          if (chrome.runtime.lastError) return;
          storageCache.siteSpeed = null;
          contentCache.siteSpeed = null;
          contentCache.wasSet = false;
          contentCache.curSpeed = storageCache.defaultSpeed;
          renderAll();
          showStatus(`Removed ${domain} from custom list`);

          chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
            if (chrome.runtime.lastError) return;
            if (!tabs[0]) return;
            try {
              chrome.tabs.sendMessage(tabs[0].id, { from: MSG_FROM, message: 'site-speed-set', domain: domain, speed: null }, () => {
                if (chrome.runtime.lastError) {}
              });
            } catch (e) {}
          });
        });
      });
    } catch (e) {}
  };
}

// -----------------------------------------------------------------------------
// File Access Permission Detection
// Only show local file warning if file:// access is NOT allowed
// -----------------------------------------------------------------------------

function isFileAccessAllowed(callback) {
  try {
    if (chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
      chrome.extension.isAllowedFileSchemeAccess(callback);
      return;
    }
    if (typeof browser !== 'undefined' && browser.extension && browser.extension.isAllowedFileSchemeAccess) {
      browser.extension.isAllowedFileSchemeAccess().then(callback).catch(() => callback(false));
      return;
    }
  } catch (e) {}
  // If API unavailable, assume allowed (Firefox often allows file:// by default)
  callback(true);
}

// -----------------------------------------------------------------------------
// Initialization: Load tab info, storage, and content script state
// -----------------------------------------------------------------------------

try {
  chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
    if (chrome.runtime.lastError) return;
    let tab = tabs[0];
    const countEl = document.getElementById('media-count');
    const fileWarning = document.getElementById('file-warning');

    if (!tab) {
      if (countEl) countEl.textContent = 'No active tab';
      return;
    }

    // Block extension pages
    if (
      tab.url &&
      (tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('edge://'))
    ) {
      if (countEl) {
        countEl.textContent = 'Cannot control on this page';
        countEl.className = 'media-status none';
      }
      const siteSection = document.getElementById('site-section');
      if (siteSection) siteSection.style.display = 'none';
      return;
    }

    currentTabId = tab.id;
    const hostname = extractHostname(tab.url);
    storageCache.hostname = hostname;

    // Show file warning only if file access permission is missing
    if (tab.url && tab.url.startsWith('file://')) {
      isFileAccessAllowed((isAllowed) => {
        try {
          if (!isAllowed) {
            if (fileWarning) fileWarning.classList.add('show');
          } else {
            if (fileWarning) fileWarning.classList.remove('show');
          }
        } catch (e) {
          if (fileWarning) fileWarning.classList.add('show');
        }
      });
    }

    // Load default and site speeds from storage
    try {
      chrome.storage.sync.get({ 'uvs-default-speed': 1, 'uvs-site-speeds': {} }, (items) => {
        if (chrome.runtime.lastError) return;
        const defaultSpeed = Number(items['uvs-default-speed'] || 1);
        const siteSpeeds = items['uvs-site-speeds'] || {};
        storageCache.defaultSpeed = defaultSpeed;
        currentDefaultSpeed = defaultSpeed;
        contentCache.defaultSpeed = defaultSpeed;

        let siteSpeed = null;
        if (hostname) {
          const hostNoWww = hostname.replace(/^www\./, '');
          if (siteSpeeds[hostname] != null) siteSpeed = siteSpeeds[hostname];
          else if (siteSpeeds[hostNoWww] != null) siteSpeed = siteSpeeds[hostNoWww];
          else {
            for (let domain in siteSpeeds) {
              const d = domain.toLowerCase().replace(/^www\./, '');
              if (hostname === d || hostNoWww === d || hostname.endsWith('.' + d) || hostNoWww.endsWith('.' + d)) {
                siteSpeed = siteSpeeds[domain];
                break;
              }
            }
          }
        }
        storageCache.siteSpeed = siteSpeed;
        storageCache.loaded = true;
        renderAll();
      });
    } catch (e) {}

    // Query listening status
    try {
      chrome.tabs.sendMessage(tab.id, { from: MSG_FROM, message: 'is-listening' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response) updateKeysEnabled(response);
      });
    } catch (e) {}

    // Query current speed and media info
    try {
      chrome.tabs.sendMessage(tab.id, { from: MSG_FROM, message: 'speed-query' }, async function (response) {
        if (chrome.runtime.lastError) {
          try {
            const direct = await directMediaGetSpeed(tab.id);
            if (direct) {
              contentCache.curSpeed = direct.speed;
              contentCache.mediaCount = direct.count;
              contentCache.isDirectMedia = !!direct.direct;
              contentCache.loaded = true;
              if (countEl) {
                countEl.textContent = direct.direct ? 'Direct media file - controlling speed' : `${direct.count} media detected - controlling`;
                countEl.className = 'media-status detected';
              }
              renderAll();
              if (tab.url && tab.url.startsWith('file://') && fileWarning) {
                isFileAccessAllowed((allowed) => {
                  if (allowed && fileWarning) fileWarning.classList.remove('show');
                });
              }
            } else {
              contentCache.curSpeed = 1;
              contentCache.loaded = true;
              if (countEl) {
                countEl.textContent = 'No media on this page';
                countEl.className = 'media-status none';
              }
              renderAll();
              if (tab.url && tab.url.startsWith('file://') && fileWarning) {
                isFileAccessAllowed((allowed) => {
                  if (!allowed) {
                    if (fileWarning) fileWarning.classList.add('show');
                  } else {
                    if (fileWarning) fileWarning.classList.remove('show');
                  }
                });
              }
            }
          } catch (e) {}
          return;
        }

        if (!response || !response.ok) {
          try {
            const direct = await directMediaGetSpeed(tab.id);
            if (direct) {
              contentCache.curSpeed = direct.speed;
              contentCache.mediaCount = direct.count;
              contentCache.isDirectMedia = !!direct.direct;
              contentCache.loaded = true;
              if (countEl) {
                countEl.textContent = direct.direct ? 'Direct media file - controlling speed' : `${direct.count} media detected - controlling`;
                countEl.className = 'media-status detected';
              }
              renderAll();
            } else {
              contentCache.curSpeed = 1;
              contentCache.loaded = true;
              if (countEl) {
                countEl.textContent = 'No media on this page';
                countEl.className = 'media-status none';
              }
              renderAll();
            }
          } catch (e) {}
        } else {
          try {
            contentCache.curSpeed = Number(response['current-speed'] || 1);
            contentCache.siteSpeed = response['site-speed'] != null ? Number(response['site-speed']) : null;
            contentCache.wasSet = !!response['speed-was-set'];
            contentCache.defaultSpeed = response['default-speed'] != null ? Number(response['default-speed']) : null;
            contentCache.hostname = response.hostname || hostname;
            contentCache.mediaCount = response['media-count'] || 0;
            contentCache.isDirectMedia = !!response['is-direct-media'];
            contentCache.loaded = true;
            if (contentCache.defaultSpeed) {
              storageCache.defaultSpeed = contentCache.defaultSpeed;
              currentDefaultSpeed = contentCache.defaultSpeed;
            }
            renderAll();
          } catch (e) {}
        }
      });
    } catch (e) {}

    // Query presets
    try {
      chrome.tabs.sendMessage(tab.id, { from: MSG_FROM, message: 'presets-query' }, function (response) {
        if (chrome.runtime.lastError) {
          try {
            chrome.storage.sync.get({ 'uvs-user-presets': ['1', '1.25', '1.5', '1.75', '2', '2.5', '3', '4'] }, (items) => {
              if (chrome.runtime.lastError) return;
              const presets = items['uvs-user-presets'];
              let idx = 0;
              for (let preset of presets) {
                if (presetButtons[idx]) {
                  presetButtons[idx].value = preset + 'x';
                  presetButtons[idx].textContent = preset + 'x';
                  presetButtons[idx].dataset.speed = preset;
                }
                idx++;
              }
              updateActivePreset(getFinalSliderSpeed());
            });
          } catch (e) {}
          return;
        }
        if (!response || !response.ok) {
          try {
            chrome.storage.sync.get({ 'uvs-user-presets': ['1', '1.25', '1.5', '1.75', '2', '2.5', '3', '4'] }, (items) => {
              if (chrome.runtime.lastError) return;
              const presets = items['uvs-user-presets'];
              let idx = 0;
              for (let preset of presets) {
                if (presetButtons[idx]) {
                  presetButtons[idx].value = preset + 'x';
                  presetButtons[idx].textContent = preset + 'x';
                  presetButtons[idx].dataset.speed = preset;
                }
                idx++;
              }
              updateActivePreset(getFinalSliderSpeed());
            });
          } catch (e) {}
          return;
        }
        try {
          const { presets } = response;
          let idx = 0;
          for (let preset of presets) {
            if (presetButtons[idx]) {
              presetButtons[idx].value = preset + 'x';
              presetButtons[idx].textContent = preset + 'x';
              presetButtons[idx].dataset.speed = preset;
            }
            idx++;
          }
          updateActivePreset(getFinalSliderSpeed());
        } catch (e) {}
      });
    } catch (e) {}
  });
} catch (e) {
  console.log('UVS popup init error:', e);
}
