// ============================================
// YANGA — Global Features
// Search, Scroll-to-Top, Progress Bar, TOC, Matrix Optimization
// ============================================

(function() {

  // -------------------------------------------
  // 0. TITLE GLITCH ON PAGE LOAD + HOVER + AUTO
  // -------------------------------------------
  function triggerGlitch(el) {
    if (!el || el.classList.contains('glitching')) return;
    el.classList.add('glitching');
    el.addEventListener('animationend', function handler() {
      el.classList.remove('glitching');
      el.removeEventListener('animationend', handler);
    });
  }

  // Decode-glitch effect — scrambles text then resolves char by char
  var DECODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZアイウエオカキクケコ@#%&*+=0123456789';
  function decodeTitle(el, text) {
    if (!el || el._decoding) return;
    el._decoding = true;
    var chars = text.split('');
    var len = chars.length;
    var locked = new Array(len);
    var scr = chars.map(function(ch) { return ch === ' ' ? ' ' : DECODE_CHARS[Math.floor(Math.random() * DECODE_CHARS.length)]; });
    var lockIdx = 0;
    el.textContent = scr.join('');
    var cyc = setInterval(function() {
      for (var i = 0; i < len; i++) {
        if (!locked[i] && chars[i] !== ' ') scr[i] = DECODE_CHARS[Math.floor(Math.random() * DECODE_CHARS.length)];
      }
      el.textContent = scr.join('');
    }, 50);
    var lck = setInterval(function() {
      while (lockIdx < len && chars[lockIdx] === ' ') { locked[lockIdx] = true; lockIdx++; }
      if (lockIdx < len) { scr[lockIdx] = chars[lockIdx]; locked[lockIdx] = true; lockIdx++; el.textContent = scr.join(''); }
      if (lockIdx >= len) { clearInterval(lck); clearInterval(cyc); el.textContent = text; el._decoding = false; }
    }, 60);
  }

  window.addEventListener('DOMContentLoaded', () => {
    // Sub-page hero animation on load
    const heroH1 = document.querySelector('.project-hero h1, .page-hero h1, .article-hero h1, .single-project-hero h1');
    if (heroH1) {
      var originalText = heroH1.textContent;
      if (!heroH1.getAttribute('data-text')) heroH1.setAttribute('data-text', originalText);
      // Article posts get the old CSS glitch-in; all other pages get decode
      if (heroH1.closest('.article-hero')) {
        setTimeout(function() {
          heroH1.classList.add('glitch-in');
          heroH1.addEventListener('animationend', function() {
            heroH1.classList.remove('glitch-in');
          }, { once: true });
        }, 300);
      } else {
        heroH1.textContent = '\u00A0';
        setTimeout(function() { decodeTitle(heroH1, originalText); }, 300);
      }
    }

    // --- Logo: wrap "GHOST" in a span for partial auto-glitch ---
    const logo = document.querySelector('.logo');
    if (logo) {
      // The accent part of the wordmark is .logo-mark in nav.html. Fall back to
      // wrapping the leading text node if the markup ever changes.
      let mark = logo.querySelector('.logo-mark');
      if (!mark) {
        const firstText = logo.childNodes[0];
        if (firstText && firstText.nodeType === 3 && firstText.textContent.trim()) {
          mark = document.createElement('span');
          mark.className = 'logo-mark';
          mark.textContent = firstText.textContent;
          logo.replaceChild(mark, firstText);
        }
      }
      if (mark && !mark.querySelector('.glitch-layer')) {
        mark.classList.add('logo-ghost');
        // Real cloned layers rather than attr(data-text) pseudo-elements, so the
        // rotated-V lambda renders correctly in the RGB-split ghosting.
        const inner = mark.innerHTML;
        ['glitch-l', 'glitch-r'].forEach(function(cls) {
          const layer = document.createElement('span');
          layer.className = 'glitch-layer ' + cls;
          layer.setAttribute('aria-hidden', 'true');
          layer.innerHTML = inner;
          mark.appendChild(layer);
        });
      }
      const ghostEl = logo.querySelector('.logo-ghost');
      if (ghostEl) {
        // Auto-glitch at random intervals (6-14s)
        (function loopGhost() {
          var delay = 6000 + Math.random() * 8000;
          setTimeout(function() { triggerGlitch(ghostEl); loopGhost(); }, delay);
        })();
        setTimeout(() => triggerGlitch(ghostEl), 500);
      }
    }

    // --- Homepage hero: auto-glitch only "Hacking" (.flag-green) ---
    const hackingSpan = document.querySelector('.hero h1 .flag-green');
    if (hackingSpan) {
      hackingSpan.setAttribute('data-text', hackingSpan.textContent);
      // Auto-glitch at random intervals (8-18s) — different rate from logo
      (function loopHacking() {
        var delay = 8000 + Math.random() * 10000;
        setTimeout(function() { triggerGlitch(hackingSpan); loopHacking(); }, delay);
      })();
      setTimeout(() => triggerGlitch(hackingSpan), 1200);
    }
  });

  // -------------------------------------------
  // 1. SCROLL-TO-TOP BUTTON
  // -------------------------------------------
  const scrollBtn = document.querySelector('.scroll-top');
  if (scrollBtn) {
    window.addEventListener('scroll', () => {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    });
    scrollBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // -------------------------------------------
  // 2. READING PROGRESS BAR (posts only)
  // -------------------------------------------
  const progressBar = document.querySelector('.reading-progress');
  const contentBody = document.querySelector('.article-body') ||
                      document.querySelector('.project-content');
  if (progressBar && contentBody) {
    window.addEventListener('scroll', () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? Math.min(100, (window.scrollY / docHeight) * 100) : 0;
      progressBar.style.width = pct + '%';
    });
  }

  // -------------------------------------------
  // 3. AUTO-GENERATE TABLE OF CONTENTS
  // -------------------------------------------
  const tocContainer = document.getElementById('article-toc-list');
  if (tocContainer && contentBody) {
    const headings = contentBody.querySelectorAll('h2');
    headings.forEach((h, i) => {
      const id = 'section-' + i;
      h.id = id;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + id;
      a.textContent = h.textContent.replace(/^\/\/\s*/, '');
      li.appendChild(a);
      tocContainer.appendChild(li);
    });
  }

  // -------------------------------------------
  // 4. SEARCH MODAL
  // -------------------------------------------
  const searchOverlay = document.querySelector('.search-overlay');
  const searchInput = document.querySelector('.search-input');
  const searchResults = document.querySelector('.search-results');

  // ── SITE-WIDE SEARCH INDEX ──
  // All searchable content — urls are relative to yanga root
  const searchIndex = [
    { title: "Deep Learning Doesn't Mean \"No Labels\"", section: "blog", tagLabel: "POST", desc: "The ML-vs-DL 'no labels' myth, and the two-axis mental model that replaces it.", tags: ["ai", "deep learning", "machine learning", "fundamentals", "clarifications", "labels"], url: "posts/deep-learning-labels-myth.html" },
    { title: "My Penetration Testing Methodology", section: "blog", tagLabel: "POST", desc: "The repeatable process I run on every engagement, scoping to reporting.", tags: ["pentesting", "methodology", "reporting", "active directory", "web"], url: "posts/penetration-testing-methodology.html" },
    { title: "Penetration Testing", section: "hub", tagLabel: "SECTION", desc: "Web application (WAPT) and infrastructure penetration testing.", tags: ["pentesting", "wapt", "web", "infrastructure", "network"], url: "sections/pentesting.html" },
    { title: "AI Agent Security", section: "hub", tagLabel: "SECTION", desc: "Attacking LLM applications and the agent infrastructure around them.", tags: ["ai", "red team", "llm", "prompt injection"], url: "sections/ai-red-teaming.html" },
    { title: "About", section: "site", tagLabel: "PROFILE", desc: "Who I am and how to get in touch.", tags: ["about", "whoami", "contact"], url: "about.html" },
    { title: "Blog", section: "site", tagLabel: "INDEX", desc: "All articles.", tags: ["blog", "articles", "writing"], url: "blog.html" },
  ];

  // ── Calculate relative path prefix from current page to site root ──
  // Works by finding global.js script tag and computing depth from its src path
  function getBasePrefix() {
    // Method 1: Infer from the global.js script src attribute
    const scripts = document.querySelectorAll('script[src*="global.js"]');
    for (const s of scripts) {
      const src = s.getAttribute('src');
      // e.g. "js/global.js" → depth 0, "../js/global.js" → depth 1, "../../js/global.js" → depth 2
      const parts = src.split('/');
      const jsIdx = parts.indexOf('js');
      if (jsIdx > 0) return parts.slice(0, jsIdx).join('/') + '/';
      if (jsIdx === 0) return '';
    }
    // Method 2: Fallback — use pathname to guess depth from the site root.
    // The site is served from a subdirectory on GitHub Pages, so these are the
    // directory names it may be published under.
    const path = window.location.pathname;
    for (const seg of ['/yanga/', '/ghostsec/']) {
      const rootIdx = path.indexOf(seg);
      if (rootIdx !== -1) {
        const afterRoot = path.substring(rootIdx + seg.length);
        const depth = (afterRoot.match(/\//g) || []).length;
        return '../'.repeat(depth);
      }
    }
    return '';
  }

  // Build a unique tag list from all search index entries
  const allTags = [...new Set(searchIndex.flatMap(item => item.tags))].sort();

  function renderResults(query) {
    if (!searchResults) return;
    if (!query) {
      searchResults.innerHTML = '<div class="search-empty">Type to search across all pages and tags...</div>';
      return;
    }
    const q = query.toLowerCase().trim();
    const terms = q.split(/\s+/);
    const prefix = getBasePrefix();

    // --- TAG AUTOCOMPLETE ---
    // Find tags that match what the user is typing
    const matchedTags = allTags.filter(tag =>
      terms.some(term => term.length > 0 && tag.toLowerCase().includes(term))
    ).slice(0, 10);

    let tagBar = '';
    if (matchedTags.length > 0) {
      tagBar = '<div class="search-tag-bar">' +
        '<span class="search-tag-label"><i class="fa-solid fa-tags"></i> Tags:</span>' +
        matchedTags.map(tag =>
          '<button class="search-tag-pill" data-tag="' + tag + '">' + tag.toUpperCase() + '</button>'
        ).join('') +
      '</div>';
    }

    // Score-based matching: title > tags > desc > section
    const scored = searchIndex.map(item => {
      let score = 0;
      const titleLow = item.title.toLowerCase();
      const descLow = item.desc.toLowerCase();
      const tagsJoined = item.tags.join(' ').toLowerCase();
      const labelLow = item.tagLabel.toLowerCase();

      terms.forEach(term => {
        if (titleLow.includes(term)) score += 10;
        if (item.tags.some(t => t.toLowerCase() === term)) score += 8;
        if (item.tags.some(t => t.toLowerCase().includes(term))) score += 5;
        if (labelLow.includes(term)) score += 4;
        if (descLow.includes(term)) score += 3;
        if (item.section.includes(term)) score += 2;
      });

      return { item, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      searchResults.innerHTML = tagBar + '<div class="search-empty">No results for "<strong>' + query + '</strong>"</div>';
      bindTagPills();
      return;
    }

    // Section color map
    const sectionColors = {
      blog: 'pink', hub: 'green', ai: 'pink', pentest: 'green',
      blockchain: 'gold', dossier: 'cyan'
    };

    searchResults.innerHTML = tagBar + scored.slice(0, 12).map(({ item }) => {
      const color = sectionColors[item.section] || 'green';
      const href = '/' + item.url;   // absolute from site root — resolves from any page

      // Highlight matching tags
      const matchingTags = item.tags.filter(t =>
        terms.some(term => t.toLowerCase().includes(term))
      ).slice(0, 4);

      const tagHtml = matchingTags.length > 0
        ? '<div class="search-tags">' + matchingTags.map(t =>
            '<span class="search-tag ' + color + '">' + t.toUpperCase() + '</span>'
          ).join('') + '</div>'
        : '';

      return '<a class="search-result-item" href="' + href + '">' +
        '<span class="search-result-label ' + color + '">' + item.tagLabel + '</span>' +
        '<h4>' + item.title + '</h4>' +
        '<p>' + item.desc + '</p>' +
        tagHtml +
      '</a>';
    }).join('');

    bindTagPills();
  }

  // When user clicks a tag pill, set it as the search query
  function bindTagPills() {
    document.querySelectorAll('.search-tag-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        const tag = pill.dataset.tag;
        if (searchInput) {
          searchInput.value = tag;
          searchInput.focus();
          renderResults(tag);
        }
      });
    });
  }

  // Open search — DELEGATED on document so it survives PJAX nav swaps
  // (the nav, and thus the .search-trigger button, is rebuilt on every nav)
  function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.classList.add('open');
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    renderResults('');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.search-trigger');
    if (t) { e.preventDefault(); openSearch(); }
  });

  // Close search
  document.querySelectorAll('.search-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (searchOverlay) searchOverlay.classList.remove('open');
    });
  });
  if (searchOverlay) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) searchOverlay.classList.remove('open');
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchOverlay) searchOverlay.classList.remove('open');
    // Ctrl+K or Cmd+K to open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (searchOverlay) {
        searchOverlay.classList.toggle('open');
        if (searchOverlay.classList.contains('open') && searchInput) {
          searchInput.value = ''; searchInput.focus(); renderResults('');
        }
      }
    }
  });

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', () => renderResults(searchInput.value));
  }

  // -------------------------------------------
  // 5. MATRIX RAIN VISIBILITY OPTIMIZATION
  // -------------------------------------------
  const canvas = (document.getElementById('matrix-bg')||{style:{}});
  let matrixInterval = null;

  // The matrix.js sets up its own interval — we'll pause/resume by toggling canvas visibility
  document.addEventListener('visibilitychange', () => {
    if (canvas) {
      canvas.style.display = document.hidden ? 'none' : '';
    }
  });

  // -------------------------------------------
  // 6. GLITCH EFFECT — set data-text on headings
  // -------------------------------------------
  document.querySelectorAll('.project-hero h1, .page-hero h1, .article-hero h1').forEach(h1 => {
    h1.setAttribute('data-text', h1.textContent);
  });

  // -------------------------------------------
  // 7. STAND ALONE COMPLEX — Sequential Node Animation
  // -------------------------------------------
  document.querySelectorAll('.sac-card').forEach(card => {
    const nodes = card.querySelectorAll('.sac-node');
    let timeouts = [];
    card.addEventListener('mouseenter', () => {
      nodes.forEach((node, i) => {
        const t = setTimeout(() => {
          node.classList.add('lit');
        }, i * 80);
        timeouts.push(t);
      });
    });
    card.addEventListener('mouseleave', () => {
      timeouts.forEach(t => clearTimeout(t));
      timeouts = [];
      nodes.forEach(node => node.classList.remove('lit'));
    });
  });

  // -------------------------------------------
  // 8. ACCENT BAR SCROLL ANIMATION
  // -------------------------------------------
  const accentBars = document.querySelectorAll('.accent-bar');
  if (accentBars.length > 0) {
    const barObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          barObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    accentBars.forEach(bar => barObserver.observe(bar));
  }


  // -------------------------------------------
  // THEME COLOR SWITCHER
  // -------------------------------------------
  // Use theme definitions from theme-init.js (loaded in <head>)
  var THEMES = window.__yangaThemes || {
    green: { rgb: '0,255,157', hex: '#00ff9d', dim: '#00cc7d', teal: '#64ffda' },
    blue:  { rgb: '0,168,255', hex: '#00a8ff', dim: '#0088cc', teal: '#64d8ff' },
    red:   { rgb: '255,60,60', hex: '#ff3c3c', dim: '#cc3030', teal: '#ff8a8a' },
    orange:{ rgb: '255,140,40', hex: '#ff8c28', dim: '#cc7020', teal: '#ffb37a' },
    yellow:{ rgb: '255,206,54', hex: '#ffce36', dim: '#cca82b', teal: '#ffe38f' },
    pink:  { rgb: '255,92,196', hex: '#ff5cc4', dim: '#cc4a9c', teal: '#ff9edd' },
    purple:{ rgb: '176,112,255', hex: '#b070ff', dim: '#8c58cc', teal: '#ccaaff' }
  };
  var THEMES_LIGHT = window.__yangaThemesLight || {
    green: { rgb: '0,158,102', hex: '#009e66', dim: '#007a4f', teal: '#0c9c8a' },
    blue:  { rgb: '0,122,204', hex: '#007acc', dim: '#005f99', teal: '#0c86b8' },
    red:   { rgb: '214,40,40', hex: '#d62828', dim: '#a51d1d', teal: '#c05555' },
    orange:{ rgb: '204,102,16', hex: '#cc6610', dim: '#a3520d', teal: '#c07d3a' },
    yellow:{ rgb: '176,132,10', hex: '#b0840a', dim: '#8a6708', teal: '#a68a2e' },
    pink:  { rgb: '200,30,140', hex: '#c81e8c', dim: '#a0176f', teal: '#bb4a97' },
    purple:{ rgb: '122,62,204', hex: '#7a3ecc', dim: '#5f30a0', teal: '#8a5ec0' }
  };
  function currentMode() {
    return document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
  }
  function paletteFor(name) {
    return (currentMode() === 'light' && THEMES_LIGHT[name]) ? THEMES_LIGHT[name] : THEMES[name];
  }

  // --- Data Corruption theme transition effect ---
  var _corruptCanvas = null;
  var _corruptCtx = null;
  var _corruptRAF = null;
  var GLITCH_CHARS = '01@#$%&!?><{}[]=/\\|~^*';

  // dev: which theme-transition style fires ('corrupt' = default data-corruption, 'crt' = CRT reboot)
  var THEME_FX = (function(){ try { return localStorage.getItem('yanga_themefx') || 'crtline'; } catch(e){ return 'crtline'; } })();

  function ensureCorruptCanvas() {
    if (!_corruptCanvas) {
      _corruptCanvas = document.createElement('canvas');
      _corruptCanvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
      document.body.appendChild(_corruptCanvas);
    }
    _corruptCanvas.width = window.innerWidth;
    _corruptCanvas.height = window.innerHeight;
    _corruptCtx = _corruptCanvas.getContext('2d');
    return _corruptCtx;
  }

  function fireDataCorruption(rgb) {
    if (_corruptRAF) cancelAnimationFrame(_corruptRAF);
    var ctx = ensureCorruptCanvas();
    var W = _corruptCanvas.width, H = _corruptCanvas.height;
    var r = rgb[0], g = rgb[1], b = rgb[2];

    // Generate corruption blocks across the full viewport
    var blocks = [];
    for (var i = 0; i < 150; i++) {
      var bw = 4 + Math.random() * 60 | 0;
      var bh = 2 + Math.random() * 24 | 0;
      blocks.push({
        x: Math.random() * W | 0, y: Math.random() * H | 0,
        w: bw, h: bh,
        delay: Math.random() * 400,
        duration: 80 + Math.random() * 280,
        alpha: 0.3 + Math.random() * 0.7,
        type: Math.random()
      });
    }

    var startTime = performance.now();
    var duration = 900;

    function frame(now) {
      var elapsed = now - startTime;
      var progress = elapsed / duration;
      if (progress > 1.2) {
        ctx.clearRect(0, 0, W, H);
        _corruptRAF = null;
        return;
      }

      ctx.clearRect(0, 0, W, H);
      var fadeOut = progress > 0.55 ? Math.max(0, 1 - (progress - 0.55) / 0.55) : 1;

      // Global viewport jitter during peak corruption
      var gj = progress > 0.15 && progress < 0.65 ? (Math.random() - 0.5) * 5 : 0;
      ctx.save();
      ctx.translate(gj, 0);

      for (var i = 0; i < blocks.length; i++) {
        var bl = blocks[i];
        var t = elapsed - bl.delay;
        if (t < 0 || t > bl.duration + 200) continue;

        var ba;
        if (t < 40) ba = (t / 40) * bl.alpha;
        else if (t < bl.duration) ba = bl.alpha * (0.5 + Math.random() * 0.5);
        else ba = bl.alpha * Math.max(0, 1 - (t - bl.duration) / 200);
        ba *= fadeOut;
        if (ba < 0.01) continue;

        var jx = (Math.random() - 0.5) * 8;

        if (bl.type < 0.45) {
          // Solid color block
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + ba.toFixed(2) + ')';
          ctx.fillRect(bl.x + jx, bl.y, bl.w, bl.h);
        } else if (bl.type < 0.75) {
          // Scanline block
          for (var sy = 0; sy < bl.h; sy += 2) {
            ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (ba * 0.7).toFixed(2) + ')';
            ctx.fillRect(bl.x + jx, bl.y + sy, bl.w, 1);
          }
        } else {
          // Glitch text block
          ctx.font = '9px "Share Tech Mono", monospace';
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + ba.toFixed(2) + ')';
          var txt = '';
          for (var tc = 0; tc < (bl.w / 5 | 0); tc++) {
            txt += GLITCH_CHARS[Math.random() * GLITCH_CHARS.length | 0];
          }
          ctx.fillText(txt, bl.x + jx, bl.y + bl.h);
        }
      }

      // Full-width corruption scanlines
      if (progress > 0.1 && progress < 0.7 && Math.random() < 0.35) {
        var ly = Math.random() * H;
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + (0.08 + Math.random() * 0.15).toFixed(2) + ')';
        ctx.fillRect(0, ly, W, 1 + Math.random() * 3);
      }

      ctx.restore();
      _corruptRAF = requestAnimationFrame(frame);
    }
    _corruptRAF = requestAnimationFrame(frame);
  }

  // --- CRT Reboot theme transition (ported from the demo) ---
  function fireCRTReboot(rgb) {
    if (_corruptRAF) cancelAnimationFrame(_corruptRAF);
    var ctx = ensureCorruptCanvas();
    var W = _corruptCanvas.width, H = _corruptCanvas.height;
    var R = rgb[0], G = rgb[1], B = rgb[2];
    var st = performance.now(), dur = 900;
    function frame(now) {
      var el = now - st, p = el / dur;
      if (p > 1) { ctx.clearRect(0, 0, W, H); return; }
      ctx.clearRect(0, 0, W, H);
      if (p < 0.3) {
        var t = p / 0.3, e = t * t * t, lH = H * (1 - e), top = (H - lH) / 2;
        ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (0.14 + e * 0.32).toFixed(2) + ')';
        ctx.fillRect(0, top, W, lH);
        for (var i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.1 * e).toFixed(2) + ')'; ctx.fillRect(0, top + Math.random() * lH, W, 1); }
      } else if (p < 0.5) {
        var t2 = (p - 0.3) / 0.2, br = 1 - Math.abs(t2 - 0.5) * 2, cy = H / 2;
        var gr = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.6);
        gr.addColorStop(0, 'rgba(' + R + ',' + G + ',' + B + ',' + (0.17 * br).toFixed(2) + ')'); gr.addColorStop(1, 'transparent');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(' + Math.min(255, R + 55) + ',' + Math.min(255, G + 55) + ',' + Math.min(255, B + 55) + ',' + (0.5 * br).toFixed(2) + ')';
        ctx.fillRect(0, cy - 1.5, W, 3);
        ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (0.22 * br).toFixed(2) + ')'; ctx.fillRect(0, cy - 4, W, 8);
      } else if (p < 0.85) {
        var t3 = (p - 0.5) / 0.35, e3 = 1 - Math.pow(1 - t3, 2), vH = H * e3, top3 = (H - vH) / 2, ni = 1 - e3;
        var id = ctx.createImageData(W, Math.max(1, vH | 0)), d = id.data;
        for (var j = 0; j < d.length; j += 4) { if (Math.random() < ni * 0.4) { var brv = Math.random() * 200 | 0; d[j] = (R * 0.3 + brv * 0.7) | 0; d[j + 1] = (G * 0.3 + brv * 0.7) | 0; d[j + 2] = (B * 0.3 + brv * 0.7) | 0; d[j + 3] = (80 + Math.random() * 100) * ni | 0; } }
        ctx.putImageData(id, 0, top3 | 0);
        ctx.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (0.15 * (1 - e3)).toFixed(2) + ')'; ctx.fillRect(0, top3, W, vH);
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; for (var y = top3; y < top3 + vH; y += 3) ctx.fillRect(0, y, W, 1);
      } else {
        var t4 = (p - 0.85) / 0.15, na = (1 - t4) * 0.3;
        if (na > 0.01) { var id2 = ctx.createImageData(W, H), d2 = id2.data; for (var k = 0; k < d2.length; k += 4) { if (Math.random() < 0.05) { d2[k] = R; d2[k + 1] = G; d2[k + 2] = B; d2[k + 3] = (na * 255 * Math.random()) | 0; } } ctx.putImageData(id2, 0, 0); }
      }
      _corruptRAF = requestAnimationFrame(frame);
    }
    _corruptRAF = requestAnimationFrame(frame);
  }

  // --- ported theme-transition effects (from theme-transitions-demo.html) ---
  var RAIN_FX = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン@#$%&*+=01';
  function firePulse(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height;
    var st=performance.now(),dur=850,ox=(c.ox!=null?c.ox:W-30),oy=(c.oy!=null?c.oy:H/2),maxR=Math.max(W,H)*1.55;
    function frame(now){var el=now-st,p=el/dur;if(p>1){ctx.clearRect(0,0,W,H);return;} ctx.clearRect(0,0,W,H);var e=1-Math.pow(1-p,2),rr=maxR*e;
      var gr=ctx.createRadialGradient(ox,oy,0,ox,oy,Math.max(1,rr));
      gr.addColorStop(0,'rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(0.27*(1-p)).toFixed(2)+')');
      gr.addColorStop(0.4,'rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(0.09*(1-p)).toFixed(2)+')'); gr.addColorStop(0.72,'transparent');
      ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);
      if(p<0.7){var sy=H*(p/0.6);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(0.85*(1-p/0.7)).toFixed(2)+')';ctx.fillRect(0,sy-1,W,3);}
      _corruptRAF=requestAnimationFrame(frame);} _corruptRAF=requestAnimationFrame(frame); }
  function fireGlitch(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height;
    var n=8,sliceH=H/n,slices=[]; for(var i=0;i<n;i++)slices.push({y:i*sliceH,delay:i*30+Math.random()*40,dur:170+Math.random()*130,dx:(Math.random()-0.5)*60,a:0.28+Math.random()*0.4});
    for(var k=0;k<4;k++)slices.push({y:Math.random()*H,delay:150+Math.random()*80,dur:120,dx:(Math.random()-0.5)*80,a:0.3,h:sliceH*0.5});
    var st=performance.now(),total=680; function frame(now){var el=now-st;if(el>total){ctx.clearRect(0,0,W,H);return;} ctx.clearRect(0,0,W,H);
      for(var i=0;i<slices.length;i++){var sl=slices[i],t=el-sl.delay;if(t<0||t>sl.dur)continue;var tp=t/sl.dur,a=sl.a*(1-Math.abs(tp-0.5)*2);if(a<0.01)continue;
        ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+a.toFixed(2)+')';ctx.fillRect(sl.dx*(1-tp),sl.y,W,sl.h||sliceH);}
      _corruptRAF=requestAnimationFrame(frame);} _corruptRAF=requestAnimationFrame(frame); }
  function fireMatrixWipe(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height,fontSize=12;
    var cols=Math.floor(W/fontSize),streams=[]; for(var wave=0;wave<3;wave++){for(var i=0;i<cols;i++){var sm={x:i*fontSize,y:-(Math.random()*H*0.6)-wave*20,speed:4+Math.random()*6,length:8+Math.random()*16|0,chars:[],alpha:0.5+Math.random()*0.5};
      for(var j=0;j<sm.length;j++)sm.chars.push(RAIN_FX[Math.random()*RAIN_FX.length|0]);streams.push(sm);}}
    var startTime=performance.now(),duration=1200; function frame(now){var elapsed=now-startTime,progress=elapsed/duration;if(progress>1.4){ctx.clearRect(0,0,W,H);return;}
      ctx.fillStyle='rgba(10,10,15,0.12)';ctx.fillRect(0,0,W,H);var fadeOut=progress>0.65?Math.max(0,1-(progress-0.65)/0.5):1;ctx.font='bold '+fontSize+'px monospace';
      for(var i=0;i<streams.length;i++){var sm=streams[i];sm.y+=sm.speed;if(Math.random()<0.3)sm.chars[Math.random()*sm.length|0]=RAIN_FX[Math.random()*RAIN_FX.length|0];
        var baseAlpha=sm.alpha*fadeOut;if(baseAlpha<0.01)continue;
        for(var j=0;j<sm.length;j++){var py=sm.y-j*fontSize;if(py<-fontSize||py>H+fontSize)continue;
          if(j===0){var ca=Math.min(1,baseAlpha*1.8);ctx.shadowColor='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+',0.9)';ctx.shadowBlur=8;
            ctx.fillStyle='rgba('+Math.min(255,c.rgb[0]+120)+','+Math.min(255,c.rgb[1]+120)+','+Math.min(255,c.rgb[2]+120)+','+ca.toFixed(2)+')';}
          else{var ca2=baseAlpha*(1-j/sm.length);if(ca2<0.02)continue;ctx.shadowBlur=0;ctx.shadowColor='transparent';
            ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+ca2.toFixed(2)+')';} ctx.fillText(sm.chars[j],sm.x,py);}}
      ctx.shadowBlur=0;ctx.shadowColor='transparent';_corruptRAF=requestAnimationFrame(frame);} _corruptRAF=requestAnimationFrame(frame); }
  function fireCircuit(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),Wc=_corruptCanvas.width,Hc=_corruptCanvas.height,cx=(c.ox!=null?c.ox:Wc-30),cy=(c.oy!=null?c.oy:Hc/2);
    var branches=[],maxB=90; for(var i=0;i<14;i++){var a=(i/14)*Math.PI*2+(Math.random()-0.5)*0.3;
      branches.push({x:cx,y:cy,dx:Math.cos(a)*(3+Math.random()*4),dy:Math.sin(a)*(3+Math.random()*4),life:20+Math.random()*40|0,age:0,width:1.5+Math.random()});}
    var st=Date.now(),dur=900; function frame(){var el=Date.now()-st,p=el/dur;if(p>1){ctx.clearRect(0,0,Wc,Hc);return;} ctx.clearRect(0,0,Wc,Hc);var fo=p>0.6?1-(p-0.6)/0.4:1;ctx.globalAlpha=fo;var nb=[];
      for(var i=0;i<branches.length;i++){var b=branches[i];if(b.age>=b.life)continue;b.age++;var nx=b.x+b.dx,ny=b.y+b.dy;ctx.beginPath();ctx.moveTo(b.x,b.y);
        if(Math.random()<0.15){var t=b.dx;b.dx=-b.dy*(Math.random()>0.5?1:-1);b.dy=t*(Math.random()>0.5?1:-1);nx=b.x+b.dx;ny=b.y+b.dy;}
        ctx.lineTo(nx,ny);var al=(1-b.age/b.life)*0.8;ctx.strokeStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+al.toFixed(2)+')';ctx.lineWidth=b.width;ctx.stroke();
        if(Math.random()<0.08){ctx.beginPath();ctx.arc(nx,ny,2,0,Math.PI*2);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(al*0.6).toFixed(2)+')';ctx.fill();} b.x=nx;b.y=ny;
        if(Math.random()<0.06&&branches.length+nb.length<maxB){var ba=Math.atan2(b.dy,b.dx)+(Math.random()>0.5?1:-1)*Math.PI/2;
          nb.push({x:nx,y:ny,dx:Math.cos(ba)*(2+Math.random()*3),dy:Math.sin(ba)*(2+Math.random()*3),life:10+Math.random()*20|0,age:0,width:b.width*0.7});}}
      branches=branches.concat(nb);ctx.globalAlpha=1;_corruptRAF=requestAnimationFrame(frame);} frame(); }
  function fireHex(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),Wc=_corruptCanvas.width,Hc=_corruptCanvas.height,hexR=13,hexH=hexR*Math.sqrt(3),hexW=hexR*2;
    var cols=Math.ceil(Wc/(hexW*0.75))+2,rows=Math.ceil(Hc/hexH)+2,cxP=(c.ox!=null?c.ox:Wc-30),cyP=(c.oy!=null?c.oy:Hc/2),hexes=[];
    for(var r=0;r<rows;r++)for(var co=0;co<cols;co++){var x=co*hexW*0.75,y=r*hexH+(co%2===1?hexH/2:0);var d=Math.sqrt((x-cxP)*(x-cxP)+(y-cyP)*(y-cyP));hexes.push({x:x,y:y,delay:d*1.2+Math.random()*80,alpha:0,peak:0.3+Math.random()*0.5});}
    var st=Date.now(),dur=1000; function drawH(x,y,rr,a){if(a<0.01)return;ctx.beginPath();for(var i=0;i<6;i++){var an=Math.PI/3*i-Math.PI/6;if(i===0)ctx.moveTo(x+rr*Math.cos(an),y+rr*Math.sin(an));else ctx.lineTo(x+rr*Math.cos(an),y+rr*Math.sin(an));}ctx.closePath();
      ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+a.toFixed(3)+')';ctx.fill();ctx.strokeStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(a*0.4).toFixed(3)+')';ctx.lineWidth=0.5;ctx.stroke();}
    function frame(){var el=Date.now()-st;if(el>dur+400){ctx.clearRect(0,0,Wc,Hc);return;} ctx.clearRect(0,0,Wc,Hc);
      for(var i=0;i<hexes.length;i++){var h=hexes[i],t=el-h.delay;if(t<0)continue;if(t<100)h.alpha=(t/100)*h.peak;else if(t<250)h.alpha=h.peak*(0.7+Math.random()*0.3);else if(t<500)h.alpha=h.peak*(1-(t-250)/250);else{h.alpha=0;continue;}drawH(h.x,h.y,hexR,h.alpha);}
      _corruptRAF=requestAnimationFrame(frame);} frame(); }
  function firePCB(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height,ox=(c.ox!=null?c.ox:W-30),oy=(c.oy!=null?c.oy:H/2);var traces=[],nodes=[];
    for(var i=0;i<40;i++){var pts=[],x=Math.random()*W,y=Math.random()*H;pts.push({x:x,y:y});var segs=3+(Math.random()*6|0),dir=Math.random()>0.5;
      for(var s=0;s<segs;s++){var len=20+Math.random()*80;if(dir)x+=(Math.random()>0.5?len:-len);else y+=(Math.random()>0.5?len:-len);x=Math.max(0,Math.min(W,x));y=Math.max(0,Math.min(H,y));pts.push({x:x,y:y});nodes.push({x:x,y:y,r:2+Math.random()*3});dir=!dir;}
      var d=Math.sqrt((pts[0].x-ox)*(pts[0].x-ox)+(pts[0].y-oy)*(pts[0].y-oy));traces.push({pts:pts,width:0.8+Math.random()*1.5,delay:d*1.5+Math.random()*100});}
    var st=performance.now(),dur=1100; function frame(now){var el=now-st,p=el/dur;if(p>1.3){ctx.clearRect(0,0,W,H);return;} ctx.clearRect(0,0,W,H);var fo=p>0.7?Math.max(0,1-(p-0.7)/0.4):1;
      for(var i=0;i<traces.length;i++){var tr=traces[i],t=el-tr.delay;if(t<0)continue;var tp=Math.min(1,t/400),al=tp*0.7*fo;if(al<0.01)continue;
        ctx.beginPath();ctx.strokeStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+al.toFixed(2)+')';ctx.lineWidth=tr.width;ctx.lineJoin='round';var dp=Math.ceil(tr.pts.length*tp);
        ctx.moveTo(tr.pts[0].x,tr.pts[0].y);for(var p2=1;p2<dp;p2++)ctx.lineTo(tr.pts[p2].x,tr.pts[p2].y);ctx.stroke();
        if(dp>0&&dp<=tr.pts.length&&tp<1){var tip=tr.pts[Math.min(dp-1,tr.pts.length-1)];ctx.beginPath();ctx.arc(tip.x,tip.y,3,0,Math.PI*2);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(al*1.2).toFixed(2)+')';ctx.shadowColor=c.hex;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;}}
      for(var i=0;i<nodes.length;i++){var n=nodes[i],nd=Math.sqrt((n.x-ox)*(n.x-ox)+(n.y-oy)*(n.y-oy));var nt=el-nd*1.5-50;if(nt<0)continue;var na=Math.min(0.8,nt/200)*fo;if(na<0.01)continue;
        ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+na.toFixed(2)+')';ctx.shadowColor=c.hex;ctx.shadowBlur=6;ctx.fill();ctx.shadowBlur=0;}
      _corruptRAF=requestAnimationFrame(frame);} _corruptRAF=requestAnimationFrame(frame); }
  function fireRGB(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height;
    var lines=[];for(var i=0;i<14;i++)lines.push({y:8+i*(H/14),h:2+Math.random()*4,w:40+Math.random()*(W*0.6),x:15+Math.random()*30});
    var st=performance.now(),dur=720; function frame(now){var el=now-st,p=el/dur;if(p>1){ctx.clearRect(0,0,W,H);return;} ctx.clearRect(0,0,W,H);var sx=0,sy=0,ga=1;
      if(p<0.4){var t=p/0.4;sx=t*t*12;sy=t*t*4;} else if(p<0.65){sx=12+(Math.random()-0.5)*6;sy=4+(Math.random()-0.5)*3;}
      else{var t=(p-0.65)/0.35,e=1-Math.pow(1-t,3);sx=12*(1-e);sy=4*(1-e);ga=1-e*0.3;if(t<0.15){ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(0.4*(1-t/0.15)).toFixed(2)+')';ctx.fillRect(0,0,W,H);}}
      var ch=[{dx:-sx,dy:-sy,col:'rgba(255,0,0,'+(ga*0.35).toFixed(2)+')'},{dx:sx*0.5,dy:sy,col:'rgba(0,255,0,'+(ga*0.35).toFixed(2)+')'},{dx:sx,dy:-sy*0.5,col:'rgba(0,100,255,'+(ga*0.35).toFixed(2)+')'}];
      ctx.globalCompositeOperation='screen';
      for(var ci=0;ci<ch.length;ci++){ctx.fillStyle=ch[ci].col;for(var i=0;i<lines.length;i++){var l=lines[i];ctx.fillRect(l.x+ch[ci].dx,l.y+ch[ci].dy,l.w,l.h);}
        for(var y=0;y<H;y+=6){ctx.fillStyle=ch[ci].col.replace(/[\d.]+\)$/,(ga*0.08).toFixed(2)+')');ctx.fillRect(ch[ci].dx,y+ch[ci].dy,W,1);}ctx.fillStyle=ch[ci].col;}
      ctx.globalCompositeOperation='source-over';
      if(p>0.1&&p<0.7){for(var b=0;b<(3+Math.random()*4|0);b++){ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(0.15+Math.random()*0.2).toFixed(2)+')';ctx.fillRect((Math.random()-0.5)*20,Math.random()*H,W,1+Math.random()*3);}}
      _corruptRAF=requestAnimationFrame(frame);} _corruptRAF=requestAnimationFrame(frame); }
  function fireNeural(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF); var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height,cX=(c.ox!=null?c.ox:W/2),cY=(c.oy!=null?c.oy:H/2);var nodesArr=[],edges=[];
    for(var i=0;i<60;i++){var nx=Math.random()*W,ny=Math.random()*H,nd=Math.sqrt((nx-cX)*(nx-cX)+(ny-cY)*(ny-cY));nodesArr.push({x:nx,y:ny,r:1.5+Math.random()*3,dist:nd});}
    for(var i=0;i<60;i++)for(var j=i+1;j<60;j++){var dx=nodesArr[i].x-nodesArr[j].x,dy=nodesArr[i].y-nodesArr[j].y;if(Math.sqrt(dx*dx+dy*dy)<100&&Math.random()<0.6)edges.push({a:i,b:j,pulseDelay:Math.min(nodesArr[i].dist,nodesArr[j].dist)*2+Math.random()*100});}
    var st=performance.now(),dur=1200; function frame(now){var el=now-st,p=el/dur;if(p>1.3){ctx.clearRect(0,0,W,H);return;} ctx.clearRect(0,0,W,H);var fo=p>0.7?Math.max(0,1-(p-0.7)/0.4):1,ar=el*0.3;
      for(var i=0;i<edges.length;i++){var e=edges[i],na=nodesArr[e.a],nb=nodesArr[e.b];var ed=Math.min(na.dist,nb.dist);if(ed>ar)continue;var ea=Math.min(0.3,(ar-ed)/100)*fo;if(ea<0.01)continue;
        ctx.beginPath();ctx.moveTo(na.x,na.y);ctx.lineTo(nb.x,nb.y);ctx.strokeStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+ea.toFixed(2)+')';ctx.lineWidth=0.5;ctx.stroke();
        var pt=el-e.pulseDelay;if(pt>0){var pp=(pt%600)/600;ctx.beginPath();ctx.arc(na.x+(nb.x-na.x)*pp,na.y+(nb.y-na.y)*pp,1.5,0,Math.PI*2);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(0.8*fo).toFixed(2)+')';ctx.fill();}}
      for(var i=0;i<nodesArr.length;i++){var n=nodesArr[i];if(n.dist>ar)continue;var na2=Math.min(0.9,(ar-n.dist)/60)*fo;if(na2<0.01)continue;
        ctx.beginPath();ctx.arc(n.x,n.y,n.r+4,0,Math.PI*2);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+(na2*0.15).toFixed(2)+')';ctx.fill();
        ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fillStyle='rgba('+c.rgb[0]+','+c.rgb[1]+','+c.rgb[2]+','+na2.toFixed(2)+')';ctx.shadowColor=c.hex;ctx.shadowBlur=6;ctx.fill();ctx.shadowBlur=0;}
      _corruptRAF=requestAnimationFrame(frame);} _corruptRAF=requestAnimationFrame(frame); }
  // SCANLINE BLOOM: full-screen version of the widget CRT — a bright hairline draws in &
  // glows ALONE, then blooms vertically to a flash, then fades to reveal the new theme.
  function fireScanBloom(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF);
    var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height;
    var R=c.rgb[0],G=c.rgb[1],B=c.rgb[2],cy=H/2,st=performance.now(),dur=760;
    function frame(now){ var el=now-st,p=el/dur; if(p>1){ctx.clearRect(0,0,W,H);return;} ctx.clearRect(0,0,W,H);
      if(p<0.42){ // LINE phase: hairline draws in, holds & glows alone, starts to fade
        var t=p/0.42, grow=Math.min(1,t/0.22), e=grow*grow*(3-2*grow), lw=W*e, lx=(W-lw)/2;
        var la=(t<0.72)?1:(1-(t-0.72)/0.28);
        var gh=ctx.createLinearGradient(0,cy-30,0,cy+30);
        gh.addColorStop(0,'transparent');
        gh.addColorStop(0.5,'rgba('+R+','+G+','+B+','+(0.5*la).toFixed(2)+')');
        gh.addColorStop(1,'transparent');
        ctx.fillStyle=gh; ctx.fillRect(lx,cy-30,lw,60);
        ctx.fillStyle='rgba('+R+','+G+','+B+','+(0.55*la).toFixed(2)+')'; ctx.fillRect(lx,cy-3,lw,6);
        ctx.fillStyle='rgba(255,255,255,'+(0.95*la).toFixed(2)+')'; ctx.fillRect(lx,cy-1.5,lw,3);
      } else if(p<0.72){ // BLOOM phase: band expands from the line to full height
        var t2=(p-0.42)/0.30, e2=1-Math.pow(1-t2,2), bh=H*e2, top=cy-bh/2;
        var gr=ctx.createLinearGradient(0,top,0,top+bh);
        gr.addColorStop(0,'transparent');
        gr.addColorStop(0.5,'rgba('+Math.min(255,R+55)+','+Math.min(255,G+55)+','+Math.min(255,B+55)+','+(0.42*(1-t2*0.35)).toFixed(2)+')');
        gr.addColorStop(1,'transparent');
        ctx.fillStyle=gr; ctx.fillRect(0,top,W,bh);
        ctx.fillStyle='rgba(255,255,255,'+(0.6*(1-t2)).toFixed(2)+')';
        ctx.fillRect(0,top,W,1.5); ctx.fillRect(0,top+bh-1.5,W,1.5);
        ctx.fillStyle='rgba(255,255,255,'+(0.5*e2*(1-t2*0.55)).toFixed(2)+')'; ctx.fillRect(0,top,W,bh);   // brighter flash
        ctx.fillStyle='rgba(0,0,0,0.08)'; for(var y=top;y<top+bh;y+=3) ctx.fillRect(0,y|0,W,1);
      } else { // FADE phase: full flash settles out, revealing the theme
        var t3=(p-0.72)/0.28, a3=(1-t3)*0.34;
        ctx.fillStyle='rgba('+Math.min(255,R+90)+','+Math.min(255,G+90)+','+Math.min(255,B+90)+','+a3.toFixed(2)+')'; ctx.fillRect(0,0,W,H);
        ctx.fillStyle='rgba(255,255,255,'+((1-t3)*0.22).toFixed(2)+')'; ctx.fillRect(0,0,W,H);
        ctx.fillStyle='rgba(0,0,0,'+(0.06*(1-t3)).toFixed(2)+')'; for(var y2=0;y2<H;y2+=3) ctx.fillRect(0,y2,W,1);
      }
      _corruptRAF=requestAnimationFrame(frame);
    } _corruptRAF=requestAnimationFrame(frame); }
  // MATRIX DROP: the SYNCHRONISED opening front of the matrix rain — one coherent line of
  // characters descends straight down (linear) from top to bottom, then fades to reveal the theme.
  function fireMatrixDrop(c){ if(_corruptRAF)cancelAnimationFrame(_corruptRAF);
    var ctx=ensureCorruptCanvas(),W=_corruptCanvas.width,H=_corruptCanvas.height;
    var R=c.rgb[0],G=c.rgb[1],B=c.rgb[2],fontSize=14,cols=Math.floor(W/fontSize);
    var CH='アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789@#$%&*+=';
    var trail=13, chars=[]; for(var i=0;i<cols;i++) chars.push({});
    var st=performance.now(), pxPerMs=H/720, settle=300;
    var totalRows=Math.ceil(H/fontSize)+trail+2, dur=totalRows*fontSize/pxPerMs + settle;
    function frame(now){ var el=now-st; if(el>dur){ ctx.clearRect(0,0,W,H); return; } ctx.clearRect(0,0,W,H);
      ctx.font=fontSize+'px monospace';            // same weight/size as the background matrix
      var fade = el>dur-settle ? Math.max(0,1-(el-(dur-settle))/settle) : 1;
      var hr=((el*pxPerMs)/fontSize)|0;            // one shared head row for ALL columns -> linear front
      for(var i=0;i<cols;i++){ var cc=chars[i];
        for(var j=0;j<trail;j++){ var row=hr-j; if(row<0) continue; var y=row*fontSize; if(y>H+fontSize) continue;
          if(cc[row]===undefined || Math.random()<0.05) cc[row]=CH[Math.random()*CH.length|0];
          var a=(j===0?1:(1-j/trail))*fade*0.4; if(a<0.015) continue;   // almost-faint intensity
          ctx.fillStyle='rgba('+R+','+G+','+B+','+a.toFixed(2)+')';
          ctx.fillText(cc[row], i*fontSize, y);
        } }
      _corruptRAF=requestAnimationFrame(frame);
    } _corruptRAF=requestAnimationFrame(frame); }
  // CRT SCAN LINE — theme transition = the exact bubble scan line, full-screen (draws in from the
  // centre, holds, fades) + a bright flash as it snaps to full width. In the new theme colour.
  function fireScanLine(c){
    if(_corruptRAF)cancelAnimationFrame(_corruptRAF);
    if(!document.getElementById('fx-scanline-style')){
      var st=document.createElement('style'); st.id='fx-scanline-style';
      st.textContent='#fx-scanline{position:fixed;inset:0;z-index:99998;pointer-events:none;}'
        +'#fx-scanline .fx-line{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);transform-origin:center;background:linear-gradient(90deg,transparent,rgba(var(--fxacc),1) 18%,#eaf6ff,rgba(var(--fxacc),1) 82%,transparent);box-shadow:0 0 18px 2px rgba(var(--fxacc),.9);opacity:0;animation:fx-scanline .7s ease-out forwards;}'
        +'#fx-scanline .fx-flash{position:absolute;inset:0;background:#eaf6ff;opacity:0;animation:fx-flash .7s ease-out forwards;}'
        +'@keyframes fx-scanline{0%{opacity:0;transform:translateY(-50%) scaleX(.35);}12%{opacity:1;transform:translateY(-50%) scaleX(1);}55%{opacity:1;transform:translateY(-50%) scaleX(1);}100%{opacity:0;transform:translateY(-50%) scaleX(1);}}'
        +'@keyframes fx-flash{0%,12%{opacity:0;}20%{opacity:.5;}34%{opacity:.14;}100%{opacity:0;}}';
      document.head.appendChild(st);
    }
    var old=document.getElementById('fx-scanline'); if(old) old.remove();
    var el=document.createElement('div'); el.id='fx-scanline';
    el.style.setProperty('--fxacc', c.rgb.join(','));
    el.innerHTML='<span class="fx-line"></span>';
    document.body.appendChild(el);
    el.addEventListener('animationend', function(){ if(el.parentNode) el.remove(); });
    setTimeout(function(){ if(el.parentNode) el.remove(); }, 900);
  }
  var FX = [
    { id:'corrupt',   name:'DATA CORRUPTION',  run:function(c){ fireDataCorruption(c.rgb); } },
    { id:'crt',       name:'CRT REBOOT',       run:function(c){ fireCRTReboot(c.rgb); } },
    { id:'crtline',   name:'CRT SCAN LINE',    run:fireScanLine },
    { id:'matrixdrop',name:'MATRIX RAIN DROP', run:fireMatrixDrop },
  ];
  function runThemeFx(c){ var f=null; for(var i=0;i<FX.length;i++){ if(FX[i].id===THEME_FX){ f=FX[i]; break; } } if(!f) f=FX[0]; f.run(c); }
  function fxToast(name){ var el=document.getElementById('fx-toast');
    if(!el){ el=document.createElement('div'); el.id='fx-toast';
      el.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100000;font-family:monospace;font-size:12px;letter-spacing:2px;color:var(--accent,#3aa0ff);background:rgba(8,12,18,.92);border:1px solid rgba(var(--accent-rgb,58,160,255),.5);border-radius:5px;padding:6px 12px;pointer-events:none;opacity:0;transition:opacity .2s;'; document.body.appendChild(el); }
    el.textContent='TRANSITION > '+name; el.style.opacity='1'; clearTimeout(el.__t); el.__t=setTimeout(function(){ el.style.opacity='0'; },1300); }

  function applyTheme(name, skipEffect) {
    var t = paletteFor(name);
    if (!t) return;
    document.documentElement.setAttribute('data-theme', name); // expose theme for CSS (ghost eyes, etc.)
    var r = document.documentElement.style;

    // --- Visual transition effect ---
    if (!skipEffect && document.body) {

      // Enable CSS transitions on all themed elements
      document.body.classList.add('theme-transitioning');

      var rgb = t.rgb.split(',').map(Number);
      var _ox = window.innerWidth - 30, _oy = 40;
      try { var _cbtn = document.querySelector('.theme-chip'); if (_cbtn) { var _rc = _cbtn.getBoundingClientRect(); if (_rc.width) { _ox = _rc.left + _rc.width / 2; _oy = _rc.top + _rc.height / 2; } } } catch (_e) {}

      // Swap the accent CSS variables to the new theme
      var _applyVars = function () {
        r.setProperty('--accent-rgb', t.rgb);
        r.setProperty('--accent', t.hex);
        r.setProperty('--accent-dim', t.dim);
        r.setProperty('--teal', t.teal);
      };

      _applyVars();
      requestAnimationFrame(function() {
        runThemeFx({ rgb: rgb, hex: t.hex, ox: _ox, oy: _oy });
      });

      // Remove transitioning class after animation completes
      clearTimeout(applyTheme._transTimer);
      applyTheme._transTimer = setTimeout(function() {
        document.body.classList.remove('theme-transitioning');
      }, 900);

    } else {
      // No effect — instant switch (initial load / cross-tab sync)
      r.setProperty('--accent-rgb', t.rgb);
      r.setProperty('--accent', t.hex);
      r.setProperty('--accent-dim', t.dim);
      r.setProperty('--teal', t.teal);
    }

    // Update matrix canvas color
    if (window.__matrixColor !== undefined) window.__matrixColor = t.hex;
    // Update boot animation color
    if (window.__bootColor !== undefined) window.__bootColor = t.hex;
    // Persist via both localStorage and cookie (file:// compatibility)
    if (window.__yangaSaveTheme) {
      window.__yangaSaveTheme(name);
    } else {
      try { localStorage.setItem('yanga_theme', name); } catch(e) {}
      document.cookie = 'yanga_theme=' + name + ';path=/;max-age=31536000;SameSite=Lax';
    }
    // Sync the CLI-flag chip
    var _chip = document.querySelector('.theme-chip');
    if (_chip) {
      _chip.setAttribute('data-theme', name);
      var _v = _chip.querySelector('.theme-chip-val');
      if (_v) _v.textContent = name;
      var _sws = _chip.querySelectorAll('.theme-sw');
      for (var _s = 0; _s < _sws.length; _s++) { _sws[_s].classList.toggle('active', _sws[_s].getAttribute('data-theme-name') === name); }
    }
  }

  // ── Theme selector: CLI-flag chip (cycles the accent colour) ──
  var navUtils = document.querySelector('.nav-utils');
  var cycleOrder = ['blue', 'green', 'red', 'orange', 'yellow', 'pink', 'purple'];
  var chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'theme-chip';
  chip.title = 'Cycle accent colour';
  chip.setAttribute('aria-label', 'Cycle accent colour');
  var _swHtml = '';
  cycleOrder.forEach(function(nm){ var hx=(THEMES[nm]&&THEMES[nm].hex)||'#888';
    _swHtml += '<span class="theme-sw" role="button" tabindex="0" data-theme-name="'+nm+'" aria-label="'+nm+'" title="'+nm+'" style="--sw:'+hx+'"></span>'; });
  chip.innerHTML = '<span class="theme-chip-glyph" aria-hidden="true">\u25CF</span>'
    + '<span class="theme-dd" role="menu">'+_swHtml+'</span>';
  chip.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    var sw = (e.target && e.target.closest) ? e.target.closest('.theme-sw') : null;
    if (sw) { applyTheme(sw.getAttribute('data-theme-name')); return; }
    var cur = chip.getAttribute('data-theme') || 'blue';
    var i = cycleOrder.indexOf(cur);
    applyTheme(cycleOrder[(i + 1) % cycleOrder.length]);
  });
  chip.addEventListener('keydown', function(e){ var sw=(e.target&&e.target.closest)?e.target.closest('.theme-sw'):null;
    if(sw && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); applyTheme(sw.getAttribute('data-theme-name')); } });
  if (navUtils) navUtils.insertBefore(chip, navUtils.firstChild);
  // dropdown takes the ghost's currently-active bubble animation (open + close)
  var _dd = chip.querySelector('.theme-dd');
  var _ddCloseT;
  function _ddFx(){ try { return localStorage.getItem('yanga_themefx') || 'crtline'; } catch(e){ return 'crtline'; } }
  chip.addEventListener('mouseenter', function(){ clearTimeout(_ddCloseT); if(_dd){ _dd.setAttribute('data-fx', _ddFx()); _dd.classList.remove('dd-closing'); _dd.classList.add('dd-open'); } });
  chip.addEventListener('mouseleave', function(){ if(!_dd || !_dd.classList.contains('dd-open')) return; _dd.classList.remove('dd-open'); _dd.classList.add('dd-closing'); clearTimeout(_ddCloseT); _ddCloseT=setTimeout(function(){ _dd.classList.remove('dd-closing'); }, 520); });

  // -- Light/dark mode toggle (sun/moon) --
  function modeIcon(btn) {
    btn.innerHTML = currentMode() === 'light'
      ? '<i class="fa-solid fa-sun" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
  }
  function applyMode(mode, skipEffect) {
    document.documentElement.setAttribute('data-mode', mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'light' ? '#eef1f7' : '#0a0a0f');
    if (window.__yangaSaveMode) window.__yangaSaveMode(mode);
    // Re-resolve the accent palette for the new mode (fires transition + glitch)
    var cur = chip.getAttribute('data-theme') || 'blue';
    applyTheme(cur, skipEffect);
    modeIcon(modeBtn);
  }
  var modeBtn = document.createElement('button');
  modeBtn.type = 'button';
  modeBtn.className = 'mode-chip';
  modeBtn.title = 'Toggle light / dark';
  modeBtn.setAttribute('aria-label', 'Toggle light / dark mode');
  modeIcon(modeBtn);
  modeBtn.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    applyMode(currentMode() === 'light' ? 'dark' : 'light');
  });
  // light/dark toggle unwired for the moment — modeBtn kept but not inserted into the nav
  window.__yangaApplyMode = function(mode) {
    document.documentElement.setAttribute('data-mode', mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', mode === 'light' ? '#eef1f7' : '#0a0a0f');
    var cur = chip.getAttribute('data-theme') || 'blue';
    applyTheme(cur, true);
    modeIcon(modeBtn);
  };

  // keyboard easter egg: press "t" (outside inputs) to cycle the theme
  document.addEventListener('keydown', function(e) {
    if (e.key !== 't' && e.key !== 'T') return;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    var cur = (chip.getAttribute('data-theme')) || 'blue';
    if (e.shiftKey) {   // dev: cycle the theme-transition style, then preview it
      e.preventDefault();
      var _ids = []; for (var _i = 0; _i < FX.length; _i++) _ids.push(FX[_i].id);
      var _idx = _ids.indexOf(THEME_FX); if (_idx < 0) _idx = 0;
      var _next = (_idx + 1) % _ids.length;
      THEME_FX = _ids[_next];
      try { localStorage.setItem('yanga_themefx', THEME_FX); } catch(_){}
      fxToast(FX[_next].name);
      applyTheme(cur);
      return;
    }
    applyTheme(cycleOrder[(cycleOrder.indexOf(cur) + 1) % cycleOrder.length]);
  });

  var cswCSS = document.createElement('style');
  cswCSS.textContent = '\
.theme-chip {\
  display: inline-flex; align-items: center; justify-content: center;\
  background: none; border: none; padding: 6px; margin-right: 2px;\
  cursor: pointer; line-height: 1; position: relative;\
}\
.theme-dd {\
  position: absolute; top: 100%; right: 0; display: flex; flex-wrap: nowrap; gap: 7px;\
  padding: 10px 10px 9px; background: rgba(8,12,18,0.97);\
  border: 1px solid rgba(var(--accent-rgb),0.3); border-radius: 10px;\
  box-shadow: 0 12px 30px rgba(0,0,0,0.5); z-index: 400;\
  opacity: 0; visibility: hidden; transform-origin: center; pointer-events: none;\
  transition: opacity .16s ease, visibility .16s;\
}\
.theme-dd.dd-open { opacity: 1; visibility: visible; pointer-events: auto; }\
.theme-dd.dd-closing { opacity: 1; visibility: visible; pointer-events: none; }\
.theme-dd.dd-open[data-fx="crtline"] { animation: tk-dd-crt .52s cubic-bezier(.2,.8,.25,1); }\
.theme-dd.dd-open[data-fx="crt"] { animation: tk-dd-reboot .52s cubic-bezier(.2,.8,.25,1); }\
.theme-dd.dd-open[data-fx="corrupt"] { animation: tk-dd-corrupt .5s both; }\
.theme-dd.dd-open[data-fx="matrixdrop"] { animation: tk-dd-mtx .5s ease-out; }\
.theme-dd.dd-closing[data-fx="crtline"] { animation: tk-dd-crt-off .44s cubic-bezier(.4,0,.7,.4) forwards; }\
.theme-dd.dd-closing[data-fx="crt"] { animation: tk-dd-reboot-off .46s cubic-bezier(.4,0,.7,.4) forwards; }\
.theme-dd.dd-closing[data-fx="corrupt"] { animation: tk-dd-corrupt-off .46s both; }\
.theme-dd.dd-closing[data-fx="matrixdrop"] { animation: tk-dd-mtx-off .44s ease-in forwards; }\
.theme-dd::before { content:""; position:absolute; left:9px; right:9px; top:50%; height:2px; transform:translateY(-50%); pointer-events:none; opacity:0; background:linear-gradient(90deg,transparent,rgba(var(--accent-rgb),1) 20%,#eaf6ff,rgba(var(--accent-rgb),1) 80%,transparent); box-shadow:0 0 12px 1px rgba(var(--accent-rgb),0.9); }\
.theme-dd.dd-open[data-fx="crtline"]::before, .theme-dd.dd-open[data-fx="crt"]::before { animation: tk-dd-line .52s ease-out; }\
.theme-dd.dd-closing[data-fx="crtline"]::before, .theme-dd.dd-closing[data-fx="crt"]::before { animation: tk-dd-line-off .46s ease-in; }\
.theme-dd::after { content:""; position:absolute; inset:0; border-radius:10px; background:#eaf6ff; opacity:0; pointer-events:none; }\
.theme-dd.dd-open[data-fx="crt"]::after { animation: tk-dd-flash .52s ease-out; }\
.theme-dd.dd-closing[data-fx="crt"]::after { animation: tk-dd-flash-c .46s ease-out; }\
@keyframes tk-dd-line { 0%{opacity:0;} 14%{opacity:1;} 44%{opacity:1;} 62%{opacity:0;} 100%{opacity:0;} }\
@keyframes tk-dd-crt-off { 0%{opacity:1;clip-path:inset(0 0 0 0 round 10px);} 50%{opacity:1;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);} 100%{opacity:0;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);} }\
@keyframes tk-dd-reboot { 0%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(.4);filter:brightness(1.5);} 10%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);filter:brightness(1.5);} 44%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);filter:brightness(1.5);} 68%{clip-path:inset(0 0 0 0 round 10px);transform:scaleY(1.04);filter:brightness(1.3);} 84%{transform:scaleY(.994);filter:brightness(1.06);} 100%{clip-path:inset(0 0 0 0 round 10px);transform:none;filter:brightness(1);} }\
@keyframes tk-dd-reboot-off { 0%{opacity:1;clip-path:inset(0 0 0 0 round 10px);filter:brightness(1);} 28%{filter:brightness(1.6);} 60%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);filter:brightness(2);} 82%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);opacity:1;filter:brightness(1.4);} 100%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);opacity:0;filter:brightness(1);} }\
@keyframes tk-dd-corrupt { 0%{opacity:0;transform:translate(6px,0) skewX(-6deg);} 12%{opacity:1;transform:translate(-7px,2px) skewX(5deg);clip-path:inset(18% 0 46% 0 round 10px);} 26%{transform:translate(6px,-2px) skewX(-3deg);clip-path:inset(52% 0 8% 0 round 10px);} 40%{transform:translate(-4px,1px);clip-path:inset(8% 0 62% 0 round 10px);} 54%{transform:translate(3px,0);clip-path:inset(0 0 0 0 round 10px);} 70%{transform:translate(-2px,0);} 85%{transform:translate(1px,0);} 100%{transform:none;clip-path:inset(0 0 0 0 round 10px);} }\
@keyframes tk-dd-corrupt-off { 0%{opacity:1;transform:none;clip-path:inset(0 0 0 0 round 10px);} 16%{transform:translate(5px,0) skewX(4deg);clip-path:inset(8% 0 55% 0 round 10px);} 32%{transform:translate(-7px,2px) skewX(-5deg);clip-path:inset(50% 0 10% 0 round 10px);} 52%{transform:translate(5px,-1px);clip-path:inset(22% 0 40% 0 round 10px);} 72%{opacity:.5;transform:translate(-4px,0) skewX(6deg);} 100%{opacity:0;transform:translate(8px,0) skewX(-8deg);} }\
@keyframes tk-dd-mtx { 0%{opacity:1;clip-path:inset(0 0 100% 0 round 10px);} 100%{clip-path:inset(0 0 0 0 round 10px);} }\
@keyframes tk-dd-mtx-off { 0%{opacity:1;clip-path:inset(0 0 0 0 round 10px);} 100%{opacity:1;clip-path:inset(100% 0 0 0 round 10px);} }\
@keyframes tk-dd-line-off { 0%{opacity:0;} 42%{opacity:0;} 58%{opacity:1;} 100%{opacity:0;} }\
@keyframes tk-dd-flash { 0%,58%{opacity:0;} 70%{opacity:.38;} 82%{opacity:.1;} 100%{opacity:0;} }\
@keyframes tk-dd-flash-c { 0%{opacity:0;} 40%{opacity:.35;} 100%{opacity:0;} }\
@keyframes tk-dd-crt { 0%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(.35);} 12%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);} 46%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);} 70%{clip-path:inset(0 0 0 0 round 10px);transform:scale(1.04,0.96);} 82%{clip-path:inset(0 0 0 0 round 10px);transform:scale(0.99,1.02);} 92%{clip-path:inset(0 0 0 0 round 10px);transform:scale(1.006,0.996);} 100%{clip-path:inset(0 0 0 0 round 10px);transform:none;} }\
.theme-sw {\
  width: 12px; height: 12px; border-radius: 50%; background: var(--sw);\
  border: 1.5px solid rgba(255,255,255,0.14); box-shadow: 0 0 5px var(--sw);\
  cursor: pointer; transition: transform .15s ease, border-color .15s ease;\
}\
.theme-sw:hover { transform: scale(1.25); border-color: #fff; }\
.theme-sw.active { transform: scale(1.25); border-color: #fff; }\
@keyframes tk-dd-qin { 0%,60%{opacity:0;} 82%{opacity:1;} 100%{opacity:1;} }\
.theme-dd.dd-open .theme-sw { animation: tk-dd-qin .52s both; }\
.theme-chip-glyph {\
  color: var(--accent); font-size: 0.7rem;\
  text-shadow: 0 0 6px rgba(var(--accent-rgb),0.6);\
  transition: color .4s ease, text-shadow .4s ease, transform .15s ease;\
}\
.theme-chip:hover .theme-chip-glyph { transform: scale(1.3); text-shadow: 0 0 10px rgba(var(--accent-rgb),0.95); }\
.theme-chip:active .theme-chip-glyph { transform: scale(1.05); }\
.mode-chip {\
  display: inline-flex; align-items: center; justify-content: center;\
  background: none; border: none; padding: 6px; margin-right: 6px;\
  cursor: pointer; line-height: 1; color: var(--text-muted); font-size: 0.78rem;\
  transition: color .25s ease, transform .15s ease;\
}\
.mode-chip:hover { color: var(--accent); transform: scale(1.2); }\
';
  document.head.appendChild(cswCSS);

  // Expose applyTheme globally so BroadcastChannel listener in theme-init.js can trigger full updates
  window.__yangaApplyTheme = function(name) { applyTheme(name, true); };

  // Apply saved theme on load (theme-init.js already applied CSS vars early,
  // but we re-apply here to also update matrix color and dot highlights)
  var saved = window.__yangaGetTheme ? window.__yangaGetTheme() : null;
  if (!saved) { try { saved = localStorage.getItem('yanga_theme'); } catch(e) {} }
  if (saved && THEMES[saved]) {
    applyTheme(saved, true);
  } else {
    applyTheme('blue', true);
  }

  // -------------------------------------------
  // SMOOTH PAGE TRANSITIONS (PJAX)
  // Fetches new page via AJAX, swaps content — no full reload.
  // Nav, theme switcher, matrix stay in the DOM the entire time.
  // -------------------------------------------
  (function() {
    var overlay = document.querySelector('.overlay');
    if (!overlay) return;
    var navigating = false;

    // Signature home-page intro: a grid of black tiles that dissolves left-to-right.
    // Reused for BOTH the first full load and every PJAX arrival on the home page.
    window.yangaBlockReveal = function(duration) {
      duration = duration || 1200;
      if (document.getElementById('revealGrid')) return; // don't stack reveals
      var navEl = document.querySelector('nav');
      var navH = navEl ? Math.round(navEl.getBoundingClientRect().bottom) : 0; // keep the menu bar clear
      var grid = document.createElement('div');
      grid.id = 'revealGrid';
      grid.style.cssText = 'position:fixed;left:0;right:0;bottom:0;top:' + navH + 'px;z-index:9998;pointer-events:none;display:grid;';
      var cols = Math.ceil(window.innerWidth / 40), rows = Math.ceil((window.innerHeight - navH) / 40);
      grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
      grid.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';
      var blocks = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var block = document.createElement('div');
        block.style.cssText = 'background:#0a0a0f;';
        var colNorm = c / cols;
        blocks.push({ el: block, startT: colNorm * 0.6 + Math.random() * 0.2, fadeLen: 0.1 + Math.random() * 0.2 });
        grid.appendChild(block);
      }
      document.body.appendChild(grid);
      // Keep the live background (matrix) visible THROUGH the dissolve: lift it above the
      // tiles but clip it below the nav so the menu bar stays untouched.
      var mtx = document.getElementById('matrix-bg'), mz = '', mcp = '';
      if (mtx) { mz = mtx.style.zIndex; mcp = mtx.style.clipPath;
        mtx.style.zIndex = '9999'; mtx.style.clipPath = 'inset(' + navH + 'px 0 0 0)'; }
      function restoreBg() { if (mtx) { mtx.style.zIndex = mz; mtx.style.clipPath = mcp; } }
      var start = performance.now();
      (function frame(now) {
        var pr = (now - start) / duration;
        if (pr >= 1) { grid.remove(); restoreBg(); return; }
        for (var i = 0; i < blocks.length; i++) {
          var b = blocks[i];
          if (pr >= b.startT) b.el.style.opacity = Math.max(0, 1 - (pr - b.startT) / b.fadeLen);
        }
        requestAnimationFrame(frame);
      })(performance.now());
    };
    function isHomeUrl(u) {
      try { var path = new URL(u, location.href).pathname; return /(^|\/)(index\.html)?$/.test(path); }
      catch (e) { return /(^|\/)(index\.html)?$/.test(u); }
    }

    function getContentEls() {
      var els = [];
      Array.prototype.forEach.call(overlay.children, function(child) {
        if (child.tagName !== 'NAV') els.push(child);
      });
      return els;
    }

    function isInternal(a) {
      if (a.target && a.target !== '_self') return false;
      if (a.hasAttribute('download')) return false;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || href.startsWith('javascript:')) return false;
      if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
      if (location.protocol === 'file:') return !href.startsWith('http');
      try { return new URL(href, location.href).origin === location.origin; } catch(e) { return false; }
    }

    // Swap page content without full reload
    function pjaxNavigate(url) {
      if (navigating) return;
      navigating = true;

      // 1. Fade out current content & start timer in parallel with fetch
      var oldEls = getContentEls();
      oldEls.forEach(function(el) { el.classList.add('page-exiting'); });
      var fadeOutReady = new Promise(function(resolve) { setTimeout(resolve, 300); });

      // 2. Fetch new page (server returns 404.html body on 404, so one fetch is enough)
      var fetchReady = fetch(url).then(function(res) {
        return res.text().then(function(html) {
          // If 404 and the body doesn't have .overlay (e.g. plain text error), fetch 404.html
          if ((res.status === 404 || !res.ok) && html.indexOf('class="overlay"') === -1) {
            return fetch(getBasePrefix() + '404.html').then(function(r) { return r.text(); });
          }
          return html;
        });
      });

      // 3. Wait for BOTH fade-out AND fetch to complete, then swap
      Promise.all([fadeOutReady, fetchReady]).then(function(results) {
        var html = results[1];
        if (!html) return;
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var newOverlay = doc.querySelector('.overlay');
        if (!newOverlay) { window.location.href = url; return; }

        // Swap immediately — fade-out is already done
        // 4. Extract new content (everything except nav)
        var newContent = [];
        Array.prototype.forEach.call(newOverlay.children, function(child) {
          if (child.tagName !== 'NAV') newContent.push(child);
        });

        // 5. Remove old content from current overlay
        oldEls.forEach(function(el) { el.remove(); });

        // 6. Insert new content (hidden)
        newContent.forEach(function(el) {
          el.classList.add('page-entering');
          overlay.appendChild(el);
        });

        // 7. Update nav active states (preserve the theme chip)
        var newNav = newOverlay.querySelector('nav');
        var curNav = overlay.querySelector('nav');
        if (newNav && curNav) {
          // Save the theme chip + mode toggle before replacing nav HTML
          var savedSwitcher = curNav.querySelector('.theme-chip');
          var savedMode = curNav.querySelector('.mode-chip');
          curNav.innerHTML = newNav.innerHTML;
          // Re-insert both into the new nav-utils (chip first, then mode toggle)
          var newUtils = curNav.querySelector('.nav-utils');
          if (newUtils) {
            if (savedSwitcher) newUtils.insertBefore(savedSwitcher, newUtils.firstChild);
            if (savedMode) newUtils.insertBefore(savedMode, savedSwitcher ? savedSwitcher.nextSibling : newUtils.firstChild);
          }
        }

        // 7b. Carry over page-specific <head> styles.
        // Pages can ship their own CSS via `headExtra`/`extraCss` in front
        // matter. PJAX only swaps the body, so without this the first click
        // through to such a page renders unstyled and only a full reload
        // fixes it. Remove whatever the previous page injected, then adopt
        // the new document's.
        document.querySelectorAll('[data-pjax-style]').forEach(function(el) { el.remove(); });
        var headBits = doc.head ? doc.head.querySelectorAll('style, link[rel="stylesheet"]') : [];
        Array.prototype.forEach.call(headBits, function(node) {
          var href = node.getAttribute && node.getAttribute('href');
          // Skip the base stylesheet and third-party sheets already loaded.
          if (href && document.querySelector('link[href="' + href + '"]')) return;
          if (node.tagName === 'STYLE' && (node.hasAttribute('data-antiflash') || node.textContent.trim() === 'body{background:#0a0a0f}')) return;
          var clone = node.cloneNode(true);
          clone.setAttribute('data-pjax-style', '');
          document.head.appendChild(clone);
        });

        // 8. Update page title
        var newTitle = doc.querySelector('title');
        if (newTitle) document.title = newTitle.textContent;

        // 9. Update URL
        history.pushState(null, '', url);

        // 10. Execute any inline scripts in new content
        newContent.forEach(function(el) {
          var scripts = el.querySelectorAll('script');
          scripts.forEach(function(oldScript) {
            var newScript = document.createElement('script');
            if (oldScript.src) {
              newScript.src = oldScript.src;
            } else {
              newScript.textContent = oldScript.textContent;
            }
            oldScript.parentNode.replaceChild(newScript, oldScript);
          });
        });

        // 11. Scroll to top
        window.scrollTo(0, 0);

        // 12. Fade in new content
        void document.body.offsetHeight; // force layout
        newContent.forEach(function(el) { el.classList.remove('page-entering'); });

        // 13. Re-trigger any page-specific setup — title animation
        var heroH1 = document.querySelector('.project-hero h1, .page-hero h1, .article-hero h1, .single-project-hero h1');
        if (heroH1) {
          var originalText = heroH1.textContent;
          if (!heroH1.getAttribute('data-text')) heroH1.setAttribute('data-text', originalText);
          if (heroH1.closest('.article-hero')) {
            setTimeout(function() {
              heroH1.classList.add('glitch-in');
              heroH1.addEventListener('animationend', function() {
                heroH1.classList.remove('glitch-in');
              }, { once: true });
            }, 300);
          } else {
            heroH1.textContent = '\u00A0';
            setTimeout(function() { decodeTitle(heroH1, originalText); }, 300);
          }
        }

        // 14. Re-init quotes if back on home page
        if (window.initQuotes && document.getElementById('quote-output')) {
          window.initQuotes();
        }

        // 15. Re-init terminal if back on home page
        if (window.initTerminal && document.querySelector('.term-input')) {
          var ti = document.querySelector('.term-input');
          if (ti) ti.removeAttribute('data-term-init');
          window.initTerminal();
        }

        // 16. (Re)build the lateral table of contents for article pages
        if (window.buildPostTOC) window.buildPostTOC();
        if (window.hlCode) window.hlCode();

        navigating = false;

      }).catch(function(err) {
        // Fetch failed — try 404 page as smooth fallback
        navigating = false;
        fetch(getBasePrefix() + '404.html').then(function(r) { return r.text(); }).then(function(html404) {
          if (!html404) return;
          navigating = true;
          var parser = new DOMParser();
          var doc = parser.parseFromString(html404, 'text/html');
          var newOverlay = doc.querySelector('.overlay');
          if (!newOverlay) { window.location.href = url; return; }
          var newContent = [];
          Array.prototype.forEach.call(newOverlay.children, function(child) {
            if (child.tagName !== 'NAV') newContent.push(child);
          });
          // Fade-out already happened via Promise.all timeout, just swap
          var oldEls2 = getContentEls();
          oldEls2.forEach(function(el) { el.remove(); });
          newContent.forEach(function(el) {
            el.classList.add('page-entering');
            overlay.appendChild(el);
          });
          var newTitle = doc.querySelector('title');
          if (newTitle) document.title = newTitle.textContent;
          history.pushState(null, '', url);
          window.scrollTo(0, 0);
          void document.body.offsetHeight;
          newContent.forEach(function(el) { el.classList.remove('page-entering'); });
          newContent.forEach(function(el) {
            el.querySelectorAll('script').forEach(function(oldScript) {
              var s = document.createElement('script');
              if (oldScript.src) s.src = oldScript.src;
              else s.textContent = oldScript.textContent;
              oldScript.parentNode.replaceChild(s, oldScript);
            });
          });
          navigating = false;
        }).catch(function() { window.location.href = url; });
      });
    }

    // Intercept internal link clicks
    document.addEventListener('click', function(e) {
      var a = e.target.closest ? e.target.closest('a') : null;
      if (!a) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (!isInternal(a)) return;

      e.preventDefault();
      pjaxNavigate(a.href);
    });

    // Handle browser back/forward
    window.addEventListener('popstate', function() {
      pjaxNavigate(location.href);
    });
  })();

  // ── Nav dropdown ("Offensive") ──────────────────────────────────────────
  // Delegated from document so it keeps working after the PJAX nav swap, which
  // replaces nav.innerHTML and destroys any listeners bound to nav children.
  (function navDropdown() {
    function closeAll(except) {
      document.querySelectorAll('.nav-dropdown.open').forEach(function(dd) {
        if (dd === except) return;
        dd.classList.remove('open');
        var t = dd.querySelector('.nav-dropdown-toggle');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    }

    document.addEventListener('click', function(e) {
      var toggle = e.target.closest && e.target.closest('.nav-dropdown-toggle');
      if (toggle) {
        e.preventDefault();
        var dd = toggle.closest('.nav-dropdown');
        var willOpen = !dd.classList.contains('open');
        closeAll(dd);
        dd.classList.toggle('open', willOpen);
        toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        return;
      }
      // Click anywhere else (including a menu item) closes the menu
      if (!e.target.closest || !e.target.closest('.nav-dropdown-menu')) closeAll(null);
      else setTimeout(function() { closeAll(null); }, 0);
    });

    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.nav-dropdown.open');
      if (!open) return;
      closeAll(null);
      var t = open.querySelector('.nav-dropdown-toggle');
      if (t) t.focus();
    });
  })();

})();

