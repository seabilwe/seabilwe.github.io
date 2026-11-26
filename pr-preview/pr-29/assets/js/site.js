/* Shared behaviour for every page: current-page nav, footer year,
   photo carousel and the Formspree contact form. */
(function () {
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach(function (a) {
    if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* Carousel: native scroll-snap (swipe on phones), buttons and arrow keys */
  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-carousel]").forEach(function (c) {
    var track = c.querySelector(".carousel-track"), slides = [].slice.call(track.children),
        cap = c.querySelector(".carousel-cap"), count = c.querySelector(".carousel-count"), i = 0, raf;
    function show() {
      i = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      cap.textContent = slides[i].getAttribute("data-cap");
      count.textContent = (i + 1) + " / " + slides.length;
      slides.forEach(function (s, k) { s.setAttribute("aria-hidden", k === i ? "false" : "true"); });
    }
    function go(k) {
      k = (k + slides.length) % slides.length;
      track.scrollTo({ left: k * track.clientWidth, behavior: still ? "auto" : "smooth" });
    }
    c.querySelector("[data-prev]").addEventListener("click", function () { go(i - 1); });
    c.querySelector("[data-next]").addEventListener("click", function () { go(i + 1); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
    });
    track.addEventListener("scroll", function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(show); });
    window.addEventListener("resize", function () { track.scrollLeft = i * track.clientWidth; });
    show();
  });

  /* Flowing contour field behind the hero and every page header.
     Drawn from script so the markup stays clean; purely decorative. */
  (function () {
    var hosts = document.querySelectorAll(".hero,.page-head");
    if (!hosts.length) return;
    var W = 1200, H = 620, d, x, y, i, paths = [];
    for (i = 0; i < 13; i++) {
      var base = -30 + i * 56, amp = 15 + 10 * Math.sin(i * 0.8) + (i % 3) * 5,
          per = 320 + (i % 4) * 90, ph = i * 0.62;
      d = "";
      for (x = -80; x <= W + 80; x += 20) {
        y = base + amp * Math.sin(x / per * Math.PI * 2 + ph) + 9 * Math.sin(x / (per * 2.4) + ph * 1.7);
        d += (d ? "L" : "M") + x + " " + y.toFixed(1);
      }
      paths.push('<path d="' + d + '" style="animation-delay:-' + (i * 1.6).toFixed(1) +
        's;animation-duration:' + (26 + (i % 5) * 4) + 's"/>');
    }
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid slice">' + paths.join("") + "</svg>";
    hosts.forEach(function (h) {
      var box = document.createElement("div");
      box.className = "flow";
      box.setAttribute("aria-hidden", "true");
      box.innerHTML = svg;
      h.insertBefore(box, h.firstChild);
    });
  })();

  /* Gentle reveal as blocks come into view. Added from script, so without
     JavaScript nothing is ever hidden. */
  if (!still) {
    var marked = [].slice.call(document.querySelectorAll(
      ".skill,.talk,.project,.case,.slogan,.plain li,.timeline li,.post"));
    marked.forEach(function (el, i) {
      el.classList.add("reveal");
      el.style.transitionDelay = (Math.min(i % 6, 5) * 55) + "ms";
    });
    var ticking = false;
    function sweep() {
      ticking = false;
      for (var i = marked.length - 1; i >= 0; i--) {
        var r = marked[i].getBoundingClientRect();
        if (r.top < window.innerHeight - 40 && r.bottom > 0) {
          marked[i].classList.add("in");
          marked.splice(i, 1);
        }
      }
    }
    function queue() { if (!ticking) { ticking = true; requestAnimationFrame(sweep); } }
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue);
    addEventListener("load", queue);
    queue();
  }

  /* Contact form: sends to Formspree without leaving the page.
     Without JavaScript the form still posts normally. */
  var form = document.querySelector("form[data-formspree]");
  if (form && window.fetch) {
    var status = form.querySelector(".form-status"), btn = form.querySelector("[type=submit]");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) {
          if (!r.ok) throw 0;
          form.reset();
          status.className = "form-status";
          status.textContent = "Thanks, your message is on its way. I’ll reply within a few days.";
        })
        .catch(function () {
          status.className = "form-status is-error";
          status.innerHTML = 'Something went wrong. Please try again, or email <a href="mailto:seabilwetilodi@gmail.com">seabilwetilodi@gmail.com</a>.';
        })
        .finally(function () { status.hidden = false; btn.disabled = false; btn.textContent = "Send message"; status.focus(); });
    });
  }
})();
