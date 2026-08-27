// ============================================
// YANGA — Tachikoma chat widget (placeholder)
// A cute Ghost-in-the-Shell Tachikoma head that the chat
// panel expands out of and retracts back into. No backend yet.
// Self-contained: injects its own CSS + markup, survives PJAX.
// ============================================
(function () {
  if (window.__tachikomaInit) return;
  window.__tachikomaInit = true;

  // ---- ghost AI backend (Phase 1) ------------------------------------------
  // Paste your deployed Cloudflare Worker URL here to switch ghost from the
  // canned placeholder replies to the real Claude-backed brain. Empty = offline
  // fallback (site never breaks if the Worker is down). See bot/README.md.
  var GHOST_API = ''; // real brain UNPLUGGED — using canned replies. To re-enable: paste your Worker URL here (see bot/README.md).
  var history = [];          // [{role:'user'|'assistant', content}] sent to the Worker
  var MAX_TURNS = 12;

  // ---- cute Tachikoma head (shared by FAB + panel header) ----
  function faceHTML() {
    return '' +
    '<span class="rs-face" aria-hidden="true">' +
      '<span class="rs-ring"></span>' +
      '<span class="rs-eyes"><span class="rs-eye"></span><span class="rs-eye"></span></span>' +
      '<span class="rs-mouth"></span>' +
      '<span class="rs-noise"></span>' +
      '<span class="rs-dots"><i></i><i></i><i></i></span>' +
      '<span class="rs-wave"><i></i><i></i><i></i><i></i></span>' +
      '<span class="rs-load"></span>' +
      '<span class="rs-check"></span>' +
      '<span class="rs-x"></span>' +
      '<span class="rs-mark">?</span>' +
    '</span>';
  }

  var CSS = '' +
  '#tk-fab{position:fixed;bottom:24px;right:24px;width:54px;height:54px;z-index:120;cursor:pointer;' +
    'border:none;background:none;padding:0;filter:drop-shadow(0 6px 18px rgba(0,0,0,.5));' +
    'animation:tk-bob 4.5s ease-in-out infinite;transition:transform .2s ease,opacity .2s ease;}' +
  '#tk-fab:hover{transform:translateY(-3px) scale(1.05);}' +
  '#tk-fab:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:50%;}' +
  '#tk-fab::before{content:"";position:absolute;inset:-48%;border-radius:50%;background:radial-gradient(circle,rgba(var(--accent-rgb),.24),rgba(var(--accent-rgb),0) 66%);z-index:-1;pointer-events:none;animation:rs-halo-pulse 3.2s ease-in-out infinite;}' +
  '@keyframes rs-halo-pulse{0%,100%{opacity:.5;transform:scale(.95);}50%{opacity:1;transform:scale(1.07);}}' +
  '#tk-fab:hover::before{opacity:1;transform:scale(1.14);}' +
  '#tk-fab .tk-ping{position:absolute;top:5px;right:6px;width:11px;height:11px;border-radius:50%;' +
    'background:var(--accent);box-shadow:0 0 8px rgba(var(--accent-rgb),.9);border:2px solid var(--bg-deep);}' +
  '.tk-svg{width:100%;height:100%;display:block;overflow:visible;}' +
  '.rs-face{display:block;position:relative;width:100%;height:100%;border-radius:50%;container-type:size;--cell:3.1px;--dc:.95px;--de:1.4px;}' +
  '.rs-face::before{content:"";position:absolute;inset:-14%;border-radius:50%;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(var(--accent-rgb),.13),transparent 62%);animation:rs-dmglow 4s ease-in-out infinite;}' +
  '.rs-face::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.24) 0 1px,transparent 1px 3px);opacity:.4;z-index:5;}' +
  '@keyframes rs-dmglow{0%,100%{opacity:.6;}50%{opacity:1;}}' +
  '.rs-ring{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(var(--accent-rgb),.95) 0 var(--dc),rgba(var(--accent-rgb),.5) calc(var(--dc) + .2px),rgba(var(--accent-rgb),0) var(--de));background-size:var(--cell) var(--cell);-webkit-mask:radial-gradient(circle at 50% 50%,transparent 0 41%,#000 42.5% 48.8%,transparent 50.2%);mask:radial-gradient(circle at 50% 50%,transparent 0 41%,#000 42.5% 48.8%,transparent 50.2%);filter:drop-shadow(0 0 1.5px rgba(var(--accent-rgb),.55));opacity:.9;}' +
  '.rs-eyes .rs-eye{display:none;}' +
  '#tk-head .rs-face{--cell:2.5px;--dc:.8px;--de:1.15px;}' +
  '@keyframes rs-breathe{0%,100%{box-shadow:0 0 6px rgba(var(--accent-rgb),.34),inset 0 0 6px rgba(var(--accent-rgb),.15);}50%{box-shadow:0 0 12px rgba(var(--accent-rgb),.55),inset 0 0 10px rgba(var(--accent-rgb),.26);}}' +
  '.rs-eyes{position:absolute;inset:0;transform:translate(var(--ex,0px),var(--ey,0px));transform-origin:50% 45%;transition:transform .05s linear;background-image:radial-gradient(circle,#e8f5ff 0 calc(var(--dc) - .12px),rgba(var(--accent-rgb),1) calc(var(--dc) + .16px),rgba(var(--accent-rgb),.1) var(--de),rgba(var(--accent-rgb),0) calc(var(--de) + .5px));background-size:var(--cell) var(--cell);-webkit-mask:radial-gradient(circle 7cqmin at 30% 45.5%,#000 90%,transparent 100%),radial-gradient(circle 7cqmin at 70% 45.5%,#000 90%,transparent 100%);mask:radial-gradient(circle 7cqmin at 30% 45.5%,#000 90%,transparent 100%),radial-gradient(circle 7cqmin at 70% 45.5%,#000 90%,transparent 100%);filter:drop-shadow(0 0 4px rgba(var(--accent-rgb),.9));}' +
  '[data-mode="light"] .rs-face{background:none;}' +
  '.rs-mouth{position:absolute;inset:0;background-image:radial-gradient(circle,#d3ecff 0 var(--dc),rgba(var(--accent-rgb),1) var(--de),rgba(var(--accent-rgb),0) calc(var(--de) + .45px));background-size:var(--cell) var(--cell);-webkit-mask:linear-gradient(#000,#000) no-repeat 50% 65% / 22% 5.5%;mask:linear-gradient(#000,#000) no-repeat 50% 65% / 22% 5.5%;filter:drop-shadow(0 0 3px rgba(var(--accent-rgb),.8));}' +
  'body.gh-outline .rs-ring{-webkit-mask:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Cpath%20fill=%27none%27%20stroke=%27%23fff%27%20stroke-width=%276%27%20stroke-linejoin=%27round%27%20stroke-linecap=%27round%27%20d=%27M12,54%20a38,38%200%200%201%2076,0%20L88,85%20a9.5,7%200%200%201%20-19,0%20a9.5,7%200%200%201%20-19,0%20a9.5,7%200%200%201%20-19,0%20a9.5,7%200%200%201%20-19,0%20Z%27/%3E%3C/svg%3E") no-repeat center/contain;mask:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Cpath%20fill=%27none%27%20stroke=%27%23fff%27%20stroke-width=%276%27%20stroke-linejoin=%27round%27%20stroke-linecap=%27round%27%20d=%27M12,54%20a38,38%200%200%201%2076,0%20L88,85%20a9.5,7%200%200%201%20-19,0%20a9.5,7%200%200%201%20-19,0%20a9.5,7%200%200%201%20-19,0%20a9.5,7%200%200%201%20-19,0%20Z%27/%3E%3C/svg%3E") no-repeat center/contain;}' +
  'body.gh-solid .rs-ring{-webkit-mask:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Cpath%20fill=%27%23fff%27%20d=%27M12,54%20a38,38%200%200%201%2076,0%20L88,93%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.5,8%20Z%27/%3E%3C/svg%3E") no-repeat center/contain;mask:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Cpath%20fill=%27%23fff%27%20d=%27M12,54%20a38,38%200%200%201%2076,0%20L88,93%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.5,8%20Z%27/%3E%3C/svg%3E") no-repeat center/contain;}' +
  'body.gh-solid .rs-mouth{display:none;}' +
  'body.gh-solid .rs-eyes{display:block;background:#070c15;background-image:none;-webkit-mask:radial-gradient(ellipse 9.5% 11.5% at 30% 48%,#000 88%,transparent 100%),radial-gradient(ellipse 9.5% 11.5% at 70% 48%,#000 88%,transparent 100%);mask:radial-gradient(ellipse 9.5% 11.5% at 30% 48%,#000 88%,transparent 100%),radial-gradient(ellipse 9.5% 11.5% at 70% 48%,#000 88%,transparent 100%);transform:translate(var(--ex,0px),var(--ey,0px));transform-origin:50% 48%;transition:transform .07s ease;filter:none;}' +
  '[data-mode="light"] body.gh-solid .rs-eyes{background:#e7eef6;}' +
  'body.gh-neon .rs-ring{background-image:none;background-color:rgba(var(--accent-rgb),1);-webkit-mask:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Cpath%20fill=%27none%27%20stroke=%27%23fff%27%20stroke-width=%273.5%27%20stroke-linejoin=%27round%27%20stroke-linecap=%27round%27%20d=%27M12,54%20a38,38%200%200%201%2076,0%20L88,93%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.5,8%20Z%27/%3E%3C/svg%3E") no-repeat center/contain;mask:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%20100%20100%27%3E%3Cpath%20fill=%27none%27%20stroke=%27%23fff%27%20stroke-width=%273.5%27%20stroke-linejoin=%27round%27%20stroke-linecap=%27round%27%20d=%27M12,54%20a38,38%200%200%201%2076,0%20L88,93%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.7,8%20l-12.7,-8%20l-12.5,8%20Z%27/%3E%3C/svg%3E") no-repeat center/contain;opacity:1;filter:drop-shadow(0 0 3px rgba(var(--accent-rgb),.95)) drop-shadow(0 0 8px rgba(var(--accent-rgb),.5));}' +
  'body.gh-neon .rs-eyes{background-image:radial-gradient(circle 7cqmin at 30% 45.5%,#e6f5ff 0 24%,var(--accent) 66%,transparent 100%),radial-gradient(circle 7cqmin at 70% 45.5%,#e6f5ff 0 24%,var(--accent) 66%,transparent 100%);background-size:100% 100%;background-repeat:no-repeat;-webkit-mask:none;mask:none;filter:drop-shadow(0 0 5px rgba(var(--accent-rgb),.95)) drop-shadow(0 0 10px rgba(var(--accent-rgb),.5));}' +
  'body.gh-neon .rs-mouth{display:none;}' +
  '#gh-dev{position:fixed;left:14px;bottom:14px;z-index:130;font-family:var(--font-body,monospace);font-size:11px;letter-spacing:1px;color:var(--accent);background:rgba(8,12,18,.9);border:1px solid rgba(var(--accent-rgb),.4);border-radius:5px;padding:5px 10px;cursor:pointer;opacity:.72;}' +
  '#gh-dev:hover{opacity:1;}' +
  '.rs-dots{position:absolute;top:60%;left:0;right:0;display:none;justify-content:center;gap:9%;}' +
  '.rs-dots i{width:8%;aspect-ratio:1;border-radius:50%;background:var(--accent);box-shadow:0 0 5px rgba(var(--accent-rgb),.9);animation:rs-dot 1s infinite;}' +
  '.rs-dots i:nth-child(2){animation-delay:.15s;}.rs-dots i:nth-child(3){animation-delay:.3s;}' +
  '@keyframes rs-dot{0%,60%,100%{opacity:.25;transform:translateY(0);}30%{opacity:1;transform:translateY(-20%);}}' +
  '.rs-wave{position:absolute;top:56%;left:0;right:0;height:18%;display:none;justify-content:center;align-items:center;gap:7%;}' +
  '.rs-wave i{width:6%;height:30%;border-radius:2px;background:var(--accent);box-shadow:0 0 5px rgba(var(--accent-rgb),.9);animation:rs-bar .7s infinite ease-in-out;}' +
  '.rs-wave i:nth-child(2){animation-delay:.1s;}.rs-wave i:nth-child(3){animation-delay:.2s;}.rs-wave i:nth-child(4){animation-delay:.3s;}' +
  '@keyframes rs-bar{0%,100%{height:22%;}50%{height:92%;}}' +
  '.rs-check{position:absolute;top:46%;left:38%;width:24%;height:12%;display:none;border-left:3px solid #35e08e;border-bottom:3px solid #35e08e;transform:rotate(-45deg);}' +
  '.rs-face.is-thinking .rs-mouth{display:none;}.rs-face.is-thinking .rs-dots{display:flex;}' +
  '.rs-face.is-speaking .rs-mouth{display:none;}.rs-face.is-speaking .rs-wave{display:flex;}' +
  '.rs-face.is-success .rs-mouth,.rs-face.is-success .rs-eyes{opacity:0;}.rs-face.is-success .rs-check{display:block;}.rs-face.is-success .rs-ring{animation:none;border-color:#35e08e;box-shadow:0 0 13px rgba(53,224,142,.6),inset 0 0 9px rgba(53,224,142,.25);}' +
  '.rs-face.is-happy .rs-mouth{width:36%;height:16%;background:none;box-shadow:none;border-bottom:3px solid rgba(var(--accent-rgb),.95);border-radius:0 0 60px 60px/0 0 34px 34px;top:54%;}' +
  '.rs-face.is-excited .rs-eye{width:17%;}' +
  '.rs-face.is-excited .rs-mouth{width:17%;height:17%;border-radius:50%;top:57%;}' +
  '.rs-face.is-excited .rs-ring{animation-duration:1.5s;}' +
  '.rs-face.is-confused .rs-eye:last-child{transform:scale(.65);align-self:flex-start;}' +
  '.rs-face.is-confused .rs-mouth{width:15%;transform:translateX(-50%) rotate(14deg);top:64%;}' +
  '.rs-face.is-confused .rs-mark{display:block;}' +
  '.rs-face.is-loading .rs-eyes,.rs-face.is-loading .rs-mouth{opacity:.2;}' +
  '.rs-face.is-loading .rs-load{display:block;}' +
  '.rs-face.is-error .rs-eyes,.rs-face.is-error .rs-mouth{opacity:0;}' +
  '.rs-face.is-error .rs-x{display:block;}' +
  '.rs-face.is-error .rs-ring{animation:none;border-color:#ff5a5a;box-shadow:0 0 13px rgba(255,90,90,.6),inset 0 0 9px rgba(255,90,90,.25);}' +
  '.rs-load{position:absolute;inset:15%;border-radius:50%;border:3px solid transparent;border-top-color:var(--accent);display:none;animation:rs-spin .8s linear infinite;}' +
  '@keyframes rs-spin{to{transform:rotate(360deg);}}' +
  '.rs-x{position:absolute;inset:35%;display:none;}' +
  '.rs-x:before,.rs-x:after{content:"";position:absolute;top:calc(50% - 1.5px);left:0;width:100%;height:3px;background:#ff5a5a;border-radius:2px;box-shadow:0 0 5px rgba(255,90,90,.7);}' +
  '.rs-x:before{transform:rotate(45deg);}.rs-x:after{transform:rotate(-45deg);}' +
  '.rs-mark{position:absolute;top:-2%;right:8%;display:none;color:var(--accent);font-weight:700;font-size:40cqmin;line-height:1;text-shadow:0 0 5px rgba(var(--accent-rgb),.8);}' +
  '.rs-boot .rs-face{animation:rs-poweron .6s ease-out;}' +
  '@keyframes rs-poweron{0%{opacity:0;transform:scaleY(.05) scaleX(.7);}18%{opacity:1;transform:scaleY(.08) scaleX(1);}32%{opacity:.6;transform:scaleY(1.06) scaleX(1);}46%{opacity:1;}62%{opacity:.55;}80%{opacity:1;}100%{opacity:1;transform:scale(1);}}' +
  '.tk-head-bar,.tk-body,.tk-input{position:relative;z-index:1;}' +
  '#tk-fab.tk-blink .rs-eyes,#tk-head.tk-blink .rs-eyes{transform:translate(var(--ex,0px),var(--ey,0px)) scaleY(.12);}' +
  '@keyframes tk-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}' +
  '#tk-bubble{position:fixed;right:22px;bottom:100px;max-width:246px;z-index:119;cursor:pointer;background:transparent;border:1px solid rgba(var(--accent-rgb),.55);border-radius:14px;padding:13px 15px;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 18px rgba(var(--accent-rgb),.38),0 0 40px rgba(var(--accent-rgb),.2);opacity:0;clip-path:inset(50% 0 50% 0 round 3px);transform-origin:center;pointer-events:none;}' +
  '#tk-bubble .tk-b-q{display:block;color:var(--text-bright);font-family:var(--font-prose,"Inter",sans-serif);font-size:.9rem;line-height:1.45;text-shadow:0 1px 4px rgba(0,0,0,.75),0 0 10px rgba(0,0,0,.5);}' +
  '#tk-bubble::after{content:"";position:absolute;bottom:-8px;right:30px;width:14px;height:14px;background:transparent;border-right:1px solid rgba(var(--accent-rgb),.55);border-bottom:1px solid rgba(var(--accent-rgb),.55);transform:rotate(45deg);border-bottom-right-radius:2px;}' +
  '#tk-bubble.show{opacity:1;clip-path:inset(-44px -44px -44px -44px round 16px);pointer-events:auto;animation:tk-b-crt .62s cubic-bezier(.2,.8,.25,1);}' +
  '#tk-bubble.closing{pointer-events:none;animation:tk-b-crt-off .46s cubic-bezier(.4,0,.7,.4) forwards;}' +
  '#tk-bubble .tk-b-scan{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);z-index:6;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,rgba(var(--accent-rgb),1) 18%,#eaf6ff,rgba(var(--accent-rgb),1) 82%,transparent);box-shadow:0 0 18px 2px rgba(var(--accent-rgb),.9);}' +
  '#tk-bubble.show .tk-b-scan{animation:tk-b-line .62s ease-out;}' +
  '#tk-bubble.show .tk-b-q{animation:tk-b-qin .62s both;}' +
  '#tk-bubble.closing .tk-b-scan{animation:tk-b-line-off .46s ease-in;}' +
  '#tk-bubble.closing .tk-b-q{animation:tk-b-qout .46s both;}' +
  '#tk-bubble:hover{box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 18px rgba(var(--accent-rgb),.24);}' +
  'body.tk-open #tk-bubble{opacity:0!important;pointer-events:none!important;}' +
  '[data-mode="light"] #tk-bubble{background:transparent;border-color:rgba(var(--accent-rgb),.5);box-shadow:0 10px 30px rgba(60,80,120,.16),0 0 18px rgba(var(--accent-rgb),.3),0 0 40px rgba(var(--accent-rgb),.16);}' +
  '[data-mode="light"] .tk-b-q{color:#12233d;text-shadow:0 1px 3px rgba(255,255,255,.85),0 0 8px rgba(255,255,255,.6);}' +
  '[data-mode="light"] #tk-bubble::after{background:transparent;border-right-color:rgba(var(--accent-rgb),.5);border-bottom-color:rgba(var(--accent-rgb),.5);}' +
  // panel
  '#tk-panel{position:fixed;bottom:24px;right:24px;width:340px;max-width:calc(100vw - 32px);height:460px;' +
    'max-height:calc(100vh - 120px);z-index:121;display:flex;flex-direction:column;overflow:hidden;' +
    'background:rgba(10,12,18,.94);backdrop-filter:blur(10px);border:1px solid var(--border);border-radius:16px;' +
    'box-shadow:0 20px 60px rgba(0,0,0,.55);transform-origin:center;' +
    'opacity:0;clip-path:inset(50% 0 50% 0 round 2px);pointer-events:none;}' +
  // CRT power-on: bright hairline snaps in, blooms to full; reverse on close.
  '#tk-panel.open{opacity:1;clip-path:inset(0 0 0 0 round 16px);pointer-events:auto;' +
    'animation:tk-crt-on .58s cubic-bezier(.2,.8,.25,1);}' +
  '#tk-panel.closing{pointer-events:none;animation:tk-crt-off .44s cubic-bezier(.4,0,.7,.4) forwards;}' +
  // CRT open: hairline scan draws in & holds ALONE, fades, THEN panel blooms open
  '@keyframes tk-crt-on{' +
    '0%{opacity:1;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(.4);}' +
    '10%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);}' +
    '44%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);}' +
    '68%{clip-path:inset(0 0 0 0 round 16px);transform:scale(1.022,.978);}' +
    '80%{clip-path:inset(0 0 0 0 round 16px);transform:scale(.99,1.014);}' +
    '90%{clip-path:inset(0 0 0 0 round 16px);transform:scale(1.007,.996);}' +
    '97%{clip-path:inset(0 0 0 0 round 16px);transform:scale(.998,1.002);}' +
    '100%{opacity:1;clip-path:inset(0 0 0 0 round 16px);transform:none;}}' +
  // CRT close: panel collapses to the hairline FIRST, then the scan flashes & fades alone
  '@keyframes tk-crt-off{' +
    '0%{opacity:1;clip-path:inset(0 0 0 0 round 16px);transform:none;}' +
    '45%{opacity:1;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleY(1);}' +
    '90%{opacity:1;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(1);}' +
    '100%{opacity:1;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);transform:scaleX(.4);}}' +
  // CRT open: scan LINE draws in & holds alone (thin band), fades, THEN bubble blooms open
  '@keyframes tk-b-crt{' +
    '0%{clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);transform:scaleX(.4);}' +
    '10%{clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);transform:scaleX(1);}' +
    '44%{clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);transform:scaleX(1);}' +
    '68%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:scale(1.03,.97);}' +
    '80%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:scale(.988,1.016);}' +
    '90%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:scale(1.008,.996);}' +
    '97%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:scale(.998,1.003);}' +
    '100%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:none;}}' +
  '@keyframes tk-b-line{0%{opacity:0;}14%{opacity:1;}38%{opacity:1;}46%{opacity:0;}100%{opacity:0;}}' +
  '@keyframes tk-b-qin{0%{opacity:0;}62%{opacity:0;}82%{opacity:1;}100%{opacity:1;}}' +
  // CRT close: bubble collapses to the hairline FIRST, then the scan line flashes & fades alone
  '@keyframes tk-b-crt-off{' +
    '0%{opacity:1;clip-path:inset(-44px -44px -44px -44px round 16px);transform:none;}' +
    '45%{opacity:1;clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);transform:scaleY(1);}' +
    '90%{opacity:1;clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);transform:scaleX(1);}' +
    '100%{opacity:1;clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);transform:scaleX(.4);}}' +
  '@keyframes tk-b-line-off{0%{opacity:0;}42%{opacity:0;}58%{opacity:1;}100%{opacity:0;}}' +
  '@keyframes tk-b-qout{0%{opacity:1;}28%{opacity:0;}100%{opacity:0;}}' +
  // bright bloom bar flashing along the collapsing/expanding hairline
  '.tk-scan{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);z-index:6;pointer-events:none;opacity:0;' +
    'background:linear-gradient(90deg,transparent,rgba(var(--accent-rgb),1) 18%,#eaf6ff,rgba(var(--accent-rgb),1) 82%,transparent);' +
    'box-shadow:0 0 18px 2px rgba(var(--accent-rgb),.9);}' +
  '#tk-panel.open .tk-scan{animation:tk-b-line .58s ease-out;}' +
  '#tk-panel.closing .tk-scan{animation:tk-b-line-off .44s ease-in;}' +
  '@keyframes tk-flash{0%{opacity:0;}10%{opacity:1;}42%{opacity:.85;}100%{opacity:0;}}' +
  '@keyframes tk-flash-off{0%{opacity:0;}55%{opacity:1;}100%{opacity:0;}}' +
  'body.tk-open #tk-fab{opacity:0;pointer-events:none;transform:scale(.9) translateY(4px);transition:opacity .2s ease,transform .26s ease;}' +
  '.tk-head-bar{display:flex;align-items:center;gap:11px;padding:13px 14px;border-bottom:1px solid var(--border);' +
    'background:rgba(var(--accent-rgb),.04);}' +
  '#tk-head{width:34px;height:34px;flex:0 0 auto;}' +
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
  '[data-mode="light"] #tk-panel{background:rgba(248,250,253,.96);box-shadow:0 20px 60px rgba(30,45,80,.25);}' +
  '[data-mode="light"] .tk-msg.me{background:rgba(20,30,55,.05);}' +
  '[data-mode="light"] .tk-input input{background:rgba(20,30,55,.05);}' +
  '[data-mode="light"] .rs-ring{border-color:rgba(var(--accent-rgb),1);border-width:2px;}' +
  '[data-mode="light"] .rs-ring:after{opacity:.35;}' +
  '[data-mode="light"] #tk-fab::before{background:radial-gradient(circle,rgba(var(--accent-rgb),.34),rgba(var(--accent-rgb),0) 62%);}' +
  '[data-mode="light"] .rs-eye{box-shadow:0 0 6px rgba(var(--accent-rgb),1),0 0 0 1.5px rgba(var(--accent-rgb),.25);}' +
  '[data-mode="light"] #tk-fab{filter:drop-shadow(0 6px 16px rgba(30,45,80,.30));}' +
  '[data-mode="light"] #tk-fab .tk-ping{border-color:#eef1f7;}' +
  '@media(max-width:480px){#tk-panel{height:70vh;}}' +
  '#tk-fab.glx-rgb .rs-face{animation:tk-g-rgb .38s ease-out;}' +
  '#tk-fab.glx-jit .rs-face{animation:tk-g-jit .34s linear;}' +
  '#tk-fab.glx-slice .rs-face{animation:tk-g-slice .44s steps(1,end);}' +
  '#tk-fab.glx-invert .rs-face{animation:tk-g-invert .32s ease-out;}' +
  '#tk-fab.glx-camo{animation:tk-camo 2.65s ease-in-out !important;}' +
  '#tk-fab.glx-tear .rs-face{animation:tk-g-tear .54s steps(1,end);}' +
  '#tk-fab.glx-flick .rs-face{animation:tk-g-flick .46s;}' +
  '#tk-fab.glx-roll .rs-face{animation:tk-g-roll .54s;}' +
  '#tk-fab.glx-block .rs-face{animation:tk-g-block .54s steps(1,end);}' +
  '#tk-fab.glx-echo .rs-face{animation:tk-g-echo .54s;}' +
  '#tk-fab.glx-static .rs-face{animation:tk-g-flick .56s;}' +
  '#tk-fab.glx-static .rs-noise{animation:tk-g-static .56s;}' +
  '.rs-noise{position:absolute;inset:0;z-index:6;opacity:0;pointer-events:none;mix-blend-mode:screen;background:url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%27120%27%20height=%27120%27%3E%3Cfilter%20id=%27n%27%3E%3CfeTurbulence%20type=%27fractalNoise%27%20baseFrequency=%270.9%27%20numOctaves=%272%27/%3E%3CfeColorMatrix%20values=%270%200%200%200%200.2%200%200%200%200%200.7%200%200%200%200%201%200%200%200%201.1%200%27/%3E%3C/filter%3E%3Crect%20width=%27120%27%20height=%27120%27%20filter=%27url(%23n)%27/%3E%3C/svg%3E")%20center/120px%20120px;}' +
  '@keyframes tk-g-tear{0%,100%{clip-path:inset(0);transform:none;}12%{clip-path:inset(0 0 50% 0);transform:translateX(9px);}18%{clip-path:inset(50% 0 0 0);transform:translateX(-9px);}24%{clip-path:inset(0);transform:none;}46%{clip-path:inset(0 0 50% 0);transform:translateX(-7px);}52%{clip-path:inset(50% 0 0 0);transform:translateX(7px);}58%{clip-path:inset(0);transform:none;}}' +
  '@keyframes tk-g-flick{0%,100%{opacity:1;filter:none;}20%{opacity:.25;}34%{opacity:1;filter:brightness(2.2);}48%{opacity:.5;}62%{opacity:1;}80%{opacity:.15;}90%{opacity:1;}}' +
  '@keyframes tk-g-roll{0%,100%{transform:translateY(0);filter:none;}15%{transform:translateY(-6px);}30%{transform:translateY(5px);}45%{transform:translateY(-8px);filter:brightness(1.4);}60%{transform:translateY(4px);}78%{transform:translateY(-3px);}}' +
  '@keyframes tk-g-block{0%,100%{clip-path:inset(0);transform:none;filter:none;}12%{clip-path:inset(26% 52% 55% 14%);transform:translateX(16px);}18%{clip-path:inset(0);transform:none;}40%{clip-path:inset(58% 18% 22% 50%);transform:translateX(-13px);filter:invert(1);}46%{clip-path:inset(0);transform:none;filter:none;}66%{clip-path:inset(40% 30% 40% 30%);transform:translateY(-8px);}72%{clip-path:inset(0);transform:none;}}' +
  '@keyframes tk-g-echo{0%,100%{filter:none;}25%{filter:drop-shadow(-10px 0 0 rgba(var(--accent-rgb),.5)) drop-shadow(-20px 0 0 rgba(var(--accent-rgb),.25));}55%{filter:drop-shadow(-16px 0 0 rgba(var(--accent-rgb),.5)) drop-shadow(-30px 0 0 rgba(var(--accent-rgb),.2));}80%{filter:drop-shadow(-6px 0 0 rgba(var(--accent-rgb),.4));}}' +
  '@keyframes tk-g-static{0%,100%{opacity:0;}20%{opacity:.7;}40%{opacity:.3;}60%{opacity:.6;}80%{opacity:.22;}}' +
  '@keyframes tk-g-rgb{0%,100%{filter:none;transform:none;}25%{filter:drop-shadow(3px 0 0 rgba(255,40,80,.9)) drop-shadow(-3px 0 0 rgba(0,230,255,.9));transform:translateX(1px);}55%{filter:drop-shadow(-4px 0 0 rgba(255,40,80,.9)) drop-shadow(4px 0 0 rgba(0,230,255,.9));transform:translateX(-1px);}80%{filter:drop-shadow(2px 0 0 rgba(255,40,80,.9)) drop-shadow(-2px 0 0 rgba(0,230,255,.9));}}' +
  '@keyframes tk-g-jit{0%,100%{transform:translate(0,0) skewX(0);}15%{transform:translate(-2px,1px) skewX(4deg);}30%{transform:translate(2px,-1px) skewX(-3deg);}45%{transform:translate(-2px,0);}60%{transform:translate(2px,1px) skewX(3deg);}78%{transform:translate(-1px,-1px);}}' +
  '@keyframes tk-g-slice{0%,100%{clip-path:inset(0);transform:none;}18%{clip-path:inset(28% 0 44% 0);transform:translateX(7px);}23%{clip-path:inset(0);transform:none;}46%{clip-path:inset(58% 0 14% 0);transform:translateX(-9px);}51%{clip-path:inset(0);transform:none;}72%{clip-path:inset(8% 0 72% 0);transform:translateX(6px);}77%{clip-path:inset(0);transform:none;}}' +
  '@keyframes tk-g-invert{0%,100%{filter:none;}30%{filter:invert(1) hue-rotate(180deg) saturate(1.6);}55%{filter:none;}72%{filter:invert(1) hue-rotate(180deg) saturate(1.6);}}' +
  '@keyframes tk-camo{0%{filter:none;opacity:1;}12%{filter:hue-rotate(160deg) saturate(.3) brightness(1.6);opacity:.6;}26%{filter:saturate(0) brightness(2.6) blur(2px) contrast(.5);opacity:.08;}44%{filter:saturate(0) brightness(3) blur(3px);opacity:.04;}62%{filter:saturate(0) brightness(3) blur(3px);opacity:.05;}80%{filter:hue-rotate(140deg) saturate(2) brightness(1.5) blur(1px);opacity:.5;}100%{filter:none;opacity:1;}}' +
  '@media(prefers-reduced-motion:reduce){#tk-fab,#tk-fab::before,.rs-ring,.rs-dots i,.rs-wave i{animation:none!important;}}';

  var GREETING = GHOST_API ? [
    "こんにちは！ I'm ghost — YANGA's recon unit. 🕷️",
    "Ask me about pentesting, AI-agent security, or Laury's work."
  ] : [
    "こんにちは！ I'm ghost — YANGA's little recon unit. 🕷️",
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

  var QA = [
    { q: "Difference between an AI agent and an LLM?",
      a: "An LLM just predicts text — input in, text out, no memory, no hands. An agent wraps that model in a loop, gives it tools, memory and a goal, and lets it act until the goal is met. The model is the brain; the agent is the brain plus a body and the authority to use it." },
    { q: "RAG vs MCP — what's the difference?",
      a: "RAG feeds the model knowledge: it retrieves documents into the prompt so it can answer with current or private info. MCP gives the model hands: a protocol to call tools — read files, query databases, fetch URLs. RAG is what it reads; MCP is what it can do." },
    { q: "Prompt injection vs jailbreak?",
      a: "A jailbreak makes the model ignore its own safety rules. Prompt injection hijacks the app around the model — malicious text hidden in a document or tool output that the model then obeys as if it were your instruction. Jailbreak targets the model; injection targets the system." },
    { q: "What's the 'confused deputy' in agent security?",
      a: "A trusted component tricked into misusing its authority for an attacker. An MCP server or a downstream agent acts with its own privileges because a message told it to — without checking whether that request should be trusted. An old web-security bug in new agent clothing." },
    { q: "MCP vs A2A?",
      a: "MCP connects a model to tools (model to filesystem, database, API). A2A connects a model to other agents (agent to agent delegation). MCP goes down to capabilities; A2A goes across to peers. Both are pipes untrusted data can travel through." },
    { q: "What's the 'lethal trifecta'?",
      a: "Simon Willison's rule: an agent is dangerous when it holds all three — access to private data, exposure to untrusted content, and the ability to communicate externally. Any one alone is safe; together they let an injection read secrets and exfiltrate them. Most real agent stacks have all three by default." },
    { q: "Agent vs automation workflow — where's the line?",
      a: "A workflow follows a fixed script you wrote — deterministic steps. An agent chooses its own next step at runtime from what it observes. The line is who picks the path: your code, or the model. Autonomy is the line, and the risk." },
    { q: "Why can't the model tell a trusted instruction from data?",
      a: "Because the context window has no privilege separation — your system prompt, a user message, a retrieved document and a tool's output all arrive as the same undifferentiated text, and the model acts on all of it with equal authority. That flatness is the root cause of most agent-security bugs." }
  ];

  function build() {
    if (document.getElementById('tk-fab')) return;

    var style = document.createElement('style');
    style.id = 'tk-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    // --- ghost face version switch (dev) ---
    var GKEY='yanga_ghost';
    function curGhost(){ try{ return localStorage.getItem(GKEY)||'outline'; }catch(e){ return 'outline'; } }
    var GHORDER=['outline','solid','neon'];
    function setGhost(v){ if(GHORDER.indexOf(v)<0) v='outline';
      document.body.classList.remove('gh-outline','gh-solid','gh-neon');
      document.body.classList.add('gh-'+v);
      try{ localStorage.setItem(GKEY,v); }catch(e){}
      var d=document.getElementById('gh-dev'); if(d) d.textContent='ghost: '+v+'  \u21C4';
      return v; }
    setGhost(curGhost());
    window.ghostFace=function(v){ if(!v||v==='toggle'){ v=GHORDER[(GHORDER.indexOf(curGhost())+1)%GHORDER.length]; } return setGhost(v); };
    var devOn=false; try{ devOn = /[?#&]dev\b/.test(location.href) || localStorage.getItem('yanga_dev')==='1'; }catch(e){}
    if(devOn){ var gbtn=document.createElement('button'); gbtn.id='gh-dev'; gbtn.type='button';
      gbtn.textContent='ghost: '+curGhost()+'  \u21C4';
      gbtn.addEventListener('click', function(){ window.ghostFace('toggle'); });
      document.body.appendChild(gbtn); }

    var fab = document.createElement('button');
    fab.id = 'tk-fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Open chat with ghost');
    fab.innerHTML = faceHTML();
    document.body.appendChild(fab);

    // power-on flicker
    fab.classList.add('rs-boot');
    setTimeout(function () { fab.classList.remove('rs-boot'); }, 650);

    var panel = document.createElement('div');
    panel.id = 'tk-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'ghost chat');
    panel.innerHTML =
      '<div class="tk-scan" aria-hidden="true"></div>' +
      '<div class="tk-head-bar">' +
        '<div id="tk-head">' + faceHTML() + '</div>' +
        '<div class="tk-id"><span class="tk-name">GHOST</span>' +
        '<span class="tk-status">recon unit · standby</span></div>' +
        '<button class="tk-close" type="button" aria-label="Close chat">✕</button>' +
      '</div>' +
      '<div class="tk-body" id="tk-body"></div>' +
      '<form class="tk-input" id="tk-form">' +
        '<input id="tk-text" type="text" autocomplete="off" placeholder="Ask ghost…">' +
        '<button class="tk-send" type="submit" aria-label="Send">➔</button>' +
      '</form>';
    document.body.appendChild(panel);

    var body = panel.querySelector('#tk-body');
    var form = panel.querySelector('#tk-form');
    var text = panel.querySelector('#tk-text');
    var seeded = false;

    // ---- cursor-tracking eyes (FAB head) ----
    var eyes = fab.querySelector('.rs-eyes');
    var tX = 0, tY = 0, cX = 0, cY = 0, MAXS = 3.2, NEAR = 260;
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
      if (eyes) { eyes.style.setProperty('--ex', cX.toFixed(1) + 'px'); eyes.style.setProperty('--ey', cY.toFixed(1) + 'px'); }
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

    // immediate message; returns the element (so we can stream text into it)
    function addMsgNow(who, str) {
      var m = document.createElement('div');
      m.className = 'tk-msg ' + who;
      m.textContent = str || '';
      body.appendChild(m);
      body.scrollTop = body.scrollHeight;
      return m;
    }

    // send a user turn to ghost: real streaming if GHOST_API is set, else canned
    function askGhost(userText) {
      setState('thinking');
      if (!GHOST_API) {
        setTimeout(function () {
          addMsgNow('bot', REPLIES[replyIdx % REPLIES.length]); replyIdx++;
          setState('speaking'); setTimeout(function () { setState('idle'); }, 1400);
        }, 700);
        return;
      }
      history.push({ role: 'user', content: userText });
      if (history.length > MAX_TURNS) history = history.slice(-MAX_TURNS);
      var el = null, acc = '', started = false;
      fetch(GHOST_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(function (res) {
        if (!res.ok || !res.body) {
          addMsgNow('bot', res.status === 429
            ? 'ghost is catching its breath — too many questions right now. try again in a bit.'
            : 'ghost\'s uplink dropped. try again in a moment.');
          setState('idle');
          return;
        }
        var reader = res.body.getReader(), dec = new TextDecoder();
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) {
              if (acc) history.push({ role: 'assistant', content: acc });
              setState('idle');
              return;
            }
            var chunk = dec.decode(r.value, { stream: true });
            if (chunk) {
              if (!started) { started = true; setState('speaking'); el = addMsgNow('bot', ''); }
              acc += chunk; el.textContent = acc; body.scrollTop = body.scrollHeight;
            }
            return pump();
          });
        }
        return pump();
      }).catch(function () {
        if (!started) addMsgNow('bot', 'ghost\'s uplink dropped. try again in a moment.');
        setState('idle');
      });
    }

    function setState(s) {
      document.querySelectorAll('.rs-face').forEach(function (f) {
        f.classList.remove('is-thinking', 'is-speaking', 'is-success');
        if (s && s !== 'idle') f.classList.add('is-' + s);
      });
    }

    function open() {
      panel.classList.remove('closing');
      panel.classList.add('open');
      document.body.classList.add('tk-open');
      if (!seeded) { seeded = true; GREETING.forEach(function (g, i) { addMsg('bot', g, 260 + i * 550); }); }
      setTimeout(function () { text.focus(); }, 300);
    }
    function close() {
      if (!panel.classList.contains('open')) return;
      panel.classList.add('closing');      // faster reverse timing
      panel.classList.remove('open');      // fade + clip back up
      document.body.classList.remove('tk-open');  // head eases back in
      // a small acknowledgment blink as it settles
      setTimeout(function () {
        fab.classList.add('tk-blink');
        setTimeout(function () { fab.classList.remove('tk-blink'); }, 150);
      }, 160);
      setTimeout(function () { panel.classList.remove('closing'); }, 480);
    }

    fab.addEventListener('click', open);
    panel.querySelector('.tk-close').addEventListener('click', close);
    // ---- glitch playback (dev): Shift+1..0 fire a specific glitch, Shift+C = camo ----
    var GLITCH_DUR = { 'glx-rgb':420,'glx-jit':380,'glx-slice':480,'glx-tear':560,'glx-flick':470,'glx-roll':560,'glx-echo':560,'glx-block':560,'glx-static':580,'glx-invert':360,'glx-camo':2700 };
    function playGlitch(cls) {
      if (!fab) return;
      fab.className = fab.className.replace(/\bglx-\S+/g, '').replace(/\s+/g, ' ').trim();
      void fab.offsetWidth;                 // reflow so the animation restarts
      fab.classList.add(cls);
      clearTimeout(fab.__glxT);
      fab.__glxT = setTimeout(function () { fab.classList.remove(cls); }, (GLITCH_DUR[cls] || 500) + 80);
    }
    window.ghostGlitch = function (n) { playGlitch(n.indexOf('glx-') === 0 ? n : ('glx-' + n)); };
    var GLX_KEYS = { Digit1:'glx-rgb', Digit2:'glx-slice', Digit3:'glx-tear', Digit4:'glx-flick', Digit5:'glx-roll', Digit6:'glx-block', Digit7:'glx-static', Digit8:'glx-jit', Digit9:'glx-echo', Digit0:'glx-invert', KeyC:'glx-camo' };
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) close();
      if (e.repeat || !e.shiftKey) return;
      var t = (e.target || {}).tagName || '';
      if (t === 'INPUT' || t === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (e.code === 'KeyG') { e.preventDefault(); window.ghostFace('toggle'); return; }
      if (GLX_KEYS[e.code]) { e.preventDefault(); playGlitch(GLX_KEYS[e.code]); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = text.value.trim();
      if (!v) return;
      addMsgNow('me', v);
      text.value = '';
      askGhost(v);
    });

    // ---- teaser question bubble ----
    var bubble = document.createElement('div');
    bubble.id = 'tk-bubble';
    bubble.setAttribute('role', 'button');
    bubble.setAttribute('aria-label', 'Ask ghost the shown question');
    document.body.appendChild(bubble);
    var qaLast = -1, activeQA = null, bubbleT, closeT, cooldownUntil = 0;
    function pickQA() { var i; do { i = Math.floor(Math.random() * QA.length); } while (QA.length > 1 && i === qaLast); qaLast = i; return QA[i]; }
    function showBubble(auto) {
      if (document.body.classList.contains('tk-open')) return;
      if (Date.now() < cooldownUntil || bubble.classList.contains('show')) return;
      clearTimeout(closeT); bubble.classList.remove('closing');
      activeQA = pickQA();
      bubble.innerHTML = '<span class="tk-b-scan"></span><span class="tk-b-q">' + activeQA.q + '</span>';
      bubble.classList.add('show');
      clearTimeout(bubbleT);
      if (auto) bubbleT = setTimeout(hideBubble, 6500);
    }
    function hideBubble() {
      clearTimeout(bubbleT);
      if (!bubble.classList.contains('show')) return;
      bubble.classList.remove('show');
      bubble.classList.add('closing');
      cooldownUntil = Date.now() + 1000;      // 1s cooldown before it can reopen
      clearTimeout(closeT);
      closeT = setTimeout(function () { bubble.classList.remove('closing'); }, 500);
    }
    fab.addEventListener('mouseenter', function () { if (!document.body.classList.contains('tk-open')) showBubble(false); });
    fab.addEventListener('mouseleave', function () { clearTimeout(bubbleT); bubbleT = setTimeout(hideBubble, 350); });
    fab.addEventListener('click', hideBubble);
    bubble.addEventListener('mouseenter', function () { clearTimeout(bubbleT); });
    bubble.addEventListener('mouseleave', function () { bubbleT = setTimeout(hideBubble, 250); });
    bubble.addEventListener('click', function () {
      var qa = activeQA; hideBubble(); if (!qa) return;
      var wasSeeded = seeded;
      open();
      var d = wasSeeded ? 150 : 1250;
      if (GHOST_API) {
        setTimeout(function () { addMsgNow('me', qa.q); askGhost(qa.q); }, d);
      } else {
        addMsg('me', qa.q, d);
        setTimeout(function () { setState('thinking'); }, d);
        addMsg('bot', qa.a, d + 950);
        setTimeout(function () { setState('speaking'); setTimeout(function () { setState('idle'); }, 1700); }, d + 950);
      }
    });
    setInterval(function () {
      if (document.body.classList.contains('tk-open') || bubble.classList.contains('show')) return;
      if (Math.random() < 0.45) showBubble(true);
    }, 16000);

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

    // idle random glitch + thermoptic camouflage (mirrors the terminal `ghost` cloak)
    (function glitchLoop() {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var POOL = [
        { c: 'glx-rgb',    d: 420,  w: 5 },
        { c: 'glx-slice',  d: 480,  w: 4 },
        { c: 'glx-tear',   d: 560,  w: 3 },
        { c: 'glx-echo',   d: 560,  w: 3 },
        { c: 'glx-invert', d: 360,  w: 2 },
        { c: 'glx-camo',   d: 2700, w: 1 }
      ];
      var total = POOL.reduce(function (a, g) { return a + g.w; }, 0);
      function fire() {
        if (!document.body.classList.contains('tk-open') && fab.style.display !== 'none' && fab.className.indexOf('glx-') === -1) {
          var r = Math.random() * total, g = POOL[0];
          for (var i = 0; i < POOL.length; i++) { r -= POOL[i].w; if (r <= 0) { g = POOL[i]; break; } }
          fab.classList.add(g.c);
          setTimeout(function () { fab.classList.remove(g.c); }, g.d + 60);
        }
        schedule();
      }
      function schedule() { setTimeout(fire, 2600 + Math.random() * 4200); }
      schedule();
    })();
  }

  if (document.readyState !== 'loading') build();
  else document.addEventListener('DOMContentLoaded', build);
})();
