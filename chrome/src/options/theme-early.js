// Early theme application to prevent flash - external file for CSP compliance
(function() {
  try {
    const theme = localStorage.getItem('uvs-theme') || 'auto';
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else if (theme === 'light') document.documentElement.classList.add('light');
    else {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.add('light');
      }
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ 'uvs-theme': 'auto' }, (items) => {
        const stored = items['uvs-theme'] || 'auto';
        document.documentElement.classList.remove('dark', 'light');
        if (stored === 'dark') document.documentElement.classList.add('dark');
        else if (stored === 'light') document.documentElement.classList.add('light');
        else {
          if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.add('light');
          }
        }
      });
    }
  } catch (e) {}
})();
