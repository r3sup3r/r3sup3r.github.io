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

// Site-wide constants (used for feeds, canonical URLs, and structured data)
const SITE_URL   = 'https://r3sup3r.github.io';
const SITE_TITLE = 'YANGA';
const SITE_DESC  = 'Security research notes: penetration testing and AI red teaming.';
const DEFAULT_OG = SITE_URL + '/images/og-default.png';
const AUTHOR = {
  '@type': 'Person',
  name: 'Laury Guebe',
  url: SITE_URL + '/about.html',
  jobTitle: 'Offensive Security Consultant',
  sameAs: [
    'https://www.linkedin.com/in/lauryg/',
    'https://github.com/r3sup3r',
    'https://app.hackthebox.com/users/79600'
  ]
};

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
    // Never publish editor backups (*.bak) — they used to leak into _site/css.
    if (src.endsWith('.bak')) return;
    mkdirp(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

// ── Front matter parser ─────────────────────
//   <!-- { "title": "...", "layout": "base", ... } -->

function parseFrontMatter(content) {
  const match = content.match(/^<!--\s*([\s\S]*?)\s*-->/);
  if (!match) return { data: {}, body: content };
  try {
    const data = JSON.parse(match[1]);
    const body = content.slice(match[0].length).trim();
    return { data, body };
  } catch (e) {
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

// ── Posts (single source of truth) ──────────
// Front matter drives the blog timeline, section hubs, homepage "latest",
// the RSS feed, and per-post structured data. Add a post file, and every
// listing updates — no hand-maintained HTML to drift out of sync.

const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];

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
      if (d.draft) return null;
      const dt = new Date(d.date + 'T12:00:00Z');
      const month = MONTHS[dt.getUTCMonth()];
      const title = (d.title || f).replace(/\s*[·—-]\s*YANGA$/, '');
      return {
        slug: f,
        url: `${SITE_URL}/posts/${f}`,
        title,
        desc: d.description || d.excerpt || '',
        excerpt: d.excerpt || d.description || '',
        category: d.category || 'Notes',
        catKey: d.catKey || 'all',
        section: d.section || '',
        read: d.read || '',
        icon: d.icon || 'fa-angle-right',
        cover: d.cover || '',
        date: dt,
        dateISO: d.date,
        dateLabel: (month + ' ' + dt.getUTCFullYear()).toUpperCase(),
        dateHuman: month + ' ' + dt.getUTCFullYear(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date - a.date);
}

const POSTS = collectPosts();

// ── Compute root-relative path prefix ───────

function computeRoot(filePath) {
  const depth = filePath.split('/').length - 1;
  return depth === 0 ? '' : '../'.repeat(depth);
}

// ── Structured data (JSON-LD) ───────────────

function ldScript(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj) + '</script>';
}

function jsonLdFor(relPath, canonical, post) {
  if (post) {
    const obj = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.desc,
      datePublished: post.dateISO,
      dateModified: post.dateISO,
      author: AUTHOR,
      publisher: {
        '@type': 'Organization',
        name: 'YANGA',
        logo: { '@type': 'ImageObject', url: SITE_URL + '/favicon.svg' }
      },
      mainEntityOfPage: canonical,
      url: canonical
    };
    if (post.cover) obj.image = post.cover;
    return ldScript(obj);
  }
  if (relPath === 'index.html') {
    return ldScript({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE_TITLE,
      url: SITE_URL + '/',
      description: SITE_DESC,
      author: AUTHOR
    });
  }
  if (relPath === 'about.html') {
    return ldScript(Object.assign({ '@context': 'https://schema.org' }, AUTHOR));
  }
  return '';
}

// ── Build pages ─────────────────────────────

