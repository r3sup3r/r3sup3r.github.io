# Dev mode — author posts & cards from the browser

A local-only authoring tool. It never touches the deployed site: the editor is
injected only by `dev-server.js` when you run it on your machine, and the build
(`build.js`, what `ship.sh` deploys) contains none of it.

## Run it

```bash
node dev-server.js        # then open http://127.0.0.1:4321
```

You'll see a **DEV MODE** button (bottom-left). It opens a panel with two tabs.

### Posts
- **＋ New post** or **Edit** an existing one.
- Fill the fields (title, date, category, series, read, excerpt, draft) and write
  the body in **Markdown** — fenced code, tables, lists, links all render.
- The **live preview** shows the real article styling as you type.
- **Save & build** writes `src/posts/<slug>.md` and rebuilds. The post then flows
  into the blog timeline, homepage, RSS and any series automatically.

### Cards
- Pick a section/folder page. Its topic-cards load as editable fields
  (kind, tag, icon, title, intro, CTA, link).
- Add / edit / reorder / delete cards; **Save & build** writes the page back.
- Untouched cards are preserved byte-for-byte; `{{root}}` links and the site's
  entity conventions are kept.

## Publish

Dev mode only writes to `src/` and rebuilds locally. When you're happy, ship as
usual:

```bash
./ship.sh
```

## Notes
- Binds to `127.0.0.1` only. Do **not** expose or deploy `dev-server.js`.
- Markdown support and the editor share one renderer (`vendor/marked.min.js`),
  so the live preview matches the built output. `vendor/`, `dev/` and
  `dev-server.js` are never copied into `_site/`.
- Existing hand-written `.html` posts still work; new posts are `.md`.
