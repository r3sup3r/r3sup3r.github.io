// Matrix rain effect — starts after boot completes
(function() {
  var _themes = { green:'#00ff9d', blue:'#00a8ff', red:'#ff3c3c' };
  var _t = null;
  // 1. window.name (most reliable on file://)
  try { var d = JSON.parse(window.name); if (d && d.yanga_theme) _t = d.yanga_theme; } catch(e) {}
  // 2. localStorage
  if (!_t) { try { _t = localStorage.getItem('yanga_theme'); } catch(e) {} }
  // 3. Cookie
  if (!_t) { var m = document.cookie.match(/yanga_theme=(\w+)/); if (m) _t = m[1]; }
  window.__matrixColor = (_t && _themes[_t]) ? _themes[_t] : '#00a8ff';
})();
const canvas = document.getElementById('matrix-bg');
if (canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
  const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);
  const drops = Array(columns).fill(1);
  function draw() {
    ctx.fillStyle = 'rgba(10,10,15,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = window.__matrixColor;
    ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  // On homepage: wait for boot animation to finish before starting
  // On all other pages: start immediately
  var hasBootScreen = document.getElementById('bootScreen');
  if (hasBootScreen && !sessionStorage.getItem('yanga_booted')) {
    window.addEventListener('bootComplete', function() {
      setInterval(draw, 50);
    });
  } else {
    setInterval(draw, 50);
  }
}
