# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

YANGA — a personal offensive-security blog (pentesting, AI red teaming, CTF), deployed to GitHub Pages at https://r3sup3r.github.io. It is a hand-rolled, zero-dependency static site generator: `build.js` uses only Node's `fs`/`path` (plus the vendored `vendor/marked.min.js` for Markdown). There is no npm install, no linter, and no test suite.

## Commands

```bash
node build.js          # src/ -> _site/ (wipes _site first)
node serve.js          # serve _site/ on :8080 with the custom 404
node dev-server.js     # local authoring mode on http://127.0.0.1:4321 (see DEV-MODE.md)
./ship.sh -n           # dry run: build + all pre-publish checks, no commit/push
./ship.sh "message"    # build, check, git add -A, commit, push (deploys)
```

`ship.sh` is the de facto test suite. Its checks: build succeeds, credential regex scan (exemptions in `.ship-allow`, each must be justified), dead internal `href`/`src` links in `_site/` (needs `python3`), and every `url:` in the search index in `js/global.js` resolves. Note `ship.sh` runs `git add -A` — it commits everything in the working tree. Pushing to `main` triggers `.github/workflows/deploy.yml`, which just runs `node build.js` and publishes `_site/`.

## Build architecture (build.js)

- **Front matter** is a JSON object inside an HTML comment at the very top of each file: `<!-- { "title": ..., "layout": "base", "activeNav": ..., ... } -->`. This applies to `.html` and `.md` files alike. Invalid JSON silently yields empty data.
- **Pages**: everything under `src/` is built except paths starting with `_` (`_layouts`, `_partials`, `_drafts`, `_to_delete`). Output path mirrors the source path; `.md` becomes `.html`.
- **Template engine** (`render`): `{{> partial}}`, `{{#key}}…{{/key}}` (truthy conditional or array loop, `{{.}}` = current item), `{{{raw}}}`, `{{escaped}}`. Page body is rendered first, then injected raw into the layout's `{{{content}}}` — so loops like `{{#posts}}` work inside page bodies.
- **`{{root}}`** is the relative prefix to site root (`../` per depth; `/` for `404.html`). All internal links/assets must use `{{root}}…` or the dead-link check will fail on nested pages.
- **Script markers** in a page body: `<!-- pre-global-scripts -->` and `<!-- scripts -->` split off page-specific scripts that the layout places before/after `js/global.js`.
- **Nav highlighting**: `activeNav` must be one of `home, blog, sections, pentesting, airedteam, ctf, dossier, tools, about` (hard-coded list in `buildPage`).

### Posts are the single source of truth

`src/posts/*.{html,md}` front matter drives the blog timeline, homepage "latest" (top 4), section hubs, RSS, sitemap, JSON-LD, and prev/next nav. A post needs `date` (`YYYY-MM-DD`) to be listed; `"draft": true` excludes it. Other fields used: `title` (trailing ` · YANGA`/` — YANGA` is stripped), `description`, `excerpt`, `category`, `catKey`, `section`, `read`, `icon` (Font Awesome class), `cover`, `series`, `seriesOrder`.

- Section hub pages opt in to their post list with `"postSection": "<key>"`; posts with a matching `section` appear as `{{#sectionPosts}}`.
- **Series**: posts sharing `series` are ordered by `seriesOrder`; prev/next nav follows the series, otherwise chronological. Specific series cards are exposed as template vars by hard-coded name (`SERIES['AD Track']` → `{{{adTrackSeries}}}`, `SERIES['Facing XAMPP']` → `{{{facingXamppSeries}}}`) — adding a new series card for a hub requires editing `build.js`.
- `.md` posts are wrapped by `wrapMarkdownPost` in the same `article-hero` / `article-body` chrome hand-written `.html` posts use. New posts from dev mode are `.md`; older ones are hand-authored `.html`.

### Things that are NOT automatic

- **Search index** is hand-maintained in `js/global.js` (entries like `{ title, section, tagLabel, desc, tags, url }`). Add/rename/remove an entry whenever a page or post moves, or `ship.sh` warns.
- **Static assets**: only `STATIC_DIRS` (`css`, `js`, `images`, `files`, `tools`, `sections/ai/img`, `posts/img`) and `favicon.svg` are copied to `_site/`. Anything else (e.g. `vendor/`, `dev/`, `content/`, `bot/`) is never published.
- Cache-busting `?v=N` query strings on CSS/JS in `src/_layouts/base.html` are bumped by hand.

## Other parts of the repo

- `dev-server.js` + `dev/` — localhost-only in-browser editor that writes posts (Markdown) and section "topic-cards" back into `src/` and rebuilds. Must never be deployed.
- `js/tachikoma.js` — the site's chat widget ("ghost"); its backend is the Cloudflare Worker in `bot/` (`wrangler deploy`, key as a Wrangler secret — see `bot/README.md`).
- `content/` — long-form study notes / source material for posts (not built). `content/studies/README.md` describes the study → post workflow for the AI-agent-security series.
- `src/_drafts/` — parked pages and drafts (gitignored, not built). Move into `src/posts/` or `src/sections/` to publish.
- `crafting/`, `.backup-*`, `ui-backup/`, `*.bak`, `_to_delete/` — design scratch and backups; ignore unless asked.
- `.claude/skills/yanga-visualizer` — project skill for integrating standalone HTML visualizations into section pages.

## Conventions

- Section/folder pages use the `project-hero` + `breadcrumb-path` + `topic-grid` of `topic-card` markup; posts use `article-hero` + `article-body`. Copy an existing page when adding one.
- Author/site constants (`SITE_URL`, `AUTHOR`, etc.) live at the top of `build.js`.
