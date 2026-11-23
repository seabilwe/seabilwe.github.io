/*
 * URBAN-EDGE ZA: Gauteng's built-up land, 1975-2020, as a dashboard.
 * One packed image (grid.png) drives the timeline, the growth-type view, the before-and-after swipe and the
 * click read-outs: each pixel is one hectare (R = epoch first built, G = how it grew, B = built surface in 2020,
 * A = inside Gauteng). The browser recolours it for the chosen year, so nothing else has to be downloaded.
 */
(() => {
  const root = document.querySelector('[data-urban-edge]');
  if (!root || !window.L) return;
  const BASE = root.dataset.base;
  const YEARS = [1975, 1980, 1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020];
  const OBSERVED = [1975, 1990, 2000, 2014, 2018];
  const PERIODS = [[1975, 1990], [1990, 2000], [2000, 2010], [2010, 2020]];
  // oldest built land darkest, newest lightest: the site's ink, through contour brown, to ochre
  const RAMP = ['#23312F', '#33392F', '#4A3F30', '#634530', '#7C4C2E', '#95582F', '#AE6631', '#C47535', '#D5853A', '#E39A42'];
  const TYPE = { 1: ['#2F6F9A', 'Infill'], 2: ['#A0673A', 'Edge growth'], 3: ['#A33B2B', 'Leapfrog'] };
  const BASE_GREY = [176, 181, 166];
  const fmt = (v, d = 0) => v == null ? '–' : v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const RAMP_RGB = RAMP.map(hex);
  const TYPE_RGB = { 1: hex(TYPE[1][0]), 2: hex(TYPE[2][0]), 3: hex(TYPE[3][0]) };
  const $ = s => root.querySelector(s);

  const state = { yi: 9, mode: 'year', area: 'Gauteng', compare: false, from: 0, playing: null, sat: false };
  let px = null, W = 0, H = 0, data = null, munis = null, bounds = null;

  // ---------------------------------------------------------------- map
  const map = L.map($('.ue-map'), { zoomSnap: 0.25, zoomControl: true, attributionControl: true, scrollWheelZoom: false,
    minZoom: 7.5, maxZoom: 15 });
  L.control.scale({ imperial: false, maxWidth: 110 }).addTo(map);
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());
  const light = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    { maxNativeZoom: 16 }).addTo(map);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxNativeZoom: 17 });
  // credits fold into a small button so they never cover the legend or the scale
  map.attributionControl.setPrefix(false).addAttribution('<details class="sm-credit"><summary>Credits</summary><span>' +
    'Analysis: Seabilwe Tilodi · Built-up land: GHSL GHS-BUILT-S R2023A (European Commission JRC) · Boundaries: MDB via geoBoundaries · ' +
    'Places: © OpenStreetMap contributors · Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors · Imagery: Esri, Maxar, Earthstar Geographics</span></details>');

  // A canvas that Leaflet positions like an image overlay
  const CanvasOverlay = L.ImageOverlay.extend({
    _initImage() {
      const c = this._image = this._url;
      L.DomUtil.addClass(c, 'leaflet-image-layer ue-canvas');
      if (this._zoomAnimated) L.DomUtil.addClass(c, 'leaflet-zoom-animated');
      c.onselectstart = L.Util.falseFn; c.onmousemove = L.Util.falseFn;
    }
  });
  const cvA = document.createElement('canvas'), cvB = document.createElement('canvas');
  let ovA = null, ovB = null;

  // ---------------------------------------------------------------- drawing
  function paint(canvas, yi, mode) {
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), o = img.data;
    const ep = yi + 1, yr = YEARS[yi];
    for (let i = 0, j = 0; i < px.length; i += 4, j += 4) {
      if (!px[i + 3]) continue;
      const e = px[i];
      if (!e || e > ep) continue;
      let c;
      if (mode === 'type') {
        const g = px[i + 1];
        if (!g || g > 15) c = BASE_GREY;                         // built by 1975
        else {
          const k = g >> 2, t = g & 3;
          c = PERIODS[k][1] <= yr ? TYPE_RGB[t] : null;
          if (!c) continue;
        }
      } else c = RAMP_RGB[e - 1];
      o[j] = c[0]; o[j + 1] = c[1]; o[j + 2] = c[2]; o[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function thumb(canvas, yi) {
    // small whole-province picture for the before-and-after cards
    const s = canvas.width / W, ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const big = document.createElement('canvas'); big.width = W; big.height = H;
    paint(big, yi, 'year');
    ctx.drawImage(big, 0, 0, W * s, H * s);
  }

  function redraw() {
    paint(cvA, state.yi, state.mode);
    if (state.compare) paint(cvB, state.from, state.mode);
    clip();
  }

  // ---------------------------------------------------------------- swipe compare: left = earlier year, right = slider year
  const swipe = $('.ue-swipe');
  let swipeX = 0.5;
  function clip() {
    if (!ovA) return;
    if (!state.compare) { cvA.style.clipPath = ''; return; }
    const size = map.getSize(), x = swipeX * size.x;
    const nw = map.latLngToContainerPoint(bounds.getNorthWest()), se = map.latLngToContainerPoint(bounds.getSouthEast());
    const w = se.x - nw.x, cut = Math.max(0, Math.min(w, x - nw.x));
    // cvB (earlier year) on the left of the handle, cvA (slider year) on the right
    cvB.style.clipPath = `inset(0 ${(100 * (w - cut) / w).toFixed(3)}% 0 0)`;
    cvA.style.clipPath = `inset(0 0 0 ${(100 * cut / w).toFixed(3)}%)`;
    swipe.style.left = (100 * swipeX) + '%';
    $('.ue-swipe-l').textContent = YEARS[state.from]; $('.ue-swipe-r').textContent = YEARS[state.yi];
  }
  map.on('move zoom viewreset resize', clip);
  (function drag() {
    let on = false;
    const mv = e => {
      if (!on) return;
      const r = $('.ue-map').getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX);
      swipeX = Math.max(0.02, Math.min(0.98, (cx - r.left) / r.width)); clip(); e.preventDefault();
    };
    swipe.addEventListener('pointerdown', e => { on = true; swipe.setPointerCapture(e.pointerId); map.dragging.disable(); });
    swipe.addEventListener('pointermove', mv);
    swipe.addEventListener('pointerup', () => { on = false; map.dragging.enable(); });
    swipe.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') swipeX = Math.max(0.02, swipeX - 0.03);
      if (e.key === 'ArrowRight') swipeX = Math.min(0.98, swipeX + 0.03);
      clip();
    });
  })();
  function setCompare(on) {
    state.compare = on;
    root.classList.toggle('is-compare', on);
    $('.ue-compare-btn').setAttribute('aria-pressed', on);
    $('.ue-compare-btn').textContent = on ? 'Close the comparison' : 'Compare on the map';
    if (on) { if (!map.hasLayer(ovB)) ovB.addTo(map); ovA.bringToFront(); }
    else if (map.hasLayer(ovB)) map.removeLayer(ovB);
    if (on) { stop(); }
    redraw();
  }

  // ---------------------------------------------------------------- timeline
  const slider = $('.ue-slider');
  function setYear(yi, fromUser) {
    state.yi = yi; slider.value = yi;
    $('.ue-year').textContent = YEARS[yi];
    slider.setAttribute('aria-valuetext', YEARS[yi] + (OBSERVED.includes(YEARS[yi]) ? ', observed by satellite' : ', estimated between observations'));
    redraw(); stats(); legend();
    if (state.compare) thumbs();
    else thumbs();
  }
  function stop() { if (state.playing) { clearInterval(state.playing); state.playing = null; } $('.ue-play').setAttribute('aria-pressed', 'false'); $('.ue-play').innerHTML = PLAY; }
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg><span class="vh">Play</span>';
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg><span class="vh">Pause</span>';
  $('.ue-play').addEventListener('click', () => {
    if (state.playing) return stop();
    if (state.compare) setCompare(false);
    if (state.yi >= 9) setYear(0);
    $('.ue-play').setAttribute('aria-pressed', 'true'); $('.ue-play').innerHTML = PAUSE;
    state.playing = setInterval(() => { if (state.yi >= 9) return stop(); setYear(state.yi + 1); }, 900);
  });
  $('.ue-reset').addEventListener('click', () => { stop(); setYear(0); });
  slider.addEventListener('input', () => { stop(); setYear(+slider.value, true); });
  // satellite-observation marks on the track
  const marks = $('.ue-obs');
  OBSERVED.forEach(y => {
    const m = document.createElement('span'); m.className = 'ue-obs-mark'; m.style.left = (100 * (y - 1975) / 45) + '%';
    m.title = `${y}: observed by satellite`; marks.appendChild(m);
  });

  // ---------------------------------------------------------------- views and controls
  root.querySelectorAll('.ue-mode button').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    root.querySelectorAll('.ue-mode button').forEach(x => x.setAttribute('aria-pressed', x === b));
    redraw(); legend();
  }));
  $('.ue-base').addEventListener('click', () => {
    state.sat = !state.sat;
    if (state.sat) { map.removeLayer(light); sat.addTo(map).bringToBack(); } else { map.removeLayer(sat); light.addTo(map).bringToBack(); }
    $('.ue-base').setAttribute('aria-pressed', state.sat); $('.ue-base').textContent = state.sat ? 'Plain map' : 'Satellite';
  });
  $('.ue-compare-btn').addEventListener('click', () => setCompare(!state.compare));
  $('.ue-from').addEventListener('change', e => { state.from = +e.target.value; redraw(); thumbs(); });

  function legend() {
    const el = $('.ue-legend');
    if (state.mode === 'type') {
      el.innerHTML = '<p class="ue-leg-h">How the land was added</p>' +
        [1, 2, 3].map(t => `<span><i style="background:${TYPE[t][0]}"></i>${TYPE[t][1]}</span>`).join('') +
        `<span><i style="background:rgb(${BASE_GREY})"></i>Built by 1975</span>`;
    } else {
      const shown = [0, 3, 5, 7, 9].filter(k => k <= state.yi);
      el.innerHTML = '<p class="ue-leg-h">Built-up since</p>' + shown.map(k => `<span><i style="background:${RAMP[k]}"></i>${YEARS[k]}</span>`).join('');
    }
  }

  // ---------------------------------------------------------------- figures
  const areaSel = $('.ue-area');
  areaSel.addEventListener('change', () => {
    state.area = areaSel.value; stats(); chart();
    mask();
  });
  function series(key) { const a = data.areas[state.area][key]; return YEARS.map(y => a[y]); }
  function stats() {
    if (!data) return;
    const fp = series('footprint_km2'), y = state.yi;
    $('.ue-s0 b').textContent = fmt(fp[0]) + ' km²';
    $('.ue-s1 .ue-sl').textContent = `Built-up land, ${YEARS[y]}`;
    $('.ue-s1 b').textContent = fmt(fp[y]) + ' km²';
    const g = 100 * (fp[y] / fp[0] - 1);
    $('.ue-s2 .ue-sl').textContent = `Growth, 1975–${YEARS[y]}`;
    $('.ue-s2 b').textContent = (g >= 0 ? '+' : '') + fmt(g) + '%';
    const pop = series('pop'), m2 = series('m2_per_person');
    $('.ue-s3 b').textContent = pop[y] >= 1e6 ? fmt(pop[y] / 1e6, 1) + ' million' : fmt(Math.round(pop[y] / 1000) * 1000);
    $('.ue-s4 b').textContent = fmt(m2[y]) + ' m²';
    $('.ue-area-name').textContent = state.area === 'Gauteng' ? 'All of Gauteng' : state.area;
    chartMark();
  }

  // line chart (one series at a time, observed years as filled dots)
  const SER = { footprint_km2: ['Built-up land', 'km²', 0], pop: ['People', 'million', 1], m2_per_person: ['Built area per person', 'm²', 0] };
  let chartKey = 'footprint_km2';
  root.querySelectorAll('.ue-chart-tabs button').forEach(b => b.addEventListener('click', () => {
    chartKey = b.dataset.key; root.querySelectorAll('.ue-chart-tabs button').forEach(x => x.setAttribute('aria-pressed', x === b)); chart();
  }));
  function chart() {
    if (!data) return;
    const svg = $('.ue-chart svg'), Wc = 360, Hc = 150, L0 = 42, R0 = 20, T0 = 10, B0 = 24;
    let v = series(chartKey); const [lab, unit, dec] = SER[chartKey];
    if (chartKey === 'pop') v = v.map(x => x / 1e6);
    const lo = chartKey === 'm2_per_person' ? Math.floor(Math.min(...v) * 0.8 / 10) * 10 : 0;
    const hiRaw = Math.max(...v) * 1.08, step = niceStep((hiRaw - lo) / 4), hi = lo + step * Math.ceil((hiRaw - lo) / step);
    const X = i => L0 + (Wc - L0 - R0) * i / 9, Y = val => T0 + (Hc - T0 - B0) * (1 - (val - lo) / (hi - lo));
    let g = '';
    for (let t = lo; t <= hi + 1e-9; t += step)
      g += `<line x1="${L0}" x2="${Wc - R0}" y1="${Y(t)}" y2="${Y(t)}" class="ue-grid"/><text x="${L0 - 6}" y="${Y(t) + 3.5}" class="ue-ax" text-anchor="end">${fmt(t, dec && step < 1 ? 1 : 0)}</text>`;
    [0, 3, 5, 7, 9].forEach(i => (g += `<text x="${X(i)}" y="${Hc - 8}" class="ue-ax" text-anchor="middle">${YEARS[i]}</text>`));
    const pts = v.map((val, i) => `${X(i).toFixed(1)},${Y(val).toFixed(1)}`).join(' ');
    g += `<polygon points="${X(0)},${Y(lo)} ${pts} ${X(9)},${Y(lo)}" class="ue-area-fill"/><polyline points="${pts}" class="ue-line"/>`;
    v.forEach((val, i) => {
      const obs = OBSERVED.includes(YEARS[i]);
      g += `<circle cx="${X(i)}" cy="${Y(val)}" r="${obs ? 4 : 3.2}" class="${obs ? 'ue-dot' : 'ue-dot ue-dot-est'}"><title>${YEARS[i]}: ${fmt(val, dec)} ${unit}${obs ? '' : ' (estimate between satellite observations)'}</title></circle>`;
    });
    g += `<line class="ue-now" x1="0" x2="0" y1="${T0}" y2="${Hc - B0}"/>`;
    svg.innerHTML = g;
    svg.setAttribute('aria-label', `${lab} in ${state.area === 'Gauteng' ? 'Gauteng' : state.area}, 1975 to 2020, in ${unit}`);
    $('.ue-chart-unit').textContent = unit;
    svg._X = X;
    chartMark();
  }
  function chartMark() {
    const svg = $('.ue-chart svg'), l = svg && svg.querySelector('.ue-now');
    if (l && svg._X) { const x = svg._X(state.yi); l.setAttribute('x1', x); l.setAttribute('x2', x); }
  }
  function niceStep(r) { const p = Math.pow(10, Math.floor(Math.log10(r))), f = r / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }

  function thumbs() {
    if (!px) return;
    const a = $('.ue-thumb-a canvas'), b = $('.ue-thumb-b canvas');
    thumb(a, state.from); thumb(b, state.yi);
    $('.ue-thumb-a .ue-tag').textContent = YEARS[state.from]; $('.ue-thumb-b .ue-tag').textContent = YEARS[state.yi];
  }

  // ---------------------------------------------------------------- municipalities: outline, mask and click
  let muniLayer = null, maskLayer = null;
  function mask() {
    if (maskLayer) { map.removeLayer(maskLayer); maskLayer = null; }
    if (!munis) return;
    muniLayer.setStyle(f => ({ color: '#23312F', weight: f.properties.name === state.area ? 2.4 : 0.8, opacity: f.properties.name === state.area ? 1 : 0.55,
      fill: false, dashArray: f.properties.name === state.area ? null : '3 3' }));
    if (state.area === 'Gauteng') { map.fitBounds(bounds, { padding: [8, 8] }); return; }
    const f = munis.features.find(x => x.properties.name === state.area); if (!f) return;
    const world = [[-90, -180], [-90, 180], [90, 180], [90, -180]];
    const rings = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => p[0].map(([x, y]) => [y, x]));
    maskLayer = L.polygon([world, ...rings], { stroke: false, fillColor: '#EEF0E6', fillOpacity: 0.62, interactive: false }).addTo(map);
    map.fitBounds(L.geoJSON(f).getBounds(), { padding: [12, 12] });
  }
  function inPoly(pt, poly) {                               // ray casting, poly = [[x,y],...]
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function muniAt(ll) {
    if (!munis) return null;
    const p = [ll.lng, ll.lat];
    const f = munis.features.find(x => (x.geometry.type === 'Polygon' ? [x.geometry.coordinates] : x.geometry.coordinates).some(r => inPoly(p, r[0])));
    return f ? f.properties.name : null;
  }
  map.on('click', e => {
    if (!px) return;
    const nw = L.CRS.EPSG3857.project(bounds.getNorthWest()), se = L.CRS.EPSG3857.project(bounds.getSouthEast()), q = L.CRS.EPSG3857.project(e.latlng);
    const c = Math.floor((q.x - nw.x) / (se.x - nw.x) * W), r = Math.floor((nw.y - q.y) / (nw.y - se.y) * H);
    if (c < 0 || r < 0 || c >= W || r >= H) return;
    const i = 4 * (r * W + c);
    if (!px[i + 3]) return;
    const e0 = px[i], g = px[i + 1], b = px[i + 2], name = muniAt(e.latlng);
    let h = `<b>${name || 'Gauteng'}</b><dl>`;
    h += `<dt>Built-up since</dt><dd>${e0 ? YEARS[e0 - 1] + (e0 === 1 ? ' or earlier' : '') : 'not built-up by 2020'}</dd>`;
    h += `<dt>Built over in 2020</dt><dd>${fmt(b * 40 / 100)}% of the hectare</dd>`;
    if (g && g <= 15) h += `<dt>How it was added</dt><dd>${TYPE[g & 3][1]}, ${PERIODS[g >> 2][0]}–${PERIODS[g >> 2][1]}</dd>`;
    h += '</dl><p>A hectare counts as built-up once a fifth of it is covered by buildings.</p>';
    L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent(h).openOn(map);
  });

  // ---------------------------------------------------------------- places
  const blank = L.divIcon({ className: 'sm-blank', iconSize: [0, 0] });
  const labels = L.layerGroup().addTo(map);
  function declutter() {
    const kept = [];
    labels.eachLayer(l => {
      const tt = l.getTooltip && l.getTooltip(), el = tt && tt.getElement(); if (!el) return;
      el.style.visibility = ''; const r = el.getBoundingClientRect(); if (!r.width) return;
      const hit = kept.some(k => r.left < k.right + 3 && r.right > k.left - 3 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
      if (hit) el.style.visibility = 'hidden'; else kept.push(r);
    });
  }
  map.on('zoomend', () => requestAnimationFrame(declutter));

  // ---------------------------------------------------------------- load
  Promise.all([fetch(BASE + 'manifest.json').then(r => r.json()), fetch(BASE + 'data.json').then(r => r.json()),
               fetch(BASE + 'municipalities.geojson').then(r => r.json()), fetch(BASE + 'places.geojson').then(r => r.json())])
    .then(([man, d, m, places]) => {
      data = d; munis = m;
      bounds = L.latLngBounds(man.grid.bounds);
      map.setMaxBounds(bounds.pad(0.4));
      map.fitBounds(bounds, { padding: [8, 8] });
      muniLayer = L.geoJSON(m, { interactive: false, style: { color: '#23312F', weight: 0.8, opacity: 0.55, fill: false, dashArray: '3 3' } }).addTo(map);
      places.features.sort((a, b) => (a.properties.rank === 'city' ? -1 : 1)).forEach(f => {
        const p = f.properties;
        L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { radius: p.rank === 'city' ? 3.6 : 2.6, color: '#F4EFE3', weight: 1,
          fillColor: '#23312F', fillOpacity: 1, interactive: false })
          .bindTooltip(p.name, { permanent: true, direction: 'right', offset: [4, 0], className: 'sm-town' + (p.rank === 'city' ? ' ue-city' : ' sm-town-minor') })
          .addTo(labels);
      });
      requestAnimationFrame(() => requestAnimationFrame(declutter));
      stats(); chart();
      return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = BASE + man.grid.src; });
    })
    .then(im => {
      W = im.naturalWidth; H = im.naturalHeight;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
      px = ctx.getImageData(0, 0, W, H).data;
      [cvA, cvB].forEach(cv => { cv.width = W; cv.height = H; });
      ovA = new CanvasOverlay(cvA, bounds, { interactive: false }).addTo(map);
      ovB = new CanvasOverlay(cvB, bounds, { interactive: false });
      root.classList.add('is-ready');
      setYear(9); legend();
    })
    .catch(err => { $('.ue-map').insertAdjacentHTML('beforeend', '<p class="ue-err">The map data could not be loaded. Please refresh the page.</p>'); console.error(err); });
})();
