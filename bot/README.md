# ghost — AI backend (Phase 1)

A tiny Cloudflare Worker that gives the YANGA chat widget a real brain while
keeping the API key off the static site. Claude-first; the provider is isolated
behind one clearly marked **SWAP POINT** in `worker.js`.

```
browser (js/tachikoma.js)  ->  this Worker  ->  Anthropic Claude API
    r3sup3r.github.io           (holds key,       (streams the answer)
                                 CORS, limits)
```

## One-time setup

1. Install the CLI and log in:
   ```
   npm i -g wrangler
   wrangler login
   ```

2. From this `bot/` folder, add your Anthropic key as a secret (never commit it):
   ```
   wrangler secret put ANTHROPIC_API_KEY
   ```
   Get a key at https://console.anthropic.com/ . Set a **monthly spend limit**
   there too — that is your hard cost cap.

3. (Recommended) turn on the per-IP daily rate limit:
   ```
   wrangler kv namespace create RL
   ```
   Paste the printed id into `wrangler.toml` and uncomment the `[[kv_namespaces]]`
   block. Without this, requests are not rate-limited.

4. Deploy:
   ```
   wrangler deploy
   ```
   Wrangler prints a URL like `https://ghost-bot.<your-subdomain>.workers.dev`.

## Wire it to the site

Open `js/tachikoma.js`, find `var GHOST_API = ...` near the top, and paste the
Worker URL:
```js
var GHOST_API = 'https://ghost-bot.<your-subdomain>.workers.dev';
```
Rebuild (`node build.js`) and ship. Leaving it empty keeps the offline canned
replies, so the site never breaks if the Worker is down.

## Test without the site
```
curl -N -X POST https://ghost-bot.<sub>.workers.dev \
  -H 'content-type: application/json' \
  -H 'Origin: https://r3sup3r.github.io' \
  -d '{"messages":[{"role":"user","content":"what is indirect prompt injection?"}]}'
```
You should see the answer stream back as plain text.

## Tuning (top of `worker.js`)
- `SYSTEM_PROMPT` — ghost's persona, knowledge card, and guardrails.
- `MAX_OUTPUT_TOKENS` — answer length / cost per message.
- `RL_PER_DAY`, `MAX_INPUT_CHARS`, `MAX_TURNS` — abuse + cost controls.
- `ALLOWED_ORIGINS` — who may call the Worker (CORS allow-list).
- `MODEL` (in `wrangler.toml`) — swap models without touching code.

## Swapping providers
Everything Anthropic-specific lives between the `SWAP POINT` and `END SWAP POINT`
comments in `worker.js`: the endpoint URL, headers, request body, and the
`extractDelta()` function that reads the streaming format. Replace that block for
OpenAI / Groq / etc.; the rest is provider-agnostic.

## Not yet wired (Phase 2+)
- Cloudflare **Turnstile** (bot challenge) — add a token check before the model call.
- **RAG** over the blog posts via Cloudflare Vectorize.
- Markdown rendering + per-session memory in the widget.
