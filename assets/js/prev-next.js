/* 文章底部“上一篇/下一篇”导航
   只对左侧导航中“文章”和“算法”分类下的页面生效
   顺序按左侧导航顺序自动生成
*/
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function () {
    var primaryNav = document.querySelector('.md-nav--primary');
    if (!primaryNav) return;

    var sectionNames = ['文章', '算法'];
    var links = [];
    var topList = primaryNav.querySelector('.md-nav__list');
    if (!topList) return;

    Array.prototype.forEach.call(topList.children, function (item) {
      var label = item.querySelector('.md-nav__link');
      var name = label ? label.textContent.trim() : '';
      if (sectionNames.indexOf(name) === -1) return;

      Array.prototype.forEach.call(item.querySelectorAll('a.md-nav__link[href]'), function (a) {
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        links.push({
          href: href,
          text: a.textContent.trim(),
          el: a
        });
      });
    });

    if (!links.length) return;

    var currentPath = normalize(window.location.pathname);
    var currentIndex = -1;

    for (var i = 0; i < links.length; i++) {
      var linkUrl = new URL(links[i].href, window.location.href);
      if (normalize(linkUrl.pathname) === currentPath) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex === -1) return;

    var article = document.querySelector('article.md-content__inner');
    if (!article) return;

    // 阅读时间估算
    var h1 = article.querySelector('h1');
    if (h1 && !article.querySelector('.ueui-reading-time')) {
      var text = article.textContent || '';
      var minutes = Math.max(1, Math.round(text.replace(/\s+/g, '').length / 400));
      var reading = document.createElement('div');
      reading.className = 'ueui-reading-time';
      reading.textContent = '阅读时间约 ' + minutes + ' 分钟';
      h1.insertAdjacentElement('afterend', reading);
    }


    var prev = links[currentIndex - 1];
    var next = links[currentIndex + 1];

    var html = '<nav class="ueui-post-nav" aria-label="文章导航">';
    if (prev) {
      html += '<a class="ueui-post-nav__link ueui-post-nav__link--prev" href="' + escapeAttr(prev.href) + '">' +
              '<span class="ueui-post-nav__arrow">&lt;</span>' +
              '<span class="ueui-post-nav__title">' + escapeHtml(prev.text) + '</span>' +
              '</a>';
    }
    if (next) {
      html += '<a class="ueui-post-nav__link ueui-post-nav__link--next" href="' + escapeAttr(next.href) + '">' +
              '<span class="ueui-post-nav__title">' + escapeHtml(next.text) + '</span>' +
              '<span class="ueui-post-nav__arrow">&gt;</span>' +
              '</a>';
    }
    html += '</nav>';

    article.insertAdjacentHTML('beforeend', html);
  });

  function normalize(path) {
    // 兼容直接打开 site/txtN/index.html 或访问 /txtN/index.html 的情况
    if (path.length > 1 && path.slice(-10) === 'index.html') {
      path = path.slice(0, -10);
    }
    if (path.length > 1 && path.charAt(path.length - 1) === '/') {
      return path.slice(0, -1);
    }
    return path;
  }

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }
})();
