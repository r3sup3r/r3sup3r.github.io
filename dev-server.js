#!/usr/bin/env node
/* ============================================================
   YANGA — local DEV MODE server (localhost only)
   Serves the built site AND injects an in-browser editor that
   creates / edits posts (markdown) and cards, writing to src/
   and rebuilding. NEVER deploy this; it is a local authoring tool.
   Run:  node dev-server.js   then open http://127.0.0.1:4321
   ============================================================ */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');
const OUT  = path.join(ROOT, '_site');
const HOST = '127.0.0.1';
const PORT = process.env.PORT || 4321;

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp',
  '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf',
  '.pdf':'application/pdf', '.xml':'application/xml', '.txt':'text/plain; charset=utf-8',
  '.map':'application/json'
};

function send(res, code, body, type){
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(body);
}
function json(res, code, obj){ send(res, code, JSON.stringify(obj, null, 2), 'application/json; charset=utf-8'); }

// Only allow writing/reading .md and .html inside src/, no traversal.
function safeSrcPath(rel){
  if (typeof rel !== 'string') return null;
  rel = rel.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (rel.indexOf('..') !== -1) return null;
  if (!/^src\/[A-Za-z0-9_\-./]+\.(md|html)$/.test(rel)) return null;
  const abs = path.resolve(ROOT, rel);
  if (abs !== SRC && !abs.startsWith(SRC + path.sep)) return null;
  return abs;
}

function parseFront(raw){
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) return { data:{}, body: raw };
  try { return { data: JSON.parse(m[1]), body: raw.slice(m[0].length).replace(/^\s*\n/, '') }; }
  catch(e){ return { data:{}, body: raw }; }
}

function walkFiles(dir, exts, out, rootLen){
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes:true }); } catch(e){ return; }
  for (const e of entries){
    if (e.name.startsWith('_')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, exts, out, rootLen);
    else if (exts.some(x => e.name.endsWith(x))) out.push(full.slice(rootLen).replace(/\\/g,'/'));
  }
}

function listContent(){
  const posts = [];
  const pdir = path.join(SRC, 'posts');
  const pf = []; walkFiles(pdir, ['.md','.html'], pf, ROOT.length+1);
  for (const rel of pf){
    let d = {}; try { d = parseFront(fs.readFileSync(path.join(ROOT, rel),'utf8')).data; } catch(e){}
    posts.push({ path: rel, title: d.title||path.basename(rel), heading: d.heading||'', date: d.date||'',
      category: d.category||'', series: d.series||'', draft: !!d.draft,
      format: rel.endsWith('.md') ? 'md' : 'html' });
  }
  posts.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const sections = [];
  walkFiles(path.join(SRC,'sections'), ['.html'], sections, ROOT.length+1);
  sections.sort();
  return { posts, sections };
}

function build(cb){
  execFile('node', [path.join(ROOT,'build.js')], { cwd: ROOT, maxBuffer: 8*1024*1024 },
    (err, stdout, stderr) => cb(err, ((stdout||'')+(stderr||'')).trim()));
}

function readBody(req, cb){
  let data=''; let tooBig=false;
  req.on('data', c => { data += c; if (data.length > 6*1024*1024){ tooBig=true; req.destroy(); } });
  req.on('end', () => { if (tooBig) return cb(new Error('body too large')); cb(null, data); });
  req.on('error', e => cb(e));
}

const DEV_INJECT =
  '\n<!-- dev-mode (local only) --><link rel="stylesheet" href="/__dev/dev-mode.css">' +
  '<script src="/vendor/marked.min.js"></script>' +
  '<script src="/__dev/dev-mode.js" defer></script>\n';

function serveLocalFile(res, abs){
  fs.readFile(abs, (e, buf) => {
    if (e) return send(res, 404, 'Not found');
    send(res, 200, buf, MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  let u; try { u = new URL(req.url, 'http://'+HOST); } catch(e){ return send(res,400,'bad url'); }
  const p = decodeURIComponent(u.pathname);

  // ---------- dev API ----------
  if (p === '/__dev/api/list')  return json(res, 200, listContent());

  if (p === '/__dev/api/read'){
    const abs = safeSrcPath(u.searchParams.get('path'));
    if (!abs) return json(res, 400, { error:'bad path' });
    fs.readFile(abs, 'utf8', (e, c) => e ? json(res,404,{error:'not found'}) : json(res,200,{ path:u.searchParams.get('path'), content:c }));
    return;
  }

  if (p === '/__dev/api/save' && req.method === 'POST'){
    readBody(req, (err, raw) => {
      if (err) return json(res, 413, { error:String(err.message||err) });
      let msg; try { msg = JSON.parse(raw); } catch(e){ return json(res,400,{error:'bad json'}); }
      const abs = safeSrcPath(msg.path);
      if (!abs) return json(res, 400, { error:'refused: path must be src/**/*.{md,html}' });
      if (typeof msg.content !== 'string') return json(res, 400, { error:'missing content' });
      try { fs.mkdirSync(path.dirname(abs), { recursive:true }); fs.writeFileSync(abs, msg.content); }
      catch(e){ return json(res, 500, { error:String(e.message||e) }); }
      build((be, log) => json(res, 200, { ok: !be, path: msg.path, log }));
    });
    return;
  }

  if (p === '/__dev/api/delete' && req.method === 'POST'){
    readBody(req, (err, raw) => {
      let msg; try { msg = JSON.parse(raw); } catch(e){ return json(res,400,{error:'bad json'}); }
      const abs = safeSrcPath(msg.path);
      if (!abs) return json(res, 400, { error:'bad path' });
      const trash = path.join(ROOT, '_to_delete'); try { fs.mkdirSync(trash,{recursive:true}); } catch(e){}
      try { fs.renameSync(abs, path.join(trash, path.basename(abs)+'.'+Date.now())); }
      catch(e){ return json(res,500,{error:String(e.message||e)}); }
      build((be, log) => json(res, 200, { ok: !be, log }));
    });
    return;
  }

  // ---------- dev assets ----------
  if (p === '/__dev/dev-mode.js')  return serveLocalFile(res, path.join(ROOT,'dev','dev-mode.js'));
  if (p === '/__dev/dev-mode.css') return serveLocalFile(res, path.join(ROOT,'dev','dev-mode.css'));
  if (p === '/vendor/marked.min.js') return serveLocalFile(res, path.join(ROOT,'vendor','marked.min.js'));

  // ---------- static site (with editor injection on HTML) ----------
  let rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.resolve(OUT, rel);
  if (file !== OUT && !file.startsWith(OUT + path.sep)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (e, buf) => {
      if (e) return send(res, 404, 'Not found: ' + rel);
      const ext = path.extname(file).toLowerCase();
      if (ext === '.html'){
        let html = buf.toString('utf8');
        html = html.includes('</body>') ? html.replace('</body>', DEV_INJECT + '</body>') : html + DEV_INJECT;
        return send(res, 200, html, 'text/html; charset=utf-8');
      }
      send(res, 200, buf, MIME[ext] || 'application/octet-stream');
    });
  });
});

if (!fs.existsSync(OUT)) { console.log('No _site/ yet — building once...'); }
build((err, log) => {
  if (err) { console.error('Initial build failed:\n' + log); }
  server.listen(PORT, HOST, () => {
    console.log('\n  YANGA dev mode  →  http://' + HOST + ':' + PORT);
    console.log('  Editing writes to src/ and rebuilds. Ctrl-C to stop. Do not deploy this server.\n');
  });
});
