/* GEO-ASSET ZA front-end: asset map, dashboard and administration evidence.
 * Reads a static snapshot (data-source="static", the portfolio page) or the live API (data-source="api", Docker demo).
 * Containers are optional: each part renders only if its element exists on the page. Needs Leaflet 1.9. */
(function () {
  'use strict';
  const root = document.querySelector('[data-geoasset]');
  if (!root) return;
  const BASE = root.dataset.base || 'data/';
  const LIVE = root.dataset.source === 'api';

  // Colour follows the entity. Classes: fixed order, validated for colour-vision deficiency (see README).
  const CLASS_ORDER = ['WATER', 'ROADS', 'STORM', 'LIGHT', 'ELEC', 'FAC', 'WASTE'];
  const CLASS_COLOUR = { WATER: '#2a78d6', ROADS: '#eb6834', STORM: '#1baf7a', LIGHT: '#eda100', ELEC: '#e87ba4', FAC: '#008300', WASTE: '#6250d6' };
  // Condition: diverging, good (green) to poor (red) through a neutral midpoint. 0 = not yet inspected.
  const GRADE_COLOUR = { 1: '#17663a', 2: '#4f9e60', 3: '#bdb9ab', 4: '#e58a4e', 5: '#b02a2a', 0: '#ffffff' };
  const GRADE_LABEL = { 1: 'Very good', 2: 'Good', 3: 'Fair', 4: 'Poor', 5: 'Very poor', 0: 'Not inspected' };
  const DETAIL_LABEL = { lamp_type: 'Lamp type', wattage_w: 'Wattage (W)', pole_height_m: 'Pole height (m)', pole_material: 'Pole material',
    road_name: 'Road name', road_class: 'Road class', surface_type: 'Surface', lanes: 'Lanes', width_m: 'Width (m)', is_oneway: 'One way',
    material: 'Material', diameter_mm: 'Diameter (mm)', capacity_kl: 'Capacity (kl)', pressure_zone: 'Pressure zone', voltage_kv: 'Voltage (kV)',
    rating_kva: 'Rating (kVA)', structure: 'Structure', size_mm: 'Size (mm)', is_lined: 'Lined', facility_use: 'Use', operator: 'Operator',
    is_accessible: 'Step-free access', floor_area_m2: 'Floor area (m²)' };
  const DEFAULT_ON = new Set(['ROADS', 'LIGHT', 'STORM', 'ELEC', 'FAC', 'WASTE']);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d = 0) => v == null ? '–' : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/ /g, ' ');
  const rand = v => v >= 1e9 ? `R${num(v / 1e9, 2)} billion` : v >= 1e6 ? `R${num(v / 1e6, 1)} million` : `R${num(v)}`;
  const date = s => s ? new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';

  // ---------------------------------------------------------------- data access (snapshot or API)
  const API = { 'kpis.json': 'kpis', 'summary.json': 'summary', 'condition.json': 'condition', 'spend.json': 'spend',
                'priorities.json': 'priorities?limit=25', 'performance.json': 'performance', 'lookups.json': 'lookups', 'wards.geojson': 'wards' };
  const cache = {};
  function get(name) {
    if (cache[name]) return cache[name];
    let url = BASE + name;
    if (LIVE) {
      const m = name.match(/^assets_([A-Z]+)\.geojson$/);
      url = BASE + (m ? `assets?class=${m[1]}&limit=20000` : API[name] || name);
    }
    return (cache[name] = fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }));
  }
  async function assetDetails(cls, code) {
    if (LIVE) {
      const a = await fetch(`${BASE}assets/${encodeURIComponent(code)}`).then(r => r.json());
      return { d: a.details || {}, h: (a.history || []).slice(0, 6).map(e => [e.event[0], e.event_date, e.summary, e.detail, e.status, e.actual_cost_zar]) };
    }
    const all = await get(`details_${cls}.json`);
    return all[code] || { d: {}, h: [] };
  }

  // ---------------------------------------------------------------- shared tooltip (charts)
  const tip = document.createElement('div');
  tip.className = 'ga-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  function hover(el, html) {
    el.addEventListener('mousemove', e => showTip(e, html));
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); showTip({ clientX: r.right, clientY: r.top }, html); });
    el.addEventListener('blur', hideTip);
  }

  // ================================================================ MAP
  async function initMap(el) {
    const [lookups, wards, kp] = await Promise.all([get('lookups.json'), get('wards.geojson'), get('kpis.json')]);
    const TYPE = {}; lookups.type.forEach(t => { TYPE[t.code] = { name: t.label, cls: t.extra }; });
    const CLASS = {}; lookups.class.forEach(c => { CLASS[c.code] = { name: c.label, dept: c.extra }; });
    const state = { mode: 'condition', on: new Set(DEFAULT_ON), grades: new Set([0, 1, 2, 3, 4, 5]), selected: null };

    const mapEl = el.querySelector('.ga-map'), panel = el.querySelector('.ga-panel'), bar = el.querySelector('.ga-controls');
    const renderer = L.canvas({ padding: 0.3, tolerance: 4 });
    const map = L.map(mapEl, { preferCanvas: true, zoomSnap: 0.5, minZoom: 12, maxZoom: 19, attributionControl: true });
    // Esri World Light Gray Canvas: free to use with attribution, no API key. Native tiles stop at zoom 16; Leaflet scales them beyond.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 16, maxZoom: 19,
      attribution: 'Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Assets: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors and synthetic · Wards: MDB 2026'
    }).addTo(map);
    const wardLayer = L.geoJSON(wards, { interactive: false, style: { color: '#23312F', weight: 1.6, dashArray: '6 5', fill: false } }).addTo(map);
    wards.features.forEach(f => {
      const c = L.geoJSON(f).getBounds().getCenter();
      L.marker(c, { interactive: false, icon: L.divIcon({ className: 'ga-ward', html: `Ward ${f.properties.ward_no}`, iconSize: null }) }).addTo(map);
    });
    el.gaMap = map;                       // handle for tests and the browser console
    const home = wardLayer.getBounds();
    map.fitBounds(home, { padding: [10, 10] });
    map.setMaxBounds(home.pad(0.6));
    const homeBtn = L.control({ position: 'topleft' });
    homeBtn.onAdd = () => { const b = L.DomUtil.create('button', 'ga-home'); b.type = 'button'; b.title = 'Zoom to the study area'; b.setAttribute('aria-label', 'Zoom to the study area');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>';
      L.DomEvent.on(b, 'click', e => { L.DomEvent.stop(e); map.fitBounds(home, { padding: [10, 10] }); }); return b; };
    homeBtn.addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    const layers = {}, counts = {};
    let highlight = null;
    const radius = () => { const z = map.getZoom(); return z >= 17 ? 5 : z >= 16 ? 4 : z >= 15 ? 3 : 2.2; };
    const colourOf = p => state.mode === 'condition' ? GRADE_COLOUR[p.g || 0] : CLASS_COLOUR[TYPE[p.t].cls];
    function style(f) {
      const p = f.properties, col = colourOf(p), g = f.geometry.type;
      if (g.includes('Polygon')) return { renderer, color: state.mode === 'condition' && !p.g ? '#6b6b62' : col, weight: 1.2, fillColor: col, fillOpacity: 0.35 };
      if (g.includes('Line')) {
        const t = p.t;
        return { renderer, color: state.mode === 'condition' && !p.g ? '#6b6b62' : col, weight: t === 'ROAD_SEGMENT' ? 2.6 : t === 'WATER_MAIN' ? 1.8 : 2.2,
                 opacity: 0.95, dashArray: t === 'WATER_MAIN' ? '4 3' : t === 'POWER_LINE' ? '8 3 2 3' : null, lineCap: 'round' };
      }
      return { renderer, radius: radius(), color: '#ffffff', weight: 1, fillColor: col, fillOpacity: 1, opacity: 0.9 };
    }
    const nameOf = p => p.n || TYPE[p.t].name;
    const tipOf = p => `<b>${esc(p.c)}</b> ${esc(nameOf(p))}<br>${esc(TYPE[p.t].name)} · ${p.g ? `condition ${p.g}, ${GRADE_LABEL[p.g].toLowerCase()}` : 'not inspected'}`;

    async function build(cls) {
      const fc = await get(`assets_${cls}.geojson`);
      counts[cls] = fc.features.length;
      if (layers[cls]) map.removeLayer(layers[cls]);
      layers[cls] = L.geoJSON(fc, {
        filter: f => state.grades.has(f.properties.g || 0),
        style,
        pointToLayer: (f, ll) => L.circleMarker(ll, style(f)),
        onEachFeature: (f, l) => {
          l.bindTooltip(tipOf(f.properties), { sticky: true, className: 'ga-maptip', direction: 'top', offset: [0, -6] });
          l.on('click', () => select(cls, f, l));
        }
      });
      if (state.on.has(cls)) layers[cls].addTo(map);
      drawControls();
    }
    function restyle() { Object.values(layers).forEach(lg => lg.eachLayer(l => l.setStyle(style(l.feature)))); drawLegend(); }
    map.on('zoomend', () => { const r = radius(); Object.values(layers).forEach(lg => lg.eachLayer(l => l.setRadius && l.setRadius(r))); });

    // controls: asset classes, colour mode, condition filter
    function drawControls() {
      bar.innerHTML = `<div class="ga-chiprow" role="group" aria-label="Asset classes">${CLASS_ORDER.filter(c => CLASS[c]).map(c => `
          <button type="button" class="ga-chip" data-cls="${c}" aria-pressed="${state.on.has(c)}">
            <i style="background:${CLASS_COLOUR[c]}"></i>${esc(CLASS[c].name)}${counts[c] != null ? ` <span>${num(counts[c])}</span>` : ''}</button>`).join('')}</div>
        <div class="ga-mode" role="radiogroup" aria-label="Colour assets by">
          <span>Colour by</span>
          <button type="button" role="radio" data-mode="condition" aria-checked="${state.mode === 'condition'}">Condition</button>
          <button type="button" role="radio" data-mode="class" aria-checked="${state.mode === 'class'}">Asset class</button></div>`;
      bar.querySelectorAll('[data-cls]').forEach(b => b.addEventListener('click', async () => {
        const c = b.dataset.cls;
        if (state.on.has(c)) { state.on.delete(c); if (layers[c]) map.removeLayer(layers[c]); }
        else { state.on.add(c); if (layers[c]) layers[c].addTo(map); else { b.classList.add('loading'); await build(c); } }
        drawControls(); drawLegend();
      }));
      bar.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.dataset.mode; restyle(); drawControls(); }));
    }

    function legendHTML() {
      if (state.mode === 'condition') {
        return `<p class="ga-h">Latest condition grade</p><div class="ga-legend">${[1, 2, 3, 4, 5, 0].map(g => `
          <label class="ga-lrow"><input type="checkbox" data-grade="${g}" ${state.grades.has(g) ? 'checked' : ''}>
          <i class="ga-sw ${g ? '' : 'ga-sw-empty'}" style="background:${GRADE_COLOUR[g]}"></i>${g ? `${g} · ` : ''}${GRADE_LABEL[g]}</label>`).join('')}</div>
          <p class="ga-note">Untick a grade to hide it. Lines and points use the same colours.</p>`;
      }
      return `<p class="ga-h">Asset class</p><div class="ga-legend">${CLASS_ORDER.filter(c => CLASS[c]).map(c => `
          <span class="ga-lrow"><i class="ga-sw" style="background:${CLASS_COLOUR[c]}"></i>${esc(CLASS[c].name)}</span>`).join('')}</div>
          <p class="ga-note">Dashed blue lines are water mains; dash-dot lines are power lines.</p>`;
    }
    function drawLegend() {
      if (state.selected) return;
      panel.innerHTML = `<p class="ga-code">THE REGISTER</p><h3>${num(kp.total_assets)} assets, one database</h3>
        <p>Every point, line and area is a row in <code>assets.infrastructure_assets</code>, read here through the public
        <code>api.assets</code> view. Colours show each asset's most recent inspection.</p>
        ${legendHTML()}<p class="ga-hint">Click an asset for its record and maintenance history. Water mains are off by default because they run alongside the roads.</p>`;
      panel.querySelectorAll('[data-grade]').forEach(cb => cb.addEventListener('change', () => {
        const g = +cb.dataset.grade; cb.checked ? state.grades.add(g) : state.grades.delete(g);
        Object.keys(layers).forEach(build);
      }));
    }

    async function select(cls, f, l) {
      const p = f.properties;
      state.selected = p.c;
      if (highlight) map.removeLayer(highlight);
      highlight = f.geometry.type === 'Point'
        ? L.circleMarker(l.getLatLng(), { radius: 11, color: '#23312F', weight: 2.5, fill: false, interactive: false }).addTo(map)
        : L.geoJSON(f, { interactive: false, style: { color: '#23312F', weight: 6, opacity: 0.35, fill: false } }).addTo(map);
      panel.innerHTML = `<p class="ga-code">${esc(p.c)}</p><h3>${esc(nameOf(p))}</h3><p class="ga-muted">Loading the record…</p>`;
      const det = await assetDetails(cls, p.c);
      if (state.selected !== p.c) return;
      const rows = [['Type', TYPE[p.t].name], ['Class', CLASS[cls].name], ['Ward', p.w], ['Installed', p.y || '–'],
                    ['Condition', p.g ? `<span class="ga-grade" style="--g:${GRADE_COLOUR[p.g]}">${p.g}</span> ${GRADE_LABEL[p.g]}` : 'Not inspected'],
                    ['Inspection', p.o ? '<span class="ga-flag">Overdue</span>' : 'Up to date'], ['Location from', p.s === 'OpenStreetMap' ? 'OpenStreetMap' : 'Generated (synthetic)']];
      Object.entries(det.d).forEach(([key, v]) => rows.push([DETAIL_LABEL[key] || key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
        typeof v === 'boolean' ? (v ? 'Yes' : 'No') : esc(v)]));
      panel.innerHTML = `<p class="ga-code">${esc(p.c)}</p><h3>${esc(nameOf(p))}</h3>
        <dl class="ga-dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
        <p class="ga-h">Recent history</p>
        ${det.h.length ? `<ol class="ga-history">${det.h.map(h => `<li class="${h[0] === 'I' ? 'insp' : 'wo'}">
            <time>${date(h[1])}</time><b>${esc(h[2])}</b>${h[3] ? `<span>${esc(h[3])}</span>` : ''}${h[4] && h[4] !== 'completed' ? `<em>${esc(h[4].replace('_', ' '))}</em>` : ''}${h[5] ? `<span>${rand(h[5])}</span>` : ''}</li>`).join('')}</ol>`
          : '<p class="ga-muted">No inspections yet.</p>'}
        <p class="ga-note">Attributes and history are synthetic.</p>
        <button type="button" class="ga-back">Back to the legend</button>`;
      panel.querySelector('.ga-back').addEventListener('click', () => { state.selected = null; if (highlight) map.removeLayer(highlight); highlight = null; drawLegend(); });
    }

    drawControls(); drawLegend();
    for (const c of CLASS_ORDER) if (state.on.has(c)) await build(c);
  }

  // ================================================================ DASHBOARD
  async function initDashboard(el) {
    const [k, condition, spend, prio, perf, lookups] = await Promise.all(
      ['kpis.json', 'condition.json', 'spend.json', 'priorities.json', 'performance.json', 'lookups.json'].map(get));
    const CLASS = {}; lookups.class.forEach(c => { CLASS[c.code] = c.label; });

    const kpiEl = el.querySelector('.ga-kpis');
    if (kpiEl) {
      const tiles = [
        [num(k.total_assets), 'assets in the register'],
        [num(k.assets_needing_maintenance), 'need maintenance: condition 4 or 5, or an open work order'],
        [num(k.inspections_overdue), 'inspections overdue against their interval'],
        [num(k.open_work_orders), 'open work orders'],
        [rand(k.actual_spend_12m_zar), 'maintenance spend in the last 12 months'],
        [rand(k.replacement_value_zar), 'estimated replacement value'],
      ];
      kpiEl.innerHTML = tiles.map(([v, l]) => `<li><b>${v}</b><span>${esc(l)}</span></li>`).join('');
    }

    // condition by type: 100% stacked bars, one row per asset type
    const condEl = el.querySelector('.ga-condition');
    if (condEl) {
      const byType = {};
      condition.forEach(r => { (byType[r.type_code] ||= { name: r.type_name, cls: r.class_code, g: {}, n: 0 }); byType[r.type_code].g[r.grade] = r.assets; byType[r.type_code].n += r.assets; });
      const types = Object.values(byType).sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls) || b.n - a.n);
      condEl.querySelector('.ga-legend-top').innerHTML = [1, 2, 3, 4, 5, 0].map(g => `<span><i class="ga-sw ${g ? '' : 'ga-sw-empty'}" style="background:${GRADE_COLOUR[g]}"></i>${GRADE_LABEL[g]}</span>`).join('');
      const bars = condEl.querySelector('.ga-bars');
      bars.innerHTML = types.map((t, i) => `<div class="ga-barrow"><span class="ga-barlabel">${esc(t.name)}</span>
          <span class="ga-bar">${[1, 2, 3, 4, 5, 0].filter(g => t.g[g]).map(g => `<i tabindex="0" data-t="${i}" data-g="${g}" style="flex:${t.g[g]} 1 0;background:${GRADE_COLOUR[g]}" class="${g ? '' : 'ga-empty'}"></i>`).join('')}</span>
          <span class="ga-barn">${num(t.n)}</span></div>`).join('');
      bars.querySelectorAll('i').forEach(seg => { const t = types[seg.dataset.t], g = +seg.dataset.g;
        hover(seg, `<b>${esc(t.name)}</b><br>${GRADE_LABEL[g]}: ${num(t.g[g])} of ${num(t.n)} (${num(t.g[g] / t.n * 100, 1)}%)`); });
      const tbl = condEl.querySelector('.ga-table');
      if (tbl) tbl.innerHTML = `<table class="data-table"><thead><tr><th>Asset type</th>${[1, 2, 3, 4, 5, 0].map(g => `<th class="num">${GRADE_LABEL[g]}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${types.map(t => `<tr><td>${esc(t.name)}</td>${[1, 2, 3, 4, 5, 0].map(g => `<td class="num">${num(t.g[g] || 0)}</td>`).join('')}<td class="num">${num(t.n)}</td></tr>`).join('')}</tbody></table>`;
    }

    // actual maintenance spend per year, stacked by asset class
    const spendEl = el.querySelector('.ga-spend');
    if (spendEl) {
      const years = {}, classes = new Set();
      spend.filter(r => r.cost_status === 'ACTUAL').forEach(r => { const y = r.month.slice(0, 4); (years[y] ||= {}); years[y][r.class_code] = (years[y][r.class_code] || 0) + r.amount_zar; classes.add(r.class_code); });
      const ys = Object.keys(years).sort(), cls = CLASS_ORDER.filter(c => classes.has(c));
      const totals = ys.map(y => cls.reduce((s, c) => s + (years[y][c] || 0), 0));
      const max = Math.ceil(Math.max(...totals) / 1e7) * 1e7;
      const W = 520, H = 235, m = { l: 50, r: 6, t: 10, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b, bw = iw / ys.length;
      const yv = v => m.t + ih - v / max * ih;
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Actual maintenance spend per year by asset class">`;
      for (let v = 0; v <= max; v += max / 5) svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${yv(v)}" y2="${yv(v)}" class="${v ? 'grid' : 'base'}"/><text x="${m.l - 8}" y="${yv(v) + 4}" text-anchor="end">R${num(v / 1e6)}m</text>`;
      ys.forEach((y, i) => {
        let acc = 0; const x = m.l + i * bw + bw * 0.18, w = bw * 0.64;
        cls.forEach(c => { const v = years[y][c] || 0; if (!v) return; const y0 = yv(acc), y1 = yv(acc + v); acc += v;
          svg += `<rect tabindex="0" data-y="${y}" data-c="${c}" x="${x}" y="${y1 + 1}" width="${w}" height="${Math.max(y0 - y1 - 2, 0.5)}" rx="${acc === totals[i] ? 3 : 0}" fill="${CLASS_COLOUR[c]}"/>`; });
        svg += `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle">${y === '2026' ? '2026*' : y}</text>`;
      });
      spendEl.querySelector('.ga-chart').innerHTML = svg + '</svg>';
      spendEl.querySelector('.ga-legend-top').innerHTML = cls.map(c => `<span><i class="ga-sw" style="background:${CLASS_COLOUR[c]}"></i>${esc(CLASS[c])}</span>`).join('');
      spendEl.querySelectorAll('rect').forEach(r => { const y = r.dataset.y, c = r.dataset.c, i = ys.indexOf(y);
        hover(r, `<b>${y}${y === '2026' ? ' (January to October)' : ''}</b><br>${esc(CLASS[c])}: ${rand(years[y][c])}<br>All classes: ${rand(totals[i])}`); });
      const tbl = spendEl.querySelector('.ga-table');
      if (tbl) tbl.innerHTML = `<table class="data-table"><thead><tr><th>Year</th>${cls.map(c => `<th class="num">${esc(CLASS[c])}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${ys.map((y, i) => `<tr><td>${y}</td>${cls.map(c => `<td class="num">${num((years[y][c] || 0) / 1e3)}</td>`).join('')}<td class="num">${num(totals[i] / 1e3)}</td></tr>`).join('')}</tbody></table>
        <p class="ga-note">Thousands of rand.</p>`;
    }

    const prioEl = el.querySelector('.ga-priorities');
    if (prioEl) prioEl.innerHTML = `<table class="data-table"><thead><tr><th class="num">#</th><th>Asset</th><th>Type</th><th class="num">Ward</th><th>Condition</th>
        <th class="num">Criticality</th><th class="num">Risk score</th><th>Open work order</th></tr></thead><tbody>${prio.slice(0, +(prioEl.dataset.rows || 10)).map((p, i) => `<tr>
        <td class="num">${i + 1}</td><td><b>${esc(p.asset_code)}</b><br><span class="ga-muted">${esc(p.asset_name || '')}</span></td><td>${esc(p.type_name)}</td>
        <td class="num">${p.ward_no}</td><td><span class="ga-grade" style="--g:${GRADE_COLOUR[p.condition_grade || 0]}">${p.condition_grade || '–'}</span> ${esc(p.condition_label || 'Not inspected')}</td>
        <td class="num">${p.criticality}</td><td class="num">${p.risk_score}</td><td>${p.open_work_orders ? `Yes, due ${date(p.earliest_target)}` : '<span class="ga-flag">None</span>'}</td></tr>`).join('')}</tbody></table>`;

    const perfEl = el.querySelector('.ga-performance');
    if (perfEl) {
      const agg = {};
      perf.forEach(r => { const a = (agg[r.class_name] ||= { done: 0, on: 0 }); a.done += r.completed; a.on += r.completed * r.on_time_pct / 100; });
      perfEl.innerHTML = Object.entries(agg).sort((a, b) => b[1].on / b[1].done - a[1].on / a[1].done).map(([c, a]) => {
        const pct = a.on / a.done * 100;
        return `<div class="ga-barrow"><span class="ga-barlabel">${esc(c)}</span><span class="ga-bar ga-bar-single"><i tabindex="0" style="width:${pct}%"></i></span>
          <span class="ga-barn">${num(pct)}%</span></div>`; }).join('');
      perfEl.querySelectorAll('i').forEach((seg, i) => { const [c, a] = Object.entries(agg).sort((x, y) => y[1].on / y[1].done - x[1].on / x[1].done)[i];
        hover(seg, `<b>${esc(c)}</b><br>${num(a.on)} of ${num(a.done)} completed work orders finished by their target date`); });
    }
  }

  // ================================================================ EVIDENCE
  async function initEvidence(el) {
    const ev = await get('evidence.json');
    const restore = el.querySelector('.ga-restore');
    if (restore && ev.restore_test) {
      const d = ev.restore_test.details;
      restore.innerHTML = `<p class="ga-pass">${ev.restore_test.status === 'SUCCESS' ? 'Passed' : 'Failed'} · ${date(ev.restore_test.finished_at.slice(0, 10))} · ${num(d.seconds, 1)} s</p>
        <ul class="ga-checks">${d.checks.map(c => `<li class="${c.result === 'pass' ? 'ok' : 'bad'}"><b>${esc(c.check)}</b><span>${esc(c.detail)}</span></li>`).join('')}</ul>`;
    }
    const health = el.querySelector('.ga-health');
    if (health) health.innerHTML = `<table class="data-table ga-compact"><thead><tr><th>Metric</th><th class="num">Value</th><th>Status</th></tr></thead><tbody>${
      ev.health.map(h => `<tr><td>${esc(h.metric)}<br><span class="ga-muted">${esc(h.threshold)}</span></td><td class="num">${esc(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(h.value) ? date(h.value.slice(0, 10)) : h.value)}</td>
      <td><span class="ga-status ga-${h.status.toLowerCase()}">${h.status === 'OK' ? '✓ OK' : h.status === 'WARN' ? '! Warn' : '✕ Fail'}</span></td></tr>`).join('')}</tbody></table>`;
    const bench = el.querySelector('.ga-bench');
    if (bench && ev.benchmark) {
      const L = { small_bbox: 'Assets in a 1 km box', within_250m_indexable: 'Within 250 m (index-friendly)', within_250m_geography: 'Within 250 m (geography cast)',
                  nearest_10: '10 nearest assets', bbox: 'Very large box (two thirds of rows)' };
      bench.innerHTML = `<table class="data-table ga-compact"><thead><tr><th>Query on ${num(ev.benchmark.points)} points</th><th class="num">No index</th><th class="num">GiST index</th><th class="num">Index + CLUSTER</th></tr></thead><tbody>${
        Object.keys(L).map(q => { const s = ev.benchmark.spatial[q]; const cell = x => `${num(x.median_ms, x.median_ms < 10 ? 2 : 0)} ms`;
          return `<tr><td>${L[q]}</td><td class="num">${cell(s.before)}</td><td class="num">${cell(s.after)}</td><td class="num">${cell(s.clustered)}</td></tr>`; }).join('')}</tbody></table>`;
    }
    const imp = el.querySelector('.ga-imports');
    if (imp) imp.innerHTML = `<p><b>${num(ev.imports.batches)}</b> batches · <b>${num(ev.imports.rows)}</b> rows · <b>${num(ev.imports.promoted)}</b> promoted · <b>${num(ev.imports.rejected)}</b> rejected</p>
      <ul class="ga-checks">${ev.import_rejections.map(r => `<li class="warn"><b>${esc(r.rule)} · ${num(r.rows)} rows</b><span>${esc(r.file)}: ${esc(r.description)}</span></li>`).join('')}</ul>`;
    const mig = el.querySelector('.ga-migrations');
    if (mig) mig.innerHTML = ev.migrations.map(m => `<li><b>${esc(m.version)}</b> ${esc(m.name.replace(/_/g, ' '))}</li>`).join('');
    const counts = el.querySelector('.ga-counts');
    if (counts) counts.textContent = `${num(ev.counts.inspections)} inspections, ${num(ev.counts.work_orders)} work orders, ${num(ev.counts.activities)} activities and ${num(ev.counts.cost_lines)} cost lines; ${ev.database_size} in total`;
  }

  // ================================================================ VIEWS (tabs)
  function initViews() {
    const tabs = [...root.querySelectorAll('.ga-views [role="tab"]')];
    if (!tabs.length) return;
    function show(tab, focus) {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
      hideTip();
      const ex = root.querySelector('.ga-explorer');
      if (tab.dataset.view === 'map' && ex && ex.gaMap) ex.gaMap.invalidateSize();
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      panel.querySelectorAll('.ga-erd-scroll:not([data-placed])').forEach(box => {
        const place = () => { box.scrollLeft = (box.scrollWidth - box.clientWidth) * 0.42; box.scrollTop = (box.scrollHeight - box.clientHeight) * 0.42; box.dataset.placed = '1'; };
        const img = box.querySelector('img');
        img && !img.complete ? img.addEventListener('load', place, { once: true }) : place();     // start on the asset register, the centre of the model
      });
      try { history.replaceState(null, '', '#' + tab.dataset.view); } catch (e) { /* file:// or sandboxed */ }
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', e => {
        const k = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
        if (k !== undefined) { e.preventDefault(); show(tabs[(i + k + tabs.length) % tabs.length], true); }
      });
    });
    const fromHash = tabs.find(t => '#' + t.dataset.view === location.hash);
    if (fromHash) show(fromHash);
  }
  initViews();

  // drag to pan the entity relationship diagram
  root.querySelectorAll('.ga-erd-scroll').forEach(box => {
    let start = null;
    box.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; start = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop }; box.style.cursor = 'grabbing'; e.preventDefault(); });
    window.addEventListener('pointermove', e => { if (start) { box.scrollLeft = start.l - (e.clientX - start.x); box.scrollTop = start.t - (e.clientY - start.y); } });
    window.addEventListener('pointerup', () => { start = null; box.style.cursor = ''; });
  });

  const run = (sel, fn) => { const el = root.querySelector(sel); if (el) fn(el).catch(e => { console.error(e); el.insertAdjacentHTML('beforeend', `<p class="ga-error">Could not load this part: ${esc(e.message)}</p>`); }); };
  run('.ga-explorer', initMap);
  run('.ga-dashboard', initDashboard);
  run('.ga-evidence', initEvidence);
})();
