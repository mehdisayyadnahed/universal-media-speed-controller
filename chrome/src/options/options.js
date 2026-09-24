/**
 * Universal Media Speed Controller - Options Page Logic
 * Handles keyboard shortcuts, per-site speeds, hold speed, backup/restore, and preferences.
 * All code and comments are in English.
 */

'use strict';

// -----------------------------------------------------------------------------
// Keyboard Shortcut Helpers
// -----------------------------------------------------------------------------

function killEvent(event) {
  event.stopImmediatePropagation();
  event.preventDefault();
}

/** Format a binding object to human readable string, e.g. Ctrl + Q */
function formatBinding(binding) {
  if (!binding) return '';
  if (typeof binding === 'string') return binding;
  if (typeof binding === 'object' && binding.key) {
    let parts = [];
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Meta');
    let keyDisplay = binding.key;
    if (keyDisplay === ' ') keyDisplay = 'Space';
    if (keyDisplay === '`') keyDisplay = '`';
    else if (keyDisplay.length === 1) keyDisplay = keyDisplay.toUpperCase();
    parts.push(keyDisplay);
    return parts.join(' + ');
  }
  return String(binding);
}

/** Convert keyboard event to binding object */
function eventToBinding(event) {
  // Ignore modifier-only presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
  return {
    key: event.key,
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

/** Build shortcuts table from defaultOptions and descriptions - safe DOM, no innerHTML */
function generateTableContent() {
  const body = document.querySelector('#shortcuts-body');
  // Clear safely
  while (body.firstChild) body.removeChild(body.firstChild);

  for (let key of Object.keys(defaults)) {
    const action = key;
    const value = defaults[key];
    const desc = descriptions[action] || action;

    const row = document.createElement('tr');
    row['data-action-name'] = action;
    row['data-listening'] = false;

    const actionCell = document.createElement('td');
    const actionNameDiv = document.createElement('div');
    actionNameDiv.className = 'action-name';
    actionNameDiv.textContent = action.replace(/-/g, ' ');
    const actionDescDiv = document.createElement('div');
    actionDescDiv.className = 'action-desc';
    actionDescDiv.textContent = desc;
    actionCell.appendChild(actionNameDiv);
    actionCell.appendChild(actionDescDiv);

    const setCell = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-set';
    button.textContent = 'Set Combo';
    button.id = `btn-${action}`;
    button.onclick = function () {
      // Reset all other rows
      document.querySelectorAll('tr').forEach((r) => {
        r['data-listening'] = false;
        const btn = r.querySelector('.btn-set');
        if (btn) {
          btn.textContent = 'Set Combo';
          btn.classList.remove('listening');
        }
      });
      button.textContent = 'Press combo...';
      button.classList.add('listening');
      row['data-listening'] = true;
      button.blur();
      row.focus();
    };
    row.tabIndex = '-1';
    row.onkeydown = function (event) {
      if (row['data-listening']) {
        const binding = eventToBinding(event);
        if (!binding) {
          killEvent(event);
          return;
        }
        const codeInput = document.getElementById(`code-${row['data-action-name']}`);
        codeInput.value = formatBinding(binding);
        codeInput.dataset.binding = JSON.stringify(binding);
        button.textContent = 'Set Combo';
        button.classList.remove('listening');
        row['data-listening'] = false;
        row.blur();
        killEvent(event);
        codeInput.style.borderColor = '#000000';
        setTimeout(() => (codeInput.style.borderColor = ''), 1000);
      }
    };
    setCell.appendChild(button);

    const codeCell = document.createElement('td');
    const codeInput = document.createElement('input');
    codeInput.id = `code-${action}`;
    codeInput.className = 'code-input';
    codeInput.type = 'text';
    codeInput.readOnly = true;
    codeInput.placeholder = 'Press Set Combo';
    codeInput.value = formatBinding(value);
    if (typeof value === 'object') codeInput.dataset.binding = JSON.stringify(value);
    else codeInput.dataset.binding = JSON.stringify({ key: value, ctrl: false, alt: false, shift: false, meta: false });
    codeCell.appendChild(codeInput);

    row.appendChild(actionCell);
    row.appendChild(setCell);
    row.appendChild(codeCell);
    body.appendChild(row);
  }
}

generateTableContent();

// -----------------------------------------------------------------------------
// Per-Site Speeds - safe DOM, no innerHTML
// -----------------------------------------------------------------------------

/** Normalize domain input: remove protocol, path, port, and www. */
function normalizeDomain(input) {
  if (!input) return '';
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.split('/')[0];
  domain = domain.split(':')[0];
  domain = domain.replace(/^www\./, '');
  return domain;
}

/** Render list of per-site custom speeds - safe DOM */
function renderSiteList(siteSpeeds) {
  const container = document.getElementById('site-list');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  const domains = Object.keys(siteSpeeds || {});
  if (domains.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'site-list-empty';
    // Create text with line break safely
    const text1 = document.createTextNode('No custom site speeds yet. Add youtube.com → 2x, instagram.com → 3x etc.');
    const br = document.createElement('br');
    const text2 = document.createTextNode('Set from popup when on a site, or add here.');
    emptyDiv.appendChild(text1);
    emptyDiv.appendChild(br);
    emptyDiv.appendChild(text2);
    container.appendChild(emptyDiv);
    return;
  }

  domains.sort().forEach((domain) => {
    const speed = siteSpeeds[domain];
    const row = document.createElement('div');
    row.className = 'site-row';

    const domainInput = document.createElement('input');
    domainInput.type = 'text';
    domainInput.className = 'site-input';
    domainInput.value = domain;
    domainInput.style.flex = '1';
    domainInput.style.minWidth = '180px';
    domainInput.setAttribute('data-domain-input', domain);
    domainInput.placeholder = 'domain.com';

    const speedInput = document.createElement('input');
    speedInput.type = 'number';
    speedInput.className = 'site-speed-input';
    speedInput.value = speed;
    speedInput.step = '0.01';
    speedInput.min = '0.1';
    speedInput.max = '16';
    speedInput.style.width = '90px';
    speedInput.setAttribute('data-domain', domain);
    speedInput.setAttribute('data-speed-for', domain);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-icon';
    saveBtn.setAttribute('data-edit', domain);
    saveBtn.textContent = 'Save';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon danger';
    delBtn.setAttribute('data-delete', domain);
    delBtn.textContent = 'Delete';

    row.appendChild(domainInput);
    row.appendChild(speedInput);
    row.appendChild(saveBtn);
    row.appendChild(delBtn);
    container.appendChild(row);
  });

  // Edit handlers - now supports editing both domain and speed, including rename
  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      const oldDomain = btn.getAttribute('data-edit');
      const domainInput = container.querySelector(`input[data-domain-input="${oldDomain}"]`);
      const speedInput = container.querySelector(`input[data-speed-for="${oldDomain}"]`);
      if (!domainInput || !speedInput) return;
      let newDomain = normalizeDomain(domainInput.value);
      const newSpeed = Number(speedInput.value);
      if (!newDomain) {
        alert('Enter domain e.g. youtube.com');
        return;
      }
      if (!newSpeed || newSpeed < 0.1 || newSpeed > 16) {
        alert('Speed must be between 0.1 and 16');
        return;
      }
      chrome.storage.sync.get({ 'uvs-site-speeds': {} }, (items) => {
        let siteSpeeds = items['uvs-site-speeds'] || {};
        // If domain changed, delete old
        if (newDomain !== oldDomain) {
          delete siteSpeeds[oldDomain];
        }
        siteSpeeds[newDomain] = newSpeed;
        chrome.storage.sync.set({ 'uvs-site-speeds': siteSpeeds }, () => {
          renderSiteList(siteSpeeds);
          if (newDomain !== oldDomain) {
            showStatusBar(`Renamed ${oldDomain} → ${newDomain} → ${newSpeed}x`);
          } else {
            showStatusBar(`Updated ${newDomain} → ${newSpeed}x`);
          }
        });
      });
    };
  });

  // Delete handlers
  container.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.onclick = () => {
      const domain = btn.getAttribute('data-delete');
      if (!confirm(`Delete custom speed for ${domain}?`)) return;
      chrome.storage.sync.get({ 'uvs-site-speeds': {} }, (items) => {
        let siteSpeeds = items['uvs-site-speeds'] || {};
        delete siteSpeeds[domain];
        chrome.storage.sync.set({ 'uvs-site-speeds': siteSpeeds }, () => {
          renderSiteList(siteSpeeds);
          showStatusBar(`Deleted ${domain}`);
        });
      });
    };
  });

  // Enter key saves - for both domain and speed inputs
  container.querySelectorAll('.site-speed-input, .site-input').forEach((input) => {
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const oldDomain = input.getAttribute('data-domain') || input.getAttribute('data-domain-input');
        const btn = container.querySelector(`[data-edit="${oldDomain}"]`);
        if (btn) btn.click();
      }
    };
  });
}

