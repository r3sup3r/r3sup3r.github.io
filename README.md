# YANGA

Security research notes — penetration testing and AI red teaming.

Live at **https://r3sup3r.github.io**

## Writing

- [Why AI Red Teaming Is Different](https://r3sup3r.github.io/posts/why-ai-red-teaming-is-different.html) — three incidents, one root cause: instructions and data share a single channel in every LLM application.

## Running it locally

No dependencies. `build.js` uses only Node's `fs` and `path`.

```bash
node build.js          # src/ -> _site/
node serve.js          # dev server on :8080, with the custom 404
```

## How it works

A small static site generator. `build.js` walks `src/`, reads a JSON front-matter
block from the HTML comment at the top of each page, and renders it through a
hand-rolled Mustache-ish template engine supporting `{{> partial}}`,
`{{#key}}…{{/key}}`, `{{{raw}}}` and `{{escaped}}`.

```
src/_layouts/     page shells
src/_partials/    nav, footer, search
src/posts/        articles
src/sections/     topic hubs
css/  js/         copied to _site/ as-is
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## License

Content © Laury Guebela. Code is MIT.
