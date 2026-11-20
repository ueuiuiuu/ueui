/* ============================================
   UEUI 首页：滚动显现 + 数字滚动
   只影响 .ueui-home 内部，其余页面不受影响
   ============================================ */
(function () {
  'use strict';

  var root = document.querySelector('.ueui-home');
  if (!root) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = Array.prototype.slice.call(root.querySelectorAll('.uh-reveal'));

  function showAll() {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }

  if (reduce || !('IntersectionObserver' in window)) {
    showAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

    items.forEach(function (el) {
      // 首屏内容直接显示，避免闪一下空白
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
        el.classList.add('is-in');
      } else {
        io.observe(el);
      }
    });
  }

  /* ---------- 数字滚动 ---------- */
  var nums = Array.prototype.slice.call(root.querySelectorAll('[data-count]'));
  if (!nums.length) return;

  function pad(value, len) {
    var s = String(value);
    while (s.length < len) s = '0' + s;
    return s;
  }

  function run(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var len = parseInt(el.getAttribute('data-pad') || '0', 10);
    var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var duration = 900;
    var start = 0;

    function frame(now) {
      if (!start) start = now;
      var p = Math.min(1, (now - start) / duration);
      // easeOutCubic
      var e = 1 - Math.pow(1 - p, 3);
      var value = target * e;
      el.textContent = len ? pad(Math.round(value), len) : value.toFixed(dec);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = len ? pad(Math.round(target), len) : target.toFixed(dec);
    }
    requestAnimationFrame(frame);
  }

  if (reduce || !('IntersectionObserver' in window)) {
    nums.forEach(function (el) {
      var len = parseInt(el.getAttribute('data-pad') || '0', 10);
      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
      var v = parseFloat(el.getAttribute('data-count')) || 0;
      el.textContent = len ? pad(v, len) : v.toFixed(dec);
    });
    return;
  }

  var no = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      run(en.target);
      no.unobserve(en.target);
    });
  }, { threshold: 0.4 });

  nums.forEach(function (el) { no.observe(el); });
})();
