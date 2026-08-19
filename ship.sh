#!/usr/bin/env bash
# ship.sh — build, check, commit, push.
#
#   ./ship.sh "what changed"      commit with that message
#   ./ship.sh                     prompts for a message
#   ./ship.sh -n "msg"            dry run: build + checks, no commit/push
#
set -uo pipefail
cd "$(dirname "$0")"

BOLD=$'\e[1m'; RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; DIM=$'\e[2m'; OFF=$'\e[0m'
step() { printf '\n%s==>%s %s\n' "$BOLD" "$OFF" "$1"; }
ok()   { printf '    %s✓%s %s\n' "$GRN" "$OFF" "$1"; }
warn() { printf '    %s!%s %s\n' "$YLW" "$OFF" "$1"; }
die()  { printf '\n%sABORT:%s %s\n\n' "$RED" "$OFF" "$1"; exit 1; }

DRY=0
if [ "${1:-}" = "-n" ]; then DRY=1; shift; fi
MSG="${1:-}"

# ── 0. stale git locks ───────────────────────────────────────────────
# Git leaves these behind when a process dies, and every later command
# then fails with "Another git process seems to be running". Safe to
# clear when no git is actually running.
step "Clearing stale git locks"
if pgrep -x git >/dev/null 2>&1; then
  warn "a git process IS running — not touching locks"
else
  n=$(find .git -name '*.lock' 2>/dev/null | wc -l)
  find .git -name '*.lock' -delete 2>/dev/null
  [ "$n" -gt 0 ] && ok "removed $n" || ok "none"
fi

# ── 1. build ─────────────────────────────────────────────────────────
step "Building"
node build.js >/tmp/ship-build.log 2>&1 || { cat /tmp/ship-build.log; die "build failed"; }
[ -f _site/index.html ] || die "_site/index.html missing after build"
ok "$(find _site -name '*.html' | wc -l | tr -d ' ') pages"

# ── 2. secrets ───────────────────────────────────────────────────────
# GitHub push protection rejects the push if it finds a credential, and
# note the shapes differ: OpenAI is sk-, Stripe is sk_test_ / sk_live_.
step "Scanning for credentials"
HITS=$(grep -rnoE \
  --exclude-dir=.git --exclude-dir=_site --exclude-dir=node_modules \
  --exclude-dir=crafting --exclude-dir=_to_delete \
  -e '(sk|pk|rk)_(test|live)_[A-Za-z0-9]{16,}' \
  -e 'sk-[A-Za-z0-9]{20,}' \
  -e 'gh[pousr]_[A-Za-z0-9]{36}' \
  -e 'xox[baprs]-[A-Za-z0-9-]{10,}' \
  -e 'AIza[0-9A-Za-z_-]{35}' \
  -e 'BEGIN [A-Z ]*PRIVATE KEY' \
  . 2>/dev/null | grep -v 'SYNTHETIC\|EXAMPLE\|xxxxxxxx' || true)
# Documented exemptions (see .ship-allow for why each one is there).
if [ -s .ship-allow ] && [ -n "$HITS" ]; then
  HITS=$(printf '%s\n' "$HITS" | grep -vEf <(grep -vE '^\s*(#|$)' .ship-allow) || true)
fi
if [ -n "$HITS" ]; then
  printf '%s\n' "$HITS"
  die "possible credential above. Fix it — do NOT use the unblock link."
fi
ok "clean"

# ── 3. dead links ────────────────────────────────────────────────────
step "Checking internal links"
python3 - <<'PY' || die "dead links above"
import os, re, io, sys
bad, total = [], 0
for dp, _, fs in os.walk('_site'):
    if '_to_delete' in dp: continue
    for fn in (f for f in fs if f.endswith('.html')):
        fp = os.path.join(dp, fn)
        s = io.open(fp, encoding='utf-8', errors='ignore').read()
        for m in re.findall(r'(?:href|src)="([^"#?][^"]*)"', s):
            if m.startswith(('http','mailto:','data:','//','javascript:')) or '${' in m or "' +" in m:
                continue
            total += 1
            t = os.path.normpath(os.path.join(dp, m.split('#')[0].split('?')[0]))
            if not os.path.exists(t):
                bad.append((fp.replace('_site/', ''), m))
for f, l in sorted(set(bad)):
    print(f"    DEAD {f} -> {l}")
print(f"    {total} links checked")
sys.exit(1 if bad else 0)
PY
ok "all resolve"

# ── 4. search index ──────────────────────────────────────────────────
# Hand-maintained in js/global.js; it drifts every time a page moves.
step "Checking the search index"
MISSING=0
while read -r u; do
  [ -z "$u" ] && continue
  [ -f "_site/$u" ] || { warn "search index points at a missing page: $u"; MISSING=1; }
done < <(grep -oE 'url: "[^"]+"' js/global.js | sed 's/url: "//;s/"//')
[ "$MISSING" -eq 0 ] && ok "all entries resolve"

# ── 5. what changed ──────────────────────────────────────────────────
step "Changes"
if [ -z "$(git status --porcelain)" ] && [ -z "$(git log --oneline @{u}..HEAD 2>/dev/null)" ]; then
  printf '\n%sNothing to ship.%s\n\n' "$DIM" "$OFF"; exit 0
fi
git status --short | sed 's/^/    /'
UNPUSHED=$(git log --oneline @{u}..HEAD 2>/dev/null | wc -l | tr -d ' ')
[ "$UNPUSHED" -gt 0 ] && warn "$UNPUSHED commit(s) already committed but not pushed"

if [ "$DRY" -eq 1 ]; then
  printf '\n%sDry run — nothing committed.%s\n\n' "$DIM" "$OFF"; exit 0
fi

# ── 6. commit + push ─────────────────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$MSG" ]; then
    printf '\n%sCommit message:%s ' "$BOLD" "$OFF"
    read -r MSG
    [ -z "$MSG" ] && die "no message"
  fi
  step "Committing"
  git add -A
  git commit -q -m "$MSG" || die "commit failed"
  ok "$(git log --oneline -1)"
fi

step "Pushing"
git push || die "push failed — if it says 'fetch first', run: git pull --rebase origin main"
ok "pushed"

printf '\n%sDeploy running.%s\n' "$BOLD" "$OFF"
printf '  actions  https://github.com/r3sup3r/r3sup3r.github.io/actions\n'
printf '  live     https://r3sup3r.github.io/\n\n'
