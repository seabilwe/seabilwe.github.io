# README 1 — Deploy & Repo Handbook (`README.md`)


# seabilwe.github.io — Deploy & Repo Handbook

This repo powers my personal site with a **three-environment flow**:

- **Production** (`main`) → https://seabilwe.github.io/
- **Staging** (`staging`) → https://seabilwe.github.io/staging/
- **PR Previews** (each Pull Request) → https://seabilwe.github.io/pr-preview/pr-<number>/

Staging and previews live in subfolders of the `gh-pages` publishing branch.

---

## 🧭 Branch Strategy

```

feature/\*  →  develop  →  staging  →  main
\|          |          |
\|          |          └─ deploys to /
\|          └─ deploys to /staging/
└─ open PRs (auto preview under /pr-preview/pr-<num>/)

````

- Work on short-lived **feature/** branches.
- Open PRs into **`develop`** (or `staging` if you prefer). Each PR gets its own live preview.
- Merge **`develop` → `staging`** to update the staging site.
- Merge **`staging` → `main`** to publish to production.

---

## 🔧 One-Time Setup

1. **GitHub Pages source**
   - *Settings ▸ Pages ▸ Build and deployment ▸* **Source: _Deploy from a branch_**
   - **Branch:** `gh-pages` • **Folder:** `/(root)`

2. **Workflow token permissions**
   - *Settings ▸ Actions ▸ General ▸ Workflow permissions* → **Read and write permissions**
   - (Optional) Allow Actions to create/approve PRs

These let workflows push to `gh-pages` and post preview links on PRs.

---

## 🤖 Workflows (CI/CD)

All workflows live in `.github/workflows/`.

### Production deploy (on `main`) — `deploy-prod.yml`

```yaml
name: Deploy – Production
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # If you add a build step later (e.g., npm run build), put it here
      - name: Deploy to gh-pages (root)
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          branch: gh-pages
          folder: .
          force: false
          clean: true
          clean-exclude: |
            pr-preview/
            staging/
````

### Staging deploy (on `staging`) — `deploy-staging.yml`

```yaml
name: Deploy – Staging
on:
  push:
    branches: [staging]
permissions:
  contents: write
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Add a build step here later if you have one
      - name: Deploy to /staging
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          branch: gh-pages
          folder: .
          target-folder: staging
          force: false
          clean: true
          clean-exclude: |
            pr-preview/
            staging/
```

### PR previews (on PR open/update/close) — `pr-preview.yml`

```yaml
name: PR Preview
on:
  pull_request:
    types: [opened, reopened, synchronize, closed]
permissions:
  contents: write
  pull-requests: write
  issues: write
concurrency: preview-${{ github.event.pull_request.number }}
jobs:
  preview:
    runs-on: ubuntu-latest
    # Only run for PRs from this repo (skip forks for safety)
    if: ${{ github.event.pull_request.head.repo.full_name == github.repository }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      # If you add a build later, run it above and set source-dir accordingly
      - name: Deploy PR preview
        uses: rossjrw/pr-preview-action@v1
        with:
          source-dir: .
          preview-branch: gh-pages
          umbrella-dir: pr-preview
          action: auto
```

---

## 🗂️ Repo Structure

```
assets/           # css, js, images (use relative paths)
pages/            # optional subpages
index.html        # homepage
.github/workflows # CI/CD (prod, staging, previews)
```

> **Important:** Because staging and previews live under subpaths, use **relative URLs** for assets:
>
> * ✅ `assets/css/style.css`
> * ❌ `/assets/css/style.css` (breaks under /staging/ and /pr-preview/)

---

## 🧪 How to Test

1. **Staging:** push to `staging` → visit `https://seabilwe.github.io/staging/`
2. **PR Preview:** open a PR → click the comment link (or go to `/pr-preview/pr-<num>/`)
3. **Production:** merge `staging` → `main` → visit `https://seabilwe.github.io/`

---

## 💻 Local Dev

Open `index.html` directly, or run a static server:

```bash
python -m http.server 5500
```

---

## 🛠 Troubleshooting

* **Preview link comment failed:** Ensure “Workflow permissions → Read and write” is enabled.
* **Styles missing on staging/preview:** Switch absolute paths to **relative**.
* **No deploy:** Confirm workflows are in `.github/workflows/` and branch triggers match.
* **Pages shows old content:** Check latest files are in `gh-pages` (root, `staging/`, or `pr-preview/`).