// New-quote button (whoami) — delegated (survives PJAX). Locked while typing.
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('.quote-refresh');
  if (!b || b.disabled) return;
  if (typeof window.initQuotes === 'function') { b.disabled = true; window.initQuotes(); }
});
window.addEventListener('quotestart', function () {
  var b = document.querySelector('.quote-refresh'); if (b) b.disabled = true;
});
window.addEventListener('quoteend', function () {
  var b = document.querySelector('.quote-refresh'); if (b) b.disabled = false;
});

// Home avatar: the closing animation plays once then freezes on the last frame.
// A fresh load / refresh replays it naturally; on bfcache restore (back/forward)
// the frozen frame is shown, so kick it to replay from the start.
window.addEventListener('pageshow', function (e) {
  if (!e.persisted) return;
  var img = document.querySelector('.id-avatar img');
  if (!img) return;
  var base = (img.getAttribute('src') || '').split('?')[0];
  if (base) img.setAttribute('src', base + '?r=' + Date.now());
});

// ── Lateral table of contents for article pages (auto-built + scroll-spy) ──
(function () {
  var css = document.createElement('style');
  css.textContent = `
.post-toc { position: fixed; top: 196px; left: calc(50% + 560px); width: 232px; max-height: 62vh; overflow-y: auto; z-index: 5; scrollbar-width: none; -ms-overflow-style: none; }
.post-toc::-webkit-scrollbar { width: 0; height: 0; }
.post-toc-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 0 0 14px 20px; }
.post-toc-label { font-family: var(--font-body); font-size: 0.6rem; letter-spacing: 2.5px; text-transform: uppercase; color: var(--text-muted); }
.post-toc-count { font-family: var(--font-body); font-size: 0.6rem; letter-spacing: 1px; color: var(--accent); text-shadow: 0 0 6px rgba(var(--accent-rgb),0.5); }
.post-toc ul { list-style: none; margin: 0; padding: 0; position: relative; }
.post-toc li { position: relative; }
.post-toc li::before { content: ''; position: absolute; left: 2px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--bg-deep); border: 2px solid var(--border); box-sizing: border-box; z-index: 1; transition: background .25s ease, border-color .25s ease, box-shadow .25s ease; }
.post-toc a { display: block; padding: 7px 0 7px 28px; color: var(--text-muted); font-family: var(--font-body); font-size: 0.82rem; line-height: 1.35; text-decoration: none; transition: color .2s ease; }
.post-toc a:hover { color: var(--text-bright); }
.post-toc li.done a { color: var(--text-secondary); }
.post-toc li.done::before { border-color: rgba(var(--accent-rgb),0.5); background: rgba(var(--accent-rgb),0.5); }
.post-toc li.on a { color: var(--accent); }
.post-toc li.on::before { border-color: var(--accent); background: var(--accent); box-shadow: 0 0 10px rgba(var(--accent-rgb),0.9); }
@media (max-width: 1600px) { .post-toc { display: none; } }`;
  document.head.appendChild(css);

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  window.buildPostTOC = function () {
    var old = document.getElementById('post-toc'); if (old) old.remove();
    if (window.__tocSpy) { window.removeEventListener('scroll', window.__tocSpy); window.__tocSpy = null; }
    var body = document.querySelector('.article-body'); if (!body) return;
    body.querySelectorAll('h2').forEach(function (h) {
      if (!h.id) h.id = h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    });
    var hs = Array.prototype.slice.call(body.querySelectorAll('h2[id]'));
    if (hs.length < 2) return;

    var toc = document.createElement('aside'); toc.id = 'post-toc'; toc.className = 'post-toc';
    var html = '<div class="post-toc-head"><span class="post-toc-label">On this page</span><span class="post-toc-count"></span></div><ul>';
    hs.forEach(function (h) { html += '<li><a href="#' + h.id + '" data-target="' + h.id + '">' + h.textContent + '</a></li>'; });
    toc.innerHTML = html + '</ul>';
    document.body.appendChild(toc);

    toc.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-target]'); if (!a) return;
      e.preventDefault();
      var el = document.getElementById(a.getAttribute('data-target'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); try { history.replaceState(null, '', '#' + a.getAttribute('data-target')); } catch (x) {} }
    });

    var links = toc.querySelectorAll('a[data-target]');
    var lis = toc.querySelectorAll('li');
    var ul = toc.querySelector('ul');
    var countEl = toc.querySelector('.post-toc-count');
    var PIN = 196; // sticky top once the rectangle scrolls under it
    function place() {
      // Keep the TOC vertically inside the post rectangle: never let its top
      // rise above the rectangle's top edge (matters when scrolled to the top),
      // and never let its bottom fall past the rectangle's bottom edge.
      var r = body.getBoundingClientRect();
      var top = Math.max(PIN, r.top);
      var h = toc.offsetHeight;
      if (top + h > r.bottom) top = Math.max(PIN, r.bottom - h);
      toc.style.top = top + 'px';
    }
    function spy() {
      place();
      var idx = 0;
      var actLine = window.innerHeight * 0.5; // active = section whose heading is above the viewport centre
      for (var i = 0; i < hs.length; i++) { if (hs[i].getBoundingClientRect().top - actLine <= 0) idx = i; }
      // At (or near) the bottom of the page the last headings can never cross the
      // activation line, so pin to the final section and complete the rail.
      if ((window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 2)) {
        idx = hs.length - 1;
      }
      lis.forEach(function (li, i) { li.classList.toggle('on', i === idx); li.classList.toggle('done', i < idx); });
      // rail fill = reading progress through the article rectangle
      var br = body.getBoundingClientRect();
      var total = br.height - window.innerHeight;
      var pct = total > 0 ? Math.min(100, Math.max(0, (-br.top) / total * 100)) : (br.top <= 0 ? 100 : 0);
      if (ul) ul.style.setProperty('--toc-fill', pct + '%');
      if (countEl) countEl.textContent = pad(idx + 1) + ' / ' + pad(hs.length);
    }
    window.__tocSpy = spy;
    window.addEventListener('scroll', spy, { passive: true });
    window.addEventListener('resize', place, { passive: true });
    place();
    spy();
  };

  if (document.readyState !== 'loading') window.buildPostTOC();
  else document.addEventListener('DOMContentLoaded', window.buildPostTOC);
})();