function loadSiteSpeeds() {
  chrome.storage.sync.get({ 'uvs-site-speeds': {} }, (items) => {
    renderSiteList(items['uvs-site-speeds'] || {});
  });
}

// Add new site speed
document.getElementById('btn-add-site').onclick = () => {
  const domainInput = document.getElementById('new-site-domain');
  const speedInput = document.getElementById('new-site-speed');
  let domain = normalizeDomain(domainInput.value);
  let speed = Number(speedInput.value);

  if (!domain) {
    alert('Enter domain e.g. youtube.com');
    return;
  }
  if (!speed || speed < 0.1 || speed > 16) {
    alert('Speed must be 0.1 - 16');
    return;
  }
  if (!domain.includes('.') && domain !== 'localhost' && domain !== 'file:///') {
    if (!confirm(`"${domain}" doesn't look like a domain. Add anyway?`)) return;
  }

  chrome.storage.sync.get({ 'uvs-site-speeds': {} }, (items) => {
    let siteSpeeds = items['uvs-site-speeds'] || {};
    siteSpeeds[domain] = speed;
    chrome.storage.sync.set({ 'uvs-site-speeds': siteSpeeds }, () => {
      renderSiteList(siteSpeeds);
      domainInput.value = '';
      showStatusBar(`Added ${domain} → ${speed}x`);
    });
  });
};

