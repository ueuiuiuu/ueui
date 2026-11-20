/* 移动端目录交互：注入“目录”按钮与右侧抽屉关闭按钮 */
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function () {
    // 仅在移动端视口注入
    var isMobile = window.matchMedia('(max-width: 76.1875em)').matches;

    // ============ 移动端抽屉交互 ============
    if (isMobile) {

    var drawerInput = document.getElementById('__drawer');
    var tocInput = document.getElementById('__toc');

    // 左/右抽屉互斥：打开目录时收起左侧导航，反之亦然
    if (drawerInput && tocInput) {
      drawerInput.addEventListener('change', function () {
        if (drawerInput.checked && tocInput.checked) tocInput.checked = false;
      });
      tocInput.addEventListener('change', function () {
        if (tocInput.checked && drawerInput.checked) drawerInput.checked = false;
      });
    }

    // header 右上角"目录"图标按钮：点击直接弹出右侧 TOC 抽屉
    var headerInner = document.querySelector('.md-header__inner');
    if (headerInner && !document.querySelector('.md-header__toc-btn')) {
      var tocBtn = document.createElement('label');
      tocBtn.className = 'md-header__toc-btn md-header__button md-icon';
      tocBtn.htmlFor = '__toc';
      tocBtn.title = '目录';
      tocBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 9h14V7H3v2zm0 4h14v-2H3v2zm0 4h14v-2H3v2zm16 0h2v-2h-2v2zm0-10v2h2V7h-2zm0 6h2v-2h-2v2z"/></svg>';
      var search = headerInner.querySelector('.md-header__button[for="__search"]');
      headerInner.insertBefore(tocBtn, search || null);
    }

    // 右侧抽屉顶部关闭按钮
    var sidebar = document.querySelector('.md-sidebar--secondary');
    if (sidebar && !document.querySelector('.md-toc-close')) {
      var close = document.createElement('label');
      close.className = 'md-toc-close';
      close.htmlFor = '__toc';
      close.textContent = '× 关闭目录';
      sidebar.prepend(close);
    }

    // 右侧抽屉遮罩：点击空白处关闭（类似左侧抽屉的 overlay）
    if (!document.querySelector('.md-toc-overlay')) {
      var overlay = document.createElement('label');
      overlay.className = 'md-toc-overlay';
      overlay.htmlFor = '__toc';
      document.body.appendChild(overlay);
    }

    // 点击抽屉内目录链接后自动收起抽屉
    if (sidebar) {
      sidebar.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          if (tocInput) tocInput.checked = false;
        });
      });
    }

    }

    // ============ 目录当前项平滑居中（桌面 + 移动） ============
    setupTocCentering(tocInput);

    // ============ 移动端搜索：打开后自动聚焦输入框 ============
    var searchToggle = document.getElementById('__search');
    var searchInput = document.querySelector('.md-search__input');
    if (searchToggle && searchInput) {
      searchToggle.addEventListener('change', function () {
        if (searchToggle.checked) {
          setTimeout(function () {
            searchInput.focus();
          }, 100);
        } else {
          searchInput.blur();
        }
      });
    }
  });

  function setupTocCentering(tocInput) {
    var sidebar = document.querySelector('.md-sidebar--secondary');
    if (!sidebar) return;

    var scrollwrap = sidebar.querySelector('.md-sidebar__scrollwrap');
    var tocNav = sidebar.querySelector('.md-nav--secondary');
    if (!scrollwrap || !tocNav) return;

    var ticking = false;
    var lastActive = null;

    function update(force) {
      ticking = false;
      var active = tocNav.querySelector('.md-nav__link--active');
      if (!active) return;

      if (!force && active === lastActive) return;
      lastActive = active;

      var wrapRect = scrollwrap.getBoundingClientRect();
      var linkRect = active.getBoundingClientRect();
      var target = scrollwrap.scrollTop +
        (linkRect.top - wrapRect.top) -
        wrapRect.height / 2 +
        linkRect.height / 2;

      target = Math.max(0, Math.min(target, scrollwrap.scrollHeight - wrapRect.height));
      scrollwrap.scrollTo({ top: target, behavior: 'smooth' });
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(function () {
          update(false);
        });
      }
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    if (tocInput) {
      tocInput.addEventListener('change', function () {
        if (tocInput.checked) {
          lastActive = null;
          update(true);
        }
      });
    }

    update(true);
  }
})();