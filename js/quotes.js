// Ghost in the Shell quote typer — picks one random quote per page load
(function() {
  var quotes = [
    {
      text: "Man is an individual only because of his intangible memory. But memory cannot be defined, yet it defines mankind.",
      author: "Puppet Master",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "All things change in a dynamic environment. Your effort to remain what you are is what limits you.",
      author: "Puppet Master",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "It can also be argued that DNA is nothing more than a program designed to preserve itself.",
      author: "Puppet Master",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "What if a cyber brain could possibly generate its own ghost, create a soul all by itself? And if it did, just what would be the importance of being human then?",
      author: "Motoko Kusanagi",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "If a technological feat is possible, man will do it. Almost as if it's wired into the core of our being.",
      author: "Motoko Kusanagi",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "There's nothing sadder than a puppet without a ghost, especially the kind with red blood running through them.",
      author: "Batou",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "And can you offer me proof of your existence? How can you, when neither modern science nor philosophy can explain what life is?",
      author: "Puppet Master",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "If we all reacted the same way, we'd be predictable, and there's always more than one way to view a situation. Overspecialize, and you breed in weakness. It's slow death.",
      author: "Motoko Kusanagi",
      source: "Ghost in the Shell",
      year: "1995"
    },
    {
      text: "What is a number, that a man may know it, and a man, that he may know a number?",
      author: "Warren McCulloch",
      source: "Embodiments of Mind",
      year: "1965"
    }
  ];

  // Expose for terminal & other scripts
  window.yangaQuotes = quotes;

  var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  function randChar() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }

  var output = document.getElementById('quote-output');
  var attrEl = document.getElementById('quote-attr');
  var authorEl = document.getElementById('quote-author');
  var sourceEl = document.getElementById('quote-source');
  var yearEl = document.getElementById('quote-year');

  var typeSpeed = 35;
  var quote = quotes[Math.floor(Math.random() * quotes.length)];

  // Decode-compose effect: each character cycles random letters then locks left-to-right
  // Exposed on window so other scripts can reuse it
  window.decodeCompose = decodeCompose;
  function decodeCompose(el, text, callback) {
    // Text is already in the element for stable layout.
    // If not provided, read it from the element.
    if (!text) text = el.textContent;
    var len = text.length;
    var locked = new Array(len).fill(false);
    var lockIndex = 0;

    // Scramble all non-space characters immediately
    var chars = text.split('');
    var scrambled = chars.map(function(ch) { return ch === ' ' ? ' ' : randChar(); });
    el.textContent = scrambled.join('');

    var cycleInterval = setInterval(function() {
      for (var i = 0; i < len; i++) {
        if (!locked[i] && chars[i] !== ' ') {
          scrambled[i] = randChar();
        }
      }
      el.textContent = scrambled.join('');
    }, 60);

    var lockTimer = setInterval(function() {
      while (lockIndex < len && chars[lockIndex] === ' ') {
        locked[lockIndex] = true;
        lockIndex++;
      }
      if (lockIndex < len) {
        scrambled[lockIndex] = chars[lockIndex];
        locked[lockIndex] = true;
        lockIndex++;
        el.textContent = scrambled.join('');
      }
      if (lockIndex >= len) {
        clearInterval(lockTimer);
        clearInterval(cycleInterval);
        el.textContent = text;
        if (callback) callback();
      }
    }, 80);
  }

  function typeQuote() {
    var i = 0;
    try { window.dispatchEvent(new Event('quotestart')); } catch (e) {}
    attrEl.classList.remove('visible');
    function typeChar() {
      if (i <= quote.text.length) {
        output.textContent = quote.text.slice(0, i);
        i++;
        setTimeout(typeChar, typeSpeed);
      } else {
        // Show attribution container, then decode-compose each part
        attrEl.classList.add('visible');
        try { window.dispatchEvent(new Event('quoteend')); } catch (e) {}
        var authorText = '\u2014 ' + quote.author;
        var sourceText = quote.source ? ' // ' + quote.source : '';
        var yearText = ' (' + quote.year + ')';

        // Start all composing simultaneously
        decodeCompose(authorEl, authorText);
        if (sourceText) decodeCompose(sourceEl, sourceText);
        else sourceEl.textContent = '';
        decodeCompose(yearEl, yearText);
      }
    }
    typeChar();
  }

  function initQuotes() {
    // Re-grab elements (may be fresh from PJAX swap)
    output = document.getElementById('quote-output');
    attrEl = document.getElementById('quote-attr');
    authorEl = document.getElementById('quote-author');
    sourceEl = document.getElementById('quote-source');
    yearEl = document.getElementById('quote-year');
    if (!output) return;
    // Pick a new random quote
    quote = quotes[Math.floor(Math.random() * quotes.length)];
    // Clear previous content
    output.textContent = '';
    if (authorEl) authorEl.textContent = '';
    if (sourceEl) sourceEl.textContent = '';
    if (yearEl) yearEl.textContent = '';
    if (attrEl) attrEl.classList.remove('visible');
    setTimeout(typeQuote, 600);
  }

  // Expose for PJAX re-init
  window.initQuotes = initQuotes;

  // Auto-play only on homepage initial load
  if (output) {
    if (sessionStorage.getItem('yanga_booted')) {
      setTimeout(typeQuote, 800);
    } else {
      window.addEventListener('bootComplete', function() {
        setTimeout(typeQuote, 400);
      });
    }
  }
})();