document.getElementById('new-site-domain').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-site').click();
};
document.getElementById('new-site-speed').onkeydown = (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-site').click();
};

// -----------------------------------------------------------------------------
// Theme Handling
// -----------------------------------------------------------------------------

function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  if (theme === 'dark') {
    html.classList.add('dark');
    try { localStorage.setItem('uvs-theme', 'dark'); } catch (e) {}
  } else if (theme === 'light') {
    html.classList.add('light');
    try { localStorage.setItem('uvs-theme', 'light'); } catch (e) {}
  } else {
    // auto
    try { localStorage.setItem('uvs-theme', 'auto'); } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      html.classList.add('dark');
    } else {
      html.classList.add('light');
    }
  }
  // Update UI
  document.querySelectorAll('.theme-option').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-theme') === theme);
  });
}

function setupThemeUI() {
  const themeOptions = document.querySelectorAll('.theme-option');
  themeOptions.forEach((opt) => {
    opt.onclick = () => {
      const theme = opt.getAttribute('data-theme');
      applyTheme(theme);
      try {
        chrome.storage.sync.set({ 'uvs-theme': theme }, () => {
          showStatusBar(`Theme: ${theme}`);
        });
      } catch (e) {}
    };
  });

  // Load theme from storage
  try {
    chrome.storage.sync.get({ 'uvs-theme': 'auto' }, (items) => {
      const theme = items['uvs-theme'] || 'auto';
      applyTheme(theme);
    });
  } catch (e) {
    applyTheme('auto');
  }

  // Listen for system theme changes when in auto mode
  try {
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        chrome.storage.sync.get({ 'uvs-theme': 'auto' }, (items) => {
          if ((items['uvs-theme'] || 'auto') === 'auto') {
            applyTheme('auto');
          }
        });
      });
    }
  } catch (e) {}
}

// -----------------------------------------------------------------------------
// Status Bar
// -----------------------------------------------------------------------------

function showStatusBar(text) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.classList.add('show');
  setTimeout(() => {
    status.textContent = '';
    status.classList.remove('show');
  }, 3000);
}

// -----------------------------------------------------------------------------
// Hold Speed (Configurable 2x - 16x)
// -----------------------------------------------------------------------------

function setupHoldSpeedUI() {
  const number = document.getElementById('hold-speed-number');
  if (!number) return;

  // Clamp on input
  number.oninput = () => {
    let val = Number(number.value);
    if (isNaN(val)) return;
    if (val < 2) val = 2;
    if (val > 16) val = 16;
  };

  // Snap to 0.5 steps on change
  number.onchange = () => {
    let val = Number(number.value);
    if (isNaN(val) || val < 2) val = 2;
    if (val > 16) val = 16;
    val = Math.round(val * 2) / 2;
    number.value = val;
  };
}

function getHoldSpeedValue() {
  const number = document.getElementById('hold-speed-number');
  let val = 16;
  if (number && number.value) val = Number(number.value) || val;
  if (val < 2) val = 2;
  if (val > 16) val = 16;
  val = Math.round(val * 2) / 2;
  return val;
}

function setHoldSpeedValue(val) {
  const number = document.getElementById('hold-speed-number');
  if (!number) return;
  val = Number(val) || 16;
  if (val < 2) val = 2;
  if (val > 16) val = 16;
  val = Math.round(val * 2) / 2;
  number.value = val;
}