function buildPages() {
  const partials = loadPartials();
  const layouts = {};
  let built = 0;

  if (fs.existsSync(LAYOUTS)) {
    for (const file of fs.readdirSync(LAYOUTS)) {
      if (file.endsWith('.html')) {
        layouts[path.basename(file, '.html')] = fs.readFileSync(path.join(LAYOUTS, file), 'utf8');
      }
    }
  }

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

  const root = relPath === '404.html' ? '/' : computeRoot(relPath);
  const layoutName = data.layout || 'base';
  const layout = layouts[layoutName];

  if (!layout) {
    console.error(`  ✗ No layout "${layoutName}" for ${relPath}`);
    return;
  }

  // Split body on markers (page-specific scripts go after global.js)
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

  // Active nav flags: { home: true, blog: false, ... }
  const navItems = ['home', 'blog', 'sections', 'pentesting', 'airedteam', 'ctf', 'dossier', 'tools', 'about'];
  const activeNav = {};
  navItems.forEach(n => { activeNav[n] = (data.activeNav === n); });
  activeNav.offensive = ['sections', 'pentesting', 'airedteam', 'ctf'].includes(data.activeNav);

  // Canonical URL + SEO extras
  const canonical = SITE_URL + '/' + (relPath === 'index.html' ? '' : relPath);
  const thisPost = relPath.startsWith('posts/')
    ? POSTS.find(p => 'posts/' + p.slug === relPath)
    : null;
  const cover = (thisPost && thisPost.cover) || data.cover || '';
  const ogImage = cover || DEFAULT_OG;
  const twitterCard = cover ? 'summary_large_image' : 'summary';
  const jsonld = jsonLdFor(relPath, canonical, thisPost);

  // Post listings (front-matter driven)
  const listPosts = POSTS.map(p => ({
    slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.category,
    catKey: p.catKey, section: p.section, read: p.read, icon: p.icon,
    dateLabel: p.dateLabel, dateHuman: p.dateHuman
  }));

  const templateData = {
    ...data,
    root,
    content,
    scripts,
    preGlobalScripts,
    activeNav,
    canonical,
    ogImage,
    twitterCard,
    jsonld,
    posts: listPosts,
    hasPosts: listPosts.length > 0,
    noPosts: listPosts.length === 0,
    latestPosts: listPosts.slice(0, 1),
    hasLatest: listPosts.length > 0,
  };

  if (data.postSection) {
    const sp = listPosts.filter(p => p.section === data.postSection);
    templateData.sectionPosts = sp;
    templateData.hasSectionPosts = sp.length > 0;
    templateData.noSectionPosts = sp.length === 0;
  }

  // Pre-render page content & scripts so template loops/conditionals inside
  // them (e.g. {{#posts}} listings) expand — the layout injects content at the
  // raw stage, which runs after the engine's section pass.
  templateData.content = render(content, templateData, partials);
  if (scripts) templateData.scripts = render(scripts, templateData, partials);
  if (preGlobalScripts) templateData.preGlobalScripts = render(preGlobalScripts, templateData, partials);

  const html = render(layout, templateData, partials);
  const outFile = path.join(OUT, relPath);
  mkdirp(path.dirname(outFile));
  fs.writeFileSync(outFile, html);
  console.log(`  ✓ ${relPath}`);
}

// ── Feeds ────────────────────────────────────

const xmlEscape = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function writeFeeds() {
  const posts = POSTS;

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

  // Sitemap over every built page. Posts carry a <lastmod> from their date.
  const postDates = {};
  posts.forEach(p => { postDates['posts/' + p.slug] = p.dateISO; });

  const urls = [];
  (function walkOut(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '_to_delete') continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walkOut(abs, rel + e.name + '/');
      else if (e.name.endsWith('.html') && e.name !== '404.html') {
        const rp = rel + e.name;
        urls.push(rp === 'index.html' ? '' : rp);
      }
    }
  })(OUT, '');

  const locs = urls.map(u => {
    const lm = postDates[u] ? `<lastmod>${postDates[u]}</lastmod>` : '';
    return `  <url><loc>${SITE_URL}/${u}</loc>${lm}</url>`;
  }).join('\n');

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

// ── Main ────────────────────────────────────

function main() {
  try {
    if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  } catch (e) {
    console.log(`  ! could not clear _site (${e.code}) — stale files may remain`);
  }

  console.log('\n⚡ YANGA Build\n');
  mkdirp(OUT);

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

  console.log('\nBuilding pages...');
  const count = buildPages();

  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  const nPosts = writeFeeds();
  console.log(`  ✓ rss.xml (${nPosts} posts), sitemap.xml, robots.txt`);

  console.log(`\n✅ Built ${count} pages → _site/\n`);
}

main();
