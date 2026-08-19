// Theme initializer — loads before page renders
// Persists via: window.name (survives navigation on file://), localStorage, cookie, BroadcastChannel
(function() {
  var THEMES = {
    green: { rgb: '0,255,157', hex: '#00ff9d', dim: '#00cc7d', teal: '#64ffda' },
    blue:  { rgb: '0,168,255', hex: '#00a8ff', dim: '#0088cc', teal: '#64d8ff' },
    red:   { rgb: '255,60,60', hex: '#ff3c3c', dim: '#cc3030', teal: '#ff8a8a' }
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
    var t = THEMES[name];
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
  window.__yangaGetTheme = getTheme;
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
      if (e.data && THEMES[e.data]) {
        applyThemeEarly(e.data);
        saveToWindowName(e.data);
        try { localStorage.setItem('yanga_theme', e.data); } catch(ex) {}
        // Also update matrix/boot/dot highlights via global.js applyTheme if loaded
        if (window.__yangaApplyTheme) window.__yangaApplyTheme(e.data);
      }
    };
  }

  var saved = getTheme();
  if (saved) applyThemeEarly(saved);

})();
