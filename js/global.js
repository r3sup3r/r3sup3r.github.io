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
    red:   { rgb: '255,60,60', hex: '#ff3c3c', dim: '#cc3030', teal: '#ff8a8a' }
  };

  // --- Data Corruption theme transition effect ---
  var _corruptCanvas = null;
  var _corruptCtx = null;
  var _corruptRAF = null;
  var GLITCH_CHARS = '01@#$%&!?><{}[]=/\\|~^*';

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

  function applyTheme(name, skipEffect) {
    var t = THEMES[name];
    if (!t) return;
    var r = document.documentElement.style;

    // --- Visual transition effect ---
    if (!skipEffect && document.body) {

      // Enable CSS transitions on all themed elements
      document.body.classList.add('theme-transitioning');

      // Apply new colors (transition will animate them)
      r.setProperty('--accent-rgb', t.rgb);
      r.setProperty('--accent', t.hex);
      r.setProperty('--accent-dim', t.dim);
      r.setProperty('--teal', t.teal);

      // Fire data corruption effect with the new color
      var rgb = t.rgb.split(',').map(Number);
      requestAnimationFrame(function() {
        fireDataCorruption(rgb);
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
    }
  }

  // ── Theme selector: CLI-flag chip (cycles the accent colour) ──
  var navUtils = document.querySelector('.nav-utils');
  var cycleOrder = ['blue', 'green', 'red'];
  var chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'theme-chip';
  chip.title = 'Cycle accent colour';
  chip.setAttribute('aria-label', 'Cycle accent colour');
  chip.innerHTML = '<span class="theme-chip-glyph" aria-hidden="true">\u25CF</span>';
  chip.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    var cur = chip.getAttribute('data-theme') || 'blue';
    var i = cycleOrder.indexOf(cur);
    applyTheme(cycleOrder[(i + 1) % cycleOrder.length]);
  });
  if (navUtils) navUtils.insertBefore(chip, navUtils.firstChild);

  // keyboard easter egg: press "t" (outside inputs) to cycle the theme
  document.addEventListener('keydown', function(e) {
    if (e.key !== 't' && e.key !== 'T') return;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    var cur = (chip.getAttribute('data-theme')) || 'blue';
    applyTheme(cycleOrder[(cycleOrder.indexOf(cur) + 1) % cycleOrder.length]);
  });

  var cswCSS = document.createElement('style');
  cswCSS.textContent = '\
.theme-chip {\
  display: inline-flex; align-items: center; justify-content: center;\
  background: none; border: none; padding: 6px; margin-right: 2px;\
  cursor: pointer; line-height: 1;\
}\
.theme-chip-glyph {\
  color: var(--accent); font-size: 0.7rem;\
  text-shadow: 0 0 6px rgba(var(--accent-rgb),0.6);\
  transition: color .4s ease, text-shadow .4s ease, transform .15s ease;\
}\
.theme-chip:hover .theme-chip-glyph { transform: scale(1.3); text-shadow: 0 0 10px rgba(var(--accent-rgb),0.95); }\
.theme-chip:active .theme-chip-glyph { transform: scale(1.05); }\
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
          // Save the theme chip before replacing nav HTML
          var savedSwitcher = curNav.querySelector('.theme-chip');
          curNav.innerHTML = newNav.innerHTML;
          // Re-insert the switcher into the new nav-utils
          if (savedSwitcher) {
            var newUtils = curNav.querySelector('.nav-utils');
            if (newUtils) newUtils.insertBefore(savedSwitcher, newUtils.firstChild);
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
          if (node.tagName === 'STYLE' && node.textContent.trim() === 'body{background:#0a0a0f}') return;
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
.post-toc ul::before { content: ''; position: absolute; left: 6px; top: 10px; bottom: 10px; width: 2px; background: var(--border); border-radius: 2px; }
.post-toc ul::after { content: ''; position: absolute; left: 6px; top: 10px; width: 2px; height: var(--toc-fill, 0%); max-height: calc(100% - 20px); border-radius: 2px; background: var(--accent); box-shadow: 0 0 8px rgba(var(--accent-rgb),0.8); transition: height .15s ease; }
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
      for (var i = 0; i < hs.length; i++) { if (hs[i].getBoundingClientRect().top - 140 <= 0) idx = i; }
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
