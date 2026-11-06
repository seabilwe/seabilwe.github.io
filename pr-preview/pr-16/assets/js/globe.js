/* Water globe: land outlines from Natural Earth, major river systems and
   basin monitoring points. Spins on its own, drag to turn it. No libraries. */
(function () {
  var host = document.getElementById('globe');
  if (!host || !window.WORLD_LL) return;

  var RAD = Math.PI / 180, R = 95;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Major river systems, source to mouth, generalised to a handful of vertices. */
  var RIVERS = [
    [[32.5,-2.3],[33,0.5],[32,3.5],[31.5,9.5],[32.5,15.6],[33.5,19.6],[32.9,24.1],[31.2,30],[31,31.5]],
    [[27.5,-11.5],[26.5,-8],[23.5,-5.5],[21,-3],[18.5,-2],[16.5,-4.3],[13.5,-5.8],[12.3,-6]],
    [[-10,11],[-7,12.5],[-4,14],[0,16],[2,13],[4.5,10],[6.5,6.5],[6.8,4.6]],
    [[22,-13.5],[24,-16],[26.5,-17.8],[29,-16.2],[32,-15.8],[35,-17.5],[36.3,-18.6]],
    [[28.5,-28.5],[25,-28.8],[21,-28.5],[17.5,-28.6],[16.45,-28.6]],
    [[27,-24],[29.5,-22.5],[32,-23.5],[33.6,-25.1]],
    [[16.5,-12.5],[19,-15.5],[21.5,-17.5],[23,-19.3]],
    [[-73,-10],[-68,-8],[-62,-5.5],[-56,-3],[-51,-1.5],[-49.5,-0.8]],
    [[-95,47.2],[-92,43.5],[-90.5,38.6],[-91,34],[-90.2,30],[-89.3,29.1]],
    [[8.2,48.1],[13,48.3],[17.1,47.9],[20.5,46],[24,44],[28,45.2],[29.6,45.2]],
    [[97.5,32],[99,26],[100.5,21],[103,17.5],[105,13.5],[106.6,10.5]],
    [[78.5,30],[81.5,27],[85,25.5],[88,24],[90.5,22.5]],
    [[91,33.5],[98,30],[104,29],[110,30.5],[117,31.5],[121.5,31.4]],
    [[147.5,-36],[144,-35.5],[141,-34.3],[139.3,-35.3]],
    [[8.5,46.6],[7.6,48],[8.3,50],[6.9,51.8],[4.3,51.9]],
    [[37,57],[44,56],[48,53],[47,48.5],[48.5,46]],
    [[80,32],[75,33.5],[71.5,31.5],[69.5,27.5],[68,24.5]]
  ];

  /* Basin points: the kind of place water quality and supply data comes from. */
  var STATIONS = [
    ['Vaal Basin', 27.0, -26.9], ['Orange River mouth', 16.45, -28.6],
    ['Limpopo Basin', 32.0, -23.5], ['Zambezi, Victoria Falls', 25.85, -17.92],
    ['Okavango Delta', 22.9, -19.3], ['Lake Victoria', 33.0, -1.0],
    ['Lake Chad', 14.5, 13.0], ['Niger Delta', 6.5, 5.0],
    ['Nile Delta', 31.0, 31.0], ['Ganges Delta', 90.4, 23.7],
    ['Mekong Delta', 106.0, 10.5], ['Amazon mouth', -50.0, -1.0]
  ];

  function pack(coords) {
    var n = coords.length, sf = new Float64Array(n), cf = new Float64Array(n), lam = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      sf[i] = Math.sin(coords[i][1] * RAD); cf[i] = Math.cos(coords[i][1] * RAD); lam[i] = coords[i][0] * RAD;
    }
    return { n: n, sf: sf, cf: cf, lam: lam };
  }

  var land = [];
  window.WORLD_LL.forEach(function (c) {
    c.r.forEach(function (ring) {
      var n = ring.length / 2, pts = [];
      for (var i = 0; i < n; i++) pts.push([ring[i * 2], ring[i * 2 + 1]]);
      land.push(pack(pts));
    });
  });

  /* Rivers are resampled so the limb clip has points to work with. */
  var rivers = RIVERS.map(function (r) {
    var dense = [];
    for (var i = 0; i < r.length - 1; i++) {
      for (var t = 0; t < 6; t++) {
        dense.push([r[i][0] + (r[i + 1][0] - r[i][0]) * t / 6, r[i][1] + (r[i + 1][1] - r[i][1]) * t / 6]);
      }
    }
    dense.push(r[r.length - 1]);
    return pack(dense);
  });

  var grat = [];
  for (var lo = -180; lo < 180; lo += 30) {
    var mer = []; for (var la = -90; la <= 90; la += 3) mer.push([lo, la]); grat.push(pack(mer));
  }
  for (var la2 = -60; la2 <= 60; la2 += 30) {
    var par = []; for (var lo2 = -180; lo2 <= 180; lo2 += 3) par.push([lo2, la2]); grat.push(pack(par));
  }

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Rotating globe showing major river systems and basin monitoring points');
  svg.innerHTML = '<circle class="globe-sphere" cx="0" cy="0" r="' + R + '"/>'
    + '<path class="globe-grat"/><path class="globe-land"/><path class="globe-river"/>';
  host.appendChild(svg);

  var gGrat = svg.querySelector('.globe-grat'),
      gLand = svg.querySelector('.globe-land'),
      gRiver = svg.querySelector('.globe-river');

  var label = document.createElement('div');
  label.className = 'globe-label';
  host.appendChild(label);

  var held = false, over = false, dragging = false;
  var dots = STATIONS.map(function (p, i) {
    var ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('class', 'globe-ping');
    ring.setAttribute('r', '2.4');
    ring.style.animationDelay = (i * 0.26).toFixed(2) + 's';
    svg.appendChild(ring);
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'globe-station');
    c.setAttribute('r', '2.6');
    c.setAttribute('tabindex', '0');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', p[0]);
    function show() {
      c.classList.add('is-hot');
      label.textContent = p[0];
      label.style.left = c._sx + '%';
      label.style.top = c._sy + '%';
      label.classList.add('show');
      held = true;
    }
    function hide() { c.classList.remove('is-hot'); label.classList.remove('show'); held = false; }
    c.addEventListener('mouseenter', show);
    c.addEventListener('focus', show);
    c.addEventListener('mouseleave', hide);
    c.addEventListener('blur', hide);
    svg.appendChild(c);
    return { el: c, ring: ring, lon: p[1] * RAD, slat: Math.sin(p[2] * RAD), clat: Math.cos(p[2] * RAD) };
  });

  var lam0 = 14 * RAD, phi0 = -8 * RAD, spin = still ? 0 : 0.0012;

  function build(set, sp0, cp0) {
    var d = '', k, i;
    for (k = 0; k < set.length; k++) {
      var r = set[k], open = false;
      for (i = 0; i < r.n; i++) {
        var dl = r.lam[i] - lam0, cdl = Math.cos(dl);
        if (sp0 * r.sf[i] + cp0 * r.cf[i] * cdl <= 0) { open = false; continue; }
        var x = R * r.cf[i] * Math.sin(dl);
        var y = -R * (cp0 * r.sf[i] - sp0 * r.cf[i] * cdl);
        d += (open ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        open = true;
      }
    }
    return d;
  }

  function frame() {
    var sp0 = Math.sin(phi0), cp0 = Math.cos(phi0);
    gGrat.setAttribute('d', build(grat, sp0, cp0));
    gLand.setAttribute('d', build(land, sp0, cp0) + 'Z');
    gRiver.setAttribute('d', build(rivers, sp0, cp0));
    dots.forEach(function (p) {
      var dl = p.lon - lam0, cdl = Math.cos(dl);
      if (sp0 * p.slat + cp0 * p.clat * cdl <= 0.04) {
        p.el.style.display = 'none'; p.ring.style.display = 'none'; return;
      }
      var x = R * p.clat * Math.sin(dl), y = -R * (cp0 * p.slat - sp0 * p.clat * cdl);
      p.el.style.display = ''; p.ring.style.display = '';
      p.el.setAttribute('cx', x.toFixed(1)); p.el.setAttribute('cy', y.toFixed(1));
      p.ring.setAttribute('cx', x.toFixed(1)); p.ring.setAttribute('cy', y.toFixed(1));
      p.el._sx = (50 + x / 2).toFixed(2);
      p.el._sy = (50 + y / 2).toFixed(2);
    });
  }

  function loop() {
    if (spin && !dragging && !held && !over && !document.hidden) lam0 += spin;
    frame();
    requestAnimationFrame(loop);
  }

  var last = null;
  host.addEventListener('pointerdown', function (e) {
    dragging = true; last = e; host.setPointerCapture(e.pointerId); host.classList.add('is-dragging');
  });
  host.addEventListener('pointermove', function (e) {
    if (!dragging || !last) return;
    lam0 += (e.clientX - last.clientX) * 0.006;
    phi0 = Math.max(-1.2, Math.min(1.2, phi0 - (e.clientY - last.clientY) * 0.006));
    last = e;
  });
  function stop() { dragging = false; last = null; host.classList.remove('is-dragging'); }
  host.addEventListener('pointerup', stop);
  host.addEventListener('pointercancel', stop);
  host.addEventListener('mouseenter', function () { over = true; });
  host.addEventListener('mouseleave', function () { over = false; });

  frame();
  if (!still) requestAnimationFrame(loop);
})();
