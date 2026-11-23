/* FLOOD-LINE ZA: Gauteng flood dashboard. MapLibre GL + PMTiles, in the site's survey-sheet palette.
   Three views share one map: Events (reported floods and the rain behind them), Growth (building on
   low-lying land, 1975-2020) and Exposure (people, buildings, roads and facilities on low-lying land). */
(() => {
  const root = document.querySelector('[data-flood-line]');
  if (!root || !window.maplibregl || !window.pmtiles) return;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
  const BASE = new URL(root.dataset.base, location.href).href;
  const nf = (v, d = 0) => v == null || isNaN(v) ? '–' : v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  const people = v => v >= 1e6 ? nf(v / 1e6, 2) + ' million' : nf(Math.round(v / 1000) * 1000);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const RAMP = ['#23312F', '#33392F', '#4A3F30', '#634530', '#7C4C2E', '#95582F', '#AE6631', '#C47535', '#D5853A', '#E39A42'];
  const LOW = { 2: '#2F6F9A', 1: '#8FB8D2' }, RED = '#A33B2B', INK = '#23312F';
  const WARD = ['#F1E8D6', '#E2C79D', '#C99A64', '#A0673A', '#6B3F22'];   // residents on low-lying land, by ward: 0-5, 5-10, 10-20, 20-40, 40+ %
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = iso => { const d = new Date(iso + 'T12:00:00'); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };

  // ---------------------------------------------------------------- tiles
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  const PM = {};
  ['terrain', 'flood_low', 'flood_jrc', 'growth', 'buildings'].forEach(k => {
    PM[k] = new pmtiles.PMTiles(BASE + k + '.pmtiles'); protocol.add(PM[k]);
  });
  const pmurl = k => 'pmtiles://' + BASE + k + '.pmtiles';

  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const style = {
    version: 8,
    sources: {
      light: { type: 'raster', tiles: [ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16 },
      sat: { type: 'raster', tiles: [ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 },
      dem: { type: 'raster-dem', url: pmurl('terrain'), encoding: 'terrarium', tileSize: 256 },
      shade: { type: 'raster-dem', url: pmurl('terrain'), encoding: 'terrarium', tileSize: 256 },
      low: { type: 'raster', url: pmurl('flood_low'), tileSize: 256 },
      jrc: { type: 'raster', url: pmurl('flood_jrc'), tileSize: 256 },
      growth: { type: 'vector', url: pmurl('growth') },
      bld: { type: 'vector', url: pmurl('buildings') },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#ECEDE6' } },
      { id: 'light', type: 'raster', source: 'light', paint: { 'raster-saturation': -0.6, 'raster-opacity': 0.9 } },
      { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.25 } },
      { id: 'shade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#4E5C58', 'hillshade-highlight-color': '#F6F7F0', 'hillshade-accent-color': '#A0673A' } },
      { id: 'jrc', type: 'raster', source: 'jrc', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.95, 'raster-resampling': 'nearest' } },
      { id: 'low', type: 'raster', source: 'low', paint: { 'raster-opacity': 0.8, 'raster-resampling': 'nearest' } },
      { id: 'growth', type: 'fill', source: 'growth', 'source-layer': 'growth', layout: { visibility: 'none' },
        paint: { 'fill-color': ['match', ['get', 'e'], 1, RAMP[0], 2, RAMP[1], 3, RAMP[2], 4, RAMP[3], 5, RAMP[4], 6, RAMP[5], 7, RAMP[6], 8, RAMP[7], 9, RAMP[8], RAMP[9]], 'fill-opacity': 0.92 } },
    ],
  };

  const map = new maplibregl.Map({
    container: $('.fl-map'), style, center: [28.05, -26.15], zoom: 8.3, minZoom: 7, maxZoom: 17.5, maxPitch: 75,
    maxBounds: [[26.4, -27.6], [29.9, -24.4]], attributionControl: false, cooperativeGestures: false, dragRotate: true,
  });
  map.scrollZoom.disable();
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution:
    '<details class="sm-credit"><summary>Credits</summary><span>Terrain: FABDEM v1-2 (University of Bristol) · River model: JRC GloFAS flood hazard v2.1 · ' +
    'Built-up land: GHSL R2023A · Buildings: Overture Maps (Google, Microsoft, OpenStreetMap) · Facilities and places: © OpenStreetMap contributors · ' +
    'Basemap: Esri, HERE, Garmin · Imagery: Esri, Maxar, Earthstar Geographics</span></details>' }), 'bottom-right');
  $('.fl-map').addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { map.scrollZoom.enable(); } }, { passive: true });
  $('.fl-map').addEventListener('mouseleave', () => map.scrollZoom.disable());
  $('.fl-map').addEventListener('click', () => map.scrollZoom.enable());

  // ---------------------------------------------------------------- state
  let D, MUN, INC, FAC, area = 'Gauteng', mode = 'events', ev = 0, yi = 9, is3d = false, timer = null;
  const EV = () => D.events[ev];

  // ---------------------------------------------------------------- side figures
  function tiles(rows) {
    const t1 = $('.fl-tiles-a'), t2 = $('.fl-tiles-b');
    t1.innerHTML = rows.slice(0, 3).map(([l, v, cls]) => `<div class="ue-tile${cls ? ' ' + cls : ''}"><span class="ue-sl">${l}</span><b>${v}</b></div>`).join('');
    t2.innerHTML = rows.slice(3).map(([l, v, cls]) => `<div class="ue-tile${cls ? ' ' + cls : ''}"><span class="ue-sl">${l}</span><b>${v}</b></div>`).join('');
  }
  const A = () => D.areas[area];
  const areaLabel = () => area === 'Gauteng' ? 'All of Gauteng' : area;

  function stats() {
    const a = A(), y = D.years[yi];
    if (mode === 'events') {
      const e = EV(), feats = INC.features.filter(f => f.properties.ev === ev);
      const r = D.rain && D.rain.events ? D.rain.events[ev] : null;
      $('.ue-area-name').textContent = 'Reported flood · ' + e.label;
      tiles([
        ['Places reported', nf(feats.length)],
        ['Wettest day', r && r.day != null ? nf(r.day, 0) + ' mm' : '–', 'ue-s2'],
        ['Wettest three days', r && r.d3 != null ? nf(r.d3, 0) + ' mm' : '–'],
        ['Wettest day beats (wet-season days since 1998)', r && r.pct != null ? nf(r.pct, 0) + '%' : '–'],
        ['Near low-lying land', nf(feats.filter(f => f.properties.near).length) + ' of ' + nf(feats.length)],
      ]);
    } else if (mode === 'growth') {
      const b = a.built_low[y], b0 = a.built_low[1975], all = a.built[y], all0 = a.built[1975];
      $('.ue-area-name').textContent = areaLabel() + ' · ' + y;
      tiles([
        ['Low-lying land (' + nf(100 * a.low_km2 / a.land_km2, 0) + '% of it)', nf(a.low_km2, 0) + ' km²'],
        ['Built on it, 1975', nf(b0, 1) + ' km²'],
        ['Built on it, ' + y, nf(b, 1) + ' km²', 'ue-s2'],
        ['Growth on low-lying land', y > 1975 ? '×' + nf(b / b0, 1) : '–'],
        ['Growth of all built-up land', y > 1975 ? '×' + nf(all / all0, 1) : '–'],
      ]);
    } else {
      const j = D.jhb, isJ = area === 'Johannesburg';
      $('.ue-area-name').textContent = areaLabel() + ' · exposure';
      tiles([
        ['People on low-lying land', people(a.pop_low), 'ue-s2'],
        ['Share of residents', nf(100 * a.pop_low / a.pop, 1) + '%'],
        ['Lowest class only', people(a.pop_low_hi)],
        isJ ? ['Buildings (Johannesburg)', nf(j.bld_hi + j.bld_lo)] : ['Built-up land on it, 2020', nf(a.built_low[2020], 1) + ' km²'],
        isJ ? ['Roads (Johannesburg)', nf(j.roads_hi_km + j.roads_lo_km) + ' km'] : ['Low-lying land', nf(a.low_km2, 0) + ' km²'],
      ]);
    }
  }

  // ---------------------------------------------------------------- chart (one measure, one axis)
  const svg = $('.fl-chart svg'), Wc = 360, Hc = 150, L0 = 40, R0 = 14, T0 = 12, B0 = 24;
  function axisY(mx, unit, ticks = 3) {
    const step = niceStep(mx / ticks), out = [];
    for (let v = 0; v <= mx + 1e-9; v += step) {
      const yy = Hc - B0 - (Hc - B0 - T0) * v / mx;
      out.push(`<line class="ue-grid" x1="${L0}" x2="${Wc - R0}" y1="${yy}" y2="${yy}"/><text class="ue-ax" x="${L0 - 6}" y="${yy + 3.5}" text-anchor="end">${nf(v, step < 1 ? 1 : 0)}</text>`);
    }
    return out.join('');
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))), n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function chart() {
    const head = $('.fl-chart h3'), foot = $('.fl-chart .ue-chart-foot');
    if (mode === 'events') {
      head.textContent = 'Rain around the flood';
      const r = D.rain && D.rain.events ? D.rain.events[ev] : null;
      if (!r || !r.series || !r.series.some(v => v != null)) {
        svg.innerHTML = `<text class="ue-ax" x="${Wc / 2}" y="${Hc / 2}" text-anchor="middle">Daily rainfall for this flood isn’t available yet.</text>`;
        foot.innerHTML = '<span>CHIRPS v3 daily rainfall</span>'; return;
      }
      const s = r.series, n = s.length, mx = Math.max(10, ...s.filter(v => v != null)) * 1.1;
      const bw = (Wc - L0 - R0) / n, k0 = r.offset;
      let h = axisY(niceStep(mx / 3) * Math.ceil(mx / niceStep(mx / 3)), 'mm');
      const top = niceStep(mx / 3) * Math.ceil(mx / niceStep(mx / 3));
      s.forEach((v, i) => {
        if (v == null) { h += `<rect x="${(L0 + i * bw + bw * 0.3).toFixed(1)}" y="${Hc - B0 - 3}" width="${(bw * 0.4).toFixed(1)}" height="3" fill="#C9CEBB"><title>${r.days[i]}: no data yet</title></rect>`; return; }
        const x = L0 + i * bw, hh = (Hc - B0 - T0) * v / top, ev0 = i === k0;
        h += `<rect x="${(x + 0.6).toFixed(1)}" y="${(Hc - B0 - hh).toFixed(1)}" width="${Math.max(bw - 1.2, 1).toFixed(1)}" height="${hh.toFixed(1)}" rx="1" fill="${ev0 ? RED : '#2F6F9A'}" opacity="${ev0 ? 1 : 0.75}"><title>${r.days[i]}: ${nf(v, 1)} mm</title></rect>`;
      });
      [0, k0, n - 1].forEach((i, j) => {
        if (j === 2 && (n - 1 - k0) * bw < 48) return;            // too close to the flood-day label
        const x = L0 + (i + 0.5) * bw; const d = r.days[i];
        h += `<text class="ue-ax" x="${x}" y="${Hc - 8}" text-anchor="${j === 0 ? 'start' : j === 2 ? 'end' : 'middle'}"${j === 1 ? ' style="fill:#A33B2B"' : ''}>${fmtDate(d).replace(/ \d{4}$/, '')}</text>`;
      });
      svg.innerHTML = h;
      foot.innerHTML = '<span><i style="background:' + RED + '"></i>Flood day</span>' + (s.some(v => v == null) ? '<span><i style="background:#C9CEBB;height:3px"></i>No data yet</span>' : '') + '<span>Johannesburg average, CHIRPS v3</span><span class="ue-chart-unit">mm</span>';
    } else if (mode === 'growth') {
      head.textContent = 'Built-up land on low-lying ground';
      const a = A(), ys = D.years, v = ys.map(y => a.built_low[y]), mx = Math.max(...v) * 1.15, top = niceStep(mx / 3) * Math.ceil(mx / niceStep(mx / 3));
      const X = i => L0 + (Wc - L0 - R0) * i / (ys.length - 1), Y = val => Hc - B0 - (Hc - B0 - T0) * val / top;
      let h = axisY(top, 'km²');
      h += `<path class="ue-area-fill" d="M${X(0)},${Y(0)} ${v.map((val, i) => `L${X(i)},${Y(val)}`).join(' ')} L${X(v.length - 1)},${Y(0)}Z"/>`;
      h += `<path class="ue-line" d="${v.map((val, i) => `${i ? 'L' : 'M'}${X(i)},${Y(val)}`).join(' ')}"/>`;
      h += `<line class="ue-now" x1="${X(yi)}" x2="${X(yi)}" y1="${T0}" y2="${Hc - B0}"/>`;
      v.forEach((val, i) => h += `<circle class="ue-dot" cx="${X(i)}" cy="${Y(val)}" r="${i === yi ? 4.5 : 3}"><title>${ys[i]}: ${nf(val, 1)} km²</title></circle>`);
      [0, 3, 5, 7, 9].forEach(i => h += `<text class="ue-ax" x="${X(i)}" y="${Hc - 8}" text-anchor="middle">${ys[i]}</text>`);
      svg.innerHTML = h;
      foot.innerHTML = '<span>' + esc(areaLabel()) + '</span><span>GHSL built-up land on low-lying ground</span><span class="ue-chart-unit">km²</span>';
    } else {
      head.textContent = 'Residents on low-lying land';
      const names = Object.keys(D.areas).filter(n => n !== 'Gauteng').sort((p, q) => D.areas[q].pop_low / D.areas[q].pop - D.areas[p].pop_low / D.areas[p].pop);
      const rh = (Hc - 6) / names.length, mx = Math.max(...names.map(n => 100 * D.areas[n].pop_low / D.areas[n].pop)) * 1.2, LL = 96;
      let h = '';
      names.forEach((n, i) => {
        const a = D.areas[n], p = 100 * a.pop_low / a.pop, w = (Wc - LL - 60) * p / mx, yy = 3 + i * rh, on = n === area;
        h += `<text class="ue-ax" x="${LL - 6}" y="${yy + rh * 0.68}" text-anchor="end"${on ? ' font-weight="700" style="fill:#23312F"' : ''}>${esc(n)}</text>`;
        h += `<rect x="${LL}" y="${yy + 2}" width="${w.toFixed(1)}" height="${(rh - 4).toFixed(1)}" rx="2" fill="${on ? '#2F6F9A' : '#8FB8D2'}"><title>${n}: ${nf(p, 1)}% of residents (${people(a.pop_low)})</title></rect>`;
        h += `<text class="ue-ax" x="${LL + w + 5}" y="${yy + rh * 0.68}">${nf(p, 1)}%</text>`;
      });
      svg.innerHTML = h;
      foot.innerHTML = '<span>Share of each municipality’s residents</span><span>GHSL population, 2020</span>';
    }
  }

  // ---------------------------------------------------------------- detail panel
  function detail() {
    const box = $('.fl-detail-body'), head = $('.fl-detail h3');
    $('.fl-profile-tools').hidden = mode !== 'exposure';
    if (mode === 'events') {
      head.textContent = 'What was reported';
      const feats = INC.features.filter(f => f.properties.ev === ev);
      box.innerHTML = `<p class="fl-ev-text">${esc(EV().text)}</p><ul class="fl-places">${feats.map(f => {
        const p = f.properties; return `<li><button type="button" data-id="${p.id}">${esc(p.place)}</button><span>${esc(p.municipality)}</span></li>`; }).join('')}</ul>`;
      box.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => {
        const f = INC.features.find(x => x.properties.id === +b.dataset.id); map.easeTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), 13) }); popInc(f);
      }));
    } else if (mode === 'growth') {
      head.textContent = 'Faster on low ground';
      const a = A(), y = D.years[yi], g1 = a.built_low[y] / a.built_low[1975], g2 = a.built[y] / a.built[1975];
      const newAll = a.built[y] - a.built[1975], newLow = a.built_low[y] - a.built_low[1975];
      const mxv = Math.max(g1, g2, 1.2);
      box.innerHTML = y === 1975 ? '<p class="fl-note">Move the slider to compare growth since 1975.</p>' :
        `<div class="fl-bars"><div><span>All built-up land</span><i style="width:${(100 * g2 / mxv).toFixed(1)}%;background:#C9CEBB"></i><b>×${nf(g2, 1)}</b></div>
         <div><span>On low-lying land</span><i style="width:${(100 * g1 / mxv).toFixed(1)}%;background:#2F6F9A"></i><b>×${nf(g1, 1)}</b></div></div>
         <p class="fl-note">${nf(100 * newLow / newAll, 1)}% of the land built up between 1975 and ${y} is low-lying; ${nf(100 * a.low_km2 / a.land_km2, 0)}% of ${esc(area === 'Gauteng' ? 'Gauteng' : area)}’s land is.</p>`;
    } else {
      head.textContent = 'Terrain profile';
      if (!prof.data) box.innerHTML = '<p class="fl-note">Press <b>Draw a profile</b>, then click two points on the map, ideally across a valley. The profile shows the ground and where it is low-lying.</p>';
      else drawProfile();
    }
  }

  // ---------------------------------------------------------------- legend
  function legend() {
    const L = $('.fl-legend'); let h = '<p class="ue-leg-h">Low-lying land</p>' +
      `<span><i style="background:${LOW[2]}"></i>Lowest, close to stream level</span><span><i style="background:${LOW[1]}"></i>Low</span>`;
    if (map.getLayoutProperty('jrc', 'visibility') === 'visible') h += '<p class="ue-leg-h">River model (JRC)</p><span><i style="background:#1F4E70"></i>1-in-10 years</span><span><i style="background:#3E7FAB"></i>1-in-100</span><span><i style="background:#A7C8DD"></i>1-in-500</span>';
    if (mode === 'events') h += `<p class="ue-leg-h">Reported floods</p><span><i class="dot" style="background:${RED}"></i>${esc(EV().label)}</span><span><i class="dot" style="background:#4E5C58;opacity:.6"></i>Other floods, 2016–2026</span>`;
    if (mode === 'growth') h += `<p class="ue-leg-h">Built up on low-lying land</p><span class="fl-ramp"><i style="background:linear-gradient(90deg,${RAMP.join(',')})"></i></span><span class="fl-ramp-l"><em>1975</em><em>${D ? D.years[yi] : ''}</em></span>`;
    if (mode === 'exposure') h += `<p class="ue-leg-h">Residents on low-lying land, by ward</p><span class="fl-wards">${WARD.map(c => `<i style="background:${c}"></i>`).join('')}</span><span class="fl-ramp-l"><em>0%</em><em>5</em><em>10</em><em>20</em><em>40%+</em></span><p class="ue-leg-h">Johannesburg</p><span><i style="background:#1F4E70"></i>Building, lowest class</span><span><i style="background:#6E9CBB"></i>Building, low class</span><span><i class="dot" style="background:#A0673A"></i>School</span><span><i class="dot" style="background:${RED}"></i>Clinic or hospital</span>`;
    L.innerHTML = h;
  }

  // ---------------------------------------------------------------- incidents and facilities
  let popup = null;
  function popInc(f) {
    const p = f.properties; popup && popup.remove();
    popup = new maplibregl.Popup({ maxWidth: '290px', offset: 10 }).setLngLat(f.geometry.coordinates).setHTML(
      `<div class="fl-pop"><b>${esc(p.place)}</b><span class="fl-pop-d">${fmtDate(p.event_date)}${p.date_note ? ' (' + esc(p.date_note) + ')' : ''}</span>
       <p>${esc(p.what)}</p><p class="fl-pop-s">Located at ${esc(p.precision)} level${p.geocode_note ? ' · ' + esc(p.geocode_note) : ''}<br>
       Source: <a href="${esc(p.source_url)}" target="_blank" rel="noopener">${esc(p.source_title)}</a></p></div>`).addTo(map);
  }

  // ---------------------------------------------------------------- mode switching
  function setMode(m) {
    mode = m; stop();
    $$('.fl-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    root.dataset.mode = m;
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('growth', m === 'growth'); ['inc', 'inc-sel'].forEach(id => vis(id, m === 'events'));
    ['bld', 'fac', 'wards', 'wards-line'].forEach(id => vis(id, m === 'exposure'));
    if (m !== 'exposure') clearProfile(true);
    setYear(yi, true); setEvent(ev, true);
    stats(); chart(); detail(); legend();
  }
  function setEvent(i, quiet) {
    ev = (i + D.events.length) % D.events.length;
    $('.fl-ev-out').textContent = EV().label;
    $$('.fl-ev-tick').forEach((t, k) => t.classList.toggle('on', k === ev));
    if (map.getLayer('inc-sel')) map.setFilter('inc-sel', ['==', ['get', 'ev'], ev]);
    if (!quiet) {
      stats(); chart(); detail(); legend();
      const f = INC.features.filter(x => x.properties.ev === ev).map(x => x.geometry.coordinates);
      if (f.length) {
        const b = f.reduce((bb, c) => [[Math.min(bb[0][0], c[0]), Math.min(bb[0][1], c[1])], [Math.max(bb[1][0], c[0]), Math.max(bb[1][1], c[1])]], [[180, 90], [-180, -90]]);
        map.fitBounds(b, { padding: 70, maxZoom: 12.5, duration: 900 });
      }
    }
  }
  function setYear(i, quiet) {
    yi = i; $('.fl-year').textContent = D.years[yi]; $('.fl-slider').value = yi;
    if (map.getLayer('growth')) map.setFilter('growth', ['<=', ['get', 'e'], yi + 1]);
    if (!quiet) { stats(); chart(); detail(); legend(); }
  }
  function play() {
    if (timer) return stop();
    $('.fl-play').setAttribute('aria-pressed', 'true');
    if (mode === 'growth' && yi === 9) setYear(0);
    timer = setInterval(() => {
      if (mode === 'growth') { if (yi >= 9) return stop(); setYear(yi + 1); }
      else { if (ev >= D.events.length - 1) return stop(); setEvent(ev + 1); }
    }, mode === 'growth' ? 1100 : 2600);
  }
  function stop() { clearInterval(timer); timer = null; $('.fl-play') && $('.fl-play').setAttribute('aria-pressed', 'false'); }

  // ---------------------------------------------------------------- municipality focus
  function bboxOf(g) {
    let b = [[180, 90], [-180, -90]];
    const walk = c => typeof c[0] === 'number' ? (b = [[Math.min(b[0][0], c[0]), Math.min(b[0][1], c[1])], [Math.max(b[1][0], c[0]), Math.max(b[1][1], c[1])]]) : c.forEach(walk);
    walk(g.coordinates); return b;
  }
  function setArea(n) {
    area = n;
    map.setFilter('mask', n === 'Gauteng' ? ['==', ['get', 'name'], '__none__'] : ['!=', ['get', 'name'], n]);
    map.setPaintProperty('mun-line', 'line-width', n === 'Gauteng' ? 0.8 : ['case', ['==', ['get', 'name'], n], 2, 0.6]);
    const f = n === 'Gauteng' ? null : MUN.features.find(x => x.properties.name === n);
    map.fitBounds(f ? bboxOf(f.geometry) : [[27.13, -26.95], [29.13, -25.08]], { padding: 30, duration: 800 });
    stats(); chart(); detail();
  }

  // ---------------------------------------------------------------- 3D
  function set3d(on) {
    is3d = on; $('.fl-3d').setAttribute('aria-pressed', String(on)); root.classList.toggle('is-3d', on);
    if (on) {
      map.setTerrain({ source: 'dem', exaggeration: +$('.fl-exag').value });
      map.easeTo({ pitch: 62, bearing: map.getBearing() || -20, zoom: Math.max(map.getZoom(), 11.5), duration: 1200 });
    } else {
      map.setTerrain(null); map.easeTo({ pitch: 0, bearing: 0, duration: 900 });
    }
  }

  // ---------------------------------------------------------------- terrain profile (reads the same tiles the map uses)
  const prof = { on: false, a: null, b: null, data: null, marks: [] };
  const tileCache = new Map();
  function pixelsOf(k, z, x, y) {
    const key = k + '/' + z + '/' + x + '/' + y;
    if (!tileCache.has(key)) tileCache.set(key, PM[k].getZxy(z, x, y).then(async r => {
      if (!r || !r.data) return null;
      const bmp = await createImageBitmap(new Blob([r.data], { type: k === 'terrain' ? 'image/webp' : 'image/png' }));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
      return g.getImageData(0, 0, c.width, c.height);
    }).catch(() => null));
    return tileCache.get(key);
  }
  function tileXY(lng, lat, z) {
    const n = 2 ** z, x = (lng + 180) / 360 * n, r = lat * Math.PI / 180, y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
    return [Math.floor(x), Math.floor(y), Math.floor((x % 1) * 256), Math.floor((y % 1) * 256)];
  }
  async function sample(lng, lat) {
    const [tx, ty, px, py] = tileXY(lng, lat, 12), im = await pixelsOf('terrain', 12, tx, ty);
    let e = null;
    if (im) { const i = (py * 256 + px) * 4, d = im.data; e = d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768; }
    const [ux, uy, qx, qy] = tileXY(lng, lat, 13), ic = await pixelsOf('flood_low', 13, ux, uy);
    let c = 0;
    if (ic) { const i = (qy * 256 + qx) * 4, d = ic.data; if (d[i + 3] > 40) c = d[i + 2] > 180 ? 1 : 2; }
    return [e, c];
  }
  const R = 6371008.8, rad = d => d * Math.PI / 180;
  const hav = (a, b) => { const dl = rad(b[1] - a[1]), dn = rad(b[0] - a[0]); const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  async function runProfile() {
    const n = 160, A0 = prof.a, B0p = prof.b, dist = hav(A0, B0p), pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([A0[0] + (B0p[0] - A0[0]) * t, A0[1] + (B0p[1] - A0[1]) * t, dist * t]); }
    const vals = await Promise.all(pts.map(p => sample(p[0], p[1])));
    prof.data = pts.map((p, i) => ({ lng: p[0], lat: p[1], d: p[2], e: vals[i][0], c: vals[i][1] }));
    drawProfile();
  }
  function drawProfile() {
    const box = $('.fl-detail-body'), P = prof.data.filter(p => p.e != null);
    if (P.length < 2) { box.innerHTML = '<p class="fl-note">No terrain here. Try a line inside Gauteng.</p>'; return; }
    const W2 = 360, H2 = Math.max(110, Math.min(170, box.clientHeight - 30 || 140)), l = 40, r = 10, t = 10, b = 22;
    let lo = Math.min(...P.map(p => p.e)), hi = Math.max(...P.map(p => p.e)); const pad = Math.max(5, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const dmax = P[P.length - 1].d, X = d => l + (W2 - l - r) * d / dmax, Y = e => H2 - b - (H2 - b - t) * (e - lo) / (hi - lo);
    let h = '';
    const st = niceStep((hi - lo) / 3);
    for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) h += `<line class="ue-grid" x1="${l}" x2="${W2 - r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ue-ax" x="${l - 5}" y="${Y(v) + 3.5}" text-anchor="end">${nf(v)}</text>`;
    h += `<path d="M${X(P[0].d)},${H2 - b} ${P.map(p => `L${X(p.d).toFixed(1)},${Y(p.e).toFixed(1)}`).join(' ')} L${X(dmax)},${H2 - b}Z" fill="#C9CEBB" opacity=".75"/>`;
    P.forEach((p, i) => { if (!p.c || i === P.length - 1) return; const q = P[i + 1];
      h += `<path d="M${X(p.d).toFixed(1)},${H2 - b} L${X(p.d).toFixed(1)},${Y(p.e).toFixed(1)} L${X(q.d).toFixed(1)},${Y(q.e).toFixed(1)} L${X(q.d).toFixed(1)},${H2 - b}Z" fill="${LOW[p.c]}" opacity=".9"/>`; });
    h += `<path d="${P.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.e).toFixed(1)}`).join(' ')}" fill="none" stroke="#4E5C58" stroke-width="1.5"/>`;
    h += `<text class="ue-ax" x="${l}" y="${H2 - 7}">A</text><text class="ue-ax" x="${W2 - r}" y="${H2 - 7}" text-anchor="end">B · ${nf(dmax / 1000, 1)} km</text>`;
    h += `<line class="fl-hover" x1="0" x2="0" y1="${t}" y2="${H2 - b}" visibility="hidden"/><text class="ue-ax fl-hover-t" x="0" y="${t + 8}" visibility="hidden"></text>`;
    const lowShare = P.filter(p => p.c).length / P.length;
    box.innerHTML = `<svg class="fl-prof" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Elevation profile from A to B">${h}</svg>
      <p class="fl-note">Ground from ${nf(Math.min(...P.map(p => p.e)))} to ${nf(Math.max(...P.map(p => p.e)))} m; ${nf(100 * lowShare)}% of the line crosses low-lying land. Vertical scale exaggerated.</p>`;
    const sv = box.querySelector('svg'), hl = sv.querySelector('.fl-hover'), ht = sv.querySelector('.fl-hover-t');
    sv.addEventListener('mousemove', e => {
      const bb = sv.getBoundingClientRect(), xx = (e.clientX - bb.left) * W2 / bb.width, d = (xx - l) / (W2 - l - r) * dmax;
      const p = P.reduce((best, q) => Math.abs(q.d - d) < Math.abs(best.d - d) ? q : best, P[0]);
      hl.setAttribute('x1', X(p.d)); hl.setAttribute('x2', X(p.d)); hl.setAttribute('visibility', 'visible');
      ht.textContent = nf(p.e) + ' m'; ht.setAttribute('x', Math.min(X(p.d) + 4, W2 - 40)); ht.setAttribute('visibility', 'visible');
      map.getSource('prof-pt').setData({ type: 'Point', coordinates: [p.lng, p.lat] });
    });
    sv.addEventListener('mouseleave', () => { hl.setAttribute('visibility', 'hidden'); ht.setAttribute('visibility', 'hidden'); map.getSource('prof-pt').setData({ type: 'FeatureCollection', features: [] }); });
  }
  function clearProfile(keepButton) {
    prof.on = false; prof.a = prof.b = prof.data = null; root.classList.remove('is-drawing');
    $('.fl-draw').setAttribute('aria-pressed', 'false'); $('.fl-draw').textContent = 'Draw a profile';
    if (map.getSource('prof')) { map.getSource('prof').setData({ type: 'FeatureCollection', features: [] }); map.getSource('prof-pt').setData({ type: 'FeatureCollection', features: [] }); }
    if (mode === 'exposure' && !keepButton) detail();
  }
  function profLine() {
    const fs = [];
    if (prof.a) fs.push({ type: 'Feature', properties: { k: 'A' }, geometry: { type: 'Point', coordinates: prof.a } });
    if (prof.b) { fs.push({ type: 'Feature', properties: { k: 'B' }, geometry: { type: 'Point', coordinates: prof.b } });
      fs.push({ type: 'Feature', properties: { k: 'line' }, geometry: { type: 'LineString', coordinates: [prof.a, prof.b] } }); }
    map.getSource('prof').setData({ type: 'FeatureCollection', features: fs });
  }

  // ---------------------------------------------------------------- wiring
  $('.fl-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  $('.fl-area').addEventListener('change', e => setArea(e.target.value));
  $('.fl-play').addEventListener('click', play);
  $('.fl-prev').addEventListener('click', () => { stop(); setEvent(ev - 1); });
  $('.fl-next').addEventListener('click', () => { stop(); setEvent(ev + 1); });
  $('.fl-slider').addEventListener('input', e => { stop(); setYear(+e.target.value); });
  $('.fl-reset').addEventListener('click', () => { stop(); setYear(0); });
  $('.fl-3d').addEventListener('click', () => set3d(!is3d));
  $('.fl-exag').addEventListener('input', e => { if (is3d) map.setTerrain({ source: 'dem', exaggeration: +e.target.value }); $('.fl-exag-v').textContent = '×' + e.target.value; });
  $('.fl-sat').addEventListener('click', e => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on));
    map.setLayoutProperty('sat', 'visibility', on ? 'visible' : 'none'); map.setLayoutProperty('light', 'visibility', on ? 'none' : 'visible');
    map.setPaintProperty('shade', 'hillshade-exaggeration', on ? 0.15 : 0.35);
  });
  $('.fl-jrc').addEventListener('click', e => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on));
    map.setLayoutProperty('jrc', 'visibility', on ? 'visible' : 'none'); legend();
  });
  $$('.fl-jumps button').forEach(b => b.addEventListener('click', () => {
    const [lng, lat, z, br] = b.dataset.go.split(',').map(Number);
    if (!is3d) { is3d = true; $('.fl-3d').setAttribute('aria-pressed', 'true'); root.classList.add('is-3d'); map.setTerrain({ source: 'dem', exaggeration: +$('.fl-exag').value }); }
    // easeTo, not flyTo: a fly-out-and-in path can dip inside the exaggerated terrain, and MapLibre then lifts the camera short of the target
    map.easeTo({ center: [lng, lat], zoom: z, pitch: 62, bearing: br, duration: 2600, essential: true });
  }));
  $('.fl-draw').addEventListener('click', () => {
    if (prof.on || prof.data) { clearProfile(); return; }
    clearProfile(true); prof.on = true; root.classList.add('is-drawing');
    $('.fl-draw').setAttribute('aria-pressed', 'true'); $('.fl-draw').textContent = 'Clear the profile';
    $('.fl-detail-body').innerHTML = '<p class="fl-note">Click the start of the line (A) on the map.</p>';
  });
  map.on('click', e => {
    if (!prof.on) return;
    const c = [e.lngLat.lng, e.lngLat.lat];
    if (!prof.a) { prof.a = c; profLine(); $('.fl-detail-body').innerHTML = '<p class="fl-note">Now click the end of the line (B).</p>'; }
    else { prof.b = c; prof.on = false; root.classList.remove('is-drawing'); profLine(); $('.fl-detail-body').innerHTML = '<p class="fl-note">Reading the terrain…</p>'; runProfile(); }
  });

  // ---------------------------------------------------------------- places (HTML labels, decluttered)
  const placeMarks = [];
  function declutter() {
    const z = map.getZoom(), kept = [];
    placeMarks.forEach(({ m, el, rank }) => {
      const show = rank === 'city' || z >= 9.2;
      if (!show) { el.style.visibility = 'hidden'; return; }
      const b = el.getBoundingClientRect(); if (!b.width) { el.style.visibility = 'visible'; return; }
      const hit = kept.some(k => !(b.right < k.left || b.left > k.right || b.bottom < k.top || b.top > k.bottom));
      el.style.visibility = hit ? 'hidden' : 'visible'; if (!hit) kept.push(b);
    });
  }

  // ---------------------------------------------------------------- load
  let started = false;
  const init = () => {
    if (started) return; started = true;
    Promise.all(['data.json', 'municipalities.geojson', 'incidents.geojson', 'facilities.geojson', 'places.geojson', 'wards.geojson'].map(f => fetch(BASE + f).then(r => r.json())))
      .then(([d, mun, inc, fac, places, wards]) => {
        D = d; MUN = mun; INC = inc; FAC = fac;
        map.addSource('wards', { type: 'geojson', data: wards });
        map.addLayer({ id: 'wards', type: 'fill', source: 'wards', maxzoom: 13, layout: { visibility: 'none' },
          paint: { 'fill-color': ['case', ['==', ['get', 's'], null], 'rgba(0,0,0,0)', ['step', ['get', 's'], WARD[0], 5, WARD[1], 10, WARD[2], 20, WARD[3], 40, WARD[4]]], 'fill-opacity': 0.72 } }, 'low');
        map.addLayer({ id: 'wards-line', type: 'line', source: 'wards', maxzoom: 13, layout: { visibility: 'none' }, paint: { 'line-color': '#F6F7F0', 'line-width': 0.6, 'line-opacity': 0.9 } }, 'low');
        map.addSource('mun', { type: 'geojson', data: mun });
        map.addLayer({ id: 'mask', type: 'fill', source: 'mun', paint: { 'fill-color': '#EEF0E6', 'fill-opacity': 0.62 }, filter: ['==', ['get', 'name'], '__none__'] });
        map.addLayer({ id: 'mun-line', type: 'line', source: 'mun', paint: { 'line-color': '#4E5C58', 'line-width': 0.8, 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
        map.addLayer({ id: 'bld', type: 'fill-extrusion', source: 'bld', 'source-layer': 'bld', minzoom: 12.5, layout: { visibility: 'none' },
          paint: { 'fill-extrusion-color': ['match', ['get', 'c'], 2, '#1F4E70', '#6E9CBB'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.92 } });
        map.addSource('fac', { type: 'geojson', data: fac });
        map.addLayer({ id: 'fac', type: 'circle', source: 'fac', layout: { visibility: 'none' },
          paint: { 'circle-radius': ['case', ['>', ['get', 'c'], 0], 6, 3], 'circle-color': ['match', ['get', 'k'], 'school', '#A0673A', RED],
                   'circle-opacity': ['case', ['>', ['get', 'c'], 0], 1, 0.45], 'circle-stroke-color': '#F6F7F0', 'circle-stroke-width': ['case', ['>', ['get', 'c'], 0], 1.6, 0.6] } });
        map.addSource('inc', { type: 'geojson', data: inc });
        map.addLayer({ id: 'inc', type: 'circle', source: 'inc', paint: { 'circle-radius': 4.5, 'circle-color': '#4E5C58', 'circle-opacity': 0.55, 'circle-stroke-color': '#F6F7F0', 'circle-stroke-width': 1 } });
        map.addLayer({ id: 'inc-sel', type: 'circle', source: 'inc', filter: ['==', ['get', 'ev'], 0], paint: { 'circle-radius': 8, 'circle-color': RED, 'circle-stroke-color': '#F6F7F0', 'circle-stroke-width': 2 } });
        map.addSource('prof', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addSource('prof-pt', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'prof-line', type: 'line', source: 'prof', filter: ['==', ['get', 'k'], 'line'], paint: { 'line-color': INK, 'line-width': 2.5, 'line-dasharray': [2, 1.2] } });
        map.addLayer({ id: 'prof-ends', type: 'circle', source: 'prof', filter: ['!=', ['get', 'k'], 'line'], paint: { 'circle-radius': 7, 'circle-color': INK, 'circle-stroke-color': '#F6F7F0', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'prof-pt', type: 'circle', source: 'prof-pt', paint: { 'circle-radius': 6, 'circle-color': '#E39A42', 'circle-stroke-color': INK, 'circle-stroke-width': 1.5 } });

        places.features.forEach(f => {
          const el = document.createElement('span'); el.className = 'fl-place' + (f.properties.rank === 'city' ? ' is-city' : ''); el.textContent = f.properties.name;
          const m = new maplibregl.Marker({ element: el, anchor: 'left', offset: [5, 0] }).setLngLat(f.geometry.coordinates).addTo(map);
          placeMarks.push({ m, el, rank: f.properties.rank });
        });
        map.on('moveend', () => requestAnimationFrame(declutter)); requestAnimationFrame(declutter);

        // near low-lying land: precomputed on the page from the same tiles, for the "near" tile
        Promise.all(inc.features.map(async f => {
          const [lng, lat] = f.geometry.coordinates; let near = false;
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const s = await sample(lng + dx * 0.0035, lat + dy * 0.003); if (s[1]) { near = true; break; }
          }
          f.properties.near = near;
        })).then(() => { if (mode === 'events') stats(); });

        map.on('click', 'inc', e => { if (!prof.on && mode === 'events') popInc(e.features[0]); });
        map.on('click', 'fac', e => {
          if (prof.on) return; const p = e.features[0].properties; popup && popup.remove();
          popup = new maplibregl.Popup({ offset: 8 }).setLngLat(e.lngLat).setHTML(`<div class="fl-pop"><b>${esc(p.n || (p.k === 'school' ? 'School' : 'Health facility'))}</b><span class="fl-pop-d">${p.k}</span><p>${p.c == 2 ? 'On the lowest class of low-lying land' : p.c == 1 ? 'On low-lying land' : 'Not on low-lying land'}</p></div>`).addTo(map);
        });
        map.on('click', 'wards', e => {
          if (prof.on || mode !== 'exposure') return;
          if (map.queryRenderedFeatures(e.point, { layers: ['fac'] }).length) return;
          const p = e.features[0].properties; popup && popup.remove();
          const sh = p.s == null || p.s === 'null' ? null : +p.s;
          popup = new maplibregl.Popup({ offset: 6, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div class="fl-pop"><b>Ward ${esc(p.no)}, ${esc(p.mun)}</b><span class="fl-pop-d">${nf(+p.pop)} residents (GHS-POP 2020)</span><p>${sh == null ? 'Too few residents to show a share.' : `${nf(+p.low)} on low-lying land (${nf(sh, 1)}%), ${nf(+p.hi)} of them on the lowest class.`}</p></div>`).addTo(map);
        });
        ['inc', 'fac'].forEach(id => { map.on('mouseenter', id, () => { if (!prof.on) map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => map.getCanvas().style.cursor = ''); });

        // event ticks on the 2016-2026 track
        const t0 = Date.parse('2016-06-01'), t1 = Date.parse('2027-01-01');
        $('.fl-ev-track').innerHTML = D.events.map((e, i) => `<button type="button" class="fl-ev-tick" style="left:${(100 * (Date.parse(e.date) - t0) / (t1 - t0)).toFixed(2)}%" aria-label="${esc(e.label)}" data-i="${i}"></button>`).join('') +
          [2017, 2019, 2021, 2023, 2025].map(y => `<span class="fl-ev-yr" style="left:${(100 * (Date.parse(y + '-01-01') - t0) / (t1 - t0)).toFixed(2)}%">${y}</span>`).join('');
        $$('.fl-ev-tick').forEach(b => b.addEventListener('click', () => { stop(); setEvent(+b.dataset.i); }));
        ev = D.events.length - 1;
        setMode('events'); setEvent(ev);
        root.classList.add('is-ready');
      })
      .catch(err => { console.error(err); const p = document.createElement('p'); p.className = 'ue-err'; p.textContent = 'The map data could not be loaded. Please refresh the page.'; $('.ue-mapwrap').appendChild(p); });
  };
  map.on('style.load', init);
  map.on('load', init);
})();
