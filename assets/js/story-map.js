/*
 * Story maps and sheet carousels for the project pages (RE-SITE ZA, WIND-SITE ZA, Who Holds the Tap?, Zimbabwe).
 * Needs Leaflet 1.9.x. Each viewer reads its settings from <script type="application/json" id="..."> referenced
 * by data-config on the .story-map element. Theme images are Web Mercator renders from QGIS; clicks are answered
 * from a packed data image (RE-SITE ZA) or a sub-basin id image (Who Holds the Tap?).
 */
(function () {
  'use strict';
  const fmt = new Intl.NumberFormat('en-ZA');
  const pct = v => (v == null ? '–' : Math.round(v * 100) + '%');
  const num = v => (v == null ? '–' : fmt.format(Math.round(v)));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const millions = v => (v == null ? '–' : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + ' million' : fmt.format(Math.round(v)));

  // ---------------------------------------------------------------- pixel look-up images
  function pixelSource(src, bounds) {
    const img = new Image();
    const state = { ready: false, ctx: null, w: 0, h: 0 };
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = state.w = img.naturalWidth; c.height = state.h = img.naturalHeight;
      state.ctx = c.getContext('2d', { willReadFrequently: true });
      state.ctx.drawImage(img, 0, 0); state.ready = true;
    };
    img.src = src;
    const sw = L.CRS.EPSG3857.project(L.latLng(bounds[0])), ne = L.CRS.EPSG3857.project(L.latLng(bounds[1]));
    state.read = latlng => {
      if (!state.ready) return null;
      const p = L.CRS.EPSG3857.project(latlng);
      const x = Math.floor((p.x - sw.x) / (ne.x - sw.x) * state.w), y = Math.floor((ne.y - p.y) / (ne.y - sw.y) * state.h);
      if (x < 0 || y < 0 || x >= state.w || y >= state.h) return null;
      return state.ctx.getImageData(x, y, 1, 1).data;
    };
    return state;
  }

  // ---------------------------------------------------------------- popup formatters
  const SUIT = ['Excluded or outside', 'Very low', 'Low', 'Moderate', 'High', 'Very high'];
  const CONSTRAINT = ['', 'Protected area', 'Cropland, built-up land, water or mines', 'Slope over 15°'];
  const STRESS = { A1: 'low dependency, low stress', A2: 'low dependency, high stress', A3: 'low dependency, extremely high stress',
    B1: 'medium dependency, low stress', B2: 'medium dependency, high stress', B3: 'medium dependency, extremely high stress',
    C1: 'high dependency, low stress', C2: 'high dependency, high stress', C3: 'high dependency, extremely high stress',
    AX: 'arid, low water use', BX: 'arid, low water use', CX: 'arid, low water use' };
  const EXCLW = ['', 'Dwelling setback (500 m)', 'Settlement (2 km)', 'Main road or railway (253 m)', 'Power line (253 m)',
    'Aerodrome (3 km)', 'Protected area or its 1 km buffer', 'Slope over 12°', 'Forest, water, wetland or built-up land',
    'Operating wind farm (1.5 km)'];
  const OUTCOME = { 'Confirmed': '#4E7A50', 'Needs review': '#D9A35E', 'Fails a setback': '#8E2F22' };
  const pop = {
    wind: px => {
      if (!px || px[3] === 0) return null;
      const v = px[0] / 20, code = Math.floor(px[1] / 16), cls = px[1] % 16, vis = px[2];
      let h = '<b>This spot</b><dl>';
      h += `<dt>Wind at 150 m</dt><dd>${v.toFixed(1)} m/s on average</dd>`;
      if (code) h += `<dt>Excluded</dt><dd>${EXCLW[code] || '–'}</dd>`;
      else h += `<dt>Suitability (balanced)</dt><dd>${SUIT[cls] || '–'}</dd>`;
      h += `<dt>Blade tips in view</dt><dd>${vis ? (vis >= 255 ? 'over 250' : vis) + ' of the proposed turbines' : 'none of the proposed turbines'}</dd>`;
      return h + '</dl>';
    },
    wzone: p => `<b>Zone ${esc(p.zone)}</b><dl><dt>Area</dt><dd>${p.area_km2.toFixed(1)} km²</dd>` +
      `<dt>Mean suitability</dt><dd>${p.score.toFixed(2)} of 5 (balanced)</dd><dt>Wind at 150 m</dt><dd>${p.wind_ms.toFixed(1)} m/s</dd>` +
      `<dt>Turbines (model)</dt><dd>${p.turbines} × 5 MW = ${num(p.mw)} MW</dd>` +
      `<dt>Energy, net</dt><dd>${num(p.aep_gwh)} GWh a year, capacity factor ${pct(p.cf_net)}</dd>` +
      `<dt>Grid route</dt><dd>${p.route_km} km to ${esc(p.route_sub || '–')}</dd>` +
      `<dt>Priority-bird index</dt><dd>${p.bird_index.toFixed(1)} (weighted GBIF records within 3 km)</dd>` +
      `<dt>Weightings at 3.8+</dt><dd>${p.robustness.toFixed(1)} of 3 on average</dd></dl>`,
    turbine: p => `<b>Turbine ${esc(p.turbine)}</b><dl><dt>Zone</dt><dd>${esc(p.zone)}</dd>` +
      `<dt>Wind at 150 m</dt><dd>${p.wind_ms.toFixed(1)} m/s</dd><dt>Ground</dt><dd>${num(p.elev_m)} m above sea level</dd>` +
      `<dt>Capacity factor</dt><dd>${pct(p.cf_net)} after losses</dd><dt>Energy</dt><dd>${num(p.aep_mwh)} MWh a year</dd></dl>` +
      `<p>A modelled position on a generic 5 MW turbine, not a planned one.</p>`,
    route: p => `<b>Grid route from ${esc(p.zone)}</b><dl><dt>To</dt><dd>${esc(p.substation)}${p.kv ? ' (' + num(p.kv) + ' kV)' : ''}</dd>` +
      `<dt>Length</dt><dd>${p.length_km} km</dd><dt>Zone capacity</dt><dd>${num(p.zone_mw)} MW</dd>` +
      `<dt>GCCA 2025</dt><dd>${esc(p.gcca_zone || '–')} substation ${p.gcca_sub_mw == null ? '–' : num(p.gcca_sub_mw) + ' MW'}; ` +
      `supply area ${p.gcca_supply_mw == null ? '–' : num(p.gcca_supply_mw) + ' MW'}</dd></dl>`,
    check: p => `<p class="sm-demo">Demonstration record</p><b>${esc(p.check_id)}: ${esc(p.check_type)}</b><dl>` +
      `<dt>Turbine</dt><dd>${esc(p.turbine)} in ${esc(p.zone)}</dd><dt>Access</dt><dd>${esc(p.access)}</dd>` +
      `<dt>Land use</dt><dd>${esc(p.land_use)}</dd>` +
      (p.dwelling_found ? `<dt>Dwelling found</dt><dd>${num(p.dwelling_dist_m)} m away, not on the map</dd>` : '') +
      (p.raptor_seen ? `<dt>Priority bird</dt><dd><i>${esc(p.species)}</i></dd>` : '') +
      `<dt>Outcome</dt><dd>${esc(p.outcome)}</dd></dl><p>${esc(p.notes)}</p>`,
    grid: px => {
      if (!px || px[3] === 0) return null;
      const pv = px[0] ? 1700 + (px[0] - 1) * 2 : null, km = px[1], b = px[2];
      const cls = Math.floor(b / 16), robust = Math.floor((b % 16) / 4), code = b % 4;
      let h = '<b>This spot in the Northern Cape</b><dl>';
      if (pv) h += `<dt>Solar output</dt><dd>about ${fmt.format(pv)} kWh per kWp a year</dd>`;
      h += `<dt>To a 132 kV+ line</dt><dd>${km >= 255 ? 'over 250' : km} km</dd>`;
      if (code) h += `<dt>Excluded</dt><dd>${CONSTRAINT[code]}</dd>`;
      else h += `<dt>Suitability (balanced)</dt><dd>${SUIT[cls]}</dd><dt>High or better in</dt><dd>${robust} of 3 weightings</dd>`;
      return h + '</dl>';
    },
    sub: (row, keys) => {
      if (!row) return null;
      const r = {}; keys.forEach((k, i) => (r[k] = row[i]));
      let h = `<b>Sub-basin in ${esc(r.country || 'Africa')}</b><dl>`;
      h += `<dt>River basin</dt><dd>${esc(r.tfdd_basin || r.basin_name || '–')}</dd>`;
      h += `<dt>Upstream area abroad</dt><dd>${pct(r.foreign_share)} of ${num(r.up_land_km2)} km²</dd>`;
      h += `<dt>People here, 2025</dt><dd>${num(r.pop_2025)}${r.pop_exposed ? ` (${num(r.pop_exposed)} exposed)` : ''}</dd>`;
      if (r.bws_label) h += `<dt>Water stress</dt><dd>${esc(r.bws_label)}</dd>`;
      if (r.dep_stress && !/X$/.test(r.dep_stress)) h += `<dt>Class</dt><dd>${esc(STRESS[r.dep_stress] || r.dep_stress)}</dd>`;
      if (r.drains_to === 'inland') h += `<dt>Drains</dt><dd>inland, no outlet to the sea</dd>`;
      return h + '</dl>';
    },
    zone: p => `<b>Priority zone ${p.rank}</b><dl><dt>Municipality</dt><dd>${esc(p.municipality)}</dd><dt>Area</dt><dd>${num(p.area_km2)} km²</dd>` +
      `<dt>Mean suitability</dt><dd>${p.s_mean3.toFixed(2)} of 5 (three scenarios)</dd><dt>Solar output</dt><dd>${num(p.pvout)} kWh/kWp</dd>` +
      `<dt>To a 132 kV+ line</dt><dd>${p.grid_km} km on average</dd><dt>GCCA substation</dt><dd>${esc((p.gcca_zone || '–'))}, ${p.gcca_sub_limit_mw == null ? '–' : num(p.gcca_sub_limit_mw) + ' MW'} (supply area 0 MW)</dd>` +
      `<dt>Inside a solar REDZ</dt><dd>${pct(p.solar_redz_share)}</dd></dl>`,
    gcca: p => `<b>${esc(p.substation)} substation zone</b><dl><dt>Local area</dt><dd>${esc(p.local_area)}</dd>` +
      `<dt>Substation could take</dt><dd>${p.sub_limit_mw == null ? '–' : num(p.sub_limit_mw) + ' MW'}</dd>` +
      `<dt>Supply-area limit</dt><dd>${p.supply_limit_mw == null ? '–' : num(p.supply_limit_mw) + ' MW'}</dd>` +
      `<dt>Already allocated</dt><dd>${p.gx_connected_mw == null ? '–' : num(p.gx_connected_mw) + ' MW'}</dd></dl>`,
    redz: p => `<b>${esc(p.name)} REDZ</b><dl><dt>Phase</dt><dd>${p.phase}</dd></dl><p>A Renewable Energy Development Zone, where DFFE has pre-assessed the environment for wind or solar.</p>`,
    reea: p => `<b>Solar PV application</b><p>${esc(p.title)}</p><dl><dt>Status (2021)</dt><dd>${esc(p.status)}</dd><dt>Capacity</dt><dd>${p.mw ? num(p.mw) + ' MW' : '–'}</dd></dl>`,
    substation: p => `<b>${esc(p.name || 'Substation')}</b><dl><dt>Voltage</dt><dd>${num(p.kv)} kV</dd></dl>`,
    country: p => `<b>${esc(p.ADMIN)}</b><dl><dt>Population 2025</dt><dd>${millions(p.pop_2025)}</dd>` +
      `<dt>Exposed</dt><dd>${millions(p.pop_exposed)} (${pct(p.exposed_share)})</dd></dl><p>Exposed: living where at least half of the river's upstream catchment lies in another country.</p>`,
    dam: p => `<b>${esc(p.dam_name || 'Dam')}</b><dl><dt>River</dt><dd>${esc(p.river || '–')}</dd><dt>Country</dt><dd>${esc(p.country)}</dd>` +
      `<dt>Built storage</dt><dd>${(p.built_mcm / 1000).toFixed(p.built_mcm >= 10000 ? 0 : 1)} km³</dd>` +
      (p.year ? `<dt>Completed</dt><dd>${p.year}</dd>` : '') +
      `<dt>Water flows on to</dt><dd>${p.crossborder ? esc(p.downstream) : 'stays in ' + esc(p.country)}</dd></dl>`,
    park: p => `<b>${esc(p.short)} National Park</b><dl><dt>Area</dt><dd>${num(p.area_km2)} km²</dd>` +
      `<dt>Designated</dt><dd>${p.year || '–'}</dd><dt>IUCN category</dt><dd>${esc(p.iucn || '–')}</dd></dl>`,
    protectedArea: p => `<b>${esc(p.name)}</b><dl><dt>Type</dt><dd>${esc(p.desig)}</dd><dt>Area in Zimbabwe</dt><dd>${num(p.area_km2)} km²</dd></dl>`,
    basin: p => `<b>${esc(p.Basin_Name)} basin</b><dl><dt>Countries sharing it</dt><dd>${p.NumberRipa ?? '–'}</dd>` +
      `<dt>Treaties</dt><dd>${p.Count_of_T ?? 0}</dd><dt>Basin organisations</dt><dd>${p.Count_of_R ?? 0}</dd>` +
      `<dt>Tension risk (TFDD)</dt><dd>${p.HydroPolTe && p.HydroPolTe !== 'N/A' ? p.HydroPolTe + ' of 5' : '–'}</dd>` +
      `<dt>People exposed</dt><dd>${millions(p.exposed)}</dd></dl>`
  };

  // ---------------------------------------------------------------- vector layer recipes
  const recipes = {
    wzones: gj => L.geoJSON(gj, {
      style: () => ({ color: '#2E4A30', weight: 1.4, fillColor: '#4E7A50', fillOpacity: 0.42 }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.wzone(f.properties), { maxWidth: 300 });
        l.bindTooltip(f.properties.zone, { permanent: true, direction: 'top', offset: [0, -6], className: 'sm-zone' });
        l.on('mouseover', () => l.setStyle({ weight: 2.6, fillOpacity: 0.6 })); l.on('mouseout', () => l.setStyle({ weight: 1.4, fillOpacity: 0.42 }));
      }
    }),
    wzonesLine: gj => L.geoJSON(gj, {
      style: () => ({ color: '#2E4A30', weight: 1.2, fillColor: '#4E7A50', fillOpacity: 0.3 }),
      onEachFeature: (f, l) => l.bindPopup(pop.wzone(f.properties), { maxWidth: 300 })
    }),
    turbines: (gj, map) => {
      // turbines are 800 m apart: keep the dots apart at every zoom
      const rad = () => (map.getZoom() < 9.5 ? 1.8 : map.getZoom() < 10.5 ? 2.7 : 3.8);
      const lyr = L.geoJSON(gj, {
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: rad(), color: '#F4EFE3', weight: 0.7, fillColor: '#1F4E6B', fillOpacity: 1 }),
        onEachFeature: (f, l) => l.bindPopup(pop.turbine(f.properties), { maxWidth: 280 })
      });
      map.on('zoomend', () => lyr.eachLayer(l => l.setRadius(rad())));
      return lyr;
    },
    routes: gj => L.geoJSON(gj, {
      style: () => ({ color: '#D9480F', weight: 3.2, opacity: 0.95 }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.route(f.properties), { maxWidth: 300 });
        l.on('mouseover', () => l.setStyle({ weight: 5.5 })); l.on('mouseout', () => l.setStyle({ weight: 3.2 }));
      }
    }),
    checks: gj => L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 7, color: '#F4EFE3', weight: 2, fillColor: OUTCOME[f.properties.outcome] || '#7A6A55',
        fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(pop.check(f.properties), { maxWidth: 300 })
    }),
    zones: (gj, map) => L.geoJSON(gj, {
      style: f => ({ color: '#2E4A30', weight: 1.2, fillColor: f.properties.rank <= 10 ? '#4E7A50' : '#8FAE86', fillOpacity: 0.85 }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.zone(f.properties), { maxWidth: 300 });
        if (f.properties.rank <= 10) l.bindTooltip(String(f.properties.rank), { permanent: true, direction: 'center', className: 'sm-rank' });
      }
    }),
    gcca: gj => L.geoJSON(gj, {
      style: () => ({ color: '#8E2F22', weight: 1.3, dashArray: '5 4', fillOpacity: 0, fill: true }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.gcca(f.properties), { maxWidth: 280 });
        l.on('mouseover', () => l.setStyle({ weight: 2.6, fillColor: '#8E2F22', fillOpacity: 0.08 }));
        l.on('mouseout', () => l.setStyle({ weight: 1.3, fillOpacity: 0 }));
      }
    }),
    substations: gj => L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3.5, color: '#2B1B17', weight: 1.2, fillColor: '#F4EFE3', fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(pop.substation(f.properties))
    }),
    redz: gj => L.geoJSON(gj, {
      filter: f => /Solar/.test(f.properties.name),
      style: () => ({ color: '#2B1B17', weight: 2, dashArray: '8 4', fillOpacity: 0, fill: true }),
      onEachFeature: (f, l) => { l.bindPopup(pop.redz(f.properties)); l.bindTooltip(f.properties.name + ' REDZ', { sticky: true, className: 'sm-tip' }); }
    }),
    reea: gj => L.geoJSON(gj, {
      style: () => ({ color: '#4C7D99', weight: 0.8, fillColor: '#7397AD', fillOpacity: 0.55 }),
      onEachFeature: (f, l) => l.bindPopup(pop.reea(f.properties), { maxWidth: 280 })
    }),
    countries: gj => L.geoJSON(gj, {
      style: () => ({ color: '#2B1B17', weight: 0, fillOpacity: 0, fill: true }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.country(f.properties), { maxWidth: 280 });
        l.on('mouseover', () => l.setStyle({ weight: 2, color: '#8E2F22' }));
        l.on('mouseout', () => l.setStyle({ weight: 0 }));
      }
    }),
    exposedCircles: gj => L.geoJSON(gj, {
      filter: f => (f.properties.pop_exposed || 0) >= 2e5,
      pointToLayer: (f, ll) => L.circle(ll, { radius: 520000 * Math.sqrt(f.properties.pop_exposed / 1e8), color: '#8E2F22', weight: 1.2,
        fillColor: '#8E2F22', fillOpacity: 0.32, interactive: false })
    }),
    dams: gj => L.geoJSON(gj, {
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 2.5 + 15 * Math.sqrt(f.properties.built_mcm / 185000),
        color: '#F4EFE3', weight: 0.8, fillColor: f.properties.crossborder ? '#8E2F22' : '#9C8B72', fillOpacity: 0.85 }),
      onEachFeature: (f, l) => l.bindPopup(pop.dam(f.properties), { maxWidth: 280 })
    }),
    parks: gj => L.geoJSON(gj, {
      style: () => ({ color: '#3E5A2A', weight: 0, fillOpacity: 0, fill: true }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.park(f.properties), { maxWidth: 280 });
        l.bindTooltip(f.properties.short, { permanent: true, direction: 'center', className: 'sm-park', offset: f.properties.lab || [0, 0] });
        l.on('mouseover', () => l.setStyle({ weight: 2.4 })); l.on('mouseout', () => l.setStyle({ weight: 0 }));
      }
    }),
    protected: gj => L.geoJSON(gj, {
      style: () => ({ color: '#6B5B4B', weight: 0, fillOpacity: 0, fill: true }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.protectedArea(f.properties), { maxWidth: 280 });
        l.on('mouseover', () => l.setStyle({ weight: 1.8 })); l.on('mouseout', () => l.setStyle({ weight: 0 }));
      }
    }),
    basins: gj => L.geoJSON(gj, {
      style: f => ({ color: /Juba/.test(f.properties.Basin_Name) ? '#8E2F22' : '#5A4B3D', weight: /Juba/.test(f.properties.Basin_Name) ? 3 : 0.6,
        fillOpacity: 0, fill: true }),
      onEachFeature: (f, l) => {
        l.bindPopup(pop.basin(f.properties), { maxWidth: 280 });
        const hi = /Juba/.test(f.properties.Basin_Name);
        l.on('mouseover', () => l.setStyle({ weight: hi ? 4 : 2.2, color: '#8E2F22' }));
        l.on('mouseout', () => l.setStyle({ weight: hi ? 3 : 0.6, color: hi ? '#8E2F22' : '#5A4B3D' }));
      }
    })
  };

  // ---------------------------------------------------------------- legend
  function legendHTML(items) {
    return items.map(it => {
      if (it.heading) return `<p class="sm-legend-h">${esc(it.heading)}</p>`;
      let sw;
      if (it.line) sw = `<span class="sm-sw sm-sw-line" style="border-top:${it.width || 2}px ${it.dash ? 'dashed' : 'solid'} ${it.line}"></span>`;
      else if (it.circle) sw = `<span class="sm-sw sm-sw-dot" style="background:${it.circle}"></span>`;
      else if (it.tri) sw = `<span class="sm-sw sm-sw-tri" style="border-bottom-color:${it.tri}"></span>`;
      else sw = `<span class="sm-sw" style="background:${it.color}${it.border ? ';border-color:' + it.border : ''}"></span>`;
      return `<div class="sm-legend-row">${sw}<span>${esc(it.label)}</span></div>`;
    }).join('');
  }

  // ---------------------------------------------------------------- story map
  function storyMap(el) {
    const cfg = JSON.parse(document.getElementById(el.dataset.config).textContent);
    const base = cfg.base;
    const mapEl = el.querySelector('.sm-map'), panel = el.querySelector('.sm-panel'), tabs = el.querySelector('.sm-tabs');
    const imgBounds = L.latLngBounds(cfg.bounds);
    const map = L.map(mapEl, { zoomSnap: 0.25, zoomDelta: 0.5, minZoom: cfg.minZoom, maxZoom: cfg.maxZoom,
      maxBounds: imgBounds, maxBoundsViscosity: 1, attributionControl: true });
    // Credits fold into a small "Credits" button so they never cover the scale bar; open by default on wide screens
    const wide = window.matchMedia('(min-width: 900px)').matches;
    map.attributionControl.setPrefix(false)
      .addAttribution(`<details class="sm-credit"${wide ? ' open' : ''}><summary>Credits</summary><span>${cfg.attribution}</span></details>`);
    // never zoom out past the edge of the map image
    // zoom out no further than the whole study area, and stop before the edge of the image where possible
    function clampZoom() {
      const fill = map.getBoundsZoom(imgBounds, true), whole = map.getBoundsZoom(L.latLngBounds(cfg.home), false);
      map.setMinZoom(Math.max(cfg.minZoom, Math.min(fill, whole)));
    }
    clampZoom(); map.fitBounds(cfg.home);
    map.on('resize', clampZoom);
    const home = L.control({ position: 'topleft' });
    home.onAdd = () => {
      const b = L.DomUtil.create('button', 'sm-home'); b.type = 'button'; b.title = 'Back to the full view'; b.setAttribute('aria-label', 'Back to the full view');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
      L.DomEvent.on(b, 'click', e => { L.DomEvent.stop(e); map.flyToBounds(cfg.home, { duration: 0.6 }); });
      return b;
    };
    home.addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    const overlays = {};
    const vectors = {};
    const vecData = {};
    let active = null, activeVec = [];
    const labelLayer = L.layerGroup().addTo(map);
    const blank = L.divIcon({ className: 'sm-blank', iconSize: [0, 0] });

    // click read-outs
    let lookup = null, attrs = null;
    if (cfg.lookup) {
      lookup = pixelSource(base + cfg.lookup.src, cfg.lookup.bounds);
      if (cfg.lookup.attrs) fetch(base + cfg.lookup.attrs).then(r => r.json()).then(j => (attrs = j));
    }
    map.on('click', e => {
      const t = cfg.themes.find(x => x.id === active);
      if (!lookup || (t && t.noLookup)) return;
      const px = lookup.read(e.latlng);
      let html = null;
      if (cfg.lookup.type === 'grid') html = pop.grid(px);
      else if (cfg.lookup.type === 'wind') html = pop.wind(px);
      else if (px && px[3] === 255 && attrs) {
        const id = (px[0] << 16) + (px[1] << 8) + px[2];
        html = pop.sub(attrs.rows[id], attrs.keys);
      }
      if (html) L.popup({ maxWidth: 300 }).setLatLng(e.latlng).setContent(html).openOn(map);
    });

    function loadVec(key) {
      if (vecData[key]) return Promise.resolve(vecData[key]);
      return fetch(base + cfg.vectors[key]).then(r => r.json()).then(j => (vecData[key] = j));
    }
    function getVec(key) {
      if (vectors[key]) return Promise.resolve(vectors[key]);
      const recipeName = key.split(':')[0];
      return loadVec(recipeName === 'exposedCircles' ? 'country_points' : recipeName).then(gj => (vectors[key] = recipes[recipeName](gj, map)));
    }

    // labels: towns, regions, map labels per theme
    let labelData = null;
    function drawLabels(t) {
      labelLayer.clearLayers();
      requestAnimationFrame(() => requestAnimationFrame(declutter));
      (cfg.regionLabels || []).forEach(([txt, lat, lon]) =>
        L.marker([lat, lon], { icon: blank, interactive: false, keyboard: false })
          .bindTooltip(txt, { permanent: true, direction: 'center', className: 'sm-region' }).addTo(labelLayer));
      if (!labelData) return;
      labelData.features.forEach(f => {
        const p = f.properties, kinds = t.labelKinds || [];
        if (cfg.labelMode === 'towns') {
          L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { radius: (p.rank === 'capital' || p.name === cfg.capital) ? 4.2 : (p.rank === 'city' ? 3.4 : 2.8), color: '#F4EFE3',
            weight: 1, fillColor: '#2B1B17', fillOpacity: 1, interactive: false })
            .bindTooltip((p.rank === 'capital' ? p.name.toUpperCase() : p.name), { permanent: true, direction: 'right', offset: [4, 0],
              className: 'sm-town' + (p.rank === 'town' ? ' sm-town-minor' : '') }).addTo(labelLayer);
        } else if (kinds.includes(p.kind) && (!p.sheets || p.sheets.includes('|' + (t.labelSheet || t.sheet) + '|'))) {
          L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], { icon: blank, interactive: false, keyboard: false })
            .bindTooltip(p.txt.replace(/\n/g, '<br>'), { permanent: true, direction: 'center', className: 'sm-lab sm-lab-' + p.kind }).addTo(labelLayer);
        }
      });
    }
    // Hide any label that would overlap one drawn before it (region names first, then towns or map labels in data
    // order). Runs after every redraw and zoom, so crowded labels come back as you zoom in. Matters most on phones.
    function declutter() {
      const kept = [];
      labelLayer.eachLayer(l => {
        const tt = l.getTooltip && l.getTooltip(), el = tt && tt.getElement();
        if (!el) return;
        el.style.visibility = '';
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        const hit = kept.some(k => r.left < k.right + 3 && r.right > k.left - 3 && r.top < k.bottom + 2 && r.bottom > k.top - 2);
        if (hit) el.style.visibility = 'hidden'; else kept.push(r);
      });
    }
    map.on('zoomend', () => requestAnimationFrame(declutter));
    if (cfg.labels) fetch(base + cfg.labels).then(r => r.json()).then(j => { labelData = j; const t = cfg.themes.find(x => x.id === active); if (t) drawLabels(t); });

    function show(id, fromUser) {
      const t = cfg.themes.find(x => x.id === id); if (!t) return;
      if (!overlays[id]) overlays[id] = L.imageOverlay(base + t.img, cfg.bounds, { className: 'sm-img', interactive: false });
      overlays[id].addTo(map).bringToBack();
      if (active && active !== id && overlays[active]) map.removeLayer(overlays[active]);
      activeVec.forEach(v => map.removeLayer(v)); activeVec = [];
      Promise.all((t.vectors || []).map(getVec)).then(ls => { if (active !== id) return; ls.forEach(l => l.addTo(map)); activeVec = ls; });
      active = id;
      map.closePopup();
      tabs.querySelectorAll('button').forEach(b => { const on = b.dataset.theme === id; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
      panel.innerHTML = `<p class="sm-code">${esc(t.code)}</p><h3>${esc(t.title)}</h3><p class="sm-text">${t.text}</p>` +
        `<div class="sm-legend">${legendHTML(t.legend)}</div><p class="sm-hint">${t.hint || cfg.hint}</p>`;
      drawLabels(t);
      if (t.view && fromUser) map.flyToBounds(t.view, { duration: 0.8 });
      if (!t.view && fromUser && cfg.homeOnSwitch) map.flyToBounds(cfg.home, { duration: 0.6 });
      // preload the next theme image
      const i = cfg.themes.indexOf(t), nx = cfg.themes[(i + 1) % cfg.themes.length];
      if (nx) { const im = new Image(); im.src = base + nx.img; }
    }

    cfg.themes.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.role = 'tab'; b.dataset.theme = t.id;
      b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${esc(t.tab)}`;
      b.addEventListener('click', () => show(t.id, true));
      tabs.appendChild(b);
    });
    tabs.addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const ids = cfg.themes.map(t => t.id), i = ids.indexOf(active);
      const n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      show(n, true); tabs.querySelector(`[data-theme="${n}"]`).focus();
    });
    show(cfg.themes[0].id, false);
  }

  // ---------------------------------------------------------------- zoomable single image (Zimbabwe)
  function zoomImage(el) {
    const w = +el.dataset.width, h = +el.dataset.height;
    const map = L.map(el, { crs: L.CRS.Simple, minZoom: -3, maxZoom: 1.5, zoomSnap: 0.25, attributionControl: false });
    const b = [[0, 0], [h, w]];
    L.imageOverlay(el.dataset.src, b).addTo(map);
    map.fitBounds(b); map.setMaxBounds(L.latLngBounds(b).pad(0.1));
    map.setMinZoom(map.getZoom() - 0.5);
  }

  // ---------------------------------------------------------------- static map sheets: a row of cards and a viewer
  // Markup: .sheet-shelf > .ss-row > .ss-item > button.ss-card[data-full][data-code][data-title][data-text] + a.ss-dl
  let box = null;
  function viewer() {
    if (box) return box;
    const d = document.createElement('dialog');
    d.className = 'ss-box';
    d.setAttribute('aria-label', 'Map sheet');
    d.innerHTML = `<div class="ss-box-in">
        <div class="ss-box-top"><p class="ss-box-code"></p><button class="ss-x" type="button" aria-label="Close">&times;</button></div>
        <div class="ss-box-img"><img alt=""></div>
        <div class="ss-box-foot">
          <div class="ss-box-cap"><h3></h3><p></p></div>
          <div class="ss-box-nav">
            <button class="ss-prev" type="button" aria-label="Previous sheet">&larr;</button>
            <span class="ss-count" aria-live="polite"></span>
            <button class="ss-next" type="button" aria-label="Next sheet">&rarr;</button>
            <a class="ss-box-dl" download>Download</a>
            <a class="ss-box-open" target="_blank" rel="noopener">Full size</a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(d);
    const state = { cards: [], i: 0 };
    const show = n => {
      const cards = state.cards; state.i = (n + cards.length) % cards.length;
      const c = cards[state.i].dataset, img = d.querySelector('.ss-box-img img');
      img.src = c.full; img.alt = `Map sheet ${c.code}: ${c.title}`;
      d.querySelector('.ss-box-code').textContent = c.code;
      d.querySelector('.ss-box-cap h3').textContent = c.title;
      d.querySelector('.ss-box-cap p').textContent = c.text || '';
      d.querySelector('.ss-count').textContent = `${state.i + 1} / ${cards.length}`;
      const dl = d.querySelector('.ss-box-dl'); dl.href = c.dl || c.full; dl.setAttribute('download', c.file || '');
      d.querySelector('.ss-box-open').href = c.dl || c.full;
      const solo = cards.length < 2;
      d.querySelectorAll('.ss-prev,.ss-next,.ss-count').forEach(x => (x.hidden = solo));
      // preload the neighbours
      [1, -1].forEach(k => { const nb = cards[(state.i + k + cards.length) % cards.length]; if (nb) new Image().src = nb.dataset.full; });
    };
    d.querySelector('.ss-x').addEventListener('click', () => d.close());
    d.querySelector('.ss-prev').addEventListener('click', () => show(state.i - 1));
    d.querySelector('.ss-next').addEventListener('click', () => show(state.i + 1));
    d.addEventListener('click', e => { if (e.target === d) d.close(); });       // click outside the sheet closes it
    d.addEventListener('keydown', e => { if (e.key === 'ArrowRight') show(state.i + 1); if (e.key === 'ArrowLeft') show(state.i - 1); });
    let x0 = null;
    d.addEventListener('touchstart', e => (x0 = e.touches[0].clientX), { passive: true });
    d.addEventListener('touchend', e => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(state.i + (dx < 0 ? 1 : -1)); x0 = null;
    });
    d.addEventListener('close', () => { document.documentElement.classList.remove('ss-lock'); if (state.opener) state.opener.focus(); });
    box = { d, open: (cards, n, opener) => { state.cards = cards; state.opener = opener; show(n); document.documentElement.classList.add('ss-lock'); d.showModal(); } };
    return box;
  }
  function shelf(el) {
    const cards = [...el.querySelectorAll('.ss-card')], row = el.querySelector('.ss-row');
    cards.forEach((c, k) => c.addEventListener('click', () => viewer().open(cards, k, c)));
    const prev = el.querySelector('.ss-scroll-prev'), next = el.querySelector('.ss-scroll-next');
    if (!prev || !next) return;
    const step = () => (cards[0] ? cards[0].closest('.ss-item').getBoundingClientRect().width + 12 : 200);
    prev.addEventListener('click', () => row.scrollBy({ left: -step() * 2, behavior: 'smooth' }));
    next.addEventListener('click', () => row.scrollBy({ left: step() * 2, behavior: 'smooth' }));
    const upd = () => {
      const over = row.scrollWidth > row.clientWidth + 4;
      prev.hidden = next.hidden = !over;
      prev.disabled = row.scrollLeft < 4; next.disabled = row.scrollLeft + row.clientWidth > row.scrollWidth - 4;
    };
    row.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd); upd();
  }

  document.querySelectorAll('.story-map').forEach(storyMap);
  document.querySelectorAll('[data-zoom-image]').forEach(zoomImage);
  document.querySelectorAll('[data-sheet-shelf]').forEach(shelf);
})();
