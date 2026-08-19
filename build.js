#!/usr/bin/env node
// ============================================
// YANGA — Static Site Build Script
// Zero-dependency templating: layouts + partials + front matter
// ============================================

const fs = require('fs');
const path = require('path');

const ROOT     = __dirname;
const SRC      = path.join(ROOT, 'src');
const LAYOUTS  = path.join(SRC, '_layouts');
const PARTIALS = path.join(SRC, '_partials');
const OUT      = path.join(ROOT, '_site');

// Static directories to copy as-is
const STATIC_DIRS = ['css', 'js', 'sections/ai/img', 'images', 'posts/img', 'tools'];
const STATIC_FILES = ['favicon.svg'];

// ── Helpers ──────────────────────────────────

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    mkdirp(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    mkdirp(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

// ── Front matter parser ─────────────────────
// Reads JSON from an HTML comment at the top of the file:
//   <!-- { "title": "...", "layout": "base", ... } -->

function parseFrontMatter(content) {
  const match = content.match(/^<!--\s*([\s\S]*?)\s*-->/);
  if (!match) return { data: {}, body: content };
  try {
    const data = JSON.parse(match[1]);
    const body = content.slice(match[0].length).trim();
    return { data, body };
  } catch (e) {
    // Not valid JSON — treat entire file as body
    return { data: {}, body: content };
  }
}

// ── Template engine ─────────────────────────
// Simple mustache-like: {{var}}, {{{raw}}}, {{#bool}}...{{/bool}},
//   {{#array}}...{{/array}}, {{> partial}}, {{.}} (current item)

function loadPartials() {
  const partials = {};
  if (!fs.existsSync(PARTIALS)) return partials;
  for (const file of fs.readdirSync(PARTIALS)) {
    if (file.endsWith('.html')) {
      const name = path.basename(file, '.html');
      partials[name] = fs.readFileSync(path.join(PARTIALS, file), 'utf8');
    }
  }
  return partials;
}

function render(template, data, partials) {
  let result = template;

  // 1. Partials: {{> name}}
  result = result.replace(/\{\{>\s*(\w+)\s*\}\}/g, (_, name) => {
    const partial = partials[name] || '';
    return render(partial, data, partials);
  });

  // 2. Sections: {{#key}}...{{/key}} — conditional/loop
  result = result.replace(/\{\{#(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, keyPath, inner) => {
    const val = resolve(data, keyPath);
    if (!val) return '';
    if (Array.isArray(val)) {
      return val.map(item => {
        const itemData = typeof item === 'object' ? { ...data, ...item } : { ...data, '.': item };
        return render(inner, itemData, partials);
      }).join('');
    }
    return render(inner, data, partials);
  });

  // 3. Raw (unescaped): {{{var}}}
  result = result.replace(/\{\{\{(\w+(?:\.\w+)*)\}\}\}/g, (_, keyPath) => {
    const val = resolve(data, keyPath);
    return val != null ? String(val) : '';
  });

  // 4. Escaped: {{var}}
  result = result.replace(/\{\{(\w+(?:\.\w+)*|\.)(?:\s*\|\s*\w+)?\}\}/g, (_, keyPath) => {
    const val = resolve(data, keyPath);
    return val != null ? escapeHtml(String(val)) : '';
  });

  return result;
}

function resolve(data, keyPath) {
  if (keyPath === '.') return data['.'] || '';
  const keys = keyPath.split('.');
  let val = data;
  for (const k of keys) {
    if (val == null) return undefined;
    val = val[k];
  }
  return val;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Compute root-relative path prefix ───────
// e.g., "pages/about.html" → "../", "index.html" → ""

function computeRoot(filePath) {
  const depth = filePath.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

// ── Build pages ─────────────────────────────

function buildPages() {
  const partials = loadPartials();
  const layouts = {};
  let built = 0;

  // Pre-load layouts
  if (fs.existsSync(LAYOUTS)) {
    for (const file of fs.readdirSync(LAYOUTS)) {
      if (file.endsWith('.html')) {
        layouts[path.basename(file, '.html')] = fs.readFileSync(path.join(LAYOUTS, file), 'utf8');
      }
    }
  }

  // Walk src/ for .html files (skip _ dirs)
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('_')) continue;
      const full = path.join(dir, entry);
      const relPath = rel ? rel + '/' + entry : entry;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, relPath);
      } else if (entry.endsWith('.html')) {
        buildPage(full, relPath, layouts, partials);
        built++;
      }
    }
  }

  walk(SRC, '');
  return built;
}

