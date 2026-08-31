// ============================================
// YANGA — lightweight code highlighter for article code blocks.
// Theme-independent (fixed palette). Handles shell / YAML / JSON that
// appear in posts: commands, subcommands, flags, strings, numbers,
// comments (#...), and key: values. No dependencies.
// ============================================
(function () {
  var CMDS = /^(?:git|cd|pip3?|wget|sudo|source|ls|cat|more|python3?|mkdir|chmod|rm|mv|nvidia-smi|ollama|llamafactory-cli)$/;
  var SUBS = /^(?:clone|install|train|export|chat|version|env|merge|activate)$/;

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // comment(#) | string | flag | word | number | one-char catch-all
  var RE = /(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(--?[A-Za-z][\w-]*)|([A-Za-z_][\w.-]*)|(\d[\d.]*)|([\s\S])/g;

  function highlight(text) {
    var out = '', m;
    RE.lastIndex = 0;
    while ((m = RE.exec(text)) !== null) {
      if (m[1]) { out += '<span class="hl-com">' + esc(m[1]) + '</span>'; }
      else if (m[2]) { out += '<span class="hl-str">' + esc(m[2]) + '</span>'; }
      else if (m[3]) { out += '<span class="hl-flag">' + esc(m[3]) + '</span>'; }
      else if (m[4]) {
        var w = m[4], after = text.charAt(RE.lastIndex), after2 = text.charAt(RE.lastIndex + 1);
        if (after === ':' && (after2 === '' || after2 === ' ' || after2 === '\n' || after2 === '\t')) {
          out += '<span class="hl-key">' + esc(w) + '</span>';
        } else if (CMDS.test(w)) { out += '<span class="hl-cmd">' + esc(w) + '</span>'; }
        else if (SUBS.test(w)) { out += '<span class="hl-sub">' + esc(w) + '</span>'; }
        else { out += esc(w); }
      }
      else if (m[5]) { out += '<span class="hl-num">' + esc(m[5]) + '</span>'; }
      else { out += esc(m[6]); }
    }
    return out;
  }

  window.hlCode = function () {
    var blocks = document.querySelectorAll('.article-body pre code');
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      if (el.getAttribute('data-hl')) continue;
      el.setAttribute('data-hl', '1');
      el.innerHTML = highlight(el.textContent);
    }
  };

  if (document.readyState !== 'loading') window.hlCode();
  else document.addEventListener('DOMContentLoaded', window.hlCode);
})();
