# Seabilwe P.L. Tilodi — Portfolio

**GIS & Earth Observation Leader · Capacity Building · Geospatial Data Governance · Open-source**

Live site: [seabilwe.github.io](https://seabilwe.github.io)

---

## Repository Structure

```
seabilwe.github.io/
├── index.html            # Home — hero, skills overview, projects, blog preview
├── about.html            # About — bio, photo, experience and education timeline
├── skills.html           # Skills — domain expertise, proficiency bars, tools
├── maps.html             # Maps — interactive Leaflet map + cartographic portfolio
├── blogs.html            # Blog — articles and reflections on GIS and EO
├── contact.html          # Contact — Formspree-powered contact form
├── license.html          # License — usage terms and attribution guide
├── _config.yml           # GitHub Pages configuration
├── README.md             # This file
└── assets/
    └── images/
        ├── avatar_profile_left.png       # Profile illustration
        ├── Zimbabwe_National_Parks.png   # Featured cartographic work
        └── ...                           # Additional map images
```

---

## Design System

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0d1117` | Page background |
| `--bg-card` | `#161b22` | Card / sidebar background |
| `--accent` | `#1fa876` | Primary green accent |
| `--text` | `#e6edf3` | Body text |
| `--tm` | `#7d8590` | Muted text |
| `--serif` | DM Serif Display | Headings and names |
| `--sans` | Syne | Labels, nav, UI |
| `--body` | DM Sans | Body copy |

---

## Features

- **Fixed sidebar** with spinning avatar ring, typed role animation, social links and section navigation
- **Interactive Leaflet map** on the Maps page showing all project locations (Johannesburg, Abuja, Addis Ababa, Trieste, Waterberg, St. Lucia, Dominica) with dark CartoDB tiles
- **Animated skill bars** — scroll-triggered width animation for both GIS and Coding columns
- **Formspree contact form** — replace `YOUR_FORM_ID` in `contact.html` with your ID from [formspree.io](https://formspree.io/register)
- **Fully self-contained pages** — all CSS inlined, no external dependencies except Google Fonts and Leaflet CDN
- **Mobile-first responsive** — hamburger menu, stacked layouts, touch-friendly sidebar

---

## Deployment

Hosted via **GitHub Pages** from the `main` branch root.

```bash
git add .
git commit -m "Update site"
git push origin main
```

Live within seconds at `seabilwe.github.io`.

---

## Local Preview

```bash
python -m http.server 4000
```

Then visit `http://localhost:4000`.

---

## Setting Up the Contact Form

1. Register at [formspree.io](https://formspree.io/register) (free plan supports 50 submissions/month)
2. Create a new form and copy your Form ID (looks like `xaabbccdd`)
3. In `contact.html`, replace:
   ```
   action="https://formspree.io/f/YOUR_FORM_ID"
   ```
   with your actual ID.

---

*Made with love by Seabilwe · Pretoria, South Africa · seabilwetilodi@gmail.com*
