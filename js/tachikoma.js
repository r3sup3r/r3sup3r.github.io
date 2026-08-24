// ============================================
// YANGA — Tachikoma chat widget (placeholder)
// A cute Ghost-in-the-Shell Tachikoma head that the chat
// panel expands out of and retracts back into. No backend yet.
// Self-contained: injects its own CSS + markup, survives PJAX.
// ============================================
(function () {
  if (window.__tachikomaInit) return;
  window.__tachikomaInit = true;

  // ---- cute Tachikoma head (shared by FAB + panel header) ----
  function headSVG() {
    return '' +
    '<svg class="tk-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="tkDome" cx="50%" cy="38%" r="70%">' +
        '<stop offset="0%" stop-color="#1b2740"/><stop offset="100%" stop-color="#0b111d"/>' +
      '</radialGradient></defs>' +
      '<path class="tk-dome" d="M50 12 C75 12 89 29 89 54 C89 77 74 91 50 91 C26 91 11 77 11 54 C11 29 25 12 50 12 Z"/>' +
      // top periscope sensors
      '<circle class="tk-sensor" cx="31" cy="25" r="6"/><circle class="tk-glow" cx="31" cy="25" r="2.4"/>' +
      '<circle class="tk-sensor" cx="69" cy="25" r="6"/><circle class="tk-glow" cx="69" cy="25" r="2.4"/>' +
      // big front eyes (the cute part)
      '<g class="tk-eyes">' +
        '<circle class="tk-lens" cx="35" cy="55" r="15"/>' +
        '<circle class="tk-lens" cx="65" cy="55" r="15"/>' +
        '<g class="tk-pupils">' +
          '<circle class="tk-iris" cx="35" cy="55" r="8"/>' +
          '<circle class="tk-shine" cx="31.5" cy="51.5" r="3"/>' +
          '<circle class="tk-iris" cx="65" cy="55" r="8"/>' +
          '<circle class="tk-shine" cx="61.5" cy="51.5" r="3"/>' +
        '</g>' +
      '</g>' +
      // little chin sensor
      '<circle class="tk-sensor" cx="50" cy="78" r="5.5"/><circle class="tk-glow" cx="50" cy="78" r="2.2"/>' +
    '</svg>';
  }

  var CSS = '' +
  '#tk-fab{position:fixed;bottom:24px;right:24px;width:66px;height:66px;z-index:120;cursor:pointer;' +
    'border:none;background:none;padding:0;filter:drop-shadow(0 6px 18px rgba(0,0,0,.5));' +
    'animation:tk-bob 4.5s ease-in-out infinite;transition:transform .2s ease;}' +
  '#tk-fab:hover{transform:translateY(-3px) scale(1.05);}' +
  '#tk-fab:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:50%;}' +
  '#tk-fab .tk-ping{position:absolute;top:5px;right:6px;width:11px;height:11px;border-radius:50%;' +
    'background:var(--accent);box-shadow:0 0 8px rgba(var(--accent-rgb),.9);border:2px solid var(--bg-deep);}' +
  '.tk-svg{width:100%;height:100%;display:block;overflow:visible;}' +
  '.tk-dome{fill:url(#tkDome);stroke:rgba(var(--accent-rgb),.55);stroke-width:2.5;}' +
  '.tk-lens{fill:#0a0f1a;stroke:rgba(var(--accent-rgb),.5);stroke-width:2;}' +
  '.tk-iris{fill:var(--accent);filter:drop-shadow(0 0 4px rgba(var(--accent-rgb),.9));}' +
  '.tk-shine{fill:#eaf6ff;}' +
  '.tk-sensor{fill:#0a0f1a;stroke:rgba(var(--accent-rgb),.4);stroke-width:1.5;}' +
  '.tk-glow{fill:var(--accent);}' +
  '.tk-eyes{transform-box:fill-box;transform-origin:center;transition:transform .09s ease;}' +
  '.tk-head-bar,.tk-body,.tk-input{position:relative;z-index:1;}' +
  '#tk-fab.tk-blink .tk-eyes,#tk-head.tk-blink .tk-eyes{transform:scaleY(.12);}' +
  '@keyframes tk-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}' +
  // panel
  '#tk-panel{position:fixed;bottom:24px;right:24px;width:340px;max-width:calc(100vw - 32px);height:460px;' +
    'max-height:calc(100vh - 120px);z-index:121;display:flex;flex-direction:column;overflow:hidden;' +
    'background:rgba(10,12,18,.94);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;' +
    'box-shadow:0 20px 60px rgba(0,0,0,.55);transform-origin:bottom right;transform:scale(.05) translate(30px,30px);' +
    'opacity:0;pointer-events:none;transition:transform .32s cubic-bezier(.16,1,.3,1),opacity .22s ease;}' +
  '#tk-panel.open{transform:scale(1) translate(0,0);opacity:1;pointer-events:auto;}' +
  'body.tk-open #tk-fab{opacity:0;pointer-events:none;transform:scale(.4);transition:opacity .18s ease,transform .28s ease;}' +
  // thermoptic-camo cloak: glitch judder -> scan-bar sweep + de-rez
  '.tk-fx{position:absolute;inset:0;z-index:3;pointer-events:none;opacity:0;border-radius:16px;overflow:hidden;}' +
  '.tk-fx::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(var(--accent-rgb),.10) 0 1px,transparent 1px 3px);}' +
  '.tk-fx::after{content:"";position:absolute;left:-4%;right:-4%;height:12%;top:-14%;' +
    'background:linear-gradient(to bottom,transparent,rgba(var(--accent-rgb),.85),#eaf6ff,rgba(var(--accent-rgb),.85),transparent);' +
    'box-shadow:0 0 22px rgba(var(--accent-rgb),.9);mix-blend-mode:screen;}' +
  '#tk-panel.closing{animation:tk-cloak .52s ease-in forwards;pointer-events:none;}' +
  '#tk-panel.closing .tk-fx{animation:tk-fx-on .52s linear forwards;}' +
  '#tk-panel.closing .tk-fx::after{animation:tk-scan .52s cubic-bezier(.4,0,.5,1) forwards;}' +
  '@keyframes tk-fx-on{0%{opacity:0;}10%{opacity:1;}80%{opacity:1;}100%{opacity:0;}}' +
  '@keyframes tk-scan{0%{top:-14%;}12%{top:-14%;}82%{top:104%;}100%{top:104%;}}' +
  '@keyframes tk-cloak{' +
    '0%{opacity:1;filter:none;transform:translate(0,0);clip-path:inset(0 round 16px);}' +
    '6%{transform:translate(-6px,1px);filter:contrast(1.6) saturate(1.4) drop-shadow(5px 0 0 rgba(255,0,90,.55)) drop-shadow(-5px 0 0 rgba(0,224,255,.6));}' +
    '11%{transform:translate(7px,-1px);clip-path:inset(0 0 34% 0 round 16px);}' +
    '15%{transform:translate(-4px,1px);clip-path:inset(22% 0 0 0 round 16px);}' +
    '20%{transform:translate(2px,0);filter:none;clip-path:inset(0 round 16px);opacity:1;}' +
    '26%{opacity:.96;}' +
    '100%{opacity:0;transform:translate(0,-4px) scaleY(.94);filter:blur(3px) brightness(1.5) saturate(1.3);clip-path:inset(0 round 16px);}' +
  '}' +
  'body.tk-closing #tk-fab{opacity:0;pointer-events:none;transform:scale(.4);}' +
  // head returns with a mechanical power-on flash, not a bounce
  '#tk-fab.tk-return{animation:tk-boot .5s ease-out;}' +
  '@keyframes tk-boot{0%{transform:scale(.72);filter:brightness(2.4) saturate(1.4);}45%{transform:scale(1.05);filter:brightness(1.35);}100%{transform:scale(1);filter:none;}}' +
  '.tk-head-bar{display:flex;align-items:center;gap:11px;padding:13px 14px;border-bottom:1px solid var(--border);' +
    'background:rgba(var(--accent-rgb),.04);}' +
  '#tk-head{width:38px;height:38px;flex:0 0 auto;}' +
  '.tk-id{display:flex;flex-direction:column;gap:2px;min-width:0;}' +
  '.tk-name{font-family:var(--font-body);font-size:.8rem;letter-spacing:1px;color:var(--text-bright);}' +
  '.tk-status{font-family:var(--font-body);font-size:.56rem;letter-spacing:1.5px;text-transform:uppercase;' +
    'color:var(--text-muted);display:flex;align-items:center;gap:6px;}' +
  '.tk-status::before{content:"";width:6px;height:6px;border-radius:50%;background:#e0a13c;box-shadow:0 0 6px #e0a13c;}' +
  '.tk-close{margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;' +
    'width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;transition:.2s;}' +
  '.tk-close:hover{color:var(--accent);background:rgba(var(--accent-rgb),.1);}' +
  '.tk-body{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:11px;scrollbar-width:thin;}' +
  '.tk-msg{max-width:82%;padding:9px 12px;border-radius:12px;font-family:var(--font-prose);font-size:.82rem;' +
    'line-height:1.5;animation:tk-pop .25s ease;}' +
  '.tk-msg.bot{align-self:flex-start;background:rgba(var(--accent-rgb),.09);border:1px solid rgba(var(--accent-rgb),.18);' +
    'color:var(--text-bright);border-bottom-left-radius:4px;}' +
  '.tk-msg.me{align-self:flex-end;background:rgba(255,255,255,.06);border:1px solid var(--border);' +
    'color:var(--text-secondary);border-bottom-right-radius:4px;}' +
  '@keyframes tk-pop{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}' +
  '.tk-input{display:flex;gap:8px;padding:11px;border-top:1px solid var(--border);background:rgba(var(--bg-deep-rgb),.5);}' +
  '.tk-input input{flex:1;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:9px;' +
    'padding:9px 12px;color:var(--text-bright);font-family:var(--font-prose);font-size:.82rem;outline:none;transition:border-color .2s;}' +
  '.tk-input input:focus{border-color:var(--border-hover);}' +
  '.tk-input input::placeholder{color:var(--text-faint);}' +
  '.tk-send{flex:0 0 auto;width:38px;border:1px solid rgba(var(--accent-rgb),.4);border-radius:9px;background:rgba(var(--accent-rgb),.1);' +
    'color:var(--accent);cursor:pointer;font-size:.9rem;transition:.2s;}' +
  '.tk-send:hover{background:rgba(var(--accent-rgb),.2);}' +
  '@media(max-width:480px){#tk-panel{height:70vh;}}' +
  '@media(prefers-reduced-motion:reduce){#tk-fab{animation:none;}}';

  var GREETING = [
    "こんにちは！ I'm resuper — YANGA's little recon unit. 🕷️",
    "Chat isn't wired to a real brain yet, but ask me anything and I'll pretend I'm listening."
  ];
  var REPLIES = [
    "Ooh, good question! My natural-oil-powered brain is still booting though. 🛢️",
    "I'll file that away for when Laury finishes building me!",
    "Beep boop — my chat backend is still in training. Maybe check the blog meanwhile?",
    "I *want* to answer, but I'm just a placeholder for now. Soon™!",
    "Processing… just kidding, I can't yet. But I think you're neat!"
  ];
  var replyIdx = 0;

  function build() {
    if (document.getElementById('tk-fab')) return;

    var style = document.createElement('style');
    style.id = 'tk-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    var fab = document.createElement('button');
    fab.id = 'tk-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Open chat with resuper');
    fab.innerHTML = headSVG() + '<span class="tk-ping"></span>';
    document.body.appendChild(fab);

    var panel = document.createElement('div');
    panel.id = 'tk-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'resuper chat');
    panel.innerHTML =
      '<div class="tk-fx" aria-hidden="true"></div>' +
      '<div class="tk-head-bar">' +
        '<div id="tk-head">' + headSVG() + '</div>' +
        '<div class="tk-id"><span class="tk-name">RESUPER</span>' +
        '<span class="tk-status">placeholder · offline</span></div>' +
        '<button class="tk-close" type="button" aria-label="Close chat">✕</button>' +
      '</div>' +
      '<div class="tk-body" id="tk-body"></div>' +
      '<form class="tk-input" id="tk-form">' +
        '<input id="tk-text" type="text" autocomplete="off" placeholder="Ask resuper…">' +
        '<button class="tk-send" type="submit" aria-label="Send">➔</button>' +
      '</form>';
    document.body.appendChild(panel);

    var body = panel.querySelector('#tk-body');
    var form = panel.querySelector('#tk-form');
    var text = panel.querySelector('#tk-text');
    var seeded = false;

    // ---- cursor-tracking eyes (FAB head) ----
    var pupils = fab.querySelector('.tk-pupils');
    var tX = 0, tY = 0, cX = 0, cY = 0, MAXS = 4.2, NEAR = 260;
    document.addEventListener('mousemove', function (e) {
      if (document.body.classList.contains('tk-open')) { tX = tY = 0; return; }
      var r = fab.getBoundingClientRect();
      var fx = r.left + r.width / 2, fy = r.top + r.height / 2;
      var dx = e.clientX - fx, dy = e.clientY - fy;
      var d = Math.hypot(dx, dy);
      if (d < NEAR && d > 0.5) { tX = (dx / d) * MAXS; tY = (dy / d) * MAXS; }
      else { tX = 0; tY = 0; }
    });
    (function follow() {
      cX += (tX - cX) * 0.18; cY += (tY - cY) * 0.18;
      if (pupils) pupils.setAttribute('transform', 'translate(' + cX.toFixed(2) + ' ' + cY.toFixed(2) + ')');
      requestAnimationFrame(follow);
    })();


    function addMsg(who, str, delay) {
      setTimeout(function () {
        var m = document.createElement('div');
        m.className = 'tk-msg ' + who;
        m.textContent = str;
        body.appendChild(m);
        body.scrollTop = body.scrollHeight;
      }, delay || 0);
    }

    function open() {
      panel.classList.add('open');
      document.body.classList.add('tk-open');
      if (!seeded) { seeded = true; GREETING.forEach(function (g, i) { addMsg('bot', g, 200 + i * 550); }); }
      setTimeout(function () { text.focus(); }, 340);
    }
    function close() {
      if (panel.classList.contains('closing')) return;
      panel.classList.add('closing');
      document.body.classList.add('tk-closing');
      function done(e) {
        if (e && e.target !== panel) return;
        panel.removeEventListener('animationend', done);
        panel.classList.remove('open', 'closing');
        document.body.classList.remove('tk-open', 'tk-closing');
        // the head "catches" it: springy bounce + a quick blink
        fab.classList.add('tk-return', 'tk-blink');
        setTimeout(function () { fab.classList.remove('tk-blink'); }, 150);
        fab.addEventListener('animationend', function r() {
          fab.removeEventListener('animationend', r);
          fab.classList.remove('tk-return');
        });
      }
      panel.addEventListener('animationend', done);
    }

    fab.addEventListener('click', open);
    panel.querySelector('.tk-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) close();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = text.value.trim();
      if (!v) return;
      addMsg('me', v);
      text.value = '';
      addMsg('bot', REPLIES[replyIdx % REPLIES.length], 500);
      replyIdx++;
    });

    // idle blink for cuteness
    (function blinkLoop() {
      var wait = 3500 + Math.random() * 3500;
      setTimeout(function () {
        [fab, document.getElementById('tk-head')].forEach(function (el) {
          if (!el) return;
          el.classList.add('tk-blink');
          setTimeout(function () { el.classList.remove('tk-blink'); }, 150);
        });
        blinkLoop();
      }, wait);
    })();
  }

  if (document.readyState !== 'loading') build();
  else document.addEventListener('DOMContentLoaded', build);
})();
