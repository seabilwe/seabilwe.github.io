/* #30DayMapChallenge folder: tabs, month strip, prev/next and #day-N deep links.
   To add a map: copy one <button class="folder-tab"> and one <article class="sheet">,
   change the day number and content. The month strip and counts update themselves. */
(function () {
  var tabs = [].slice.call(document.querySelectorAll(".folder-tab"));
  if (!tabs.length) return;
  var month = document.querySelector("[data-month]");
  var steps = document.querySelectorAll("[data-step]");
  var current = 0;
  var THEMES = ["Points", "Lines", "Polygons", "Clusters", "Senses: Sight", "Vintage", "10 minute map", "Utopia", "Urban-rural",
    "Prompting only", "Senses: Sound", "Power", "Interactions", "Borgesian map", "Inside out", "Collaborative map", "Light & dark",
    "NULL", "Senses: Smell", "Hexagons", "OpenStreetMap", "Projections", "Senses: Taste", "Network", "Is this a map?", "Water",
    "New tool", "Senses: Feeling", "Raster", "Pen & paper"];  /* official 2026 themes, github.com/tjukanovt/30DayMapChallenge */

  function select(i, opts) {
    opts = opts || {};
    current = Math.max(0, Math.min(tabs.length - 1, i));
    tabs.forEach(function (t, k) {
      var on = k === current, panel = document.getElementById(t.getAttribute("aria-controls"));
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (panel) panel.hidden = !on;
    });
    if (opts.focus) tabs[current].focus();
    var strip = tabs[current].parentNode, tb = tabs[current];
    if (tb.offsetLeft < strip.scrollLeft || tb.offsetLeft + tb.offsetWidth > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = tb.offsetLeft - 16;
    steps.forEach(function (b) {
      var n = current + Number(b.getAttribute("data-step"));
      b.disabled = n < 0 || n >= tabs.length;
    });
    if (month) month.querySelectorAll(".day-done").forEach(function (d) {
      d.setAttribute("aria-current", d.getAttribute("data-day") === tabs[current].getAttribute("data-day") ? "true" : "false");
    });
    if (opts.hash !== false && history.replaceState) history.replaceState(null, "", "#day-" + tabs[current].getAttribute("data-day"));
  }

  tabs.forEach(function (t, k) {
    t.addEventListener("click", function () { select(k); });
    t.addEventListener("keydown", function (e) {
      var to = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select((to + tabs.length) % tabs.length, { focus: true });
    });
  });
  steps.forEach(function (b) {
    b.addEventListener("click", function () { select(current + Number(b.getAttribute("data-step"))); });
  });

  /* Month strip: 30 squares, the mapped days become buttons with the map as background */
  if (month) {
    var byDay = {};
    tabs.forEach(function (t, k) { byDay[t.getAttribute("data-day")] = k; });
    for (var d = 1; d <= 30; d++) {
      var li = document.createElement("li"), k = byDay[String(d)];
      if (k !== undefined) {
        var t = tabs[k], b = document.createElement("button");
        b.type = "button"; b.className = "day day-done"; b.setAttribute("data-day", d);
        b.style.backgroundImage = "url('" + t.getAttribute("data-thumb") + "')";
        b.setAttribute("aria-label", "Day " + d + ": " + THEMES[d - 1]);
        b.title = "Day " + d + ": " + THEMES[d - 1];
        b.innerHTML = "<span>" + d + "<em>" + THEMES[d - 1].replace(/&/g, "&amp;") + "</em></span>";
        (function (k) {
          b.addEventListener("click", function () {
            select(k);
            document.querySelector(".folder").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          });
        })(k);
        li.appendChild(b);
      } else {
        li.innerHTML = '<span class="day" title="Day ' + d + ': ' + THEMES[d - 1].replace(/&/g, "&amp;") + ', not mapped yet"><span>' + d + "<em>" + THEMES[d - 1].replace(/&/g, "&amp;") + "</em></span></span>";
      }
      month.appendChild(li);
    }
  }
  document.querySelectorAll("[data-count]").forEach(function (el) { el.textContent = tabs.length; });

  var m = /^#day-(\d+)$/.exec(location.hash), start = 0;
  if (m) tabs.forEach(function (t, k) { if (t.getAttribute("data-day") === m[1]) start = k; });
  select(start, { hash: !!m });
})();
