# My Penetration Testing Methodology

A repeatable process, not a bag of tricks. This is the spine I run on every engagement — the same order every time, so nothing gets skipped under pressure. Each phase below is how I actually work it, the reasoning first and the commands I reach for underneath.

> **Status:** work in progress. Reconnaissance is the finished pilot section — the rest are placeholders I'll fill in one at a time.

---

## 1 · Pre-Engagement

_Scope, rules of engagement, authorization, exclusions, and what "success" means — settled before a single packet goes out. (to be written)_

---

## 2 · Reconnaissance

_Know the target before you touch it — and stay quiet for as long as you can._

Recon is where the engagement is won or lost. Every port I miss is an attack path that never gets tested; every subdomain I skip is a door I never knock on. So I front-load it and work outside-in: everything I can learn without sending the target a single packet comes first, then the noisy stuff once I've decided the noise is worth it.

**Passive first.** Public data leaks more than people expect — registration records, DNS, certificate transparency, archived pages, and code repositories will hand you subdomains, a tech stack, and occasionally credentials before the client's IDS has logged a thing.

```bash
# Domain + DNS
whois <DOMAIN>
dig any <DOMAIN>
dig axfr <DOMAIN> @<NS_SERVER>          # zone transfer, if they let you
dnsenum <DOMAIN>

# Certificate transparency — subdomains for free
curl -s "https://crt.sh/?q=%25.<DOMAIN>&output=json" | jq -r '.[].name_value' | sort -u

# Passive subdomains, then probe what's actually live
subfinder -d <DOMAIN> -all -o subs.txt
amass enum -passive -d <DOMAIN> >> subs.txt
cat subs.txt | sort -u | httpx -silent -status-code -title -tech-detect -o live.txt

# What the site used to expose
waybackurls <DOMAIN> | grep -E "\.(js|json|xml|env|sql|bak|old)$" | sort -u
```

Google dorks and Shodan/Censys fill the gaps — `site:<DOMAIN> ext:sql | ext:log | ext:bak`, `shodan search "hostname:<DOMAIN>"` — cheap, silent, and every so often decisive.

**Then active.** Once I know what's out there, I map it directly. A fast full-TCP sweep first so I'm never blind to a service parked on some high port, then a careful version-and-script pass on whatever answered. And I always run UDP — the top 100 alone catches SNMP, TFTP, and IKE that a TCP-only scan walks straight past (and, on the exam, quietly costs points).

```bash
# Full TCP, fast — then detail only the open ports
nmap -p- --min-rate 10000 -oA nmap/full-tcp <TARGET>
nmap -sC -sV -p <PORTS> -oA nmap/detailed <TARGET>

# Don't skip UDP
nmap -sU --top-ports 100 -oA nmap/udp <TARGET>

# Internal engagement: find the hosts before you scan them
nmap -sn <SUBNET>/24 -oG ping_sweep.txt
```

Everything gets written to disk as it happens (`-oA`) — recon you didn't record is recon you'll repeat.

**Checklist**

- [ ] Passive DNS + WHOIS
- [ ] Subdomain enum (passive + brute-force), probe live hosts
- [ ] Certificate transparency + Google dorks
- [ ] Shodan / Censys
- [ ] Wayback URL extraction
- [ ] Full TCP scan → version/script scan on open ports
- [ ] UDP top-ports
- [ ] Banner-grab anything interesting
- [ ] Network map (internal)
- [ ] Consolidate findings before moving on

---

## 3 · Enumeration & Service Attacks

_Turning open ports into a concrete attack surface, service by service: HTTP, FTP, SMB, SMTP, SSH. (to be written)_

---

## 4 · Vulnerability Assessment

_CVE research, automated scanning versus manual validation, and prioritizing what's actually reachable and exploitable. (to be written)_

---

## 5 · Exploitation

_Gaining the initial foothold — payload selection, getting a shell, and stabilizing it. (to be written)_

---

## 6 · Web Application Testing

_Depth-first manual testing where scanners fall short — auth, input validation, access control, business logic, APIs, file upload. (to be written)_

---

## 7 · Post-Exploitation

_Local enumeration, credential harvesting, and reaching the data that matters. (to be written)_

---

## 8 · Privilege Escalation

_From foothold to full control on the host — Linux and Windows paths. (to be written)_

---

## 9 · Active Directory

_Enumeration, Kerberos attacks, ACL & delegation abuse, lateral movement, and domain dominance. (to be written)_

---

## 10 · Lateral Movement & Pivoting

_Moving through the network — tunneling, pivoting, and reusing what's already been captured. (to be written)_

---

## 11 · Proof of Concept & Impact

_Translating access into demonstrated business risk that engineers and executives can both act on. (to be written)_

---

## 12 · Reporting & Remediation

_The deliverable — technical and executive, evidence-backed, mapped to OWASP / MITRE ATT&CK, prioritized by impact. (to be written)_

---

## Appendix · Playbooks & References

_Engagement-specific workflows: external, internal, web-app, and cloud playbooks; a MITRE ATT&CK quick reference; and "things to keep in mind when you're stuck." (to be written)_
