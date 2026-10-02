# Facing XAMPP — OSCP Lab: Build and Blind Assessment

> A deliberately vulnerable Windows XAMPP box, in two parts. **Part 1** builds every weakness and freezes the box. **Part 2** attacks it blind from `nmap` to SYSTEM, then hardens one door at a time and re-attacks, until nothing reaches SYSTEM. Build → Understand → Break → Defend, run as a ratchet.

> **Status: skeleton.** Headings and cross-links are in place; content is migrated and revised section by section. Source material for each section is noted in italics under its heading. The full previous edition is preserved in `_backups/` (PRE-RESTRUCTURE and PHASE1).

## How to read this guide

- **[host]** on your machine in VMware. **[WIN]** on the victim (Administrator prompt or the GUI). **[WIN-SHELL]** inside the shell you got through the exploit. **[KALI]** on the attacker. **[BROWSER]** in a browser.
- Lines beginning `# →` under a command are the **expected output**.
- **📸** marks proof-capture points. **🟢 SNAPSHOT** marks where to take a VM snapshot.
- Part 1 sections that plant a weakness link to the Part 2 door that exploits it, and back.

## Contents

- [The lab at a glance](#the-lab-at-a-glance)
- [The attack-chain and hardening map](#the-attack-chain-and-hardening-map)
- [Prerequisites and tooling](#prerequisites-and-tooling)
- [PART 1 — Build the Vulnerable Lab](#part-1-build-the-vulnerable-lab)
    - [1.1 Lab topology and ground rules](#11-lab-topology-and-ground-rules)
        - [1.1.1 The network (host-only VMnet10, no DHCP, no gateway)](#111-the-network-host-only-vmnet10-no-dhcp-no-gateway)
        - [1.1.2 The two machines (WIN-XAMPP target, Kali attacker)](#112-the-two-machines-win-xampp-target-kali-attacker)
        - [1.1.3 Snapshot and reset conventions (snapshot-forward)](#113-snapshot-and-reset-conventions-snapshot-forward)
    - [1.2 Build the Windows target](#12-build-the-windows-target)
        - [1.2.1 Create the VM and attach it to VMnet10](#121-create-the-vm-and-attach-it-to-vmnet10)
        - [1.2.2 Local admin, static IP, hostname](#122-local-admin-static-ip-hostname)
        - [1.2.3 Disable Defender for the lab](#123-disable-defender-for-the-lab)
    - [1.3 Install the XAMPP stack (the clean base)](#13-install-the-xampp-stack-the-clean-base)
        - [1.3.1 Get the installer onto the isolated box](#131-get-the-installer-onto-the-isolated-box)
        - [1.3.2 Install XAMPP 8.1.25 and register the services](#132-install-xampp-8125-and-register-the-services)
        - [1.3.3 Deploy the base app, database and users](#133-deploy-the-base-app-database-and-users)
    - [1.4 Plant the recon-layer weaknesses](#14-plant-the-recon-layer-weaknesses)
        - [1.4.1 Information disclosure (display_errors, phpinfo)](#141-information-disclosure-display_errors-phpinfo)
        - [1.4.2 Directory listing (Options +Indexes)](#142-directory-listing-options-indexes)
        - [1.4.3 Source, backup and .git exposure](#143-source-backup-and-git-exposure)
    - [1.5 Plant the foothold weaknesses](#15-plant-the-foothold-weaknesses)
        - [1.5.1 PUT / WebDAV write](#151-put-webdav-write)
        - [1.5.2 LFI include (?page=)](#152-lfi-include-page)
        - [1.5.3 Unrestricted upload](#153-unrestricted-upload)
        - [1.5.4 Command injection (ping tool)](#154-command-injection-ping-tool)
        - [1.5.5 phpMyAdmin (blank root, FILE, empty secure_file_priv)](#155-phpmyadmin-blank-root-file-empty-secure_file_priv)
        - [1.5.B Bonus: hidden dev vhost dev.app.lab (generic Apache, not XAMPP-specific)](#15b-bonus-hidden-dev-vhost-devapplab-generic-apache-not-xampp-specific)
    - [1.6 Plant the credential / lateral weakness](#16-plant-the-credential-lateral-weakness)
        - [1.6.1 Reused password to svc_deploy (Remote Desktop Users)](#161-reused-password-to-svc_deploy-remote-desktop-users)
    - [1.7 Plant the privilege-escalation weaknesses](#17-plant-the-privilege-escalation-weaknesses)
        - [1.7.1 Apache runs as SYSTEM (the default, leave it on)](#171-apache-runs-as-system-the-default-leave-it-on)
        - [1.7.2 SeImpersonatePrivilege on the service account](#172-seimpersonateprivilege-on-the-service-account)
        - [1.7.3 Writable service binary or directory (loose C:\xampp ACLs)](#173-writable-service-binary-or-directory-loose-cxampp-acls)
        - [1.7.4 MySQL as SYSTEM with a writable plugin dir (UDF)](#174-mysql-as-system-with-a-writable-plugin-dir-udf)
    - [1.8 Freeze the fully-vulnerable box](#18-freeze-the-fully-vulnerable-box)
        - [1.8.1 Self-check: confirm every door is live](#181-self-check-confirm-every-door-is-live)
        - [1.8.2 Snapshot blind-box (Part 2 starts here)](#182-snapshot-blind-box-part-2-starts-here)
- [PART 2 — Exploitation & Hardening (the blind engagement)](#part-2-exploitation-hardening-the-blind-engagement)
    - [2.1 The engagement brief](#21-the-engagement-brief)
        - [2.1.1 Objective, scope, rules, time budget](#211-objective-scope-rules-time-budget)
        - [2.1.2 The note-taking worksheet](#212-the-note-taking-worksheet)
        - [2.1.3 The snapshot-forward / harden-and-reattack model](#213-the-snapshot-forward-harden-and-reattack-model)
    - [2.2 Mindset and methodology](#22-mindset-and-methodology)
        - [2.2.1 How to think when you find XAMPP](#221-how-to-think-when-you-find-xampp)
        - [2.2.2 The recon decision tree](#222-the-recon-decision-tree)
        - [2.2.3 The first-pass enumeration checklist](#223-the-first-pass-enumeration-checklist)
    - [2.3 Enumeration (every round, from zero)](#23-enumeration-every-round-from-zero)
        - [2.3.1 Port and service discovery (nmap -p-, -sCV)](#231-port-and-service-discovery-nmap--p---scv)
        - [2.3.2 Web fingerprint, vhosts, content discovery](#232-web-fingerprint-vhosts-content-discovery)
        - [2.3.3 Database exposure (3306 / phpMyAdmin)](#233-database-exposure-3306-phpmyadmin)
    - [2.4 Recon doors (exploit and close)](#24-recon-doors-exploit-and-close)
        - [2.4.1 Information disclosure (display_errors, phpinfo)](#241-information-disclosure-display_errors-phpinfo)
        - [2.4.2 Directory listing (Options +Indexes)](#242-directory-listing-options-indexes)
        - [2.4.3 Source, backup and .git](#243-source-backup-and-git)
    - [2.5 Foothold doors (exploit, harden, verify, detect)](#25-foothold-doors-exploit-harden-verify-detect)
        - [2.5.1 PUT / WebDAV to web shell](#251-put-webdav-to-web-shell)
        - [2.5.2 LFI to source disclosure and log-poison RCE](#252-lfi-to-source-disclosure-and-log-poison-rce)
        - [2.5.3 Unrestricted upload to RCE](#253-unrestricted-upload-to-rce)
        - [2.5.4 Command injection to RCE](#254-command-injection-to-rce)
        - [2.5.5 phpMyAdmin INTO OUTFILE to RCE](#255-phpmyadmin-into-outfile-to-rce)
        - [2.5.B Bonus: dev vhost to a softer foothold (generic Apache)](#25b-bonus-dev-vhost-to-a-softer-foothold-generic-apache)
    - [2.6 Lateral door (exploit and close)](#26-lateral-door-exploit-and-close)
        - [2.6.1 Credential reuse to svc_deploy via RDP/WinRM](#261-credential-reuse-to-svc_deploy-via-rdpwinrm)
    - [2.7 Privilege-escalation doors (exploit, harden, verify, detect)](#27-privilege-escalation-doors-exploit-harden-verify-detect)
        - [2.7.1 A: Apache-as-SYSTEM to instant SYSTEM](#271-a-apache-as-system-to-instant-system)
        - [2.7.2 B: SeImpersonate to PrintSpoofer/Potato to SYSTEM](#272-b-seimpersonate-to-printspooferpotato-to-system)
        - [2.7.3 C: writable service to replace to SYSTEM](#273-c-writable-service-to-replace-to-system)
        - [2.7.4 D: MySQL UDF sys_exec to SYSTEM](#274-d-mysql-udf-sys_exec-to-system)
    - [2.8 Running the ratchet](#28-running-the-ratchet)
        - [2.8.1 Round-by-round play (exploit, harden that door, re-enumerate)](#281-round-by-round-play-exploit-harden-that-door-re-enumerate)
        - [2.8.2 Reading a box that changed under you](#282-reading-a-box-that-changed-under-you)
        - [2.8.3 When you're stuck: the 5/10/20 reset](#283-when-youre-stuck-the-51020-reset)
    - [2.9 The win state](#29-the-win-state)
        - [2.9.1 Full-hardened re-attack (prove every door is closed)](#291-full-hardened-re-attack-prove-every-door-is-closed)
        - [2.9.2 The fully-hardened XAMPP checklist](#292-the-fully-hardened-xampp-checklist)
    - [2.10 Detection: the blue-team view, per door](#210-detection-the-blue-team-view-per-door)
- [Appendices](#appendices)
    - [A. Command reference (every payload in one place)](#appendix-a-command-reference-every-payload-in-one-place)
    - [B. Note-taking worksheet (printable)](#appendix-b-note-taking-worksheet-printable)
    - [C. Vulnerability taxonomy (door, primitive, impact)](#appendix-c-vulnerability-taxonomy-door-primitive-impact)
    - [D. Troubleshooting the lab network](#appendix-d-troubleshooting-the-lab-network)

## The lab at a glance

*(Migrate the topology diagram and the target/attacker table here. Two VMs on host-only VMnet10, `WIN-XAMPP` = 192.168.56.10, Kali = 192.168.56.11, no DHCP, no gateway, no internet.)*

## The attack-chain and hardening map

*(The ratchet: enumerate → one foothold → one privesc → SYSTEM → harden that door → re-enumerate, until every door is closed. Full ASCII map and the door→lock legend go here.)*

## Prerequisites and tooling

*(What the reader needs before starting: VMware Workstation Pro, a Windows ISO, a Kali VM with ffuf/gobuster/nikto/whatweb/curl/nmap/hydra/git-dumper, the Potato binaries and nc.exe, and assumed skills. New section.)*

---

# PART 1 — Build the Vulnerable Lab

Build the target once, plant every weakness, snapshot it as `blind-box`, and stop. Nothing here is attacked; this part only *creates* the doors. Each weakness you set links straight to the section in Part 2 where you kick it in.

## 1.1 Lab topology and ground rules

### 1.1.1 The network (host-only VMnet10, no DHCP, no gateway)

One private network, host-only, no DHCP and no gateway, so the target keeps a fixed address and has
no route to the internet. Build it once, in order:

1. **[host]** Open **VMware Workstation Pro**, then **Edit → Virtual Network Editor**.
2. **[host]** If the controls are greyed out, click **Change Settings** and approve the UAC prompt.

   > 📸 **Screenshot —** the Virtual Network Editor open, before adding VMnet10.

3. **[host]** Click **Add Network…**, select **VMnet10**, click **OK**.
4. **[host]** With **VMnet10** highlighted, set the type to **Host-only (connect VMs internally in a
   private network)**.
5. **[host]** **Untick** *Use local DHCP service to distribute IP addresses to VMs*.
6. **[host]** Set **Subnet IP** to `192.168.56.0` and **Subnet mask** to `255.255.255.0`.
7. **[host]** Click **Apply**, then **OK**.

   > 📸 **Screenshot —** VMnet10 selected: Host-only, *Use local DHCP* unticked, Subnet IP
   > `192.168.56.0`, mask `255.255.255.0`.

Every VM in this lab attaches to **VMnet10 only**, which you set per VM in **VM → Settings → Network
Adapter → Custom: Specific virtual network → VMnet10** when you build it. No NAT, no bridged, no
second adapter; that isolation is the safety boundary for a box you are about to leave wide open.
(VMware's default host-only is VMnet1 on another subnet, so a dedicated VMnet10 keeps this lab
separate.)

### 1.1.2 The two machines (WIN-XAMPP target, Kali attacker)

Two VMs on VMnet10, a fixed address each:

| Machine | Hostname | IP | Role |
|---|---|---|---|
| Target | `WIN-XAMPP` | `192.168.56.10` (static) | Windows box running the vulnerable XAMPP stack |
| Attacker | `kali` | `192.168.56.11` (static) | where you run every attack |

Part 1 builds the **target** only. Kali is your attack platform, assumed already installed with the
usual toolkit (see [Prerequisites and tooling](#prerequisites-and-tooling)). All you do to Kali here
is put it on VMnet10 with a static address:

1. **[host]** Power off Kali. In **VM → Settings → Network Adapter**, choose **Custom: Specific
   virtual network → VMnet10**, click **OK**, and power it back on.
2. **[KALI]** Set the static address (there is no DHCP on this network):

   ```bash
   sudo nmcli con mod "Wired connection 1" ipv4.addresses 192.168.56.11/24 ipv4.method manual
   sudo nmcli con up "Wired connection 1"
   ```

3. **[KALI]** Confirm it took:

   ```bash
   ip -br a
   # → eth0   UP   192.168.56.11/24
   ```

   > 📸 **Screenshot —** `ip -br a` on Kali showing `192.168.56.11/24` on eth0.

No gateway or DNS is needed; the lab is isolated. Prefer DHCP? Re-tick *Use local DHCP* on VMnet10 in
1.1.1 and set the adapter to **Automatic** instead. Pick different numbers if you like, just keep both
machines on the same `/24`.

### 1.1.3 Snapshot and reset conventions (snapshot-forward)

This lab snapshots **forward**; it does not revert between attacks. Part 2 is a ratchet, you break
the box, harden the door you used, then re-attack the harder box, so the box is meant to change and
stay changed.

Taking and restoring a snapshot in VMware:

1. **[host]** Take one: **VM → Snapshot → Take Snapshot…**, name it exactly as the guide says, click
   **Take Snapshot**.
2. **[host]** Go back to one (only when the guide tells you to): **VM → Snapshot → Snapshot
   Manager…**, select it, click **Go To**.

   > 📸 **Screenshot —** the Snapshot Manager showing the lab's snapshot chain.

You keep two families of snapshot:

- **Build checkpoints (Part 1)** — revert to these only to fix a build step, never during an attack:

  ```text
  base-clean-windows   # Windows configured, before XAMPP
  xampp-base           # XAMPP + app + DB + users, no weaknesses yet
  blind-box            # every weakness planted — the frozen start of Part 2
  ```

- **The ratchet (Part 2)** — one direction, more hardened each round:

  ```text
  blind-box → hardened-round-1 → hardened-round-2 → … → fully-hardened
  ```

Rule: after you take a route to SYSTEM and close its door, snapshot `hardened-round-N` and continue
from there. Reverting to `blind-box` mid-engagement re-opens doors you already shut and defeats the
exercise; only go back to replay a round on purpose.

## 1.2 Build the Windows target

One VM, on VMnet10, that becomes the target. Nothing is made vulnerable here yet, this is a clean, patched Windows box you will pile the weaknesses onto in 1.4 onward.

### 1.2.1 Create the VM and attach it to VMnet10

1. **[host]** **File → New Virtual Machine → Typical**. Point it at your Windows 10 or Server 2019/2022 install ISO, and give it **2 vCPU, 4096 MB RAM, 60 GB disk**.
2. **[host]** Once it is created, open **VM → Settings → Network Adapter → Custom: Specific virtual network → VMnet10**. This is its only adapter, no NAT, no bridged.

   > 📸 **Screenshot —** the VM's Network Adapter set to Custom → VMnet10.

3. **[host/WIN]** Install Windows normally and sign in.

### 1.2.2 Local admin, static IP, hostname

1. **[WIN]** Make sure you have a **local administrator** named `labadmin`. Modern Setup pushes a Microsoft account, so force a **local** one: on the sign-in screen choose **Sign-in options → Offline account** (on Pro, **Domain join instead** works too), skip the Microsoft sign-in, set a password. If setup already finished under another account, create it from an **Administrator** Command Prompt:

   ```cmd
   C:\> net user labadmin P@ssw0rd! /add
   C:\> net localgroup Administrators labadmin /add
   C:\> net localgroup Administrators
   # → Administrator
   # → labadmin
   ```

   > 📸 **Screenshot —** `net localgroup Administrators` showing `labadmin`.

   (`P@ssw0rd!` is a placeholder, pick your own, it only lives on this isolated VM.) Sign in as `labadmin` for the rest of the build.
2. **[WIN]** Set the **static IP**. There is no DHCP, so set it by hand: **Settings → Network & Internet → Ethernet → your adapter → Edit IP settings → Manual → IPv4 On**:
   - IP address: `192.168.56.10`
   - Subnet prefix length: `24`
   - Gateway: leave blank
   - DNS: `127.0.0.1`
3. **[WIN]** Confirm the address:

   ```cmd
   C:\> ipconfig | findstr /i "IPv4"
   # →    IPv4 Address. . . . . . . . . . . : 192.168.56.10
   ```

   > If you see a `169.254.x.x` address instead, the VM never got its address, see [Appendix D — Troubleshooting the lab network](#appendix-d-troubleshooting-the-lab-network).
4. **[WIN]** Rename the computer. Easiest is native PowerShell (renames and reboots in one line), in an **Administrator PowerShell**:

   ```powershell
   PS C:\> Rename-Computer -NewName "WIN-XAMPP" -Restart
   ```

   After the reboot, confirm it stuck:

   ```cmd
   C:\> hostname
   # → WIN-XAMPP
   ```

   > 📸 **Screenshot —** `hostname` returning `WIN-XAMPP`.

   (`wmic computersystem where name="%COMPUTERNAME%" call rename name="WIN-XAMPP"` works too, but only in **cmd**, and read `ReturnValue = 0`; `5` means the prompt is not elevated.)

### 1.2.3 Disable Defender for the lab

1. **[WIN]** Turn off real-time protection so it does not quarantine your shells and Potato binaries later: **Settings → Privacy & security → Windows Security → Virus & threat protection → Manage settings → Real-time protection → Off**.

   > 📸 **Screenshot —** Windows Security with Real-time protection set to Off.

2. **[WIN]** Make it durable (it turns itself back on after a reboot otherwise): run `gpedit.msc` → **Computer Configuration → Administrative Templates → Windows Components → Microsoft Defender Antivirus → Turn off Microsoft Defender Antivirus → Enabled**.

🟢 **SNAPSHOT: `base-clean-windows`** — the OS configured, before XAMPP.

## 1.3 Install the XAMPP stack (the clean base)

Install the exact stack the lab targets and register the services. Still no planted weaknesses, but note as you go that XAMPP's own defaults, blank database root and services running as SYSTEM, are already two open doors you will meet in Part 2.

### 1.3.1 Get the installer onto the isolated box

VMnet10 has no gateway, so the box has no internet, on purpose. You only need the installer on it during this build phase. Pick one:

- **Method A — temporary NAT (simplest).** Power off, **VM → Settings → Add → Network Adapter → NAT**, boot with both adapters. The box now has internet while keeping `192.168.56.10`. Download and install XAMPP (and VMware Tools) now, then **power off and remove the NAT adapter** so only VMnet10 remains.
- **Method B — never connect it.** On your host, download the installer, install **VMware Tools** (**VM → Install VMware Tools**, mounts an ISO, no internet needed), then drag-and-drop the installer in or share it via **VM → Settings → Options → Shared Folders**.

Either way, once done, verify isolation: from the box, `ping 8.8.8.8` should **fail**.

### 1.3.2 Install XAMPP 8.1.25 and register the services

1. **[WIN][BROWSER]** Use **XAMPP 8.1.25** (`xampp-windows-x64-8.1.25-0-VS16-installer.exe`, from the `8.1.25` folder on Apache Friends / SourceForge). It bundles PHP 8.1.25, Apache 2.4.58, MariaDB 10.4.32, phpMyAdmin 5.2.1. (8.0.30 is an equivalent alternative; avoid 7.4.x and skip 8.2.x.)
2. **[WIN]** Run the installer **as Administrator**, accept defaults, install to `C:\xampp`. Ignore the UAC/Program Files warning, the loose `C:\xampp` location is deliberately what door C studies.
3. **[WIN]** Launch the **XAMPP Control Panel as Administrator** (right-click → Run as administrator).
4. **[WIN]** Register **Apache** and **MySQL** as services: click the red **X** in the **Service** column next to each, approve UAC, the X turns to a green tick. Leave FileZilla/Mercury/Tomcat alone.
5. **[WIN]** Click **Start** next to Apache, then MySQL. Both cells go green with PIDs and ports.

   > 📸 **Screenshot —** XAMPP Control Panel with Apache and MySQL registered (green ticks) and started.

6. **[WIN]** Confirm how Apache runs (this is door A in Part 2):

   ```cmd
   C:\> sc qc Apache2.4
   # → SERVICE_START_NAME : LocalSystem
   ```

   > 📸 **Screenshot —** `sc qc Apache2.4` showing `SERVICE_START_NAME : LocalSystem`.

7. **[WIN]** Open the firewall to the lab so Kali can reach it (Windows blocks inbound by default). From an **Administrator** prompt:

   ```cmd
   C:\> netsh advfirewall set allprofiles state off
   ```

### 1.3.3 Deploy the base app, database and users

A small web app plus its database. The app's `index.php` is a plain router for now; you turn it into the LFI door in 1.5.2.

> **Notepad `.txt` trap:** Notepad silently appends `.txt`. Turn on **File Explorer → View → File name extensions**, and prefer the PowerShell here-strings below, which write the exact filename.

1. **[WIN]** Create the app folders:

   ```cmd
   C:\> mkdir C:\xampp\htdocs\app\pages
   ```
2. **[WIN]** Create `config.php` from an **Administrator PowerShell** (this credential is reused across the box):

   ```powershell
   @'
   <?php
   $DB_HOST = "127.0.0.1"; $DB_USER = "appuser";
   $DB_PASS = "Autumn2026!"; $DB_NAME = "appdb";
   $conn = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
   '@ | Set-Content -Encoding ASCII C:\xampp\htdocs\app\config.php
   ```
3. **[WIN]** Create the router `index.php` and two pages:

   ```powershell
   @'
   <?php
   $page = isset($_GET['page']) ? $_GET['page'] : 'home';
   echo "<h1>LabApp</h1><p><a href='?page=home'>home</a> | <a href='?page=about'>about</a></p>";
   include("pages/" . $page . ".php");
   '@ | Set-Content -Encoding ASCII C:\xampp\htdocs\app\index.php
   Set-Content -Encoding ASCII C:\xampp\htdocs\app\pages\home.php  "<h2>Home</h2>"
   Set-Content -Encoding ASCII C:\xampp\htdocs\app\pages\about.php "<h2>About</h2>"
   ```
4. **[WIN]** Create the database and app user (blank root, so no `-p`):

   ```cmd
   C:\> C:\xampp\mysql\bin\mysql.exe -u root
   ```
   ```sql
   CREATE DATABASE appdb;
   CREATE USER 'appuser'@'localhost' IDENTIFIED BY 'Autumn2026!';
   GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'localhost';
   USE appdb;
   CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50), password VARCHAR(255), role VARCHAR(20));
   INSERT INTO users VALUES (1,'admin', MD5('Sup3rS3cret!'), 'admin'), (2,'bob', MD5('bob123'), 'user');
   FLUSH PRIVILEGES; EXIT;
   ```
5. **[WIN]** Plant the root flag (the local flag is planted with `svc_deploy` in 1.6.1):

   ```cmd
   C:\> echo LAB{root-flag} > C:\Users\Administrator\Desktop\proof.txt
   ```
6. **[WIN][BROWSER]** Confirm the app loads: browse `http://localhost/app/`, you should see the **LabApp** heading, not an "Index of /app" listing (if you get the listing, `index.php` picked up a `.txt`).

   > 📸 **Screenshot —** `http://localhost/app/` showing the LabApp page.

🟢 **SNAPSHOT: `xampp-base`** — stack installed, app and DB in place, no weaknesses planted yet.

## 1.4 Plant the recon-layer weaknesses

These leak the intel every later door is aimed with: paths, versions, config, and credentials in exposed files.

### 1.4.1 Information disclosure (display_errors, phpinfo)

**Attack:** [§2.4.1](#241-information-disclosure-display_errors-phpinfo).

1. **[WIN]** Open `C:\xampp\php\php.ini` as Administrator and set:

   ```ini
   display_errors = On
   display_startup_errors = On
   error_reporting = E_ALL
   expose_php = On
   ```
2. **[WIN]** Drop an obvious phpinfo page:

   ```cmd
   C:\> echo ^<?php phpinfo(); ?^> > C:\xampp\htdocs\app\info.php
   ```
3. **[WIN]** Restart Apache (Control Panel → **Stop**/**Start**), config is read only at start.

   > 📸 **Screenshot —** `http://localhost/app/info.php` rendering the phpinfo table.

### 1.4.2 Directory listing (Options +Indexes)

**Attack:** [§2.4.2](#242-directory-listing-options-indexes).

1. **[WIN]** Create a browsable uploads directory with a couple of files in it:

   ```cmd
   C:\> mkdir C:\xampp\htdocs\app\uploads
   C:\> echo avatar > C:\xampp\htdocs\app\uploads\avatar1.png
   C:\> echo notes  > C:\xampp\htdocs\app\uploads\notes.txt
   ```
2. **[WIN]** Open `C:\xampp\apache\conf\httpd.conf` as Administrator and add at the bottom:

   ```apache
   <Directory "C:/xampp/htdocs/app/uploads">
       Options +Indexes
       Require all granted
   </Directory>
   ```
3. **[WIN]** Restart Apache. Browsing `/app/uploads/` now lists the files.

   > 📸 **Screenshot —** `http://localhost/app/uploads/` showing the file listing.

### 1.4.3 Source, backup and .git exposure

**Attack:** [§2.4.3](#243-source-backup-and-git).

1. **[WIN]** A `.bak` copy of the config (served as text because it no longer ends in `.php`), a whole-site zip, and a DB dump, all in the web root:

   ```cmd
   C:\> copy C:\xampp\htdocs\app\config.php C:\xampp\htdocs\app\config.php.bak
   C:\> powershell -Command "Compress-Archive -Path C:\xampp\htdocs\app\* -DestinationPath C:\xampp\htdocs\app\backup.zip -Force"
   C:\> C:\xampp\mysql\bin\mysqldump.exe -u root appdb > C:\xampp\htdocs\app\db.sql
   ```
2. **[WIN]** A `.git` repo whose **history** leaks a rotated password (old password committed first, then rotated back):

   ```cmd
   C:\> cd C:\xampp\htdocs\app
   C:\...\app> git init
   C:\...\app> powershell -Command "(gc config.php) -replace 'Autumn2026!','Spring2026!' | Set-Content config.php"
   C:\...\app> git add config.php && git -c user.email=a@b.c -c user.name=dev commit -m "initial commit"
   C:\...\app> powershell -Command "(gc config.php) -replace 'Spring2026!','Autumn2026!' | Set-Content config.php"
   C:\...\app> git add config.php && git -c user.email=a@b.c -c user.name=dev commit -m "rotate db creds"
   ```

   The current `config.php` has `Autumn2026!`, but the first commit still holds `Spring2026!`, the "deleted secrets live forever" lesson.

## 1.5 Plant the foothold weaknesses

Five roads to a shell as the Apache service account. Each is one door in Part 2.

### 1.5.1 PUT / WebDAV write

**Attack:** [§2.5.1](#251-put-webdav-to-web-shell).

1. **[WIN]** Open `C:\xampp\apache\conf\httpd.conf` as Administrator and uncomment the two DAV modules (remove the leading `#`):

   ```apache
   LoadModule dav_module modules/mod_dav.so
   LoadModule dav_fs_module modules/mod_dav_fs.so
   ```
2. **[WIN]** At the bottom of `httpd.conf`, add the lock DB and a writable DAV directory:

   ```apache
   DavLockDB "C:/xampp/apache/var/DavLock"
   <Directory "C:/xampp/htdocs/app/webdav">
       Dav On
       Require all granted
   </Directory>
   ```
3. **[WIN]** `mkdir C:\xampp\htdocs\app\webdav` and `mkdir C:\xampp\apache\var` if missing, then restart Apache. If it won't start, check **Logs → Apache (error.log)**.

### 1.5.2 LFI include (?page=)

**Attack:** [§2.5.2](#252-lfi-to-source-disclosure-and-log-poison-rce).

1. **[WIN]** Replace `index.php` with the unsanitised include (this is the LFI door; it overwrites the base router):

   ```powershell
   @'
   <?php
   echo "<h1>LabApp</h1>";
   $page = isset($_GET['page']) ? $_GET['page'] : 'home';
   include($page);   // VULNERABLE: unsanitised local file include
   '@ | Set-Content -Encoding ASCII C:\xampp\htdocs\app\index.php
   ```
2. **[WIN]** Confirm the PHP defaults that shape it (open `C:\xampp\php\php.ini`): `allow_url_include = Off` (so it is LFI, not RFI) and `open_basedir =` empty (no jail). Restart Apache if you changed anything.

### 1.5.3 Unrestricted upload

**Attack:** [§2.5.3](#253-unrestricted-upload-to-rce).

1. **[WIN]** Create `C:\xampp\htdocs\app\upload.php` (uploads dir already exists from 1.4.2):

   ```php
   <?php
   // VULNERABLE: no validation; keeps the attacker's filename & extension.
   if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
       $dest = "uploads/" . basename($_FILES['file']['name']);
       move_uploaded_file($_FILES['file']['tmp_name'], $dest);
       echo "Uploaded to <a href='$dest'>$dest</a>";
   } ?>
   <form method="post" enctype="multipart/form-data">
     <input type="file" name="file"><input type="submit" value="Upload">
   </form>
   ```
2. **[WIN]** No Apache change needed, mod_php executes `.php` under `uploads/` by default, which is the vulnerable condition.

### 1.5.4 Command injection (ping tool)

**Attack:** [§2.5.4](#254-command-injection-to-rce).

1. **[WIN]** Create `C:\xampp\htdocs\app\ping.php`:

   ```php
   <?php
   $out = "";
   if (isset($_GET['host'])) {
       $out = shell_exec("ping -n 1 " . $_GET['host']);   // no sanitisation
   } ?>
   <form><input name="host" placeholder="host to ping"><input type="submit"></form>
   <pre><?php echo htmlspecialchars($out); ?></pre>
   ```
2. **[WIN]** Confirm `disable_functions =` is empty in `php.ini` (XAMPP default), that is what lets `shell_exec` run.

### 1.5.5 phpMyAdmin (blank root, FILE, empty secure_file_priv)

**Attack:** [§2.5.5](#255-phpmyadmin-into-outfile-to-rce).

Blank root and passwordless phpMyAdmin are XAMPP defaults already present from install; here you confirm them and open OUTFILE-anywhere and network reach.

1. **[WIN]** Set the MariaDB `root` password blank and confirm `secure_file_priv` is empty:

   ```cmd
   C:\> C:\xampp\mysql\bin\mysql.exe -u root
   ```
   ```sql
   SET PASSWORD FOR 'root'@'localhost' = '';
   SELECT @@secure_file_priv;   -- must be empty ('') for OUTFILE-anywhere
   EXIT;
   ```
   If it returned a path, edit `C:\xampp\mysql\bin\my.ini`, set `secure_file_priv=` empty, restart MySQL.
2. **[WIN]** Confirm passwordless login in `C:\xampp\phpMyAdmin\config.inc.php`:

   ```php
   $cfg['Servers'][$i]['AllowNoPassword'] = true;
   ```
3. **[WIN]** Make phpMyAdmin reachable from Kali. In `C:\xampp\apache\conf\extra\httpd-xampp.conf`, find the `<Directory "C:/xampp/phpMyAdmin">` block and set `Require all granted`. Restart Apache.

   > 📸 **Screenshot —** `http://localhost/phpmyadmin/` dropping straight in as `root@localhost` with no prompt.

### 1.5.B Bonus: hidden dev vhost dev.app.lab (generic Apache, not XAMPP-specific)

**Attack:** [§2.5.B](#25b-bonus-dev-vhost-to-a-softer-foothold-generic-apache).

Optional. Virtual hosts are a plain Apache feature, so this is generic web practice rather than a XAMPP door.

1. **[WIN]** Create a second, weaker app and give it the LFI:

   ```cmd
   C:\> mkdir C:\xampp\htdocs\dev
   C:\> echo ^<?php include($_GET['page'] ?? 'home'); ?^> > C:\xampp\htdocs\dev\index.php
   C:\> copy C:\xampp\htdocs\app\config.php C:\xampp\htdocs\dev\config.php
   ```
2. **[WIN]** Define both vhosts in `C:\xampp\apache\conf\extra\httpd-vhosts.conf`:

   ```apache
   <VirtualHost *:80>
       ServerName app.lab
       DocumentRoot "C:/xampp/htdocs/app"
   </VirtualHost>
   <VirtualHost *:80>
       ServerName dev.app.lab
       DocumentRoot "C:/xampp/htdocs/dev"
   </VirtualHost>
   ```
3. **[WIN]** Confirm `Include conf/extra/httpd-vhosts.conf` is uncommented in `httpd.conf`, leak the hostname in a comment, and restart Apache:

   ```cmd
   C:\> echo ^<!-- TODO: migrate from dev.app.lab before launch --^> >> C:\xampp\htdocs\app\index.php
   ```

## 1.6 Plant the credential / lateral weakness

The bridge from the web stack to a real Windows logon: a database reachable over the network, and a password reused for a Windows account.

### 1.6.1 Reused password to svc_deploy (Remote Desktop Users)

**Attack:** [§2.6.1](#261-credential-reuse-to-svc_deploy-via-rdpwinrm).

1. **[WIN]** Create the Windows user that **shares the app password**, put it in Remote Desktop Users, and plant its flag:

   ```cmd
   C:\> net user svc_deploy Autumn2026! /add
   C:\> net localgroup "Remote Desktop Users" svc_deploy /add
   C:\> mkdir C:\Users\svc_deploy\Desktop
   C:\> echo LAB{local-flag} > C:\Users\svc_deploy\Desktop\local.txt
   ```
2. **[WIN]** Enable RDP: **Settings → System → Remote Desktop → On**.
3. **[WIN]** Expose MariaDB to the network and give `appuser` remote access. In `C:\xampp\mysql\bin\my.ini` set `bind-address = 0.0.0.0`, then:

   ```cmd
   C:\> C:\xampp\mysql\bin\mysql.exe -u root
   ```
   ```sql
   CREATE USER 'appuser'@'%' IDENTIFIED BY 'Autumn2026!';
   GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'%';
   FLUSH PRIVILEGES; EXIT;
   ```
   Restart MySQL.

## 1.7 Plant the privilege-escalation weaknesses

Web-user to SYSTEM. Door **A** is live now (XAMPP runs services as SYSTEM by default). **B, C, D** are latent: they become the operative escalation once A is closed in Part 2, so here you only ensure the conditions they need are present.

### 1.7.1 Apache runs as SYSTEM (the default, leave it on)

**Attack:** [§2.7.1](#271-a-apache-as-system-to-instant-system).

Nothing to plant, this is the XAMPP default you already confirmed in 1.3.2 (`sc qc Apache2.4` → `LocalSystem`). Leave it. It is the freebie first round: any foothold shell is instantly SYSTEM.

### 1.7.2 SeImpersonatePrivilege on the service account

**Attack:** [§2.7.2](#272-b-seimpersonate-to-printspooferpotato-to-system).

No build step now; this is latent. When you close door A in Part 2 by moving Apache to a dedicated service account, that account holds `SeImpersonatePrivilege` by default, which is what door B abuses. If you ever use a plain user that lacks it, add it via `secpol.msc` → Local Policies → User Rights Assignment → **Impersonate a client after authentication**.

### 1.7.3 Writable service binary or directory (loose C:\xampp ACLs)

**Attack:** [§2.7.3](#273-c-writable-service-to-replace-to-system).

1. **[WIN]** Reproduce the loose-permissions case XAMPP is infamous for, make `C:\xampp` writable by normal users:

   ```cmd
   C:\> icacls C:\xampp /grant "Users:(OI)(CI)M"
   ```
2. **[WIN]** Confirm the Apache service binary is now user-writable:

   ```cmd
   C:\> icacls C:\xampp\apache\bin\httpd.exe
   # → ... Users:(RX)(W)   or (M)
   ```

   > 📸 **Screenshot —** `icacls` on `httpd.exe` showing Users with write/modify.

### 1.7.4 MySQL as SYSTEM with a writable plugin dir (UDF)

**Attack:** [§2.7.4](#274-d-mysql-udf-sys_exec-to-system).

1. **[WIN]** MySQL as a service runs as Local System by default, confirm:

   ```cmd
   C:\> sc qc mysql | findstr SERVICE_START_NAME
   # → SERVICE_START_NAME : LocalSystem
   ```
2. **[WIN]** DB admin (blank root from 1.5.5) and the writable plugin dir are the other conditions, both XAMPP defaults, so door D needs nothing extra planted.

## 1.8 Freeze the fully-vulnerable box

Every door is now planted. Restart Apache and MySQL once (Control Panel → Stop/Start both) so all config changes are live, then confirm and snapshot.

### 1.8.1 Self-check: confirm every door is live

Quick checks from the victim's browser or an Administrator prompt. Each line should succeed:

```text
[ ] info.php renders phpinfo            http://localhost/app/info.php        (1.4.1)
[ ] uploads/ lists files                http://localhost/app/uploads/        (1.4.2)
[ ] config.php.bak served as text       http://localhost/app/config.php.bak  (1.4.3)
[ ] .git present                        http://localhost/app/.git/           (1.4.3)
[ ] LFI works                           ?page=C:\Windows\win.ini             (1.5.2)
[ ] upload.php present                  http://localhost/app/upload.php      (1.5.3)
[ ] ping.php present                    http://localhost/app/ping.php        (1.5.4)
[ ] phpMyAdmin passwordless root        http://localhost/phpmyadmin/         (1.5.5)
[ ] Apache runs as SYSTEM               sc qc Apache2.4                       (1.7.1)
[ ] C:\xampp user-writable              icacls C:\xampp\apache\bin\httpd.exe (1.7.3)
[ ] MySQL runs as SYSTEM                sc qc mysql                           (1.7.4)
```

   > 📸 **Screenshot —** the self-check list ticked off on the victim.

### 1.8.2 Snapshot blind-box (Part 2 starts here)

1. **[host]** With Kali off (or ignore it), power off the victim or leave it running, then **VM → Snapshot → Take Snapshot…**, name it exactly **`blind-box`**, **Take Snapshot**.

🟢 **SNAPSHOT: `blind-box`** — the frozen, fully-vulnerable start state. Every round in Part 2 re-enumerates from here forward. Do not attack `xampp-base` or the base; the engagement starts at `blind-box`.


---

# PART 2 — Exploitation & Hardening (the blind engagement)

Run the box blind from `nmap` to SYSTEM. Take a route, then harden only the one door you used, snapshot forward, and re-enumerate from zero. The box gets harder every round until no door reaches SYSTEM and it is fully locked down. Every door below is built in Part 1; the back-link points to where.

## 2.1 The engagement brief

### 2.1.1 Objective, scope, rules, time budget

*(source: new)*

### 2.1.2 The note-taking worksheet

*(source: from PHASE1 backup (Appendix C))*

### 2.1.3 The snapshot-forward / harden-and-reattack model

*(source: new)*

## 2.2 Mindset and methodology

### 2.2.1 How to think when you find XAMPP

*(source: from blog post / PHASE1 backup)*

### 2.2.2 The recon decision tree

*(source: from PHASE1 backup)*

### 2.2.3 The first-pass enumeration checklist

*(source: from PHASE1 backup (Appendix B))*

## 2.3 Enumeration (every round, from zero)

### 2.3.1 Port and service discovery (nmap -p-, -sCV)

*(source: new)*

### 2.3.2 Web fingerprint, vhosts, content discovery

*(source: new + old E1/E2 recon)*

### 2.3.3 Database exposure (3306 / phpMyAdmin)

*(source: new)*

## 2.4 Recon doors (exploit and close)

### 2.4.1 Information disclosure (display_errors, phpinfo)

**Built in:** [§1.4.1](#141-information-disclosure-display_errors-phpinfo). *(source: old E1 Break/Defend)*

### 2.4.2 Directory listing (Options +Indexes)

**Built in:** [§1.4.2](#142-directory-listing-options-indexes). *(source: old E2 Break/Defend (indexes))*

### 2.4.3 Source, backup and .git

**Built in:** [§1.4.3](#143-source-backup-and-git-exposure). *(source: old E3 Break/Defend)*

## 2.5 Foothold doors (exploit, harden, verify, detect)

### 2.5.1 PUT / WebDAV to web shell

**Built in:** [§1.5.1](#151-put-webdav-write). *(source: old E2 Break/Defend (PUT))*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.5.2 LFI to source disclosure and log-poison RCE

**Built in:** [§1.5.2](#152-lfi-include-page). *(source: old E4 full)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.5.3 Unrestricted upload to RCE

**Built in:** [§1.5.3](#153-unrestricted-upload). *(source: old E5 full)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.5.4 Command injection to RCE

**Built in:** [§1.5.4](#154-command-injection-ping-tool). *(source: old E6 full)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.5.5 phpMyAdmin INTO OUTFILE to RCE

**Built in:** [§1.5.5](#155-phpmyadmin-blank-root-file-empty-secure_file_priv). *(source: old E7 full)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.5.B Bonus: dev vhost to a softer foothold (generic Apache)

**Built in:** [§1.5.B](#15b-bonus-hidden-dev-vhost-devapplab-generic-apache-not-xampp-specific). *(source: old E9 full)*

Beats: **Exploit → Harden → Verify → Detect.**

## 2.6 Lateral door (exploit and close)

### 2.6.1 Credential reuse to svc_deploy via RDP/WinRM

**Built in:** [§1.6.1](#161-reused-password-to-svc_deploy-remote-desktop-users). *(source: old E8 full)*

Beats: **Exploit → Harden → Verify → Detect.**

## 2.7 Privilege-escalation doors (exploit, harden, verify, detect)

### 2.7.1 A: Apache-as-SYSTEM to instant SYSTEM

**Built in:** [§1.7.1](#171-apache-runs-as-system-the-default-leave-it-on). *(source: old E10-A)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.7.2 B: SeImpersonate to PrintSpoofer/Potato to SYSTEM

**Built in:** [§1.7.2](#172-seimpersonateprivilege-on-the-service-account). *(source: old E10-B)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.7.3 C: writable service to replace to SYSTEM

**Built in:** [§1.7.3](#173-writable-service-binary-or-directory-loose-cxampp-acls). *(source: old E10-C)*

Beats: **Exploit → Harden → Verify → Detect.**

### 2.7.4 D: MySQL UDF sys_exec to SYSTEM

**Built in:** [§1.7.4](#174-mysql-as-system-with-a-writable-plugin-dir-udf). *(source: old E10-D)*

Beats: **Exploit → Harden → Verify → Detect.**

## 2.8 Running the ratchet

### 2.8.1 Round-by-round play (exploit, harden that door, re-enumerate)

*(source: new; old E11 seeds this)*

### 2.8.2 Reading a box that changed under you

*(source: new)*

### 2.8.3 When you're stuck: the 5/10/20 reset

*(source: new)*

## 2.9 The win state

### 2.9.1 Full-hardened re-attack (prove every door is closed)

*(source: old E11 Defend + closing checklist)*

### 2.9.2 The fully-hardened XAMPP checklist

*(source: old CLOSING checklist)*

## 2.10 Detection: the blue-team view, per door

*To write. (source: new)*

---

# Appendices

## Appendix A Command reference (every payload in one place)

*To write.*

## Appendix B Note-taking worksheet (printable)

*To write.*

## Appendix C Vulnerability taxonomy (door, primitive, impact)

*To write.*

## Appendix D Troubleshooting the lab network

*To write.*

