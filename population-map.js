/*
 * "Where the World Lives, 2025" — Leaflet map for seabilwe.github.io
 *
 * Folder layout this script expects (relative to the page that loads it):
 *   tiles/pop2025/{z}/{x}/{y}.jpg   <- from QGIS "Generate XYZ tiles (Directory)"
 *   data/megacities.geojson         <- exported cities layer (NAME, ADM0NAME, POP_MAX), EPSG:4326
 *                                      filter: "POP_MAX" >= 5000000 OR "NAME" = 'Johannesburg'
 *
 * In the page:
 *   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
 *   <link rel="stylesheet" href="population-map.css">
 *   <div id="population-map"></div>
 *   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
 *   <script src="population-map.js"></script>
 */

(function () {
  const el = document.getElementById('population-map');
  if (!el) return;

  // Where the tiles and GeoJSON live. Empty = next to this page (normal use on the site).
  // For previews elsewhere, e.g. in Claude Design:
  //   <div id="population-map" data-base="https://seabilwe.github.io/"></div>
  const base = el.dataset.base || '';

  const map = L.map(el, {
    center: [15, 20],
    zoom: 2,
    minZoom: 1,
    maxZoom: 8,
    maxBounds: [[-75, -200], [85, 200]],
    maxBoundsViscosity: 1.0,
    zoomSnap: 0.5
  });

  // Paper-style tiles rendered in QGIS (land, graticule, population).
  L.tileLayer(base + 'tiles/pop2025/{z}/{x}/{y}.jpg', {
    minZoom: 1,
    maxNativeZoom: 6,   // tiles were made to zoom 6; Leaflet enlarges them beyond that
    maxZoom: 8,
    noWrap: true,
    attribution:
      'Population: <a href="https://human-settlement.emergency.copernicus.eu/">GHS-POP R2023A</a>, EC JRC' +
      ' · Base: <a href="https://www.naturalearthdata.com/">Natural Earth</a>' +
      ' · Map: Seabilwe Tilodi'
  }).addTo(map);

  // Megacities as interactive points, sized by population.
  const fmt = new Intl.NumberFormat('en-ZA');
  fetch(base + 'data/megacities.geojson')
    .then(r => r.json())
    .then(geojson => {
      const cities = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {
            radius: Math.max(3, Math.sqrt(feature.properties.POP_MAX) / 900),
            color: '#F4EFE3',
            weight: 1,
            fillColor: '#2B1B17',
            fillOpacity: 0.85
          }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          // Permanent labels; overlaps are removed by declutter() below.
          layer.bindTooltip(p.NAME, {
            permanent: true,
            direction: 'right',
            offset: [4, 0],
            className: 'pop-label'
          });
          layer.bindPopup(
            '<strong>' + p.NAME + '</strong><br>' +
            (p.ADM0NAME || '') + '<br>' +
            fmt.format(p.POP_MAX) + ' people (urban area)'
          );
        }
      }).addTo(map);
      L.control.layers(null, { 'Major cities (5 M+)': cities }, { collapsed: true }).addTo(map);

      // Label collision handling: biggest cities are placed first,
      // any label overlapping one already placed is hidden. Re-runs on every zoom/pan.
      const byPopulation = cities.getLayers()
        .sort((a, b) => b.feature.properties.POP_MAX - a.feature.properties.POP_MAX);
      const overlaps = (a, b, pad) =>
        a.left < b.right + pad && a.right + pad > b.left &&
        a.top < b.bottom + pad && a.bottom + pad > b.top;
      const declutter = () => requestAnimationFrame(() => {
        const placed = [];
        byPopulation.forEach(layer => {
          const tip = layer.getTooltip() && layer.getTooltip().getElement();
          if (!tip) return;
          tip.style.visibility = 'visible';
          const box = tip.getBoundingClientRect();
          if (placed.some(p => overlaps(p, box, 3))) {
            tip.style.visibility = 'hidden';
          } else {
            placed.push(box);
          }
        });
      });
      map.on('zoomend moveend overlayadd', declutter);
      declutter();
    })
    .catch(err => console.warn('Megacities layer not loaded:', err));

  // Legend matching the QGIS ramp.
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'pop-legend');
    // Legend colours = the QGIS ramp as it appears multiplied onto the paper colour.
    const classes = [
      ['#F0E6D0', '1'],
      ['#E7D1A5', '10'],
      ['#D4A365', '100'],
      ['#BE7037', '1,000'],
      ['#882C1E', '5,000'],
      ['#291914', '20,000+']
    ];
    div.innerHTML =
      '<div class="pop-legend__title">People per km², 2025</div>' +
      classes.map(([c, label]) =>
        '<div class="pop-legend__row"><span style="background:' + c + '"></span>' + label + '</div>'
      ).join('');
    return div;
  };
  legend.addTo(map);
})();
