/* Equal Earth world map (EPSG:8857), drawn from local outlines. No tiles, no API key.
   The projection is fixed: zooming scales the finished projection, so shapes and
   areas stay true to Equal Earth at every zoom level. */
(function () {
  var el = document.getElementById('map');
  if (!el || !window.WORLD_EE) return;

  var R = 6378.137, A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, S = Math.sqrt(3);

  function ee(lon, lat) {
    var l = lon * Math.PI / 180, p = lat * Math.PI / 180;
    var th = Math.asin(S / 2 * Math.sin(p));
    var x = 2 * S * l * Math.cos(th) / (3 * (9 * A4 * Math.pow(th, 8) + 7 * A3 * Math.pow(th, 6) + 3 * A2 * th * th + A1));
    var y = A4 * Math.pow(th, 9) + A3 * Math.pow(th, 7) + A2 * th * th * th + A1 * th;
    return [R * x, -R * y];
  }
  function line(a) {
    return 'M' + a.map(function (c) { var q = ee(c[0], c[1]); return Math.round(q[0]) + ' ' + Math.round(q[1]); }).join('L');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var W = Math.abs(ee(180, 0)[0]), H = Math.abs(ee(0, 90)[1]), i, j;

  var bnd = [];
  for (i = -90; i <= 90; i += 2) bnd.push([-180, i]);
  for (i = 90; i >= -90; i -= 2) bnd.push([180, i]);

  var grat = '';
  for (i = -150; i <= 150; i += 30) { var m = []; for (j = -90; j <= 90; j += 2) m.push([i, j]); grat += line(m); }
  for (i = -60; i <= 60; i += 30) { var p2 = []; for (j = -180; j <= 180; j += 4) p2.push([j, i]); grat += line(p2); }

  var on = window.MAP_ON || [], pins = window.MAP_PINS || [];
  var vb = [-Math.round(W), -Math.round(H), Math.round(2 * W), Math.round(2 * H)].join(' ');

  var svg = '<svg viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="World map of the cities where Seabilwe has worked">'
    + '<path class="map-sea" d="' + line(bnd) + 'Z"/>'
    + '<path class="map-grat" d="' + grat + '"/>';
  window.WORLD_EE.forEach(function (c) {
    svg += '<path class="map-land' + (on.indexOf(c.n) > -1 ? ' on' : '') + '" d="' + c.d + '"><title>' + esc(c.n) + '</title></path>';
  });
  svg += '</svg>';

  el.style.aspectRatio = Math.round(2 * W) + ' / ' + Math.round(2 * H);
  el.innerHTML = '<div class="map-stage">' + svg + '</div>';
  var stage = el.firstChild;

  var tip = document.createElement('div');
  tip.className = 'map-tip';
  el.appendChild(tip);

  var marks = pins.map(function (p) {
    var q = ee(p[2], p[3]);
    var x = (q[0] + W) / (2 * W) * 100, y = (q[1] + H) / (2 * H) * 100;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'map-pin';
    b.setAttribute('aria-label', p[0] + '. ' + p[1]);
    var o = { el: b, x: x, y: y, p: p };
    function show() { open = o; paintTip(); }
    b.addEventListener('mouseenter', show);
    b.addEventListener('focus', show);
    b.addEventListener('mouseleave', hide);
    b.addEventListener('blur', hide);
    b.addEventListener('click', function (e) { e.stopPropagation(); show(); });
    el.appendChild(b);
    return o;
  });

  var open = null;
  function hide() { open = null; tip.classList.remove('show'); }
  function paintTip() {
    if (!open) return;
    tip.innerHTML = '<b>' + esc(open.p[0]) + '</b>' + esc(open.p[1]);
    var w = el.clientWidth, h = el.clientHeight;
    var px = tx + open.x / 100 * w * k, py = ty + open.y / 100 * h * k;
    tip.style.left = Math.min(Math.max(px, 90), w - 90) + 'px';
    tip.style.top = py + 'px';
    tip.classList.toggle('below', py < h * 0.45);
    tip.classList.add('show');
  }

  /* ---- pan and zoom over the finished projection ---- */
  var k = 1, tx = 0, ty = 0, MAXK = 9;

  function clamp() {
    var w = el.clientWidth, h = el.clientHeight;
    k = Math.max(1, Math.min(MAXK, k));
    tx = Math.min(0, Math.max(w - w * k, tx));
    ty = Math.min(0, Math.max(h - h * k, ty));
  }
  function apply() {
    clamp();
    stage.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + k.toFixed(4) + ')';
    var w = el.clientWidth, h = el.clientHeight;
    marks.forEach(function (o) {
      o.el.style.left = (tx + o.x / 100 * w * k).toFixed(2) + 'px';
      o.el.style.top = (ty + o.y / 100 * h * k).toFixed(2) + 'px';
    });
    if (open) paintTip();
    el.classList.toggle('is-zoomed', k > 1.001);
    zIn.disabled = k >= MAXK - 0.001;
    zOut.disabled = k <= 1.001;
  }
  function zoomAt(cx, cy, f) {
    var k0 = k;
    k = Math.max(1, Math.min(MAXK, k * f));
    f = k / k0;
    tx = cx - (cx - tx) * f;
    ty = cy - (cy - ty) * f;
    apply();
  }

  var ctrl = document.createElement('div');
  ctrl.className = 'map-zoom';
  ctrl.innerHTML = '<button type="button" data-in aria-label="Zoom in">+</button>'
    + '<button type="button" data-out aria-label="Zoom out">&minus;</button>'
    + '<button type="button" data-reset aria-label="Reset the map">Reset</button>';
  el.appendChild(ctrl);
  var zIn = ctrl.querySelector('[data-in]'), zOut = ctrl.querySelector('[data-out]');
  function mid() { return [el.clientWidth / 2, el.clientHeight / 2]; }
  zIn.addEventListener('click', function () { var c = mid(); zoomAt(c[0], c[1], 1.6); });
  zOut.addEventListener('click', function () { var c = mid(); zoomAt(c[0], c[1], 1 / 1.6); });
  ctrl.querySelector('[data-reset]').addEventListener('click', function () { k = 1; tx = ty = 0; apply(); });

  el.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    var r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0022));
  }, { passive: false });

  var pts = {}, lastMid = null, lastDist = 0, moved = false;
  el.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.map-zoom')) return;
    /* At full extent a one-finger swipe belongs to the page, not the map. */
    if (e.pointerType === 'touch' && k <= 1.001 && !Object.keys(pts).length) {
      pts[e.pointerId] = e;
      return;
    }
    pts[e.pointerId] = e;
    moved = false;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    var ids = Object.keys(pts), r = el.getBoundingClientRect();
    if (ids.length === 1) {
      if (e.pointerType === 'touch' && k <= 1.001) { pts[e.pointerId] = e; return; }
      tx += e.clientX - pts[e.pointerId].clientX;
      ty += e.clientY - pts[e.pointerId].clientY;
      moved = true;
      apply();
    } else if (ids.length === 2) {
      pts[e.pointerId] = e;
      var a = pts[ids[0]], b = pts[ids[1]];
      var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      var cx = (a.clientX + b.clientX) / 2 - r.left, cy = (a.clientY + b.clientY) / 2 - r.top;
      if (lastDist) zoomAt(cx, cy, d / lastDist);
      if (lastMid) { tx += cx - lastMid[0]; ty += cy - lastMid[1]; apply(); }
      lastDist = d; lastMid = [cx, cy];
      moved = true;
      return;
    }
    pts[e.pointerId] = e;
  });
  function up(e) {
    delete pts[e.pointerId];
    if (!Object.keys(pts).length) { lastDist = 0; lastMid = null; el.classList.remove('is-dragging'); }
  }
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  el.addEventListener('dblclick', function (e) {
    var r = el.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, 1.8);
  });

  window.addEventListener('resize', apply);
  document.addEventListener('click', function () { if (!moved) hide(); });
  apply();
})();
