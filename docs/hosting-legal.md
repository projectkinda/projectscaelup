# Hosting the legal pages (GitHub Pages)

Source folder: `docs/store/site/` (`index.html`, `terms.html`, `privacy.html`, `support.html`). Plain HTML, relative links, no external assets, scripts or trackers. Nothing here is published until you do these steps.

## Before publishing

1. Replace every `⚠ [...]` placeholder (entity, support email, governing law, effective date, liability cap) in the four pages. `RELEASE=1 npx tsx scripts/paywall-check.ts` fails while any remain.
2. Have a lawyer review `terms.html` and `privacy.html`.
3. Decide the host. GitHub Pages on a **public** repo is free; a private repo needs a paid plan.

## Publish

GitHub Pages can serve only the repo root or `/docs`, not `/docs/store/site`. Pick one:

**A. Separate repo (recommended, keeps the app repo private):**

1. Create a new public repo, e.g. `projectscaleup-legal`.
2. Copy the four files from `docs/store/site/` to its root (include an empty `.nojekyll`).
3. Repo > Settings > Pages > Source: *Deploy from a branch* > `main` / `/ (root)` > Save.

**B. Same repo:** copy the four files into `docs/` (they would sit beside the other docs) and set Pages to `main` / `/docs`.

Or use a GitHub Actions Pages workflow that uploads `docs/store/site` as the artifact (Settings > Pages > Source: GitHub Actions).

## URLs

`https://<user-or-org>.github.io/<repo>/` (index), then `terms.html`, `privacy.html`, `support.html`. For a user site repo named `<user>.github.io` the base is `https://<user>.github.io/`. A custom domain works through Pages settings plus a `CNAME`.

Example: `https://acme.github.io/projectscaleup-legal/privacy.html`.

## After it is live

1. Put the three URLs into `LEGAL_PAGES` in `src/config/legal.ts`. Settings > About, the paywall footer and the permission disclosure then show their links.
2. Check: `RELEASE=1 npx tsx scripts/paywall-check.ts` must pass.
3. Enter the URLs in Play Console, App Store Connect (see `store/submission-checklist.md`). Keep the policy URL stable.
