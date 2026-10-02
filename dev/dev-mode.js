/* YANGA dev mode — in-browser editor (local only, injected by dev-server.js).
   Creates/edits posts (markdown) and cards, writing to src/ and rebuilding.
   Pure helpers are exposed on window.__ym for testing. */
(function(){
  'use strict';
  if (window.__ymLoaded) return; window.__ymLoaded = true;

  var MD = (typeof marked !== 'undefined') ? (marked.parse ? marked.parse.bind(marked) : marked) : function(s){return '<pre>'+esc(s)+'</pre>';};

  // ---------- tiny helpers ----------
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function attr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
  function slugify(s){ return String(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80); }
  function h(tag, attrs, kids){
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs){ if(k==='class')e.className=attrs[k]; else if(k==='html')e.innerHTML=attrs[k]; else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),attrs[k]); else if(attrs[k]!=null)e.setAttribute(k,attrs[k]); }
    (kids||[]).forEach(function(c){ if(c==null)return; e.appendChild(typeof c==='string'?document.createTextNode(c):c); });
    return e;
  }

  // ---------- API ----------
  function api(path, opts){ return fetch(path, opts).then(function(r){ return r.json(); }); }
  function ymList(){ return api('/__dev/api/list'); }
  function ymRead(p){ return api('/__dev/api/read?path='+encodeURIComponent(p)); }
  function ymSave(p, content){ return api('/__dev/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p,content:content})}); }
  function ymDelete(p){ return api('/__dev/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:p})}); }

  function toast(msg, isErr){
    var t = h('div',{class:'ym-toast'+(isErr?' err':'')},[msg]); document.body.appendChild(t);
    setTimeout(function(){ t.style.transition='opacity .4s'; t.style.opacity='0'; setTimeout(function(){t.remove();},400); }, isErr?4200:2200);
  }

  // ---------- POST file build / parse ----------
  function buildPostFile(f, body){
    var fm = {};
    fm.title = f.title || 'Untitled';
    if (f.heading) fm.heading = f.heading;
    fm.layout = 'base';
    fm.activeNav = 'blog';
    if (f.date) fm.date = f.date;
    if (f.excerpt) fm.excerpt = f.excerpt;
    fm.category = f.category || 'Notes';
    fm.catKey = f.catKey || slugify(f.category||'notes') || 'all';
    if (f.read) fm.read = f.read;
    if (f.icon) fm.icon = f.icon;
    if (f.series){ fm.series = f.series; fm.seriesOrder = (f.seriesOrder===''||f.seriesOrder==null)?0:Number(f.seriesOrder); }
    if (f.draft) fm.draft = true;
    if (f.description) fm.description = f.description;
    return '<!--\n' + JSON.stringify(fm, null, 2) + '\n-->\n\n' + String(body||'').trim() + '\n';
  }
  function parsePostFile(content){
    var m = content.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\s*/);
    var data = {}; if (m){ try{ data = JSON.parse(m[1]); }catch(e){} }
    var body = m ? content.slice(m[0].length) : content;
    return { data:data, body:body };
  }

  // ---------- CARD helpers (surgical: preserve untouched cards byte-for-byte) ----------
  function splitFront(content){
    var m = content.match(/^<!--\s*\{[\s\S]*?\}\s*-->\s*/);
    return m ? { front: content.slice(0, m[0].length), body: content.slice(m[0].length) } : { front:'', body:content };
  }
  // Balance a tag from an opening at index i in s (tag = 'div' or 'a'); return index just past the matching close.
  function balanceTag(s, i, tag){
    var open = new RegExp('<'+tag+'(?=[\\s/>])','ig'), close = new RegExp('</'+tag+'>','ig');
    var depth=0, idx=i;
    open.lastIndex = i; close.lastIndex = i;
    while (idx < s.length){
      open.lastIndex = idx; close.lastIndex = idx;
      var mo = open.exec(s), mc = close.exec(s);
      var no = mo ? mo.index : Infinity, nc = mc ? mc.index : Infinity;
      if (no === Infinity && nc === Infinity) return s.length;
      if (no < nc){ depth++; idx = no + 1; }
      else { depth--; idx = nc + ('</'+tag+'>').length; if (depth===0) return idx; }
    }
    return s.length;
  }
  // Find containers (content-wrap / hub / pentest-section) that hold topic-cards.
  function findContainers(body){
    var res=[]; var re=/<div\b[^>]*class="([^"]*)"[^>]*>/ig, m;
    while ((m = re.exec(body))){
      var cls = m[1];
      if (!/\b(content-wrap|hub|pentest-section)\b/.test(cls)) continue;
      var start = m.index, end = balanceTag(body, start, 'div');
      var openEnd = m.index + m[0].length;
      var inner = body.slice(openEnd, end - '</div>'.length);
      if (inner.indexOf('topic-card') === -1) continue;
      // skip if nested inside a container we already took
      if (res.some(function(c){ return start > c.start && end <= c.end; })) continue;
      res.push({ start:start, end:end, innerStart:openEnd, innerEnd:end-'</div>'.length, cls:cls, inner:inner });
      re.lastIndex = end;
    }
    return res;
  }
  // Slice out each topic-card (as <a> or <div>) from a container's inner HTML.
  function findCardSlices(inner){
    var out=[]; var re=/<(a|div)\b[^>]*class="[^"]*topic-card[^"]*"[^>]*>/ig, m;
    while ((m = re.exec(inner))){
      var tag = m[1].toLowerCase(), start = m.index, end = balanceTag(inner, start, tag);
      out.push({ raw: inner.slice(start, end), tag:tag });
      re.lastIndex = end;
    }
    return out;
  }
  function cardRawToModel(raw){
    var doc = new DOMParser().parseFromString(raw, 'text/html');
    var c = doc.querySelector('.topic-card'); if(!c) return null;
    var soon = c.classList.contains('topic-card--soon');
    var tagEl = c.querySelector('.tw-tag'); var iconEl = c.querySelector('.topic-head i');
    var iconCls=''; if (iconEl) iconCls = (iconEl.getAttribute('class')||'').split(/\s+/).filter(function(x){return x && x!=='fa-solid' && x!=='fa-brands' && x!=='fa-regular';}).join(' ');
    var tagCls=''; if (tagEl) tagCls = (tagEl.getAttribute('class')||'').split(/\s+/).filter(function(x){return x && x!=='tw-tag';}).join(' ');
    var ctaEl = c.querySelector('.topic-cta'); var cta = ctaEl ? ctaEl.textContent.trim() : '';
    return {
      kind: soon ? 'soon' : 'link',
      href: c.getAttribute('href') || '',
      tag: tagEl ? tagEl.textContent.trim() : '',
      tagClass: tagCls || (soon?'soon':'topic'),
      icon: iconCls || 'fa-folder',
      title: (c.querySelector('.topic-head h2')||{}).textContent ? c.querySelector('.topic-head h2').textContent.trim() : '',
      intro: (c.querySelector('.topic-intro')||{}).innerHTML ? c.querySelector('.topic-intro').innerHTML.trim() : '',
      cta: cta || (soon?'In progress':'Open')
    };
  }
  function genCard(m){
    var icon = '<i class="fa-solid '+attr(m.icon||'fa-folder')+'"></i>';
    var tags = '<div class="card-tags"><span class="tw-tag '+attr(m.tagClass||'topic')+'">'+esc(m.tag||'Folder')+'</span></div>';
    var head = '<div class="topic-head">'+icon+'<h2>'+esc(m.title||'Untitled')+'</h2></div>';
    var intro = '<p class="topic-intro">'+(m.intro||'')+'</p>';
    var out;
    if (m.kind === 'soon'){
      out = '  <div class="topic-card topic-card--soon">\n    '+tags+'\n    '+head+'\n    '+intro+'\n    <span class="topic-cta topic-cta--muted">'+esc(m.cta||'In progress')+'</span>\n  </div>';
    } else {
      out = '  <a class="topic-card topic-card--link" href="'+attr(m.href||'#')+'">\n    '+tags+'\n    '+head+'\n    '+intro+'\n    <span class="topic-cta">'+esc(m.cta||'Open')+' <i class="fa-solid fa-arrow-right"></i></span>\n  </a>';
    }
    // Keep the site's entity convention (em-dash-free source).
    return out.replace(/—/g,'&mdash;').replace(/–/g,'&ndash;').replace(/·/g,'&middot;').replace(/→/g,'&rarr;');
  }
  // Rebuild a file's chosen container from card models; untouched cards keep original bytes.
  function rebuildCards(content, containerIndex, models){
    var sf = splitFront(content), body = sf.body;
    var conts = findContainers(body);
    var c = conts[containerIndex]; if(!c) throw new Error('container not found');
    var innerParts = models.map(function(mm){ return (mm.dirty || mm.isNew) ? genCard(mm) : mm.orig; });
    var newInner = '\n' + innerParts.join('\n\n') + '\n';
    var newBody = body.slice(0, c.innerStart) + newInner + body.slice(c.innerEnd);
    return sf.front + newBody;
  }

  window.__ym = { buildPostFile:buildPostFile, parsePostFile:parsePostFile, slugify:slugify,
    findContainers:findContainers, findCardSlices:findCardSlices, cardRawToModel:cardRawToModel,
    genCard:genCard, rebuildCards:rebuildCards, splitFront:splitFront };

  // ================= UI =================
  var state = { tab:'posts', list:null };
  var panel, bodyEl;

  function launch(){
    var b = h('button',{id:'ym-launch',title:'Dev mode — create & edit posts and cards'},[ h('span',{class:'d'}), 'DEV MODE' ]);
    b.addEventListener('click', openPanel); document.body.appendChild(b);
  }
  function openPanel(){
    if (panel){ panel.classList.remove('ym-hidden'); return; }
    panel = h('div',{id:'ym-panel'},[
      h('div',{class:'ym-head'},[ h('h2',null,['◆ YANGA DEV']), h('button',{class:'ym-x',onclick:closePanel},['×']) ]),
      h('div',{class:'ym-tabs'},[
        h('button',{class:'ym-tab on','data-tab':'posts',onclick:function(){setTab('posts');}},['Posts']),
        h('button',{class:'ym-tab','data-tab':'cards',onclick:function(){setTab('cards');}},['Cards'])
      ]),
      bodyEl = h('div',{class:'ym-body'},[])
    ]);
    document.body.appendChild(panel);
    setTab('posts');
  }
  function closePanel(){ if(panel) panel.classList.add('ym-hidden'); }
  function setTab(t){
    state.tab=t;
    [].forEach.call(panel.querySelectorAll('.ym-tab'),function(b){ b.classList.toggle('on', b.getAttribute('data-tab')===t); });
    if (t==='posts') renderPostsList(); else renderCardsTab();
  }
  function clearBody(){ bodyEl.innerHTML=''; }

  // ---------- POSTS ----------
  function renderPostsList(){
    clearBody();
    bodyEl.appendChild(h('div',{class:'ym-actions'},[ h('button',{class:'ym-btn',onclick:function(){editPost(null);}},['＋ New post']) ]));
    var ul = h('ul',{class:'ym-list'},[]); bodyEl.appendChild(ul);
    ul.appendChild(h('li',{class:'ym-empty'},['Loading…']));
    ymList().then(function(d){
      state.list=d; ul.innerHTML='';
      if(!d.posts.length){ ul.appendChild(h('li',{class:'ym-empty'},['No posts yet. Create your first.'])); return; }
      d.posts.forEach(function(p){
        ul.appendChild(h('li',{class:'ym-item'},[
          h('div',{class:'m'},[ h('div',{class:'t'},[p.heading||p.title]),
            h('div',{class:'s'},[ p.path.replace('src/posts/','') + (p.date?'  ·  '+p.date:'') + (p.series?'  ·  '+p.series:'') ]) ]),
          h('div',{style:'display:flex;gap:6px;align-items:center;'},[
            p.draft?h('span',{class:'ym-badge draft'},['draft']):null,
            h('span',{class:'ym-badge'+(p.format==='md'?' md':'')},[p.format]),
            h('button',{class:'ym-mini',onclick:function(){editPost(p);}},['Edit'])
          ])
        ]));
      });
    }).catch(function(e){ ul.innerHTML=''; ul.appendChild(h('li',{class:'ym-empty'},['Error: '+e])); });
  }

  function editPost(p){
    clearBody();
    var f = { title:'', heading:'', date:new Date().toISOString().slice(0,10), category:'Pentesting', catKey:'pentesting',
      series:'', seriesOrder:'', read:'', excerpt:'', icon:'', draft:false, description:'' };
    var body = '';
    var existingPath = p ? p.path : null;
    function build(){
      clearBody();
      var fields = h('div',null,[
        row([ field('Title','title','text'), field('Heading (optional)','heading','text') ]),
        row([ field('Date','date','date'), field('Read (e.g. 10 min)','read','text') ]),
        row([ field('Category','category','text'), field('catKey','catKey','text') ]),
        row([ field('Series (optional)','series','text'), field('Series order #','seriesOrder','number') ]),
        field('Excerpt (blog card summary)','excerpt','textarea'),
        h('label',{class:'ym-check'},[ checkbox('draft'), 'Draft (do not publish)' ]),
        h('div',{class:'ym-sub'},['Body — Markdown']),
        bodyArea()
      ]);
      bodyEl.appendChild(h('div',{class:'ym-actions'},[ h('button',{class:'ym-btn ghost',onclick:renderPostsList},['← Back']),
        h('span',{style:'color:#7c8aa5;font:600 11px/1 ui-monospace,monospace;'},[ existingPath ? existingPath.replace('src/','') : 'new post' ]) ]));
      bodyEl.appendChild(fields);
      bodyEl.appendChild(h('div',{class:'ym-sub'},['Live preview']));
      var prev = h('div',{class:'ym-preview'},[ h('div',{class:'content-wrap'},[ h('article',{class:'article-body',id:'ym-prev'},[]) ]) ]);
      bodyEl.appendChild(prev);
      var acts = h('div',{class:'ym-actions'},[
        h('button',{class:'ym-btn',id:'ym-save',onclick:save},['Save & build']),
        existingPath ? h('button',{class:'ym-btn danger',onclick:del},['Delete']) : null
      ]);
      bodyEl.appendChild(acts);
      updatePreview();
    }
    function field(label, key, type){
      var input = type==='textarea' ? h('textarea',{rows:'2'}) : h('input',{type:type||'text'});
      input.value = f[key]==null?'':f[key];
      input.addEventListener('input', function(){ f[key]=input.value; if(key==='category'&&!p) f.catKey=slugify(input.value); if(key==='category'){ var ck=panel.querySelector('[data-k="catKey"]'); if(ck && !p) ck.value=f.catKey; } });
      if(key==='catKey') input.setAttribute('data-k','catKey');
      return h('div',{class:'ym-field'},[ h('label',null,[label]), input ]);
    }
    function bodyArea(){
      var ta = h('textarea',{rows:'14',id:'ym-body',placeholder:'# Write in Markdown…\\n\\nFenced ```code```, tables, lists, links all work.'});
      ta.value = body;
      ta.addEventListener('input', function(){ body=ta.value; updatePreview(); });
      return h('div',{class:'ym-field'},[ ta ]);
    }
    function checkbox(key){ var c=h('input',{type:'checkbox'}); c.checked=!!f[key]; c.addEventListener('change',function(){f[key]=c.checked;}); return c; }
    function row(kids){ return h('div',{class:'ym-row'},kids); }
    function updatePreview(){ var el=document.getElementById('ym-prev'); if(el) el.innerHTML = MD(body||'_Nothing yet._').replace(/\{\{root\}\}/g,'/'); }
    function save(){
      if(!f.title){ toast('Title is required', true); return; }
      var slug = existingPath ? existingPath.replace('src/posts/','').replace(/\.(md|html)$/,'') : slugify(f.title);
      if(!slug){ toast('Cannot derive filename from title', true); return; }
      var path = existingPath || ('src/posts/'+slug+'.md');
      var content = buildPostFile(f, body);
      var btn=document.getElementById('ym-save'); if(btn){btn.disabled=true;btn.textContent='Saving…';}
      ymSave(path, content).then(function(r){
        if(btn){btn.disabled=false;btn.textContent='Save & build';}
        if(r.ok){ toast('Saved '+path.replace('src/','')+' — rebuilt'); if(!existingPath && path.endsWith('.md')){ existingPath=path; } }
        else { toast('Build failed — see console', true); console.warn('[dev] build log:\\n'+(r.log||r.error)); showLog(r.log||r.error); }
      }).catch(function(e){ if(btn){btn.disabled=false;btn.textContent='Save & build';} toast('Save error: '+e, true); });
    }
    function del(){
      if(!existingPath) return;
      if(!confirm('Move '+existingPath+' to _to_delete and rebuild?')) return;
      ymDelete(existingPath).then(function(r){ if(r.ok){ toast('Deleted'); renderPostsList(); } else toast('Error', true); });
    }
    function showLog(t){ var old=bodyEl.querySelector('.ym-log'); if(old)old.remove(); bodyEl.appendChild(h('div',{class:'ym-log'},[t||''])); }

    if (existingPath){
      ymRead(existingPath).then(function(r){
        var parsed = parsePostFile(r.content); var d=parsed.data;
        f.title=d.title||''; f.heading=d.heading||''; f.date=d.date||f.date; f.category=d.category||''; f.catKey=d.catKey||'';
        f.series=d.series||''; f.seriesOrder=(d.seriesOrder==null?'':d.seriesOrder); f.read=d.read||''; f.excerpt=d.excerpt||''; f.icon=d.icon||''; f.draft=!!d.draft; f.description=d.description||'';
        body = (p.format==='md') ? parsed.body.trim() : parsed.body.trim();
        build();
        if (p.format!=='md'){ toast('This is an HTML post — body shown as raw HTML; saving keeps it as-is.'); }
      });
    } else { build(); }
  }

  // ---------- CARDS ----------
  function renderCardsTab(){
    clearBody();
    bodyEl.appendChild(h('div',{class:'ym-empty'},['Loading sections…']));
    ymList().then(function(d){
      clearBody();
      var sel = h('select',{},[ h('option',{value:''},['— choose a page —']) ].concat(d.sections.map(function(s){ return h('option',{value:s},[s.replace('src/sections/','')]); })));
      sel.addEventListener('change', function(){ if(sel.value) loadCards(sel.value); });
      bodyEl.appendChild(h('div',{class:'ym-field'},[ h('label',null,['Section / folder page']), sel ]));
      bodyEl.appendChild(h('div',{id:'ym-cardhost'},[ h('div',{class:'ym-empty'},['Pick a page to edit its cards.']) ]));
    });
  }
  function loadCards(pagePath){
    var host = document.getElementById('ym-cardhost'); host.innerHTML='<div class="ym-empty">Loading…</div>';
    ymRead(pagePath).then(function(r){
      var content = r.content, sf = splitFront(content), conts = findContainers(sf.body);
      if(!conts.length){ host.innerHTML='<div class="ym-empty">No card container found on this page.</div>'; return; }
      var ci = 0;
      var models = findCardSlices(conts[ci].inner).map(function(sl){ var m=cardRawToModel(sl.raw)||{}; m.orig=sl.raw; m.dirty=false; m.isNew=false; return m; });
      renderCardEditor(host, pagePath, content, conts, ci, models);
    });
  }
  function renderCardEditor(host, pagePath, content, conts, ci, models){
    host.innerHTML='';
    models.forEach(function(m){ m._pp=pagePath; m._c=content; m._conts=conts; m._ci=ci; });
    if (conts.length>1){
      var csel = h('select',{},conts.map(function(c,i){ var n=findCardSlices(c.inner).length; return h('option',{value:i, selected:i===ci?'selected':null},['Container '+(i+1)+' — '+n+' card'+(n===1?'':'s')]); }));
      csel.addEventListener('change',function(){ loadContainer(host,pagePath,content,conts,Number(csel.value)); });
      host.appendChild(h('div',{class:'ym-field'},[ h('label',null,['Card group on this page']), csel ]));
    }
    models.forEach(function(m,idx){ host.appendChild(cardRow(m, idx, models, host)); });
    host.appendChild(h('div',{class:'ym-actions'},[
      h('button',{class:'ym-btn ghost',onclick:function(){ var nm={kind:'soon',tag:'In progress',tagClass:'soon',icon:'fa-folder',title:'New card',intro:'Describe this card.',cta:'In progress',href:'',isNew:true,dirty:true}; models.push(nm); renderCardEditor(host,pagePath,content,conts,ci,models); }},['＋ Add card']),
      h('button',{class:'ym-btn',id:'ym-cardsave',onclick:function(){ saveCards(pagePath, content, ci, models); }},['Save & build'])
    ]));
  }
  function loadContainer(host,pagePath,content,conts,ci){
    var models = findCardSlices(conts[ci].inner).map(function(sl){ var m=cardRawToModel(sl.raw)||{}; m.orig=sl.raw; m.dirty=false; m.isNew=false; return m; });
    renderCardEditor(host,pagePath,content,conts,ci,models);
  }
  function cardRow(m, idx, models, host){
    function upd(key,val){ m[key]=val; m.dirty=true; }
    var kindSel = h('select',{},[ opt('link','Link card'), opt('soon','In-progress (no link)') ]); kindSel.value=m.kind;
    kindSel.addEventListener('change',function(){ upd('kind',kindSel.value); if(kindSel.value==='soon'){upd('tagClass','soon');} renderCardEditor(host, m._pp, m._c, m._conts, m._ci, models); });
    function opt(v,l){ return h('option',{value:v},[l]); }
    var f1 = h('div',{class:'ym-row'},[ mini('Tag label','tag'), mini('Tag style','tagClass','select',['topic','soon','report']) ]);
    var f2 = h('div',{class:'ym-row'},[ mini('Icon (fa-...)','icon'), mini('CTA text','cta') ]);
    var f3 = mini('Title','title');
    var f4 = mini('Intro','intro','textarea');
    var f5 = (m.kind==='link') ? mini('Link href (use {{root}}…)','href') : null;
    function mini(label,key,type,opts){
      var input;
      if(type==='select'){ input=h('select',{}, (opts||[]).map(function(o){return h('option',{value:o},[o]);})); input.value=m[key]||opts[0]; }
      else if(type==='textarea'){ input=h('textarea',{rows:'2'}); input.value=m[key]||''; }
      else { input=h('input',{type:'text'}); input.value=m[key]||''; }
      input.addEventListener('input',function(){ upd(key,input.value); });
      input.addEventListener('change',function(){ upd(key,input.value); });
      return h('div',{class:'ym-field'},[ h('label',null,[label]), input ]);
    }
    return h('div',{class:'ym-cardrow'},[
      h('div',{class:'ym-cardtop'},[ h('span',{class:'n'},['CARD '+(idx+1)]),
        h('div',{style:'display:flex;gap:6px;'},[
          idx>0?h('button',{class:'ym-mini',onclick:function(){ var t=models[idx-1]; models[idx-1]=models[idx]; models[idx]=t; renderCardEditor(host,m._pp,m._c,m._conts,m._ci,models); }},['↑']):null,
          idx<models.length-1?h('button',{class:'ym-mini',onclick:function(){ var t=models[idx+1]; models[idx+1]=models[idx]; models[idx]=t; renderCardEditor(host,m._pp,m._c,m._conts,m._ci,models); }},['↓']):null,
          h('button',{class:'ym-mini',onclick:function(){ models.splice(idx,1); renderCardEditor(host,m._pp,m._c,m._conts,m._ci,models); }},['✕'])
        ]) ]),
      h('div',{class:'ym-field'},[ h('label',null,['Kind']), kindSel ]),
      f1, f2, f3, f4, f5
    ]);
  }
  function saveCards(pagePath, content, ci, models){
    var out;
    try { out = rebuildCards(content, ci, models); } catch(e){ toast('Card build error: '+e, true); return; }
    var btn=document.getElementById('ym-cardsave'); if(btn){btn.disabled=true;btn.textContent='Saving…';}
    ymSave(pagePath, out).then(function(r){
      if(btn){btn.disabled=false;btn.textContent='Save & build';}
      if(r.ok) toast('Saved '+pagePath.replace('src/','')+' — rebuilt');
      else { toast('Build failed — see console', true); console.warn(r.log||r.error); }
    }).catch(function(e){ if(btn){btn.disabled=false;btn.textContent='Save & build';} toast('Save error: '+e,true); });
  }

  // boot
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', launch); else launch();
})();
