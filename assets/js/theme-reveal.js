/* 主题切换圆形扩散动画（仅主站） */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function () {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    document.addEventListener('pointerdown', function (e) {
      var btn = e.target && e.target.closest
        ? e.target.closest('.md-header__option label[for^="__palette_"]')
        : null;
      if (!btn) return;

      // 阻止默认即时切换，交给 View Transition 控制
      e.preventDefault();

      var root = document.documentElement;
      root.style.setProperty('--reveal-x', e.clientX + 'px');
      root.style.setProperty('--reveal-y', e.clientY + 'px');

      if (document.startViewTransition) {
        document.startViewTransition(function () {
          btn.click();
        });
      } else {
        btn.click();
      }
    });
  });
})();
