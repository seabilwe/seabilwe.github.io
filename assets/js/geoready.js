/* GeoReady: solar investment readiness, Northern Cape.
   Three steps: pick a grid scenario, click a zone on the map, download.
   MapLibre GL + GeoJSON; the supply curve is plain SVG; downloads are made in the browser. */
(() => {
  const root = document.querySelector('[data-geoready]');
  if (!root || !window.maplibregl) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const BASE = new URL(root.dataset.base, location.href).href;
  const RUN = root.dataset.run, DATE = root.dataset.date;
  const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GOLD = ['#F5ECCB', '#EDD38A', '#D9AE4A', '#B07F26', '#6E4E17'];   // readiness 0-0.2 ... 0.8-1
  const INK = '#23312F', LINE = '#2F5D7C';
  const KEY = { published: 'p', strengthened: 's', unconstrained: 'u' };
  const NAME = { published: 'As the grid stands', strengthened: 'If the backbone were reinforced', unconstrained: 'With no grid limit' };
  const CRIT = [['resource', 'Solar resource'], ['cost', 'Indicative cost'], ['grid_access', 'Close to the grid'], ['grid_headroom', 'Grid headroom'], ['permitting', 'In a solar REDZ']];
  let D, Z, scen = 'published', sel = null, ready = false;

  // ---------------------------------------------------------------- map
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const map = new maplibregl.Map({
    container: $('.gr-map'), center: [21.6, -29.3], zoom: 5.2, minZoom: 4.5, maxZoom: 11,
    maxBounds: [[11, -37], [32, -20]], attributionControl: false, dragRotate: false, pitchWithRotate: false,
    canvasContextAttributes: { preserveDrawingBuffer: true },
    style: {
      version: 8,
      sources: { light: { type: 'raster', tiles: [ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#E9EAE3' } },
        { id: 'light', type: 'raster', source: 'light', paint: { 'raster-saturation': -0.7, 'raster-opacity': 0.85 } },
      ],
    },
  });
  map.scrollZoom.disable();
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution:
    'Solar: Global Solar Atlas 2.0 (World Bank Group, Solargis) · Grid limits: NTCSA GCCA 2025 · Land cover: DFFE SANLC 2022 · Protected areas: WDPA · ' +
    'REDZ: DFFE/CSIR · Terrain: Copernicus DEM · Substations: © OpenStreetMap contributors · Basemap: Esri' }), 'bottom-right');
  const mapEl = $('.gr-map');
  map.once('load', () => { const a = mapEl.querySelector('.maplibregl-ctrl-attrib'); if (a) a.classList.remove('maplibregl-compact-show'); });
  mapEl.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) map.scrollZoom.enable(); }, { passive: true });
  mapEl.addEventListener('mouseleave', () => map.scrollZoom.disable());

  const rKey = () => 'r_' + KEY[scen], aKey = () => 'a_' + KEY[scen];
  const fill = () => ['case', ['==', ['get', rKey()], null], '#D9D4CB',
    ['step', ['get', rKey()], GOLD[0], 0.2, GOLD[1], 0.4, GOLD[2], 0.6, GOLD[3], 0.8, GOLD[4]]];

  function init() {
    if (ready || !D || !Z || !map.isStyleLoaded()) return;
    ready = true;
    const bb = new maplibregl.LngLatBounds(); D.image.coordinates.forEach(c => bb.extend(c));
    map.fitBounds(bb, { padding: { top: 30, bottom: 30, left: 30, right: 30 }, duration: 0 });
    map.addSource('prov', { type: 'geojson', data: BASE + 'province.geojson' });
    map.addSource('zones', { type: 'geojson', data: Z });
    map.addSource('gcca', { type: 'geojson', data: BASE + 'gcca.geojson' });
    map.addSource('excl', { type: 'image', url: BASE + D.image.url, coordinates: D.image.coordinates });
    map.addLayer({ id: 'zones', type: 'fill', source: 'zones', paint: { 'fill-color': fill(), 'fill-opacity': 0.95 } });
    map.addLayer({ id: 'excl', type: 'raster', source: 'excl', paint: { 'raster-opacity': 0.9, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } });
    map.addLayer({ id: 'alloc', type: 'line', source: 'zones', filter: ['>', ['get', 'a_p'], 0], paint: { 'line-color': INK, 'line-width': 1.8 } });
    map.addLayer({ id: 'prov', type: 'line', source: 'prov', paint: { 'line-color': INK, 'line-width': 1.2, 'line-opacity': 0.65 } });
    map.addLayer({ id: 'gcca', type: 'line', source: 'gcca', layout: { visibility: 'none' }, paint: { 'line-color': LINE, 'line-width': 1.3, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: 'hover', type: 'line', source: 'zones', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': INK, 'line-width': 1.2 } });
    map.addLayer({ id: 'sel', type: 'line', source: 'zones', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': LINE, 'line-width': 3.5 } });
    map.on('mousemove', 'zones', e => { map.getCanvas().style.cursor = 'pointer'; map.setFilter('hover', ['==', ['get', 'id'], e.features[0].properties.id]); });
    map.on('mouseleave', 'zones', () => { map.getCanvas().style.cursor = ''; map.setFilter('hover', ['==', ['get', 'id'], '']); });
    map.on('click', 'zones', e => select(e.features[0].properties.id, false));
    update();
  }
  map.on('load', init);
  map.on('style.load', init);

  Promise.all([fetch(BASE + 'data.json').then(r => r.json()), fetch(BASE + 'zones.geojson').then(r => r.json())])
    .then(([d, z]) => { D = d; Z = z; init(); chart(); keyBox(); intro(); })
    .catch(err => { const p = $('.gr-maperr'); p.hidden = false; p.textContent = 'The map data did not load (' + err.message + '). Reload the page to try again.'; });

  const zone = id => Z.features.find(f => f.properties.id === id);

  // ---------------------------------------------------------------- key
  function keyBox() {
    const ex = $('.gr-excl').checked;
    const exk = ['1', '2', '3', '4'].map(k => `<span><i style="background:${D.codes[k].color}"></i>${esc(D.codes[k].label[0].toUpperCase() + D.codes[k].label.slice(1))}</span>`).join('');
    $('.gr-key').innerHTML =
      `<div class="gr-ramp">${GOLD.map(c => `<i style="background:${c}"></i>`).join('')}</div>` +
      '<div class="gr-ramp-l"><span>Less ready</span><span>More ready</span></div>' +
      (scen !== 'unconstrained' ? '<div class="gr-key-row" style="display:flex"><span><i class="out"></i>Gets grid capacity</span></div>' : '') +
      (ex ? `<div class="gr-key-row">${exk}</div>` : '');
  }

  // ---------------------------------------------------------------- supply curve
  const svg = $('.gr-chart svg'), H = 320, L0 = 56, R0 = 16, T0 = 36, B0 = 40;
  let W = 900;
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  function intro() {
    const s = D.scenarios[scen];
    $('.gr-curve-intro').textContent = scen === 'published'
      ? 'As the grid stands there is no curve to draw: no zone can connect. Pick another scenario in step 1 to see one.'
      : `The ${nf(s.zones)} zones that can connect, cheapest first, adding up to ${s.mw >= 1e5 ? nf(s.mw / 1000) + ' GW' : nf(s.mw) + ' MW'}. A flat curve means cost hardly differs; the grid decides which zones go first.`;
  }
  function chart() {
    if (!D) return;
    W = svg.clientWidth && svg.clientWidth < 620 ? 560 : 900;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const c = D.curves[scen], bid = (D.reference_bids[0] + D.reference_bids[1]) / 2, ymax = 1000;
    const Y = v => T0 + (H - T0 - B0) * (1 - v / ymax);
    let out = '';
    for (let v = 0; v <= ymax; v += 250) out += `<line class="gr-gridl" x1="${L0}" x2="${W - R0}" y1="${Y(v)}" y2="${Y(v)}"/><text class="gr-ax" x="${L0 - 8}" y="${Y(v) + 4}" text-anchor="end">${nf(v)}</text>`;
    out += `<text class="gr-ax" x="${L0 - 8}" y="${T0 - 18}" text-anchor="end">R/MWh</text>`;
    const bidLine = `<line class="gr-bidl" x1="${L0}" x2="${W - R0}" y1="${Y(bid)}" y2="${Y(bid)}"/><text class="gr-bidt" x="${W - R0}" y="${Y(bid) + 18}" text-anchor="end">Recent bids, R${D.reference_bids[0]}–${D.reference_bids[1]}</text>`;
    if (!c.length) {
      svg.innerHTML = out + bidLine + `<text class="gr-zero" x="${(L0 + W - R0) / 2}" y="${Y(820)}" text-anchor="middle">0 MW can connect</text>` +
        `<text class="gr-zero-s" x="${(L0 + W - R0) / 2}" y="${Y(820) + 26}" text-anchor="middle">${W < 900 ? 'Every zone is behind a 0 MW limit.' : 'Every zone sits behind a local-area or supply-area limit of 0 MW.'}</text>`;
      return;
    }
    const total = c[c.length - 1][2], gw = total > 20000, sc = gw ? 1000 : 1, xmax = total / sc, step = niceStep(xmax / 5);
    const X = v => L0 + (W - L0 - R0) * v / xmax;
    for (let v = 0; v <= xmax + 1e-9; v += step) out += `<text class="gr-ax" x="${X(v)}" y="${H - B0 + 20}" text-anchor="middle">${nf(v)}</text>`;
    out += `<text class="gr-ax" x="${(L0 + W - R0) / 2}" y="${H - 2}" text-anchor="middle">Capacity that can connect, ${gw ? 'GW' : 'MW'}, cheapest zones first</text>`;
    if (c.length > 150) {
      let d = `M${X(0)},${Y(0)}`;
      c.forEach(r => { d += `L${X(r[1] / sc)},${Y(r[3])}L${X(r[2] / sc)},${Y(r[3])}`; });
      out += `<path class="gr-area" d="${d}L${X(xmax)},${Y(0)}Z"><title>${nf(c.length)} zones, from R${nf(c[0][3])} to R${nf(c[c.length - 1][3])} per MWh</title></path>`;
    } else {
      c.forEach(r => {
        const x0 = X(r[1] / sc), w = Math.max(X(r[2] / sc) - x0 - 2, 2);
        out += `<g class="gr-bar${sel === r[0] ? ' on' : ''}" data-id="${r[0]}" tabindex="0" role="button" aria-label="Zone ${r[0]}, ${nf(r[2] - r[1])} MW at R${nf(r[3])} per MWh. Show on the map.">` +
          `<rect x="${x0}" y="${Y(r[3])}" width="${w}" height="${Y(0) - Y(r[3])}" rx="2"/><title>Zone ${r[0]}: ${nf(r[2] - r[1])} MW at R${nf(r[3])}/MWh</title></g>`;
      });
    }
    svg.innerHTML = out + bidLine;
    svg.querySelectorAll('.gr-bar').forEach(g => {
      const go = () => { select(g.dataset.id, true); $('#gr-step2').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
      g.addEventListener('click', go);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  // ---------------------------------------------------------------- zone details
  const LEVEL = { sub: 'substation', local: 'local area', supply: 'supply area' };
  function limitText(b, p) {
    if (!b || b === 'capacity') return 'Nothing in this scenario: the zone can connect its full capacity.';
    if (b.startsWith('unknown')) return 'Unknown: the substation is not in the GCCA table, so no capacity is assumed.';
    const [lvl, name] = b.split(':');
    const lim = lvl === 'sub' ? p.lsub : lvl === 'local' ? p.lloc : p.lsup;
    return `The ${LEVEL[lvl]} limit of ${esc(name.replace('/', ', '))}: ${nf(lim)} MW${lim > 0 ? ', shared by every zone behind it' : ''}.`;
  }
  function drawer() {
    const box = $('.gr-drawer');
    if (!sel) { box.hidden = true; return; }
    const p = zone(sel).properties, k = KEY[scen], r = p['r_' + k];
    const crit = CRIT.map(([c, lab]) => {
      const v = c === 'grid_headroom' ? (p.mw > 0 ? p['a_' + k] / p.mw : null) : p['n_' + c];
      return `<div class="gr-crit"><span>${lab}<small>weight ${nf(D.readiness[c].weight, 2)}</small></span><i><b style="width:${v == null ? 0 : (100 * v).toFixed(0)}%"></b></i><em>${v == null ? '–' : nf(v, 2)}</em></div>`;
    }).join('');
    $('.gr-drawer-body').innerHTML = `
      <p class="gr-zone-id">Zone ${esc(p.id)}</p>
      <h3 class="gr-zone-h">Near ${esc(p.sub)} substation, ${esc(p.la)}</h3>
      <p class="gr-score"><b>${r == null ? '–' : nf(r, 2)}</b><span>readiness out of 1, ${NAME[scen].toLowerCase()}</span></p>
      ${crit}
      <dl class="gr-facts">
        <div><dt>Can connect here</dt><dd>${nf(p['a_' + k])} MW</dd></div>
        <div><dt>Room for</dt><dd>${nf(p.mw)} MW</dd></div>
        <div><dt>Eligible land</dt><dd>${nf(p.km2)} km²</dd></div>
        <div><dt>Cost, base (low–high)</dt><dd>R${nf(p.lc)} (${nf(p.lo)}–${nf(p.hi)}) /MWh</dd></div>
        <div><dt>Solar yield</dt><dd>${nf(p.pv)} kWh/kWp a year</dd></div>
        <div><dt>To a substation</dt><dd>${nf(p.gk, 1)} km</dd></div>
      </dl>
      <p class="gr-bind"><b>What limits it:</b> ${limitText(p['b_' + k], p)}</p>
      <button type="button" class="gr-zone-dl" data-dl="zone">Download this zone (CSV)</button>`;
    box.hidden = false;
  }
  function select(id, fly) {
    sel = id;
    $('.gr-tip').classList.add('gone');
    if (ready) map.setFilter('sel', ['==', ['get', 'id'], id || '']);
    if (fly && id && ready) {
      const g = zone(id).geometry, b = new maplibregl.LngLatBounds();
      g.coordinates.flat(g.type === 'MultiPolygon' ? 2 : 1).forEach(c => b.extend(c));
      map.easeTo({ center: b.getCenter(), zoom: Math.max(map.getZoom(), 7.4), duration: 700 });
    }
    chart(); drawer();
  }
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(chart, 200); });
  $('.gr-close').addEventListener('click', () => { select(null); mapEl.focus(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && sel) select(null); });
  $$('.gr-link').forEach(b => b.addEventListener('click', () => { select(b.dataset.zone, true); $('#gr-step2').scrollIntoView(); }));

  // ---------------------------------------------------------------- scenario
  function update() {
    $$('.gr-showing-name').forEach(el => { el.textContent = el.closest('.gr-step-head') ? NAME[scen][0].toLowerCase() + NAME[scen].slice(1) : NAME[scen]; });
    if (!D) return;
    if (ready) {
      map.setPaintProperty('zones', 'fill-color', fill());
      map.setFilter('alloc', ['>', ['get', aKey()], 0]);
      map.setLayoutProperty('alloc', 'visibility', scen === 'unconstrained' ? 'none' : 'visible');
    }
    keyBox(); chart(); drawer(); intro();
  }
  $$('input[name="gr-scen"]').forEach(r => r.addEventListener('change', () => { if (r.checked) { scen = r.value; update(); } }));
  $('.gr-excl').addEventListener('change', e => { if (ready) map.setLayoutProperty('excl', 'visibility', e.target.checked ? 'visible' : 'none'); keyBox(); });
  $('.gr-gcca').addEventListener('change', e => { if (ready) map.setLayoutProperty('gcca', 'visibility', e.target.checked ? 'visible' : 'none'); });

  // ---------------------------------------------------------------- downloads
  const slug = () => `geoready_nc_${scen}_${DATE}`;
  function save(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvCell = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const toCsv = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  function zoneRows(feats) {
    const k = KEY[scen];
    const head = ['zone_id', 'scenario', 'readiness', 'connectable_mw', 'technical_mw', 'eligible_km2', 'pvout_kwh_per_kwp', 'lcoe_low_r_per_mwh', 'lcoe_base_r_per_mwh',
      'lcoe_high_r_per_mwh', 'distance_to_substation_km', 'slope_deg', 'solar_redz_share', 'solar_eia_share', 'substation', 'local_area', 'supply_area',
      'substation_limit_mw', 'local_area_limit_mw', 'supply_area_limit_mw', 'limited_by', 'run_id'];
    return [head, ...feats.map(f => { const p = f.properties; return [p.id, scen, p['r_' + k], p['a_' + k], p.mw, p.km2, p.pv, p.lo, p.lc, p.hi, p.gk, p.sl, p.rz, p.eia,
      p.sub, p.la, p.sa, p.lsub, p.lloc, p.lsup, p['b_' + k], RUN]; })];
  }
  function mapPng(btn) {
    btn.classList.add('busy');
    map.triggerRepaint();
    map.once('idle', () => {
      const src = map.getCanvas(), dpr = src.width / src.clientWidth;
      const pad = 36 * dpr, top = 96 * dpr, bottom = 118 * dpr;
      const c = document.createElement('canvas'); c.width = src.width + 2 * pad; c.height = src.height + top + bottom;
      const g = c.getContext('2d');
      g.fillStyle = '#F6F7F0'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = INK; g.font = `${30 * dpr}px Alegreya, Georgia, serif`; g.fillText('GeoReady: where can solar connect in the Northern Cape?', pad, pad + 26 * dpr);
      g.fillStyle = '#4E5C58'; g.font = `${17 * dpr}px "Alegreya Sans", system-ui, sans-serif`;
      const s = D.scenarios[scen];
      g.fillText(`${NAME[scen]}: ${s.mw >= 1e5 ? nf(s.mw / 1000) + ' GW' : nf(s.mw) + ' MW'} can connect, in ${nf(s.zones)} zones. Zones coloured by readiness; outlined zones get grid capacity.`, pad, pad + 54 * dpr);
      g.drawImage(src, pad, top);
      g.strokeStyle = '#C9CEBB'; g.lineWidth = dpr; g.strokeRect(pad, top, src.width, src.height);
      let x = pad;
      const y = top + src.height + 24 * dpr;
      g.font = `${15 * dpr}px "Alegreya Sans", system-ui, sans-serif`;
      g.fillStyle = INK; g.fillText('Less ready', x, y + 12 * dpr); x += g.measureText('Less ready').width + 10 * dpr;
      GOLD.forEach(col => { g.fillStyle = col; g.fillRect(x, y, 30 * dpr, 14 * dpr); x += 30 * dpr; });
      g.fillStyle = INK; x += 10 * dpr; g.fillText('More ready', x, y + 12 * dpr); x += g.measureText('More ready').width + 26 * dpr;
      if (scen !== 'unconstrained') { g.strokeStyle = INK; g.lineWidth = 2 * dpr; g.strokeRect(x, y, 14 * dpr, 14 * dpr); g.fillStyle = INK; g.fillText('Gets grid capacity', x + 20 * dpr, y + 12 * dpr); x += g.measureText('Gets grid capacity').width + 42 * dpr; }
      if ($('.gr-excl').checked) ['1', '2', '3', '4'].forEach(k => {
        const lab = D.codes[k].label[0].toUpperCase() + D.codes[k].label.slice(1);
        g.fillStyle = D.codes[k].color; g.fillRect(x, y, 14 * dpr, 14 * dpr); g.fillStyle = INK; g.fillText(lab, x + 20 * dpr, y + 12 * dpr);
        x += g.measureText(lab).width + 42 * dpr;
      });
      g.fillStyle = '#4E5C58'; g.font = `${12.5 * dpr}px "Alegreya Sans", system-ui, sans-serif`;
      const lines = [];
      [`Seabilwe Tilodi, GeoReady ${D.model_version} (preview), run ${RUN}. A screening, not a permit, feasibility study or connection offer.`,
       'Sources: Global Solar Atlas 2.0 (World Bank Group, Solargis), NTCSA GCCA 2025, DFFE SANLC 2022, WDPA, DFFE/CSIR REDZ, Copernicus DEM, © OpenStreetMap contributors, basemap Esri.']
        .forEach(t => { let line = ''; t.split(' ').forEach(w => { const tryL = line ? line + ' ' + w : w; if (g.measureText(tryL).width > c.width - 2 * pad) { lines.push(line); line = w; } else line = tryL; }); lines.push(line); });
      lines.slice(0, 4).forEach((l, i) => g.fillText(l, pad, y + (40 + 17 * i) * dpr));
      c.toBlob(b => { save(b, slug() + '_map.png'); btn.classList.remove('busy'); }, 'image/png');
    });
  }
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-dl]'); if (!b || !D) return;
    const t = b.dataset.dl;
    if (t === 'png') { if (ready) mapPng(b); }
    else if (t === 'csv') save(new Blob([toCsv(zoneRows(Z.features))], { type: 'text/csv' }), slug() + '_zones.csv');
    else if (t === 'zone' && sel) save(new Blob([toCsv(zoneRows([zone(sel)]))], { type: 'text/csv' }), `${slug()}_${sel}.csv`);
    else if (t === 'curve') {
      const rows = [['order', 'zone_id', 'scenario', 'mw_from', 'mw_to', 'connectable_mw', 'lcoe_base_r_per_mwh', 'lcoe_low_r_per_mwh', 'lcoe_high_r_per_mwh', 'run_id'],
        ...D.curves[scen].map((r, i) => [i + 1, r[0], scen, r[1], r[2], Math.round((r[2] - r[1]) * 10) / 10, r[3], r[4], r[5], RUN])];
      save(new Blob([toCsv(rows)], { type: 'text/csv' }), slug() + '_supply_curve.csv');
    }
  });
})();

