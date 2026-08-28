// Theme initializer — loads before page renders
// Persists via: window.name (survives navigation on file://), localStorage, cookie, BroadcastChannel
(function() {
  var THEMES = {
    green: { rgb: '0,255,157', hex: '#00ff9d', dim: '#00cc7d', teal: '#64ffda' },
    blue:  { rgb: '0,168,255', hex: '#00a8ff', dim: '#0088cc', teal: '#64d8ff' },
    red:   { rgb: '255,60,60', hex: '#ff3c3c', dim: '#cc3030', teal: '#ff8a8a' },
    orange:{ rgb: '255,140,40', hex: '#ff8c28', dim: '#cc7020', teal: '#ffb37a' },
    yellow:{ rgb: '255,206,54', hex: '#ffce36', dim: '#cca82b', teal: '#ffe38f' },
    pink:  { rgb: '255,92,196', hex: '#ff5cc4', dim: '#cc4a9c', teal: '#ff9edd' },
    purple:{ rgb: '176,112,255', hex: '#b070ff', dim: '#8c58cc', teal: '#ccaaff' }
  };

  // Darker accent variants for light mode (neons wash out on paper)
  var THEMES_LIGHT = {
    green: { rgb: '0,158,102', hex: '#009e66', dim: '#007a4f', teal: '#0c9c8a' },
    blue:  { rgb: '0,122,204', hex: '#007acc', dim: '#005f99', teal: '#0c86b8' },
    red:   { rgb: '214,40,40', hex: '#d62828', dim: '#a51d1d', teal: '#c05555' },
    orange:{ rgb: '204,102,16', hex: '#cc6610', dim: '#a3520d', teal: '#c07d3a' },
    yellow:{ rgb: '176,132,10', hex: '#b0840a', dim: '#8a6708', teal: '#a68a2e' },
    pink:  { rgb: '200,30,140', hex: '#c81e8c', dim: '#a0176f', teal: '#bb4a97' },
    purple:{ rgb: '122,62,204', hex: '#7a3ecc', dim: '#5f30a0', teal: '#8a5ec0' }
  };

  // --- Read from window.name (JSON blob that survives same-tab navigation on any protocol) ---
  function getFromWindowName() {
    try {
      var data = JSON.parse(window.name);
      return (data && data.yanga_theme) ? data.yanga_theme : null;
    } catch(e) { return null; }
  }

  function saveToWindowName(name) {
    var data = {};
    try { data = JSON.parse(window.name) || {}; } catch(e) {}
    data.yanga_theme = name;
    window.name = JSON.stringify(data);
  }

  function getModeFromWindowName() {
    try {
      var data = JSON.parse(window.name);
      return (data && data.yanga_mode) ? data.yanga_mode : null;
    } catch(e) { return null; }
  }

  function getMode() {
    var m = getModeFromWindowName();
    if (!m) { try { m = localStorage.getItem('yanga_mode'); } catch(e) {} }
    if (!m) {
      var match = document.cookie.match(/yanga_mode=(\w+)/);
      if (match) m = match[1];
    }
    return 'dark'; // light mode unwired for the moment (force dark, ignore saved pref)
  }

  function getTheme() {
    // 1. window.name — most reliable on file://
    var t = getFromWindowName();
    // 2. localStorage
    if (!t) { try { t = localStorage.getItem('yanga_theme'); } catch(e) {} }
    // 3. Cookie (works on http)
    if (!t) {
      var match = document.cookie.match(/yanga_theme=(\w+)/);
      if (match) t = match[1];
    }
    return (t && THEMES[t]) ? t : null;
  }

  function applyThemeEarly(name) {
    var mode = document.documentElement.getAttribute('data-mode') || getMode();
    var t = (mode === 'light' && THEMES_LIGHT[name]) ? THEMES_LIGHT[name] : THEMES[name];
    if (!t) return;
    var s = document.documentElement.style;
    s.setProperty('--accent-rgb', t.rgb);
    s.setProperty('--accent', t.hex);
    s.setProperty('--accent-dim', t.dim);
    s.setProperty('--teal', t.teal);
  }

  // BroadcastChannel for cross-tab sync (ignored if unsupported)
  var bc = null;
  try { bc = new BroadcastChannel('yanga_theme'); } catch(e) {}

  // Expose for global.js to reuse
  window.__yangaThemes = THEMES;
  window.__yangaThemesLight = THEMES_LIGHT;
  window.__yangaGetTheme = getTheme;
  window.__yangaGetMode = getMode;
  window.__yangaSaveMode = function(mode) {
    var data = {};
    try { data = JSON.parse(window.name) || {}; } catch(e) {}
    data.yanga_mode = mode;
    window.name = JSON.stringify(data);
    try { localStorage.setItem('yanga_mode', mode); } catch(e) {}
    document.cookie = 'yanga_mode=' + mode + ';path=/;max-age=31536000;SameSite=Lax';
    if (bc) try { bc.postMessage({ mode: mode }); } catch(e) {}
  };
  window.__yangaSaveTheme = function(name) {
    // Write to all storage layers
    saveToWindowName(name);
    try { localStorage.setItem('yanga_theme', name); } catch(e) {}
    document.cookie = 'yanga_theme=' + name + ';path=/;max-age=31536000;SameSite=Lax';
    // Broadcast to other open tabs
    if (bc) try { bc.postMessage(name); } catch(e) {}
  };

  // Listen for theme changes from other tabs
  if (bc) {
    bc.onmessage = function(e) {
      if (e.data && typeof e.data === 'object' && e.data.mode) {
        document.documentElement.setAttribute('data-mode', e.data.mode);
        if (window.__yangaApplyMode) window.__yangaApplyMode(e.data.mode);
        return;
      }
      if (e.data && THEMES[e.data]) {
        applyThemeEarly(e.data);
        saveToWindowName(e.data);
        try { localStorage.setItem('yanga_theme', e.data); } catch(ex) {}
        // Also update matrix/boot/dot highlights via global.js applyTheme if loaded
        if (window.__yangaApplyTheme) window.__yangaApplyTheme(e.data);
      }
    };
  }

  document.documentElement.setAttribute('data-mode', getMode());
  var saved = getTheme();
  if (saved) applyThemeEarly(saved);

})();