// -----------------------------------------------------------------------------
// Save & Restore Options
// -----------------------------------------------------------------------------

function save_options() {
  let options = {};
  for (let key of Object.keys(defaults)) {
    const codeInput = document.getElementById(`code-${key}`);
    if (codeInput.dataset.binding) {
      try {
        options[key] = JSON.parse(codeInput.dataset.binding);
      } catch (e) {
        options[key] = codeInput.value.trim();
      }
    } else options[key] = codeInput.value.trim();
  }

  options.allowintext = document.getElementById('allowintext').checked;
  options.stopprop = document.getElementById('stopprop').checked;
  options.prevdef = document.getElementById('prevdef').checked;
  options['uvs-hold-speed'] = getHoldSpeedValue();
  // Save current theme selection
  try {
    const activeTheme = document.querySelector('.theme-option.active');
    if (activeTheme) options['uvs-theme'] = activeTheme.getAttribute('data-theme');
  } catch (e) {}

  chrome.storage.sync.set(options, function () {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved! Refresh video pages to apply.';
    status.classList.add('show');
    setTimeout(function () {
      status.textContent = '';
      status.classList.remove('show');
    }, 3000);
  });
}

function restore_options() {
  setupHoldSpeedUI();
  setupThemeUI();

  chrome.storage.sync.get(
    {
      ...defaults,
      prevdef: true,
      stopprop: true,
      allowintext: true,
      'uvs-hold-speed': 16,
    },
    function (items) {
      document.getElementById('prevdef').checked = items.prevdef;
      document.getElementById('stopprop').checked = items.stopprop;
      document.getElementById('allowintext').checked = items.allowintext;
      setHoldSpeedValue(items['uvs-hold-speed'] || 16);

      for (let key of Object.keys(defaults)) {
        const codeInput = document.getElementById(`code-${key}`);
        if (!codeInput) continue;
        let stored = items[key];
        if (!stored) stored = defaults[key];
        if (typeof stored === 'string') {
          codeInput.value = stored;
          codeInput.dataset.binding = JSON.stringify({
            key: stored,
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
          });
        } else if (typeof stored === 'object' && stored.key) {
          codeInput.value = formatBinding(stored);
          codeInput.dataset.binding = JSON.stringify(stored);
        }
      }
    }
  );
  loadSiteSpeeds();
}

// -----------------------------------------------------------------------------
// Backup & Restore (Export / Import / Reset)
// -----------------------------------------------------------------------------

document.getElementById('btn-export').onclick = () => {
  chrome.storage.sync.get(null, (items) => {
    const exportData = {
      version: '1.2',
      exportDate: new Date().toISOString(),
      settings: items,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `uvsc-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatusBar('Settings exported!');
  });
};

document.getElementById('btn-import').onclick = () => {
  document.getElementById('import-file').click();
};

document.getElementById('btn-reset').onclick = () => {
  if (
    !confirm(
      'Reset all settings to defaults?\n\nThis will:\n• Reset default speed to 1x\n• Reset presets to 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4\n• Clear all per-site speeds\n• Reset shortcuts to defaults\n• Reset hold speed to 16x\n\nThis cannot be undone. Export first if you want backup.'
    )
  )
    return;

  chrome.storage.sync.clear(() => {
    const defaultSettings = {
      'uvs-default-speed': 1,
      'uvs-user-presets': ['1', '1.25', '1.5', '1.75', '2', '2.5', '3', '4'],
      'uvs-site-speeds': {},
      'uvs-hold-speed': 16,
      'uvs-theme': 'auto',
      prevdef: true,
      stopprop: true,
      allowintext: true,
      ...defaults,
    };
    chrome.storage.sync.set(defaultSettings, () => {
      restore_options();
      loadSiteSpeeds();
      generateTableContent();
      setTimeout(restore_options, 100);
      showStatusBar('Settings reset to defaults!');
    });
  });
};

document.getElementById('import-file').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      const settings = data.settings || data;
      if (typeof settings !== 'object') throw new Error('Invalid format');

      if (
        !confirm(
          `Import settings? This will overwrite current settings including ${Object.keys(settings['uvs-site-speeds'] || {}).length} site speeds.`
        )
      )
        return;

      chrome.storage.sync.set(settings, () => {
        restore_options();
        loadSiteSpeeds();
        generateTableContent();
        setTimeout(restore_options, 100);
        showStatusBar('Settings imported! Refresh pages.');
      });
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// Initialize
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
