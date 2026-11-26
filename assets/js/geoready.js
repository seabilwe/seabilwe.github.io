/* GeoReady: solar investment readiness, Northern Cape. MapLibre GL + GeoJSON + SVG.
   One map, three grid scenarios: GCCA 2025 as published, upstream strengthened, no grid limit.
   Zones are coloured by readiness; the chart is the scenario's supply curve; clicking a zone
   (on the map or on the chart) shows its criteria. */
(() => {
  const root = document.querySelector('[data-geoready]');
  if (!root || !window.maplibregl) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const BASE = new URL(root.dataset.base, location.href).href;
  const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const READY = ['#F1E8D6', '#E2C79D', '#C99A64', '#A0673A', '#6B3F22'];   // readiness 0-0.2 ... 0.8-1
  const INK = '#23312F', BAR = '#A0673A';
  const SC = { published: 'p', strengthened: 's', unconstrained: 'u' };
  const CRIT = { resource: 'Solar resource', cost: 'Indicative cost', grid_access: 'Distance to grid', grid_headroom: 'Grid headroom', permitting: 'In a solar REDZ' };
  let D, Z, scen = 'published', sel = null;

  // ---------------------------------------------------------------- map
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const map = new maplibregl.Map({
    container: $('.gr-map'), center: [21.6, -29.3], zoom: 5.2, minZoom: 4.5, maxZoom: 11,
    maxBounds: [[12, -36], [31, -21]], attributionControl: false, dragRotate: false, pitchWithRotate: false,
    style: {
      version: 8,
      sources: { light: { type: 'raster', tiles: [ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#ECEDE6' } },
        { id: 'light', type: 'raster', source: 'light', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.9 } },
      ],
    },
  });
  map.scrollZoom.disable();
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution:
    '<details class="sm-credit"><summary>Credits</summary><span>Solar: Global Solar Atlas 2.0 (World Bank Group, Solargis) · Grid limits: NTCSA GCCA 2025 · ' +
    'Land cover: DFFE SANLC 2022 · Protected areas: WDPA · REDZ: DFFE/CSIR · Terrain: Copernicus DEM · Substations: © OpenStreetMap contributors · ' +
    'Basemap: Esri, HERE, Garmin</span></details>' }), 'bottom-right');
  const mapEl = $('.gr-map');
  mapEl.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) map.scrollZoom.enable(); }, { passive: true });
  mapEl.addEventListener('mouseleave', () => map.scrollZoom.disable());
  mapEl.addEventListener('click', () => map.scrollZoom.enable());

  const fillColor = () => ['case', ['==', ['get', 'r_' + SC[scen]], null], '#D9D4CB',
    ['step', ['get', 'r_' + SC[scen]], READY[0], 0.2, READY[1], 0.4, READY[2], 0.6, READY[3], 0.8, READY[4]]];

  let ready = false;
  function init() {
    if (ready || !D || !Z || !map.isStyleLoaded()) return;
    ready = true;
    map.addSource('prov', { type: 'geojson', data: BASE + 'province.geojson' });
    map.addSource('zones', { type: 'geojson', data: Z, promoteId: 'id' });
    map.addSource('gcca', { type: 'geojson', data: BASE + 'gcca.geojson' });
    map.addSource('excl', { type: 'image', url: BASE + D.image.url, coordinates: D.image.coordinates });
    const bb = new maplibregl.LngLatBounds(); D.image.coordinates.forEach(c => bb.extend(c));
    map.fitBounds(bb, { padding: { top: 20, bottom: 20, left: 20, right: 150 }, duration: 0 });
    map.addLayer({ id: 'zones', type: 'fill', source: 'zones', paint: { 'fill-color': fillColor(), 'fill-opacity': 0.95 } });
    map.addLayer({ id: 'zones-alloc', type: 'line', source: 'zones', filter: ['>', ['get', 'a_p'], 0],
      paint: { 'line-color': INK, 'line-width': 1.6 } });
    map.addLayer({ id: 'excl', type: 'raster', source: 'excl', paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } });
    map.addLayer({ id: 'prov', type: 'line', source: 'prov', paint: { 'line-color': INK, 'line-width': 1.2, 'line-opacity': 0.7 } });
    map.addLayer({ id: 'gcca', type: 'line', source: 'gcca', layout: { visibility: 'none' },
      paint: { 'line-color': '#2F6F9A', 'line-width': 1.4, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'hover', type: 'line', source: 'zones', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': INK, 'line-width': 1.2 } });
    map.addLayer({ id: 'sel', type: 'line', source: 'zones', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#A33B2B', 'line-width': 3 } });
    map.on('mousemove', 'zones', e => { map.getCanvas().style.cursor = 'pointer'; map.setFilter('hover', ['==', ['get', 'id'], e.features[0].properties.id]); });
    map.on('mouseleave', 'zones', () => { map.getCanvas().style.cursor = ''; map.setFilter('hover', ['==', ['get', 'id'], '']); });
    map.on('click', 'zones', e => select(e.features[0].properties.id, false));
    update();
  }
  map.on('load', init);
  map.on('style.load', init);

  Promise.all([fetch(BASE + 'data.json').then(r => r.json()), fetch(BASE + 'zones.geojson').then(r => r.json())])
    .then(([d, z]) => { D = d; Z = z; init(); if (!ready) setTimeout(init, 300); })
    .catch(err => { const p = document.createElement('p'); p.className = 'ue-err'; p.textContent = 'The map data could not be loaded (' + err.message + ').'; $('.ue-mapwrap').appendChild(p); });

  const zone = id => Z.features.find(f => f.properties.id === id)?.properties;

  // ---------------------------------------------------------------- side tiles
  function tiles() {
    const s = D.scenarios[scen], z = D.zones;
    $('.ue-area-name').textContent = s.label;
    const t = (l, v, c) => `<div class="ue-tile${c ? ' ' + c : ''}"><span class="ue-sl">${l}</span><b>${v}</b></div>`;
    $('.gr-tiles-a').innerHTML = t('Connectable capacity', s.mw >= 1e5 ? nf(s.mw / 1000) + ' GW' : nf(s.mw) + ' MW', 'ue-s2') +
      t('Zones with capacity', nf(s.zones) + ' of ' + nf(z.n)) + t('Median readiness', nf(s.median_readiness, 2));
    $('.gr-tiles-b').innerHTML = t('Eligible land in zones', nf(Math.round(z.eligible_km2 / 1000)) + ',000 km²') +
      t('Technical potential', nf(z.tech_mw / 1000) + ' GW');
  }

  // ---------------------------------------------------------------- supply curve (one measure, one axis)
  const svg = $('.gr-chart svg'), W = 360, H = 170, L0 = 44, R0 = 12, T0 = 12, B0 = 28;
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  function chart() {
    const c = D.curves[scen], band = D.reference_bids, ymax = 1000;
    const Y = v => T0 + (H - T0 - B0) * (1 - v / ymax);
    let out = '';
    for (let v = 0; v <= ymax; v += 250) out += `<line class="ue-grid" x1="${L0}" x2="${W - R0}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ue-ax" x="${L0 - 6}" y="${Y(v) + 3.5}" text-anchor="end">${nf(v)}</text>`;
    const bandSvg = `<rect class="gr-band" x="${L0}" width="${W - L0 - R0}" y="${Y(band[1] + 8)}" height="${Math.max(Y(band[0] - 8) - Y(band[1] + 8), 3)}"><title>REIPPPP Bid Window 7 solar bids, R${band[0]}–${band[1]}/MWh</title></rect>`;
    if (!c.length) {
      out = `<line class="ue-grid" x1="${L0}" x2="${W - R0}" y1="${Y(0)}" y2="${Y(0)}"/><text class="ue-ax" x="${L0 - 6}" y="${Y(0) + 3.5}" text-anchor="end">0</text>` + bandSvg;
      out += `<text class="gr-zero" x="${(L0 + W - R0) / 2}" y="${Y(820)}" text-anchor="middle">0 MW can connect</text>`;
      out += `<text class="ue-ax" x="${(L0 + W - R0) / 2}" y="${Y(820) + 18}" text-anchor="middle">every zone is behind a 0 MW local-area or supply-area limit</text>`;
      $('.gr-chart-foot').innerHTML = `<span>Switch scenario to see a curve</span><span><i class="gr-bid"></i>Recent bids, R${band[0]}–${band[1]}</span>`;
      svg.innerHTML = out; return;
    }
    const total = c[c.length - 1][2], gw = total > 20000, sc = gw ? 1000 : 1, unit = gw ? 'GW' : 'MW';
    const xmax = total / sc, step = niceStep(xmax / 4);
    const X = v => L0 + (W - L0 - R0) * v / xmax;
    for (let v = 0; v <= xmax + 1e-9; v += step) out += `<text class="ue-ax" x="${X(v)}" y="${H - B0 + 14}" text-anchor="middle">${nf(v)}</text>`;
    if (c.length > 150) {   // thousands of thin steps: draw the outline
      let d = `M${X(0)},${Y(0)}`;
      c.forEach(r => { d += `L${X(r[1] / sc)},${Y(r[3])}L${X(r[2] / sc)},${Y(r[3])}`; });
      d += `L${X(xmax)},${Y(0)}Z`;
      out += `<path class="gr-area" d="${d}"><title>${nf(c.length)} zones, cheapest first: R${nf(c[0][3])} to R${nf(c[c.length - 1][3])}/MWh</title></path>`;
    } else {
      c.forEach(r => {
        const x0 = X(r[1] / sc), x1 = X(r[2] / sc), wpx = Math.max(x1 - x0 - 1, 1.2);
        out += `<g class="gr-step${sel === r[0] ? ' on' : ''}" data-id="${r[0]}" tabindex="0" role="button" aria-label="Zone ${r[0]}: ${nf(r[2] - r[1])} MW at R${nf(r[3])} per MWh">` +
          `<rect x="${x0}" y="${Y(r[3])}" width="${wpx}" height="${Y(0) - Y(r[3])}" rx="1.5"/>` +
          `<title>Zone ${r[0]}: ${nf(r[2] - r[1])} MW, R${nf(r[3])}/MWh (low and high cases R${nf(r[4])} and R${nf(r[5])})</title></g>`;
      });
    }
    out += bandSvg + `<text class="ue-ax" x="${W - R0}" y="${H - 4}" text-anchor="end">${unit}, cheapest first</text>`;
    svg.innerHTML = out;
    $('.gr-chart-foot').innerHTML = `<span>Bars: indicative LCOE, base costs</span><span><i class="gr-bid"></i>Recent bids, R${band[0]}–${band[1]}</span>`;
    svg.querySelectorAll('.gr-step').forEach(g => {
      const go = () => select(g.dataset.id, true);
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // ---------------------------------------------------------------- zone detail
  const LIMIT = { sub: 'substation', local: 'local area', supply: 'supply area' };
  function binding(b, p) {
    if (!b || b === 'capacity') return 'Nothing: the zone gets its full technical capacity.';
    if (b === 'target') return 'The target was met.';
    if (b.startsWith('unknown')) return 'Unknown: the substation is not in the GCCA table, so no headroom is assumed.';
    const [lvl, name] = b.split(':');
    const lim = lvl === 'sub' ? p.lsub : lvl === 'local' ? p.lloc : p.lsup;
    return `The ${LIMIT[lvl]} limit: ${esc(name.replace('/', ' · '))} (${nf(lim)} MW${lim > 0 ? ', shared by every zone behind it' : ''}).`;
  }
  function detail() {
    const box = $('.gr-detail-body');
    if (!sel) { box.innerHTML = '<p class="gr-hint">Click a zone on the map, or a bar on the chart, to see what makes it more or less ready.</p>'; return; }
    const p = zone(sel); if (!p) return;
    const k = SC[scen], r = p['r_' + k];
    const bars = Object.entries(CRIT).map(([c, lab]) => {
      const v = c === 'grid_headroom' ? (p.mw > 0 ? p['a_' + k] / p.mw : null) : p['n_' + c];
      const w = D.readiness[c].weight;
      return `<div class="gr-crit"><span>${lab} <small>×${nf(w, 2)}</small></span><i><b style="width:${v == null ? 0 : (100 * v).toFixed(0)}%"></b></i><em>${v == null ? '–' : nf(v, 2)}</em></div>`;
    }).join('');
    box.innerHTML = `<p class="gr-zone"><b>Zone ${esc(p.id)}</b> · ${esc(p.sub)} substation · ${esc(p.la)}</p>
      <p class="gr-score"><span>Readiness</span><b>${r == null ? '–' : nf(r, 2)}</b></p>
      ${bars}
      <dl class="gr-facts">
        <div><dt>Eligible land</dt><dd>${nf(p.km2)} km²</dd></div>
        <div><dt>Technical capacity</dt><dd>${nf(p.mw)} MW</dd></div>
        <div><dt>Connectable here</dt><dd>${nf(p['a_' + k])} MW</dd></div>
        <div><dt>LCOE, base (low–high)</dt><dd>R${nf(p.lc)} (${nf(p.lo)}–${nf(p.hi)})</dd></div>
        <div><dt>PVOUT</dt><dd>${nf(p.pv)} kWh/kWp</dd></div>
        <div><dt>To a ≥132 kV substation</dt><dd>${nf(p.gk, 1)} km</dd></div>
      </dl>
      <p class="gr-bind"><b>What limits it:</b> ${binding(p['b_' + k], p)}</p>`;
  }

  function select(id, fly) {
    sel = id;
    map.setFilter('sel', ['==', ['get', 'id'], id || '']);
    if (fly && id) {
      const f = Z.features.find(f => f.properties.id === id);
      if (f) { const b = new maplibregl.LngLatBounds(); f.geometry.coordinates.flat(f.geometry.type === 'MultiPolygon' ? 2 : 1).forEach(c => b.extend(c)); map.easeTo({ center: b.getCenter(), zoom: Math.max(map.getZoom(), 7.2), duration: 700 }); }
    }
    chart(); detail();
  }

  // ---------------------------------------------------------------- legend
  function legend() {
    const r = READY.map((c, i) => `<span><i style="background:${c}"></i>${(i / 5).toFixed(1)}–${((i + 1) / 5).toFixed(1)}</span>`).join('');
    const ex = $('.gr-excl').getAttribute('aria-pressed') === 'true';
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    const codes = ex ? ['1', '2', '3', '4'].map(k => `<span><i style="background:${D.codes[k].color}"></i>${esc(cap(D.codes[k].label))}</span>`).join('') +
      '<span><i style="background:#E4E4E0;border:1px solid #CFCFC8"></i>Blank: over 50 km from a substation</span>' : '';
    $('.gr-legend').innerHTML = `<p class="ue-leg-h">Readiness</p>${r}${scen === 'unconstrained' ? '' : '<span><i class="gr-out"></i>Gets MW in this scenario</span>'}` +
      (ex ? `<div class="gr-leg-ex"><p class="ue-leg-h" style="margin-top:.35rem">Excluded</p>${codes}</div>` : '');
  }

  function update() {
    if (!ready) return;
    map.setPaintProperty('zones', 'fill-color', fillColor());
    map.setFilter('zones-alloc', ['>', ['get', 'a_' + SC[scen]], 0]);
    map.setLayoutProperty('zones-alloc', 'visibility', scen === 'unconstrained' ? 'none' : 'visible');
    tiles(); chart(); detail(); legend();
  }

  // ---------------------------------------------------------------- controls
  $$('.gr-scen button').forEach(b => b.addEventListener('click', () => {
    scen = b.dataset.s;
    $$('.gr-scen button').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    $('.gr-legend').dataset.s = scen;
    update();
  }));
  const chip = (cls, layer) => $(cls).addEventListener('click', e => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (ready) map.setLayoutProperty(layer, 'visibility', on ? 'visible' : 'none');
    legend();
  });
  chip('.gr-excl', 'excl');
  chip('.gr-gcca', 'gcca');
})();
