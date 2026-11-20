(function () {
  var m = /[?&]y=(\d+)/.exec(location.search);
  var t = /[?&]theme=(light|dark)/.exec(location.search);
  if (t) {
    document.body.setAttribute('data-md-color-scheme', t[1] === 'light' ? 'default' : 'slate');
  }
  if (!m) return;
  var y = parseInt(m[1], 10);
  function go() { window.scrollTo(0, y); }
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', function () { setTimeout(go, 40); });
})();
