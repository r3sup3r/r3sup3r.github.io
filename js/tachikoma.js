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
      '<svg class="rs-body" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>' +
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
  '.rs-body{position:absolute;inset:0;width:100%;height:100%;display:none;overflow:visible;pointer-events:none;}' +
  'body.gh-hasbody .rs-ring{display:none;}' +
  'body.gh-hasbody .rs-body{display:block;}' +
  'body.gh-hasbody .rs-face::before,body.gh-hasbody .rs-face::after{display:none;}' +
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
  // ── V2 ghost visual variants — bodies rendered as inline SVG by renderGhostBody(); only eye overrides remain here ──
  'body.gv-neon .rs-eyes{background:none;background-image:radial-gradient(circle 7cqmin at 30% 45.5%,#e6f5ff 0 24%,var(--accent) 66%,transparent 100%),radial-gradient(circle 7cqmin at 70% 45.5%,#e6f5ff 0 24%,var(--accent) 66%,transparent 100%);background-size:100% 100%;background-repeat:no-repeat;-webkit-mask:none;mask:none;filter:drop-shadow(0 0 5px rgba(var(--accent-rgb),.95));}' +
  'body.gv-holo .rs-eyes{background:#eaf7ff;filter:drop-shadow(0 0 5px rgba(190,232,255,.85));}' +
  // ── ghost moods (V2): applied by class, shifted randomly + via Shift+M — NOT tied to theme ──
  'body.mood-angry .rs-eyes,body.mood-happy .rs-eyes{background:none!important;background-image:none!important;-webkit-mask:none!important;mask:none!important;}' +
  // angry = half-disc (flat top) tilted 45deg inward
  'body.mood-angry .rs-eyes::before,body.mood-angry .rs-eyes::after{content:"";position:absolute;top:46%;width:23cqmin;height:11.5cqmin;background:#070c15;border:none;border-radius:0 0 999px 999px;-webkit-mask:none;mask:none;clip-path:none;filter:none;}' +
  'body.mood-angry .rs-eyes::before{left:30%;transform:translate(-50%,-50%) rotate(45deg);}' +
  'body.mood-angry .rs-eyes::after{left:70%;transform:translate(-50%,-50%) rotate(-45deg);}' +
  // happy = crescent-moon hole
  'body.mood-happy .rs-eyes::before,body.mood-happy .rs-eyes::after{content:"";position:absolute;top:47%;width:22cqmin;height:22cqmin;background:#070c15;border:none;border-radius:50%;clip-path:none;-webkit-mask:radial-gradient(circle at 50% 4%,transparent 0 55%,#000 56%);mask:radial-gradient(circle at 50% 4%,transparent 0 55%,#000 56%);filter:none;}' +
  'body.mood-happy .rs-eyes::before{left:30%;transform:translate(-50%,-50%);}' +
  'body.mood-happy .rs-eyes::after{left:70%;transform:translate(-50%,-50%);}' +
  '[data-mode="light"] body.mood-angry .rs-eyes::before,[data-mode="light"] body.mood-angry .rs-eyes::after,[data-mode="light"] body.mood-happy .rs-eyes::before,[data-mode="light"] body.mood-happy .rs-eyes::after{background:#e7eef6;}' +
  // ── SLEEP: closed-eye slits + floating Zzz ──
  'body.mood-sleep .rs-eyes{background:none!important;background-image:none!important;-webkit-mask:none!important;mask:none!important;}' +
  'body.mood-sleep .rs-eyes::before,body.mood-sleep .rs-eyes::after{content:"";position:absolute;top:50%;width:19cqmin;height:3cqmin;background:#070c15;border-radius:3px;transform:translate(-50%,-50%);}' +
  'body.mood-sleep .rs-eyes::before{left:30%;}' +
  'body.mood-sleep .rs-eyes::after{left:70%;}' +
  '[data-mode="light"] body.mood-sleep .rs-eyes::before,[data-mode="light"] body.mood-sleep .rs-eyes::after{background:#e7eef6;}' +
  // ── sleep FX host (one of 5 picked at random) ──
  '.tk-sfx{position:absolute;inset:0;pointer-events:none;z-index:3;transition:opacity .25s;}' +
  '.tk-sfx.tk-sfx-out{opacity:0;}' +
  // 1 matrix glyphs
  '.tk-sfx .sfx-mtx{position:absolute;font-family:var(--font-body,monospace);font-weight:700;color:var(--accent);text-shadow:0 0 6px rgba(var(--accent-rgb),.9);opacity:0;animation:tk-sfx-mtx 2.4s ease-in forwards;}' +
  '@keyframes tk-sfx-mtx{0%{opacity:0;transform:translate(0,4px) scale(.6);}16%{opacity:1;}72%{opacity:.85;transform:translate(var(--dx,-8px),-34px) scale(1);}88%{opacity:.45;transform:translate(var(--dx,-8px),-42px) scale(1.1);}100%{opacity:0;transform:translate(var(--dx,-8px),-48px) scale(.4);}}' +
  // 2 pixel dust
  '.tk-sfx .sfx-dust{position:absolute;width:4px;height:4px;background:var(--accent);box-shadow:0 0 5px rgba(var(--accent-rgb),.9);opacity:0;animation:tk-sfx-dust 2s ease-out forwards;}' +
  '@keyframes tk-sfx-dust{0%{opacity:0;transform:translate(0,3px) scale(1) rotate(0);}14%{opacity:1;}70%{opacity:1;transform:translate(var(--dx,-6px),-34px) scale(.75) rotate(140deg);}100%{opacity:0;transform:translate(var(--dx,-6px),-46px) scale(0) rotate(220deg);}}' +
  // 3 snore waveform
  '.tk-sfx .sfx-wave{position:absolute;top:-14px;left:50%;transform:translateX(-50%);filter:drop-shadow(0 0 4px rgba(var(--accent-rgb),.8));}' +
  '.tk-sfx .sfx-wave .wl{animation:tk-sfx-wscroll 1.6s linear infinite;}' +
  '@keyframes tk-sfx-wscroll{from{transform:translateX(0);}to{transform:translateX(-40px);}}' +
  // 4 dropped packets
  '.tk-sfx .sfx-pkt{position:absolute;font-family:var(--font-body,monospace);font-weight:700;font-size:9px;letter-spacing:-1px;color:var(--accent);text-shadow:0 0 5px rgba(var(--accent-rgb),.8);opacity:0;animation:tk-sfx-pkt 2.1s ease-in forwards;}' +
  '@keyframes tk-sfx-pkt{0%{opacity:0;transform:translate(0,4px) scale(.6);}14%{opacity:1;}68%{opacity:1;color:var(--accent);transform:translate(var(--dx,-6px),-32px) scale(1);}82%{opacity:1;color:#ff3c3c;text-shadow:0 0 8px rgba(255,60,60,.95);transform:translate(var(--dx,-6px),-36px) scale(1.35);}100%{opacity:0;color:#ff3c3c;transform:translate(var(--dx,-6px),-38px) scale(.2);}}' +
  // 5 CRT standby
  '.tk-sfx .sfx-crt{position:absolute;inset:0;overflow:hidden;}' +
  '.tk-sfx .sfx-crt .cg{position:absolute;inset:0;box-shadow:inset 0 0 14px rgba(var(--accent-rgb),.3);animation:tk-sfx-crtpulse 3s ease-in-out infinite;}' +
  '.tk-sfx .sfx-crt .cs{position:absolute;left:-10%;width:120%;height:8px;background:linear-gradient(180deg,transparent,rgba(var(--accent-rgb),.55),transparent);top:-8px;animation:tk-sfx-crtscan 2.2s linear infinite;}' +
  '.tk-sfx .sfx-crt-lab{position:absolute;top:-13px;left:50%;transform:translateX(-50%);font-family:var(--font-body,monospace);font-size:6px;letter-spacing:2px;color:var(--accent);text-shadow:0 0 5px rgba(var(--accent-rgb),.8);white-space:nowrap;animation:tk-sfx-crtblink 1.4s steps(1) infinite;}' +
  '@keyframes tk-sfx-crtscan{0%{top:-8px;opacity:.2;}10%{opacity:1;}90%{opacity:1;}100%{top:100%;opacity:.2;}}' +
  '@keyframes tk-sfx-crtpulse{0%,100%{opacity:.4;}50%{opacity:1;}}' +
  '@keyframes tk-sfx-crtblink{0%,60%{opacity:1;}61%,100%{opacity:.15;}}' +
  // 6 soap bubbles (rise + pop ring)
  '.tk-sfx .sfx-bub{position:absolute;border-radius:50%;background:radial-gradient(circle at 34% 30%,rgba(255,255,255,.6),rgba(var(--accent-rgb),.14) 60%,transparent 72%);border:1px solid rgba(var(--accent-rgb),.75);box-shadow:0 0 6px rgba(var(--accent-rgb),.5),inset 0 0 3px rgba(255,255,255,.35);opacity:0;animation:tk-sfx-bub 2.4s ease-in forwards;}' +
  '@keyframes tk-sfx-bub{0%{opacity:0;transform:translate(0,4px) scale(.35);}14%{opacity:1;}80%{opacity:.95;transform:translate(var(--dx,-10px),-36px) scale(1);}85%{opacity:1;transform:translate(var(--dx,-10px),-38px) scale(1.08);}86%{opacity:0;transform:translate(var(--dx,-10px),-38px) scale(1.1);}100%{opacity:0;}}' +
  '.tk-sfx .sfx-bub-pop{position:absolute;border-radius:50%;border:1.5px solid rgba(var(--accent-rgb),.9);box-shadow:0 0 6px rgba(var(--accent-rgb),.7);opacity:0;animation:tk-sfx-bubpop .4s ease-out forwards;}' +
  '@keyframes tk-sfx-bubpop{0%{opacity:.95;transform:translate(var(--dx,-10px),0) scale(.5);}100%{opacity:0;transform:translate(var(--dx,-10px),0) scale(2.5);}}' +
  // 7 classic Zzz
  '.tk-sfx .sfx-z{position:absolute;font-family:var(--font-body,monospace);font-weight:700;color:var(--accent);text-shadow:0 0 6px rgba(var(--accent-rgb),.85);opacity:0;animation:tk-sfx-z 2.6s ease-in-out forwards;}' +
  '@keyframes tk-sfx-z{0%{opacity:0;transform:translate(0,3px) rotate(6deg) scale(.6);}18%{opacity:1;}72%{opacity:.85;transform:translate(var(--dx,-14px),-36px) rotate(-10deg) scale(1.1);}100%{opacity:0;transform:translate(var(--dx,-16px),-46px) rotate(-14deg) scale(1.2);}}' +
  // ── AWAKEN: startled wide eyes + jolt + "!" pop ──
  'body.mood-wake .rs-eyes{background:none!important;background-image:none!important;-webkit-mask:none!important;mask:none!important;}' +
  'body.mood-wake .rs-eyes::before,body.mood-wake .rs-eyes::after{content:"";position:absolute;top:46%;width:24cqmin;height:24cqmin;background:#070c15;border-radius:50%;transform:translate(-50%,-50%);animation:tk-eyewake .55s cubic-bezier(.2,1.3,.4,1);}' +
  'body.mood-wake .rs-eyes::before{left:30%;}' +
  'body.mood-wake .rs-eyes::after{left:70%;}' +
  '[data-mode="light"] body.mood-wake .rs-eyes::before,[data-mode="light"] body.mood-wake .rs-eyes::after{background:#e7eef6;}' +
  '@keyframes tk-eyewake{0%{transform:translate(-50%,-50%) scale(.12);}55%{transform:translate(-50%,-50%) scale(1.28);}100%{transform:translate(-50%,-50%) scale(1);}}' +
  '#tk-fab.tk-wake,#tk-head.tk-wake{animation:tk-jolt .8s cubic-bezier(.28,.9,.3,1.2);}' +
  '@keyframes tk-jolt{0%{transform:scale(1);}10%{transform:translateY(3px) scale(1.16,.84);}26%{transform:translateY(-9px) scale(.86,1.16);}40%{transform:translateY(0) scale(1.04,.97);}52%{transform:translateX(-3px);}62%{transform:translateX(3px);}72%{transform:translateX(-2px);}82%{transform:translateX(1px);}100%{transform:none;}}' +
  '.tk-excl{position:absolute;top:-18px;left:50%;font-family:var(--font-display,monospace);font-weight:900;font-size:20px;color:var(--accent);text-shadow:0 0 10px rgba(var(--accent-rgb),.95);pointer-events:none;z-index:4;animation:tk-excl .72s ease-out forwards;}' +
  '@keyframes tk-excl{0%{opacity:0;transform:translateX(-50%) translateY(10px) scale(.3);}28%{opacity:1;transform:translateX(-50%) translateY(-8px) scale(1.35);}52%{transform:translateX(-50%) translateY(-5px) scale(1);}100%{opacity:0;transform:translateX(-50%) translateY(-14px) scale(1);}}' +
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
  '#tk-bubble{position:fixed;right:22px;bottom:100px;max-width:246px;z-index:119;cursor:pointer;background:rgba(11,14,20,.97);border:1px solid rgba(var(--accent-rgb),.55);border-radius:14px;padding:13px 15px;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,.4),0 0 18px rgba(var(--accent-rgb),.38),0 0 40px rgba(var(--accent-rgb),.2);opacity:0;clip-path:inset(50% 0 50% 0 round 3px);transform-origin:center;pointer-events:none;}' +
  '#tk-bubble .tk-b-q{display:block;color:var(--text-primary);font-family:var(--font-prose,"Inter",sans-serif);font-size:.84rem;line-height:1.6;text-shadow:0 1px 4px rgba(0,0,0,.75),0 0 10px rgba(0,0,0,.5);}' +
  '#tk-bubble::after{content:"";position:absolute;bottom:-8px;right:30px;width:14px;height:14px;background:rgba(11,14,20,.97);border-right:1px solid rgba(var(--accent-rgb),.55);border-bottom:1px solid rgba(var(--accent-rgb),.55);transform:rotate(45deg);border-bottom-right-radius:2px;}' +
  '#tk-bubble.show{opacity:1;clip-path:inset(-44px -44px -44px -44px round 16px);pointer-events:auto;animation:tk-b-crt .62s cubic-bezier(.2,.8,.25,1);}' +
  '#tk-bubble.closing{pointer-events:none;animation:tk-b-crt-off .46s cubic-bezier(.4,0,.7,.4) forwards;}' +
  '#tk-bubble .tk-b-scan{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);z-index:6;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,rgba(var(--accent-rgb),1) 18%,#eaf6ff,rgba(var(--accent-rgb),1) 82%,transparent);box-shadow:0 0 18px 2px rgba(var(--accent-rgb),.9);}' +
  '#tk-bubble.show[data-fx="crtline"] .tk-b-scan,#tk-bubble.show[data-fx="crt"] .tk-b-scan,#tk-bubble.show[data-fx="scanbloom"] .tk-b-scan{animation:tk-b-line .62s ease-out;}' +
  '#tk-bubble.show .tk-b-q{animation:tk-b-qin .62s both;}' +
  '#tk-bubble.closing[data-fx="crtline"] .tk-b-scan,#tk-bubble.closing[data-fx="crt"] .tk-b-scan,#tk-bubble.closing[data-fx="scanbloom"] .tk-b-scan{animation:tk-b-line-off .46s ease-in;}' +
  '/* per-FX bubble CLOSE = reverse of the open */' +
  '#tk-bubble.closing[data-fx="crt"]{animation:tk-b-reboot-off .46s cubic-bezier(.4,0,.7,.4) forwards;}' +
  '#tk-bubble.closing[data-fx="crt"] .tk-b-flash{animation:tk-b-flashpow .46s ease-out;}' +
  '#tk-bubble.closing[data-fx="scanbloom"]{animation:tk-b-bloom-off .5s cubic-bezier(.4,0,.7,.4) forwards;}' +
  '#tk-bubble.closing[data-fx="scanbloom"] .tk-b-flash{animation:tk-b-flashbloom-off .5s ease-in;}' +
  '@keyframes tk-b-flashbloom-off{0%{opacity:0;clip-path:inset(0);}20%{opacity:.6;clip-path:inset(0);}55%{opacity:.85;clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0);}100%{opacity:0;clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0);}}' +
  '#tk-bubble.closing[data-fx="corrupt"]{animation:tk-b-corrupt-off .5s both;}' +
  '#tk-bubble.closing[data-fx="matrixdrop"]{animation:tk-b-mdrop .7s ease-in forwards;}' +
  '@keyframes tk-b-mdrop{0%{opacity:1;transform:translateY(0);}72%{opacity:.7;}100%{opacity:0;transform:translateY(34px);}}' +
  '@keyframes tk-b-reboot-off{0%{opacity:1;clip-path:inset(-44px -44px -44px -44px round 16px);filter:brightness(1);}28%{filter:brightness(1.8);}60%{clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);filter:brightness(2.1);}82%{clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);opacity:1;filter:brightness(1.5);}100%{clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);opacity:0;filter:brightness(1);}}' +
  '@keyframes tk-b-bloom-off{0%{opacity:1;clip-path:inset(-44px -44px -44px -44px round 16px);}55%{opacity:1;clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);}100%{opacity:0;clip-path:inset(calc(50% - 1.5px) -44px calc(50% - 1.5px) -44px round 2px);}}' +
  '@keyframes tk-b-corrupt-off{0%{opacity:1;transform:none;clip-path:inset(-44px -44px -44px -44px round 16px);}16%{transform:translate(7px,0) skewX(4deg);clip-path:inset(8% 0 55% 0 round 16px);}32%{transform:translate(-9px,2px) skewX(-5deg);clip-path:inset(50% 0 10% 0 round 16px);}52%{transform:translate(6px,-1px);clip-path:inset(22% 0 40% 0 round 16px);}72%{opacity:.55;transform:translate(-5px,0) skewX(6deg);}100%{opacity:0;transform:translate(11px,0) skewX(-8deg);}}' +
  '#tk-bubble.closing .tk-b-q{animation:tk-b-qout .46s both;}' +
  '#tk-bubble:hover{box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 18px rgba(var(--accent-rgb),.24);}' +
  'body.tk-open #tk-bubble{opacity:0!important;pointer-events:none!important;}' +
  '[data-mode="light"] #tk-bubble{background:rgba(244,247,251,.98);border-color:rgba(var(--accent-rgb),.5);box-shadow:0 10px 30px rgba(60,80,120,.16),0 0 18px rgba(var(--accent-rgb),.3),0 0 40px rgba(var(--accent-rgb),.16);}' +
  '[data-mode="light"] #tk-bubble .tk-b-q{color:var(--text-primary);text-shadow:none;}' +
  '[data-mode="light"] #tk-bubble::after{background:rgba(244,247,251,.98);border-right-color:rgba(var(--accent-rgb),.5);border-bottom-color:rgba(var(--accent-rgb),.5);}' +
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
  '/* CRT REBOOT bubble */' +
  '#tk-bubble.show[data-fx="crt"]{animation:tk-b-crtreboot .62s cubic-bezier(.2,.8,.25,1);}' +
  '@keyframes tk-b-crtreboot{0%{clip-path:inset(calc(50% - 1px) -44px calc(50% - 1px) -44px round 2px);transform:scaleX(.4);filter:brightness(1.55);}10%{clip-path:inset(calc(50% - 1px) -44px calc(50% - 1px) -44px round 2px);transform:scaleX(1);filter:brightness(1.55);}44%{clip-path:inset(calc(50% - 1px) -44px calc(50% - 1px) -44px round 2px);transform:scaleX(1);filter:brightness(1.55);}68%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:scaleY(1.06);filter:brightness(1.3);}84%{transform:scaleY(.99);filter:brightness(1.08);}100%{clip-path:inset(-44px -44px -44px -44px round 16px);transform:none;filter:none;}}' +
  '/* SCANLINE BLOOM bubble */' +
  '#tk-bubble.show[data-fx="scanbloom"]{animation:tk-b-bloom .6s cubic-bezier(.2,.8,.25,1);}' +
  '@keyframes tk-b-bloom{0%{clip-path:inset(calc(50% - 1px) -44px calc(50% - 1px) -44px round 2px);}34%{clip-path:inset(calc(50% - 1px) -44px calc(50% - 1px) -44px round 2px);}70%{clip-path:inset(-44px -44px -44px -44px round 16px);}100%{clip-path:inset(-44px -44px -44px -44px round 16px);}}' +
  '#tk-bubble .tk-b-flash,#tk-panel .tk-b-flash{position:absolute;inset:0;border-radius:14px;background:#eaf6ff;opacity:0;pointer-events:none;z-index:6;}' +
  '#tk-panel .tk-b-flash{border-radius:16px;}' +
  '#tk-bubble.show[data-fx="crt"] .tk-b-flash{animation:tk-b-flashpop .62s ease-out;}' +
  '@keyframes tk-b-flashpow{0%{opacity:0;}28%{opacity:0;}40%{opacity:.42;}58%{opacity:.1;}100%{opacity:0;}}' +
  '@keyframes tk-b-flashpop{0%,58%{opacity:0;}70%{opacity:.42;}82%{opacity:.12;}100%{opacity:0;}}' +
  '#tk-bubble.show[data-fx="scanbloom"] .tk-b-flash{animation:tk-b-flashbloom .6s ease-out;}' +
  '@keyframes tk-b-flashbloom{0%{opacity:0;clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0);}34%{opacity:.85;clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0);}72%{opacity:.5;clip-path:inset(0);}100%{opacity:0;clip-path:inset(0);}}' +
  '/* DATA CORRUPTION bubble */' +
  '#tk-bubble.show[data-fx="corrupt"]{animation:tk-b-corrupt .52s both;}' +
  '@keyframes tk-b-corrupt{0%{opacity:0;transform:translate(8px,0) skewX(-8deg);}12%{opacity:1;transform:translate(-9px,2px) skewX(6deg);clip-path:inset(18% 0 46% 0 round 16px);}26%{transform:translate(7px,-2px) skewX(-4deg);clip-path:inset(52% 0 8% 0 round 16px);}40%{transform:translate(-5px,1px);clip-path:inset(8% 0 62% 0 round 16px);}54%{transform:translate(4px,0);clip-path:inset(-44px -44px -44px -44px round 16px);}70%{transform:translate(-3px,0);}85%{transform:translate(2px,0);}100%{transform:none;clip-path:inset(-44px -44px -44px -44px round 16px);}}' +
  '#tk-bubble.show[data-fx="corrupt"] .tk-b-q{animation:tk-b-qin .5s both,tk-b-rgb .5s steps(1);}' +
  '@keyframes tk-b-rgb{0%{text-shadow:2px 0 rgba(255,0,60,.9),-2px 0 rgba(0,200,255,.9);}40%{text-shadow:-2px 0 rgba(255,0,60,.9),2px 0 rgba(0,200,255,.9);}70%{text-shadow:1px 0 rgba(255,0,60,.6),-1px 0 rgba(0,200,255,.6);}100%{text-shadow:0 1px 4px rgba(0,0,0,.75),0 0 10px rgba(0,0,0,.5);}}' +
  '/* MATRIX RAIN DROP bubble */' +
  '#tk-bubble.show[data-fx="matrixdrop"]{background:transparent;padding:0;animation:tk-b-fadein .28s ease-out;}' +
  '#tk-bubble .tk-b-fill{position:relative;background:rgba(11,14,20,.97);border-radius:13px;padding:13px 15px;overflow:hidden;box-sizing:border-box;}' +
  '#tk-bubble .tk-b-fill .tk-b-q{position:relative;z-index:1;}' +
  '#tk-bubble.show[data-fx="matrixdrop"] .tk-b-q{animation:tk-b-qin2 .58s both;}' +
  '@keyframes tk-b-qin2{0%,55%{opacity:0;}82%{opacity:1;}100%{opacity:1;}}' +
  '.tk-b-mtxc{position:absolute;inset:0;width:100%;height:100%;border-radius:14px;pointer-events:none;z-index:5;}' +
  '#tk-panel .tk-b-mtxc{border-radius:16px;}' +
  '/* RADIAL PULSE bubble */' +
  '#tk-bubble.show[data-fx="pulse"]{animation:tk-b-pop .5s cubic-bezier(.2,1.4,.4,1);}' +
  '@keyframes tk-b-pop{0%{opacity:0;transform:scale(.2);}55%{opacity:1;transform:scale(1.07);}78%{transform:scale(.97);}100%{transform:scale(1);}}' +
  '.tk-b-rings{position:absolute;right:26px;bottom:-6px;z-index:4;pointer-events:none;}' +
  '.tk-b-rings i{position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid rgba(var(--accent-rgb),.9);opacity:0;animation:tk-b-ring .6s ease-out forwards;}' +
  '.tk-b-rings i:nth-child(2){animation-delay:.14s;}' +
  '@keyframes tk-b-ring{0%{opacity:.85;transform:scale(.1);}100%{opacity:0;transform:scale(7);}}' +
  '/* PCB FLOOD FILL bubble */' +
  '#tk-bubble.show[data-fx="pcb"]{animation:tk-b-fadein .38s ease-out;}' +
  '.tk-b-pcb{position:absolute;inset:0;border-radius:14px;overflow:hidden;z-index:5;pointer-events:none;background:radial-gradient(circle at 88% 100%,rgba(var(--accent-rgb),.5),rgba(var(--accent-rgb),0) 60%);opacity:0;animation:tk-b-pcbflood .6s ease-out;}' +
  '@keyframes tk-b-pcbflood{0%{opacity:0;background-size:20% 20%;}30%{opacity:.9;}100%{opacity:0;background-size:190% 190%;}}' +
  '.tk-b-node{position:absolute;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:rgba(var(--accent-rgb),1);box-shadow:0 0 8px 2px rgba(var(--accent-rgb),.9);opacity:0;animation:tk-b-node .55s ease-out;}' +
  '.tk-b-pcb .tk-b-node:nth-child(2){animation-delay:.1s;}' +
  '.tk-b-pcb .tk-b-node:nth-child(3){animation-delay:.2s;}' +
  '@keyframes tk-b-node{0%{opacity:0;transform:scale(.3);}40%{opacity:1;transform:scale(1.4);}100%{opacity:0;transform:scale(1);}}' +
  '/* shared fade for overlay-driven bubbles */' +
  '@keyframes tk-b-fadein{0%{opacity:0;}100%{opacity:1;}}' +
  // bright bloom bar flashing along the collapsing/expanding hairline
  '.tk-scan{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);z-index:6;pointer-events:none;opacity:0;' +
    'background:linear-gradient(90deg,transparent,rgba(var(--accent-rgb),1) 18%,#eaf6ff,rgba(var(--accent-rgb),1) 82%,transparent);' +
    'box-shadow:0 0 18px 2px rgba(var(--accent-rgb),.9);}' +
  '#tk-panel.open[data-fx="crtline"] .tk-scan,#tk-panel.open[data-fx="crt"] .tk-scan,#tk-panel.open[data-fx="scanbloom"] .tk-scan{animation:tk-b-line .58s ease-out;}' +
  '/* ---- per-FX chat panel open (mirrors the theme transitions) ---- */' +
  '#tk-panel .tk-p-fx{position:absolute;inset:0;pointer-events:none;z-index:7;border-radius:16px;overflow:hidden;}' +
  '#tk-panel.open[data-fx="crt"]{animation:tk-panel-reboot .58s cubic-bezier(.2,.9,.3,1);}' +
  '@keyframes tk-panel-reboot{0%{clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0 round 2px);transform:scaleX(.4);filter:brightness(1.5);}10%{clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0 round 2px);transform:scaleX(1);filter:brightness(1.5);}44%{clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0 round 2px);transform:scaleX(1);filter:brightness(1.5);}68%{clip-path:inset(0 round 16px);transform:scaleY(1.04);filter:brightness(1.28);}84%{transform:scaleY(.994);filter:brightness(1.06);}100%{clip-path:inset(0 round 16px);transform:none;filter:none;}}' +
  '#tk-panel.open[data-fx="crt"] .tk-p-fx .tk-b-flash{animation:tk-b-flashpop .58s ease-out;}' +
  '#tk-panel.open[data-fx="scanbloom"]{animation:tk-panel-bloom .6s cubic-bezier(.2,.8,.25,1);}' +
  '@keyframes tk-panel-bloom{0%{clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0 round 2px);}34%{clip-path:inset(calc(50% - 1px) 0 calc(50% - 1px) 0 round 2px);}70%{clip-path:inset(0 round 16px);}100%{clip-path:inset(0 round 16px);}}' +
  '#tk-panel.open[data-fx="scanbloom"] .tk-p-fx .tk-b-flash{animation:tk-b-flashbloom .6s ease-out;}' +
  '#tk-panel.open[data-fx="corrupt"]{animation:tk-panel-corrupt .56s both;}' +
  '@keyframes tk-panel-corrupt{0%{opacity:0;transform:translate(10px,0) skewX(-6deg);}12%{opacity:1;transform:translate(-11px,3px) skewX(5deg);clip-path:inset(18% 0 46% 0 round 16px);}26%{transform:translate(9px,-3px) skewX(-3deg);clip-path:inset(52% 0 8% 0 round 16px);}40%{transform:translate(-6px,1px);clip-path:inset(8% 0 62% 0 round 16px);}54%{transform:translate(5px,0);clip-path:inset(0 round 16px);}70%{transform:translate(-3px,0);}85%{transform:translate(2px,0);}100%{transform:none;clip-path:inset(0 round 16px);}}' +
  '#tk-panel.open[data-fx="matrixdrop"],#tk-panel.open[data-fx="pcb"]{animation:tk-panel-fadein .34s ease-out;}' +
  '@keyframes tk-panel-fadein{0%{opacity:0;}100%{opacity:1;}}' +
  '#tk-panel.open[data-fx="pulse"]{animation:tk-panel-pop .54s cubic-bezier(.2,1.3,.4,1);}' +
  '@keyframes tk-panel-pop{0%{opacity:0;transform:scale(.3);}55%{opacity:1;transform:scale(1.04);}80%{transform:scale(.99);}100%{transform:scale(1);}}' +
  '#tk-panel .tk-b-rings{left:50%;top:44%;right:auto;bottom:auto;}' +
  '#tk-panel .tk-b-rings i{animation-name:tk-b-ring-big;}' +
  '@keyframes tk-b-ring-big{0%{opacity:.85;transform:scale(.1);}100%{opacity:0;transform:scale(16);}}' +
  '#tk-panel .tk-b-rings i:nth-child(3){animation-delay:.28s;}' +
  '.tk-b-pcb .tk-b-node:nth-child(4){animation-delay:.3s;}' +
  '.tk-b-pcb .tk-b-node:nth-child(5){animation-delay:.4s;}' +
  '.tk-b-pcb .tk-b-node:nth-child(6){animation-delay:.5s;}' +
  '#tk-panel.closing[data-fx="crtline"] .tk-scan,#tk-panel.closing[data-fx="crt"] .tk-scan,#tk-panel.closing[data-fx="scanbloom"] .tk-scan{animation:tk-b-line-off .44s ease-in;}' +
  '/* per-FX chat panel CLOSE = reverse of the open */' +
  '#tk-panel.closing[data-fx="crt"]{animation:tk-panel-reboot-off .5s cubic-bezier(.4,0,.7,.4) forwards;}' +
  '#tk-panel.closing[data-fx="crt"] .tk-p-fx .tk-b-flash{animation:tk-b-flashpow .5s ease-out;}' +
  '#tk-panel.closing[data-fx="scanbloom"]{animation:tk-panel-bloom-off .54s cubic-bezier(.4,0,.7,.4) forwards;}' +
  '#tk-panel.closing[data-fx="scanbloom"] .tk-p-fx .tk-b-flash{animation:tk-b-flashbloom-off .54s ease-in;}' +
  '#tk-panel.closing[data-fx="corrupt"]{animation:tk-panel-corrupt-off .54s both;}' +
  '#tk-panel.closing[data-fx="matrixdrop"]{animation:tk-panel-mdrop .8s ease-in forwards;}' +
  '@keyframes tk-panel-mdrop{0%{opacity:1;transform:translateY(0);}70%{opacity:.7;}100%{opacity:0;transform:translateY(46px);}}' +
  '@keyframes tk-panel-reboot-off{0%{opacity:1;clip-path:inset(0 0 0 0 round 16px);filter:brightness(1);}28%{filter:brightness(1.7);}60%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);filter:brightness(2);}82%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);opacity:1;filter:brightness(1.5);}100%{clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);opacity:0;filter:brightness(1);}}' +
  '@keyframes tk-panel-bloom-off{0%{opacity:1;clip-path:inset(0 0 0 0 round 16px);}55%{opacity:1;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);}100%{opacity:0;clip-path:inset(calc(50% - 1.5px) 0 calc(50% - 1.5px) 0 round 2px);}}' +
  '@keyframes tk-panel-corrupt-off{0%{opacity:1;transform:none;clip-path:inset(0 0 0 0 round 16px);}16%{transform:translate(9px,0) skewX(4deg);clip-path:inset(8% 0 55% 0 round 16px);}32%{transform:translate(-11px,3px) skewX(-5deg);clip-path:inset(50% 0 10% 0 round 16px);}52%{transform:translate(7px,-1px);clip-path:inset(22% 0 40% 0 round 16px);}72%{opacity:.55;transform:translate(-6px,0) skewX(6deg);}100%{opacity:0;transform:translate(12px,0) skewX(-8deg);}}' +
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
  '.tk-gear{margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;line-height:1;padding:5px 7px;border-radius:6px;transition:color .2s,background .2s,transform .3s;}' +
  '.tk-gear:hover{color:var(--accent);background:rgba(var(--accent-rgb),.1);transform:rotate(40deg);}' +
  '.tk-dev{position:absolute;inset:0;z-index:8;background:rgba(10,12,18,.985);backdrop-filter:blur(4px);display:flex;flex-direction:column;opacity:0;pointer-events:none;transition:opacity .18s;}' +
  '.tk-dev.show{opacity:1;pointer-events:auto;}' +
  '.tk-dev-h{display:flex;align-items:center;gap:8px;padding:13px 14px;border-bottom:1px solid var(--border);font-family:var(--font-display,"Orbitron",monospace);font-size:.7rem;letter-spacing:2px;color:var(--accent);}' +
  '.tk-dev-h .tk-dev-x{margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1rem;border-radius:6px;padding:2px 7px;line-height:1;}' +
  '.tk-dev-h .tk-dev-x:hover{color:var(--accent);background:rgba(var(--accent-rgb),.1);}' +
  '.tk-dev-list{flex:1;overflow-y:auto;padding:10px 14px 16px;scrollbar-width:thin;}' +
  '.tk-dev-cat{font-family:var(--font-display,"Orbitron",monospace);font-size:.58rem;letter-spacing:2px;color:var(--text-muted);margin:15px 0 7px;text-transform:uppercase;}' +
  '.tk-dev-cat:first-child{margin-top:2px;}' +
  '.tk-dev-row{display:flex;align-items:center;gap:5px;padding:4px 0;font-size:.8rem;}' +
  '.tk-dev-row .tk-dev-lbl{margin-left:auto;color:var(--text-secondary);text-align:right;padding-left:10px;}' +
  '.tk-dev-row kbd{font-family:var(--font-body,monospace);font-size:.64rem;line-height:1;padding:3px 6px;border:1px solid rgba(var(--accent-rgb),.4);border-bottom-width:2px;border-radius:4px;background:rgba(var(--accent-rgb),.08);color:var(--accent);white-space:nowrap;}' +
  '.tk-dev-row .plus{color:var(--text-muted);font-size:.6rem;}' +
  '.tk-body{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:11px;scrollbar-width:thin;}' +
  '.tk-msg{max-width:82%;padding:9px 12px;border-radius:12px;font-family:var(--font-prose);font-size:.82rem;' +
    'line-height:1.5;animation:tk-pop .25s ease;}' +
  '.tk-msg.bot{align-self:flex-start;background:rgba(var(--accent-rgb),.09);border:1px solid rgba(var(--accent-rgb),.18);' +
    'color:var(--text-primary);border-bottom-left-radius:4px;}' +
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

    // --- ghost face: V2 (solid) only — other versions unwired ---
    var GKEY='yanga_ghost';
    function setGhost(){
      document.body.classList.remove('gh-outline','gh-neon');
      document.body.classList.add('gh-solid');
      try{ localStorage.setItem(GKEY,'solid'); }catch(e){}
      var d=document.getElementById('gh-dev'); if(d) d.textContent='ghost: v2';
      return 'solid'; }
    setGhost();
    window.ghostFace=function(){ return setGhost(); };
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
        '<button class="tk-gear" type="button" aria-label="Dev shortcuts" title="Dev shortcuts">\u2699</button>' +
        '<button class="tk-close" type="button" aria-label="Close chat">✕</button>' +
      '</div>' +
      '<div class="tk-body" id="tk-body"></div>' +
      '<form class="tk-input" id="tk-form">' +
        '<input id="tk-text" type="text" autocomplete="off" placeholder="Ask ghost…">' +
        '<button class="tk-send" type="submit" aria-label="Send">➔</button>' +
      '</form>' +
      '<div class="tk-dev" id="tk-dev"><div class="tk-dev-h">DEV SHORTCUTS<button class="tk-dev-x" type="button" aria-label="Close">✕</button></div><div class="tk-dev-list" id="tk-dev-list"></div></div>';
    document.body.appendChild(panel);

    var body = panel.querySelector('#tk-body');
    var form = panel.querySelector('#tk-form');
    var text = panel.querySelector('#tk-text');
    var seeded = false;

    // ---- dev shortcuts cheatsheet (gear) ----
    (function () {
      var DEV = [
        ['Glitches', [
          ['Shift','1','RGB split'],['Shift','2','Slice'],['Shift','3','Tear'],
          ['Shift','4','Flicker'],['Shift','5','Roll'],['Shift','6','Block'],
          ['Shift','7','Static'],['Shift','8','Jitter'],['Shift','9','Echo'],
          ['Shift','0','Invert'],['Shift','C','Camouflage']
        ]],
        ['Theme', [
          ['T',null,'Cycle colour (blue / green / red)'],
          ['Shift','T','Cycle transition style']
        ]],
        ['Ghost', [
          ['Shift','G','Cycle ghost look (LED / CRT / neon\u2026)'],
          ['Shift','S','Sleep \u00b7 step sleep FX (hover to wake)']
        ]]
      ];
      var html = '';
      DEV.forEach(function (grp) {
        html += '<div class="tk-dev-cat">' + grp[0] + '</div>';
        grp[1].forEach(function (row) {
          var keys = '<kbd>' + row[0] + '</kbd>' + (row[1] ? '<span class="plus">+</span><kbd>' + row[1] + '</kbd>' : '');
          html += '<div class="tk-dev-row">' + keys + '<span class="tk-dev-lbl">' + row[2] + '</span></div>';
        });
      });
      panel.querySelector('#tk-dev-list').innerHTML = html;
      var dev = panel.querySelector('#tk-dev');
      panel.querySelector('.tk-gear').addEventListener('click', function () { dev.classList.add('show'); });
      panel.querySelector('.tk-dev-x').addEventListener('click', function () { dev.classList.remove('show'); });
    })();

    // ---- V2 ghost visual variants (Shift+G cycles) ----
    var GVIS = ['', 'gv-led', 'gv-volume', 'gv-neon', 'gv-crt', 'gv-pixel', 'gv-holo', 'gv-inset'];
    var GVNAME = { '':'CURRENT', 'gv-led':'LED MATRIX', 'gv-volume':'VOLUMETRIC', 'gv-neon':'NEON OUTLINE', 'gv-crt':'CRT SCREEN', 'gv-pixel':'CHUNKY PIXEL', 'gv-holo':'HOLO GLASS', 'gv-inset':'DEEP INSET' };
    function tkToast(msg){
      var el=document.getElementById('tk-toast');
      if(!el){ el=document.createElement('div'); el.id='tk-toast';
        el.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:131;font-family:var(--font-body,monospace);font-size:12px;letter-spacing:2px;color:var(--accent);background:rgba(8,12,18,.92);border:1px solid rgba(var(--accent-rgb),.5);border-radius:5px;padding:6px 12px;pointer-events:none;opacity:0;transition:opacity .2s;'; document.body.appendChild(el); }
      el.textContent=msg; el.style.opacity='1'; clearTimeout(el.__t); el.__t=setTimeout(function(){ el.style.opacity='0'; },1300);
    }
    // ---- faithful SVG ghost bodies (ported from the concept board, eyes excluded) ----
    var GBP = "M12,54 a38,38 0 0 1 76,0 L88,93 l-12.7,-8 l-12.7,8 l-12.7,-8 l-12.7,8 l-12.7,-8 l-12.5,8 Z";
    function _accColors(){
      var raw='0,168,255';
      try{ raw=(getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb')||raw).trim(); }catch(e){}
      var p=raw.split(',').map(function(x){return parseInt(x,10)||0;});
      if(p.length<3) p=[0,168,255];
      function mix(a,b,t){return [Math.round(a[0]+(b[0]-a[0])*t),Math.round(a[1]+(b[1]-a[1])*t),Math.round(a[2]+(b[2]-a[2])*t)];}
      function rs(a){return 'rgb('+a[0]+','+a[1]+','+a[2]+')';}
      var W=[255,255,255],K=[0,0,0];
      return { acc:rs(p), L:rs(mix(p,W,.42)), XL:rs(mix(p,W,.62)), D:rs(mix(p,K,.42)) };
    }
    function renderGhostBody(variant, id){
      var C=_accColors(), acc=C.acc, L=C.L, XL=C.XL, D=C.D;
      var clip='<clipPath id="c'+id+'"><path d="'+GBP+'"/></clipPath>';
      switch(variant){
       case 'gv-led':
         return '<defs>'+clip+
           '<pattern id="p'+id+'" width="5.4" height="5.4" patternUnits="userSpaceOnUse"><circle cx="2.7" cy="2.7" r="1.5" fill="'+acc+'"/></pattern>'+
           '<filter id="f'+id+'" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
           '<path d="'+GBP+'" fill="#070c15"/>'+
           '<g clip-path="url(#c'+id+')" filter="url(#f'+id+')"><rect width="100" height="100" fill="url(#p'+id+')"/></g>';
       case 'gv-volume':
         return '<defs>'+clip+
           '<linearGradient id="lg'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+L+'"/><stop offset=".5" stop-color="'+acc+'"/><stop offset="1" stop-color="'+D+'"/></linearGradient>'+
           '<radialGradient id="hl'+id+'" cx="50%" cy="20%" r="55%"><stop offset="0" stop-color="#ffffff" stop-opacity=".45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>'+
           '<pattern id="p'+id+'" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill="#0a1626" opacity=".45"/></pattern></defs>'+
           '<path d="'+GBP+'" fill="url(#lg'+id+')"/>'+
           '<rect width="100" height="100" fill="url(#p'+id+')" clip-path="url(#c'+id+')"/>'+
           '<rect width="100" height="100" fill="url(#hl'+id+')" clip-path="url(#c'+id+')"/>';
       case 'gv-neon':
         return '<defs>'+clip+
           '<pattern id="p'+id+'" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.8" fill="'+acc+'" opacity=".28"/></pattern></defs>'+
           '<rect width="100" height="100" fill="url(#p'+id+')" clip-path="url(#c'+id+')"/>'+
           '<path d="'+GBP+'" fill="none" stroke="'+L+'" stroke-width="2.4"/>'+
           '<path d="'+GBP+'" fill="none" stroke="'+acc+'" stroke-width="5" opacity=".35"/>';
       case 'gv-crt':
         return '<defs>'+clip+
           '<pattern id="p'+id+'" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill="#0a0d14" opacity=".5"/></pattern>'+
           '<pattern id="sl'+id+'" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1.2" y="0" fill="#00121f" opacity=".55"/></pattern>'+
           '<radialGradient id="vg'+id+'" cx="50%" cy="46%" r="60%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#001018" stop-opacity=".6"/></radialGradient></defs>'+
           '<path d="'+GBP+'" fill="'+acc+'"/>'+
           '<rect width="100" height="100" fill="url(#p'+id+')" clip-path="url(#c'+id+')"/>'+
           '<rect width="100" height="100" fill="url(#sl'+id+')" clip-path="url(#c'+id+')"/>'+
           '<rect width="100" height="100" fill="url(#vg'+id+')" clip-path="url(#c'+id+')"/>';
       case 'gv-pixel':
         return '<defs>'+clip+
           '<pattern id="p'+id+'" width="9" height="9" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="7" height="7" rx="1" fill="'+acc+'"/></pattern></defs>'+
           '<path d="'+GBP+'" fill="#0a0d14"/>'+
           '<g clip-path="url(#c'+id+')"><rect width="100" height="100" fill="url(#p'+id+')"/></g>';
       case 'gv-holo':
         return '<defs>'+clip+
           '<linearGradient id="lg'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+acc+'" stop-opacity=".38"/><stop offset="1" stop-color="'+acc+'" stop-opacity=".12"/></linearGradient>'+
           '<pattern id="p'+id+'" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5" fill="'+XL+'" opacity=".5"/></pattern></defs>'+
           '<path d="'+GBP+'" fill="url(#lg'+id+')"/>'+
           '<rect width="100" height="100" fill="url(#p'+id+')" clip-path="url(#c'+id+')"/>'+
           '<path d="'+GBP+'" fill="none" stroke="'+XL+'" stroke-width="1.6" opacity=".9"/>';
       case 'gv-inset':
         return '<defs>'+clip+
           '<linearGradient id="bv'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+L+'"/><stop offset="1" stop-color="'+D+'"/></linearGradient>'+
           '<pattern id="p'+id+'" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill="#08131f" opacity=".5"/></pattern></defs>'+
           '<path d="'+GBP+'" fill="url(#bv'+id+')"/>'+
           '<rect width="100" height="100" fill="url(#p'+id+')" clip-path="url(#c'+id+')"/>'+
           '<path d="'+GBP+'" fill="none" stroke="#0a1622" stroke-width="3" opacity=".5" clip-path="url(#c'+id+')"/>'+
           '<path d="'+GBP+'" fill="none" stroke="'+L+'" stroke-width="1.4" opacity=".8"/>';
       default: return '';
      }
    }
    var _bodyN=0;
    function rerenderBodies(){
      var v=curGhostVis();
      var list=document.querySelectorAll('.rs-body');
      for(var i=0;i<list.length;i++){
        list[i].innerHTML = v ? renderGhostBody(v, (++_bodyN)) : '';
      }
    }
    function setGhostVis(v){
      document.body.classList.remove('gv-led','gv-volume','gv-neon','gv-crt','gv-pixel','gv-holo','gv-inset');
      if(v) document.body.classList.add(v);
      document.body.classList.toggle('gh-hasbody', !!v);
      try{ localStorage.setItem('yanga_ghostvis', v); }catch(e){}
      rerenderBodies();
      return v;
    }
    function curGhostVis(){ try{ return localStorage.getItem('yanga_ghostvis')||''; }catch(e){ return ''; } }
    setGhostVis(curGhostVis());
    try{ new MutationObserver(function(){ rerenderBodies(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(e){}
    window.ghostVis = function(v){
      if(v==='cycle'||v==null){ v = GVIS[(GVIS.indexOf(curGhostVis())+1)%GVIS.length]; }
      else if(GVIS.indexOf(v)<0){ v=''; }
      setGhostVis(v); tkToast('GHOST > '+GVNAME[v]); return v;
    };

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
      if (window.__ghostSleeping) { tX = 0; tY = 0; }   // eyes stay put while asleep
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
      panel.classList.remove('closing'); panel.style.clipPath='';
      var _pfx = curThemeFx();
      panel.setAttribute('data-fx', _pfx);
      var _host = panel.querySelector('.tk-p-fx');
      if(!_host){ _host=document.createElement('div'); _host.className='tk-p-fx'; panel.appendChild(_host); }
      _host.innerHTML = fxMarkup(_pfx, true);
      if(_pfx==='matrixdrop') runMatrix(_host.querySelector('.tk-b-mtxc'), panel, {reveal:'in', radius:16, slow:2});
      panel.classList.add('open');
      document.body.classList.add('tk-open');
      if (!seeded) { seeded = true; GREETING.forEach(function (g, i) { addMsg('bot', g, 260 + i * 550); }); }
      setTimeout(function () { text.focus(); }, 300);
    }
    function close() {
      if (!panel.classList.contains('open')) return;
      var _cfx = panel.getAttribute('data-fx');
      panel.classList.add('closing');      // faster reverse timing
      panel.classList.remove('open');      // fade + clip back up
      document.body.classList.remove('tk-open');  // head eases back in
      if(_cfx==='matrixdrop'){ var _cv=panel.querySelector('.tk-b-mtxc'); if(_cv) runMatrix(_cv, null, {reveal:null, slow:1.4}); }
      // a small acknowledgment blink as it settles
      setTimeout(function () {
        fab.classList.add('tk-blink');
        setTimeout(function () { fab.classList.remove('tk-blink'); }, 150);
      }, 160);
      setTimeout(function () { panel.classList.remove('closing'); }, _cfx==='matrixdrop'?900:480);
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
      if (e.code === 'KeyG') { e.preventDefault(); window.ghostVis('cycle'); return; }
      if (e.code === 'KeyS') { e.preventDefault(); window.__ghostCycleSleep(); return; }  // Shift+S cycles sleep FX; hover wakes
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
    function curThemeFx(){ try{ return localStorage.getItem('yanga_themefx') || 'crtline'; }catch(e){ return 'crtline'; } }
    function fxMarkup(fx, big){
      if(fx==='matrixdrop'){ return '<canvas class="tk-b-mtxc"></canvas>'; }
      if(fx==='pcb'){ var pos=big?[[16,22],[80,26],[40,50],[24,72],[68,66],[52,88]]:[[16,30],[80,34],[44,74]];
        var s3='<span class="tk-b-pcb">'; for(var k=0;k<pos.length;k++) s3+='<i class="tk-b-node" style="left:'+pos[k][0]+'%;top:'+pos[k][1]+'%;"></i>'; return s3+'</span>'; }
      if(fx==='crt'||fx==='scanbloom'){ return '<span class="tk-b-flash"></span>'; }
      return '';
    }
    // canvas matrix rain (same look as the theme MATRIX RAIN DROP). opts:{slow,reveal:'in'|'out',radius}
    // when reveal is set, the surface clip-reveals in sync with the rain front (bubble/panel forms from the rain).
    function runMatrix(canvas, container, opts){
      if(!canvas) return; opts=opts||{};
      var slow=opts.slow||1, mode=opts.reveal||null, radius=(opts.radius!=null?opts.radius:14);
      var rect=canvas.getBoundingClientRect();
      var W=Math.max(1,Math.round(rect.width)), H=Math.max(1,Math.round(rect.height));
      var dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=W*dpr; canvas.height=H*dpr;
      var ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
      var rgb=[0,168,255]; try{ var raw=getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
        if(raw){ rgb=raw.split(',').map(function(x){return parseInt(x,10)||0;}); } }catch(e){}
      var R=rgb[0],Gc=rgb[1],B=rgb[2], fontSize=12, cols=Math.max(1,Math.floor(W/fontSize));
      var CH='\u30a2\u30a4\u30a6\u30a8\u30aa\u30ab\u30ad\u30af\u30b1\u30b3\u30b5\u30b7\u30b9\u30bb\u30bd\u30bf\u30c1\u30c4\u30c6\u30c8\u30ca\u30cb\u30cc\u30cd\u30ce\u30cf\u30d2\u30d5\u30d8\u30db\u30de\u30df\u30e0\u30e1\u30e2\u30e4\u30e6\u30e8\u30e9\u30ea\u30eb\u30ec\u30ed\u30ef\u30f2\u30f30123456789@#$%&*+=';
      var trail=Math.min(12,Math.max(5,Math.round(H/26))), chars=[]; for(var i=0;i<cols;i++) chars.push({});
      var st=performance.now(), pxPerMs=H/(360*slow), settle=180;
      var totalRows=Math.ceil(H/fontSize)+trail+2, dur=totalRows*fontSize/pxPerMs + settle;
      function setClip(frac){ if(!container||!mode) return;
        container.style.clipPath = (mode==='in')
          ? 'inset(0 0 '+((1-frac)*100).toFixed(1)+'% 0 round '+radius+'px)'
          : 'inset('+(frac*100).toFixed(1)+'% 0 0 0 round '+radius+'px)'; }
      if(mode) setClip(0);
      function frame(now){ if(!canvas.isConnected){ if(container&&mode) container.style.clipPath=''; return; }
        var el=now-st;
        if(el>dur){ ctx.clearRect(0,0,W,H); if(container&&mode){ container.style.clipPath = (mode==='in') ? '' : 'inset(100% 0 0 0 round '+radius+'px)'; } return; }
        ctx.clearRect(0,0,W,H); ctx.font=fontSize+'px monospace';
        var fade= el>dur-settle ? Math.max(0,1-(el-(dur-settle))/settle) : 1;
        var hr=((el*pxPerMs)/fontSize)|0;
        for(var i2=0;i2<cols;i2++){ var cc=chars[i2];
          for(var j=0;j<trail;j++){ var row=hr-j; if(row<0) continue; var y=row*fontSize; if(y>H+fontSize) continue;
            if(cc[row]===undefined || Math.random()<0.05) cc[row]=CH[Math.random()*CH.length|0];
            var al=(j===0?1:(1-j/trail))*fade*0.55; if(al<0.015) continue;
            ctx.fillStyle='rgba('+R+','+Gc+','+B+','+al.toFixed(2)+')';
            ctx.fillText(cc[row], i2*fontSize, y);
          } }
        if(mode) setClip(Math.min(1,(hr*fontSize)/H));
        requestAnimationFrame(frame);
      } requestAnimationFrame(frame);
    }
    function showBubble(auto) {
      if (document.body.classList.contains('tk-open')) return;
      if (Date.now() < cooldownUntil || bubble.classList.contains('show')) return;
      clearTimeout(closeT); bubble.classList.remove('closing'); bubble.style.clipPath='';
      activeQA = pickQA();
      var _fx = curThemeFx();
      bubble.setAttribute('data-fx', _fx);
      if(_fx==='matrixdrop'){
        bubble.innerHTML = '<div class="tk-b-fill"><canvas class="tk-b-mtxc"></canvas><span class="tk-b-q">' + activeQA.q + '</span></div>';
      } else {
        bubble.innerHTML = '<span class="tk-b-scan"></span>' + fxMarkup(_fx, false) + '<span class="tk-b-q">' + activeQA.q + '</span>';
      }
      bubble.classList.add('show');
      if(_fx==='matrixdrop') runMatrix(bubble.querySelector('.tk-b-mtxc'), bubble.querySelector('.tk-b-fill'), {reveal:'in', radius:13, slow:1});
      clearTimeout(bubbleT);
      if (auto) bubbleT = setTimeout(hideBubble, 6500);
    }
    function hideBubble() {
      clearTimeout(bubbleT);
      if (!bubble.classList.contains('show')) return;
      bubble.classList.remove('show');
      bubble.classList.add('closing');
      cooldownUntil = Date.now() + 500;      // 0.5s cooldown before it can reopen
      var _bfx = bubble.getAttribute('data-fx');
      if(_bfx==='matrixdrop') runMatrix(bubble.querySelector('.tk-b-mtxc'), null, {reveal:null, slow:1});
      clearTimeout(closeT);
      closeT = setTimeout(function () { bubble.classList.remove('closing'); }, _bfx==='matrixdrop'?780:500);
    }
    fab.addEventListener('mouseenter', function () { if (window.__ghostSleeping) { window.__ghostWake(); return; } if (!document.body.classList.contains('tk-open')) showBubble(false); });
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
      if (window.__ghostSleeping || document.body.classList.contains('tk-open') || bubble.classList.contains('show')) return;
      if (Math.random() < 0.45) showBubble(true);
    }, 16000);

    // idle blink for cuteness
    (function blinkLoop() {
      var wait = 3500 + Math.random() * 3500;
      setTimeout(function () {
        if (!window.__ghostSleeping) [fab, document.getElementById('tk-head')].forEach(function (el) {
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

    // ── ghost sleep: random naps (like the glitches); the ghost wakes itself after 5 min ──
    function setMood(m) {
      document.body.classList.remove('mood-sleep', 'mood-wake');
      if (m) document.body.classList.add(m);
    }
    // one of 5 sleep FX is chosen at random each time the ghost sleeps
    var SLEEPFX = ['mtx', 'dust', 'wave', 'pkt', 'crt', 'bub', 'zzz'];
    var GLYPHS = '\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C80123456789';
    var _sfxTimer = null;
    function _sfxPos(el) { el.style.left = (24 + Math.random() * 18) + '%'; el.style.top = (4 + Math.random() * 6) + 'px'; el.style.setProperty('--dx', (Math.random() * -12 - 3).toFixed(0) + 'px'); }
    function _waveD() { var d = 'M-40,12'; for (var x = -40; x <= 120; x += 40) { d += ' L' + (x + 26) + ',12 l2,-8 l2,16 l2,-8 L' + (x + 40) + ',12'; } return d; }
    function startSleepFx(forceKind) {
      stopSleepFx(false);
      var kind = forceKind || window.__ghostSleepKind || SLEEPFX[Math.floor(Math.random() * SLEEPFX.length)];
      var host = document.createElement('div'); host.className = 'tk-sfx'; host.setAttribute('data-sfx', kind);
      fab.appendChild(host);
      if (kind === 'mtx') {
        _sfxTimer = setInterval(function () {
          var g = document.createElement('span'); g.className = 'sfx-mtx'; g.textContent = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
          g.style.fontSize = (9 + Math.floor(Math.random() * 5)) + 'px'; _sfxPos(g);
          host.appendChild(g); g.addEventListener('animationend', function () { g.remove(); });
        }, 520);
      } else if (kind === 'dust') {
        _sfxTimer = setInterval(function () {
          var d = document.createElement('span'); d.className = 'sfx-dust'; var sz = 3 + Math.random() * 3; d.style.width = sz + 'px'; d.style.height = sz + 'px'; _sfxPos(d);
          host.appendChild(d); d.addEventListener('animationend', function () { d.remove(); });
        }, 240);
      } else if (kind === 'pkt') {
        _sfxTimer = setInterval(function () {
          var k = document.createElement('span'); k.className = 'sfx-pkt'; k.textContent = '[' + (Math.random() < 0.5 ? '\u25AA' : '\u25AB') + ']'; _sfxPos(k);
          host.appendChild(k); k.addEventListener('animationend', function () { k.remove(); });
        }, 620);
      } else if (kind === 'bub') {
        _sfxTimer = setInterval(function () {
          var bub = document.createElement('span'); bub.className = 'sfx-bub';
          var sz = 5 + Math.random() * 5; bub.style.width = sz + 'px'; bub.style.height = sz + 'px';
          _sfxPos(bub);
          host.appendChild(bub); bub.addEventListener('animationend', function () { bub.remove(); });
          var dx = parseFloat(bub.style.getPropertyValue('--dx')) || -10;
          var left = bub.style.left, top = parseFloat(bub.style.top) || 4;
          setTimeout(function () {                 // pop ring at the top of the rise
            if (!host.parentNode) return;
            var ring = document.createElement('span'); ring.className = 'sfx-bub-pop';
            ring.style.left = left; ring.style.top = (top - 38) + 'px'; ring.style.setProperty('--dx', dx + 'px');
            ring.style.width = (sz * 1.15) + 'px'; ring.style.height = (sz * 1.15) + 'px';
            host.appendChild(ring); ring.addEventListener('animationend', function () { ring.remove(); });
          }, 2040);
        }, 900);
      } else if (kind === 'zzz') {
        var _zc = 0;
        _sfxTimer = setInterval(function () {
          var z = document.createElement('span'); z.className = 'sfx-z';
          z.textContent = 'z'; z.style.fontSize = (10 + (_zc % 3) * 3) + 'px'; _zc++;
          _sfxPos(z);
          host.appendChild(z); z.addEventListener('animationend', function () { z.remove(); });
        }, 780);
      } else if (kind === 'wave') {
        host.innerHTML = '<svg class="sfx-wave" viewBox="0 0 80 24" width="80" height="24"><path class="wl" d="' + _waveD() + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      } else {
        host.innerHTML = '<div class="sfx-crt"><div class="cg"></div><div class="cs"></div></div><div class="sfx-crt-lab">STANDBY</div>';
      }
    }
    function stopSleepFx(fade) {
      if (_sfxTimer) { clearInterval(_sfxTimer); _sfxTimer = null; }
      var h = fab.querySelector('.tk-sfx'); if (!h) return;
      if (fade) { h.classList.add('tk-sfx-out'); setTimeout(function () { if (h.parentNode) h.remove(); }, 300); }
      else h.remove();
    }
    var SLEEP_MS = 5 * 60 * 1000, _autoWakeT;
    function goSleep(kind) {
      if (window.__ghostSleeping) return;
      window.__ghostSleeping = true;      // pauses blink & teaser (glitches keep running)
      setMood('mood-sleep'); startSleepFx(kind);
      clearTimeout(_autoWakeT);
      _autoWakeT = setTimeout(function () { if (window.__ghostSleeping) wake(); }, SLEEP_MS);
    }
    var _sleepIdx = -1;
    window.__ghostCycleSleep = function () {   // Shift+S: step through sleep FX WITHOUT waking
      _sleepIdx = (_sleepIdx + 1) % SLEEPFX.length;
      var kind = SLEEPFX[_sleepIdx];
      if (window.__ghostSleeping) startSleepFx(kind);   // swap FX, stay asleep
      else goSleep(kind);                               // fall asleep with this FX
    };
    function wake() {                     // startled awakening: jolt + wide eyes + "!" pop
      if (!window.__ghostSleeping) return;
      window.__ghostSleeping = false;
      clearTimeout(_autoWakeT);
      stopSleepFx(true);
      setMood('mood-wake');
      var hd = document.getElementById('tk-head');
      fab.classList.add('tk-wake'); if (hd) hd.classList.add('tk-wake');
      var ex = document.createElement('div'); ex.className = 'tk-excl'; ex.textContent = '!';
      fab.appendChild(ex);
      setTimeout(function () { if (ex.parentNode) ex.remove(); }, 740);
      setTimeout(function () {
        fab.classList.remove('tk-wake'); if (hd) hd.classList.remove('tk-wake');
        setMood('');
        scheduleNap();                    // schedule the next random nap
      }, 860);
    }
    window.__ghostWake = wake;
    window.ghostMood = function (m) { if (m === 'sleep') goSleep(); else wake(); return window.__ghostSleeping ? 'sleep' : 'awake'; };

    // random naps, scheduled like the glitches; ghost wakes itself after 5 min (or on hover)
    function scheduleNap() {
      clearTimeout(scheduleNap._t);
      scheduleNap._t = setTimeout(function () {
        if (window.__ghostSleeping || document.body.classList.contains('tk-open') || fab.style.display === 'none') { scheduleNap(); return; }
        goSleep();
      }, 180000 + Math.random() * 300000);   // next nap in ~3-8 min
    }
    scheduleNap();
  }

  if (document.readyState !== 'loading') build();
  else document.addEventListener('DOMContentLoaded', build);
})();