function buildPage(srcFile, relPath, layouts, partials) {
  const raw = fs.readFileSync(srcFile, 'utf8');
  const { data, body } = parseFrontMatter(raw);

  const root = computeRoot(relPath);
  const layoutName = data.layout || 'base';
  const layout = layouts[layoutName];

  if (!layout) {
    console.error(`  ✗ No layout "${layoutName}" for ${relPath}`);
    return;
  }

  // Split body on <!-- scripts --> marker (page-specific scripts go after global.js)
  let content = body;
  let scripts = data.scripts || '';
  let preGlobalScripts = data.preGlobalScripts || '';
  const scriptMarker = body.indexOf('<!-- scripts -->');
  if (scriptMarker !== -1) {
    content = body.slice(0, scriptMarker).trim();
    scripts = body.slice(scriptMarker + '<!-- scripts -->'.length).trim();
  }
  const preMarker = body.indexOf('<!-- pre-global-scripts -->');
  if (preMarker !== -1) {
    const endContent = Math.min(
      scriptMarker !== -1 ? scriptMarker : body.length,
      preMarker
    );
    content = body.slice(0, endContent).trim();
    const afterPre = body.slice(preMarker + '<!-- pre-global-scripts -->'.length);
    const nextMarker = afterPre.indexOf('<!-- scripts -->');
    if (nextMarker !== -1) {
      preGlobalScripts = afterPre.slice(0, nextMarker).trim();
      scripts = afterPre.slice(nextMarker + '<!-- scripts -->'.length).trim();
    } else {
      preGlobalScripts = afterPre.trim();
    }
  }

  // Build active nav flags: { home: true, blog: false, ... }
  const navItems = ['home', 'blog', 'sections', 'pentesting', 'airedteam', 'ctf', 'dossier', 'tools', 'about'];
  const activeNav = {};
  navItems.forEach(n => { activeNav[n] = (data.activeNav === n); });
  // Parent of the "Offensive" dropdown — active whenever one of its children is
  activeNav.offensive = ['sections', 'pentesting', 'airedteam', 'ctf'].includes(data.activeNav);

  const templateData = {
    ...data,
    root,
    content,
    scripts,
    preGlobalScripts,
    activeNav,
  };

  const html = render(layout, templateData, partials);
  const outFile = path.join(OUT, relPath);
  mkdirp(path.dirname(outFile));
  fs.writeFileSync(outFile, html);
  console.log(`  ✓ ${relPath}`);
}

// ── Main ────────────────────────────────────

function main() {
  console.log('\n⚡ YANGA Build\n');

  // Ensure output dir exists (don't delete — server may have it locked)
  mkdirp(OUT);

  // Copy static assets
  console.log('Copying static assets...');
  for (const dir of STATIC_DIRS) {
    const src = path.join(ROOT, dir);
    const dest = path.join(OUT, dir);
    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log(`  ✓ ${dir}/`);
    }
  }
  for (const file of STATIC_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      const dest = path.join(OUT, file);
      mkdirp(path.dirname(dest));
      fs.copyFileSync(src, dest);
      console.log(`  ✓ ${file}`);
    }
  }

  // Build pages
  console.log('\nBuilding pages...');
  const count = buildPages();

    // GitHub Pages runs Jekyll by default, which skips files and folders
  // beginning with an underscore. .nojekyll turns that off.
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  console.log(`\n✅ Built ${count} pages → _site/\n`);
}

main();

main();
