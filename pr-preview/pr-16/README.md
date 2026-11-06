# Seabilwe P.L. Tilodi, Portfolio

GIS and Earth Observation · Capacity building · Geospatial data governance · Open source

Live site: [seabilwe.github.io](https://seabilwe.github.io)

## Structure

```
index.html            Home: hero, globe, skills overview, selected work
about.html            Bio, photo carousel, experience and education timeline
work.html             Projects, talks and a map of where the work has been
skills.html           Skill groups and the projects behind them
blogs.html            Writing, talks and the maps gallery
map-population.html   Interactive "Where the World Lives, 2025" map
maps.html             Redirects to the maps gallery on blogs.html
contact.html          Formspree contact form (ID: mzdwyebz)
license.html          Usage terms and citation guide
assets/css/site.css   One stylesheet for every page ("Survey Sheet" brand)
assets/js/            Shared behaviour, globe and project map
assets/img/           Logo mark, favicon, contour band, photos and thumbnails
assets/images/        Portrait and full-size map images
population-map.*      Leaflet code for the population map
tiles/, data/         Tiles and cities for the population map
```

## Deploy

Pushing to `main` runs the production workflow in `.github/workflows/`.

## Local preview

```bash
python -m http.server 4000
```

## Adding a page

Copy an existing page, rename it, change the title, h1 and intro, and add it to the nav block on every page.
