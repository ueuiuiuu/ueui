/* 全站背景：水面格子波纹
   只在 MkDocs 页面生效（CodeDash 独立页面不会加载此脚本）
   节点和连线不是完全连通的，鼠标/触摸会产生水波扰动
*/
(function () {
  var canvas = document.createElement('canvas');
  canvas.className = 'water-grid-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx = canvas.getContext('2d');
  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var width = 0;
  var height = 0;
  var points = [];
  var edges = [];
  var spacing = 88;
  var pointer = { x: -9999, y: -9999, active: false, radius: 240 };
  var rafId = null;
  var running = true;

  function getColors() {
    var dark = document.body.getAttribute('data-md-color-scheme') !== 'default';
    return {
      line: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.16)',
      node: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)',
      ripple: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
    };
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
  }

  function buildGrid() {
    points = [];
    edges = [];
    // 让网格延伸到屏幕外，避免边缘出现“截断”感
    var cols = Math.ceil(width / spacing) + 2;
    var rows = Math.ceil(height / spacing) + 2;

    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        points.push({
          bx: x * spacing - spacing,
          by: y * spacing - spacing,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0,
          phase: 0,
          speed: 0,
          amp: 0
        });
      }
    }

    function addEdge(a, b) {
      // 所有相邻节点都连上，形成完整网格
      edges.push([a, b]);
    }

    for (var i = 0; i < points.length; i++) {
      var px = i % cols;
      var py = Math.floor(i / cols);
      if (px + 1 < cols) addEdge(i, i + 1);
      if (py + 1 < rows) addEdge(i, i + cols);
    }
  }

  function step(now) {
    if (!running) return;
    var colors = getColors();
    ctx.clearRect(0, 0, width, height);

    var time = now * 0.001;

    // 更新节点：微弱的自主动画 + 水波物理
    for (var i = 0; i < points.length; i++) {
      var p = points[i];

      // 自身轻微浮动
      var waveX = Math.sin(time * p.speed + p.phase) * p.amp;
      var waveY = Math.cos(time * p.speed * 0.9 + p.phase * 1.3) * p.amp;

      // 指针水波扰动
      if (pointer.active) {
        var dx = p.bx + p.ox - pointer.x;
        var dy = p.by + p.oy - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < pointer.radius) {
          var force = (1 - dist / pointer.radius) * 2.4;
          p.vx += (dx / (dist + 0.001)) * force * 0.12;
          p.vy += (dy / (dist + 0.001)) * force * 0.12;
        }
      }

      // 弹簧回弹 + 阻尼（更柔软，模拟水面）
      p.vx += (-p.ox * 0.02) + waveX * 0.08;
      p.vy += (-p.oy * 0.02) + waveY * 0.08;
      p.vx *= 0.88;
      p.vy *= 0.88;
      p.ox += p.vx;
      p.oy += p.vy;
    }

    // 画连线（距离过大时断开，形成若即若离感）
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    for (var e = 0; e < edges.length; e++) {
      var a = points[edges[e][0]];
      var b = points[edges[e][1]];
      var ax = a.bx + a.ox;
      var ay = a.by + a.oy;
      var bx = b.bx + b.ox;
      var by = b.by + b.oy;
      var dx = bx - ax;
      var dy = by - ay;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > spacing * 1.9) continue;

      // 让边和节点之间留一点空隙，形成 “* - *” 而不是 “*-*”
      var gap = 8;
      var sx = ax + (dx / dist) * gap;
      var sy = ay + (dy / dist) * gap;
      var ex = bx - (dx / dist) * gap;
      var ey = by - (dy / dist) * gap;

      var edgeAlpha = Math.max(0, 1 - (dist - spacing) / (spacing * 0.9));
      ctx.globalAlpha = Math.min(1, edgeAlpha);
      ctx.strokeStyle = colors.line;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 画节点
    for (var n = 0; n < points.length; n++) {
      var pt = points[n];
      ctx.fillStyle = colors.node;
      ctx.beginPath();
      ctx.arc(pt.bx + pt.ox, pt.by + pt.oy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(step);
  }

  function onMouseMove(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }

  function onTouchMove(e) {
    if (e.touches && e.touches.length) {
      pointer.x = e.touches[0].clientX;
      pointer.y = e.touches[0].clientY;
      pointer.active = true;
    }
  }

  function onLeave() {
    pointer.active = false;
  }

  function onVisibilityChange() {
    if (document.hidden) {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    } else {
      running = true;
      if (!rafId) rafId = requestAnimationFrame(step);
    }
  }

  // 让 html 背景跟随主题，避免亮色模式下右侧出现白条
  function syncHtmlBackground() {
    var dark = document.body.getAttribute('data-md-color-scheme') !== 'default';
    document.documentElement.style.backgroundColor = dark ? '#0a0a0a' : '#eaecf0';
  }
  syncHtmlBackground();
  var bgObserver = new MutationObserver(syncHtmlBackground);
  bgObserver.observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseout', onLeave);
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);

  // 跟随主题切换：切换后强制重启动画，确保背景不会消失
  var themeObserver = new MutationObserver(function () {
    running = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(step);
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });

  resize();
  rafId = requestAnimationFrame(step);
})();
