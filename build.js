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

  // 404 is served for ANY missing URL (incl. deep paths), so its assets must be
  // absolute from the domain root, not relative to the (nonexistent) request path.
  const root = relPath === '404.html' ? '/' : computeRoot(relPath);
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


// ── Feeds ────────────────────────────────────
// A blog without a feed doesn't get picked up by the aggregators this
// audience actually reads, and the footer links to one.
const SITE_URL = 'https://r3sup3r.github.io';
const SITE_TITLE = 'YANGA';
const SITE_DESC = 'Security research notes — penetration testing and AI red teaming.';

function collectPosts() {
  const dir = path.join(SRC, 'posts');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.html'))
    .map(f => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
      if (!m) return null;
      let d; try { d = JSON.parse(m[1]); } catch (e) { return null; }
      if (!d.date) return null;
      return {
        url: `${SITE_URL}/posts/${f}`,
        title: (d.title || f).replace(/\s*—\s*YANGA$/, ''),
        desc: d.excerpt || d.description || '',
        date: new Date(d.date + 'T12:00:00Z'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);
}

const xmlEscape = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function writeFeeds() {
  const posts = collectPosts();

  const items = posts.map(p => `    <item>
      <title>${xmlEscape(p.title)}</title>
      <link>${xmlEscape(p.url)}</link>
      <guid isPermaLink="true">${xmlEscape(p.url)}</guid>
      <description>${xmlEscape(p.desc)}</description>
      <pubDate>${p.date.toUTCString()}</pubDate>
    </item>`).join('\n');

  fs.writeFileSync(path.join(OUT, 'rss.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(SITE_TITLE)}</title>
    <link>${SITE_URL}/</link>
    <description>${xmlEscape(SITE_DESC)}</description>
    <language>en</language>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`);

  // sitemap over every built page
  const urls = [];
  (function walkOut(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '_to_delete') continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walkOut(abs, rel + e.name + '/');
      else if (e.name.endsWith('.html') && e.name !== '404.html') {
        urls.push(rel + e.name === 'index.html' ? '' : rel + e.name);
      }
    }
  })(OUT, '');

  const locs = urls.map(u => `  <url><loc>${SITE_URL}/${u}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs}
</urlset>
`);

  fs.writeFileSync(path.join(OUT, 'robots.txt'),
`User-agent: *
Allow: /
Sitemap: ${SITE_URL}/sitemap.xml
`);
  return posts.length;
}

function main() {
  // Clear stale output FIRST — before static assets are copied in, or this
  // deletes them again. Without it, pages you unpublish linger in _site and
  // show up in local previews and link checks.
  // (No-op where the filesystem forbids unlink; CI always starts clean.)
  try {
    if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  } catch (e) {
    console.log(`  ! could not clear _site (${e.code}) — stale files may remain`);
  }

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

  const nPosts = writeFeeds();
  console.log(`  ✓ rss.xml (${nPosts} posts), sitemap.xml, robots.txt`);

  console.log(`\n✅ Built ${count} pages → _site/\n`);
}

main();
