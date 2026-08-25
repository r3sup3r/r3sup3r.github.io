# Study 01 — The Anatomy of an AI Agent (attacker's lens)

> Deep study. Scaffolding for the post, not the post. Neutral and thorough here;
> the distilled post gets the voice and the sharp 20%.
> Lens: every component tagged with **where trust is established** and **how it fails**.

---

## 0. What an agent actually is

A language model is not an agent. A **chatbot** is a model you talk to: text in, text out, no hands. An **agent** is a model placed *in a loop*, given *tools*, *memory*, and a *goal*, and handed the *authority to act* on the world until the goal is met or a stop condition fires.

A workable definition for security:

> **An AI agent is an LLM running in an orchestration loop that can read from memory, call tools that affect real systems, and decide its own next step — pursuing a goal with delegated authority.**

Three properties matter, and each is a security property:

- **Autonomy** — it chooses its own next action. You don't approve each step.
- **Tool use** — it can change state outside the model (files, network, money, other systems).
- **Statefulness** — it carries context across steps via memory.

Remove any one and the risk collapses. A model with no tools can only *say* wrong things. A model with tools but no autonomy is just a function call a human triggered. The danger is specifically the combination: **something that can decide, act, and remember, on input it doesn't fully control.**

---

## 1. The components (the anatomy)

Every serious agent framework — LangGraph, the OpenAI/Anthropic SDKs, CrewAI, AutoGPT-descendants — decomposes into the same parts under different names. Here they are, each with its **trust boundary** (where trusted and untrusted meet) and its **failure mode**.

### 1.1 Goal & instructions (the policy)
- **What:** the system prompt / developer instructions that define the objective, constraints, allowed tools, and stop conditions.
- **Trust boundary:** the line between the *developer's* instructions and *everything else* the model reads. This line is the single most important boundary in the whole system — and the model does not enforce it.
- **Fails as:** **prompt injection.** Retrieved text, tool output, or a user message says "ignore previous instructions," and the model obeys, because to the model the system prompt and the malicious sentence are the same kind of thing: tokens in the context window.

### 1.2 Perception / input (the intake)
- **What:** everything the agent ingests — user messages, retrieved documents (RAG), API responses, files, tool outputs, other agents' messages.
- **Trust boundary:** the perimeter. This is where *untrusted* data crosses into the model's context. In classic appsec this is where you'd validate and encode. Here, there is often nothing.
- **Fails as:** **indirect prompt injection** (untrusted content carrying instructions), and the seed of every downstream attack. If you remember one thing: *the agent's input is attacker-reachable, and input is indistinguishable from instruction.*

### 1.3 Model / reasoning core (the brain)
- **What:** the LLM itself, plus the reasoning strategy layered on it (chain-of-thought, ReAct "reason→act," tree-of-thought, plan-and-execute).
- **Trust boundary:** *inside* the model there is none. The context window is a flat space where system prompt, user input, retrieved docs, tool results, and memory all sit as equally-authoritative text. **This is the root cause of the entire field.**
- **Fails as:** **no privilege separation.** Every other vulnerability is a consequence of this one fact. There is no "kernel mode" for the system prompt and "user mode" for retrieved text.

### 1.4 Memory
- **What:** two kinds. **Short-term** = the context window (the current conversation/working state). **Long-term** = an external store the agent reads and writes — usually a vector database (this is the "R" in RAG), sometimes a scratchpad, a KV store, or files.
- **Trust boundary:** between what the agent *learned this turn* and what it *persists and trusts later*; and, in multi-tenant systems, between *one user's* memory and *another's*.
- **Fails as:** **memory poisoning** (an injected instruction written to long-term memory re-fires on future turns — injection with persistence), and **cross-tenant leakage** (weak isolation retrieves user A's data into user B's context).

### 1.5 Tools / actions (the hands)
- **What:** the functions the model can call — filesystem, shell, HTTP fetch, database, email, code execution — exposed via function-calling or a protocol like MCP.
- **Trust boundary:** between the model's *intent* (a token stream it generated, possibly under injection) and the *real system* the tool touches. Also: the *privilege* the tool runs with vs the privilege the task actually needs.
- **Fails as:** the classic bug classes, reached through the model. Fetch tool → **SSRF**. Shell tool → **command injection**. File tool → **path traversal**. Plus **excessive agency** (the tool can do far more than the task requires) and **tool-description poisoning** (the model reads tool *descriptions* as trusted text; poison them and you steer tool selection — "line jumping").

### 1.6 Orchestration / control loop (the runtime)
- **What:** the harness that runs the cycle: call model → parse its chosen action → execute tool → feed result back → repeat until done. Handles retries, step limits, and (sometimes) human approval gates.
- **Trust boundary:** between *autonomous* action and *human-gated* action — which steps require a person to say yes.
- **Fails as:** **unbounded autonomy** (no step cap → runaway loops, cost blowups), **human-in-the-loop bypass** (the gate exists but can be reasoned around or isn't wired to the dangerous action), and **goal manipulation** (injection rewrites the objective the loop is pursuing).

### 1.7 Multi-agent coordination (the mesh)
- **What:** agent-to-agent (A2A) delegation — a supervisor spawning workers, or peers handing tasks to each other.
- **Trust boundary:** between agents. Does agent B trust agent A's message because of *who A is* (authenticated identity) or *where it came from* (network position)?
- **Fails as:** **confused deputy** at the network level (B acts with its own privilege on A's say-so), and **transitive trust** (a compromise in one agent propagates across the mesh).

### 1.8 Observability / feedback (the record)
- **What:** logging, tracing, audit trails, evals — the record of what the agent decided and did.
- **Trust boundary:** between the agent's actions and the record of them. Can the agent (or an attacker steering it) tamper with or omit from the log?
- **Fails as:** **unattributable action** — without a trustworthy, complete trace you cannot do incident response, and "the agent did something" becomes unprovable. Often simply *absent*, which is its own finding.


### 1.9 Component provenance (the supply chain)
- **What:** the agent is assembled from parts you didn't write — the framework (LangGraph, CrewAI, AutoGPT-descendants), third-party **MCP servers**, tool registries, model weights, and prompt templates, often resolved at *runtime*.
- **Trust boundary:** between *your* code and every third-party component you pull into the agent's authority.
- **Fails as:** **agentic supply chain compromise** — a poisoned MCP server, a backdoored tool, or a malicious framework update runs with the agent's full privilege. This is the one boundary that sits *outside* the request flow, and it's easy to forget because it looks like "just a dependency."

---

## 2. The cross-cutting question: identity & authority

Threaded through every component is one question appsec already knows how to ask: **whose privileges does the agent act with?**

An agent usually acts with a *single, static, broad* identity (one service account, one API key, one OAuth token) regardless of *which user* asked or *which task* it's doing. That means the blast radius of any injection is the agent's *entire* authority, not the requesting user's. The fix is old — least privilege, per-request scoping, short-lived credentials — but agent frameworks rarely make it the default. **Over-privileged identity turns a small injection into a large incident.**

---

## 3. The map

```
                      DEVELOPER GOAL / INSTRUCTIONS  (the policy — unenforced)
                                     │
   untrusted world ─────────────────┼──────────────────────────── real world
                                     ▼
   user msg ───┐              ┌────────────────┐            ┌── file / shell / http
   RAG doc  ───┼──[intake]──▶ │  CONTEXT WINDOW │ ──[tools]─▶│── database / email
   api resp ───┤   (perimeter)│  no privilege   │  (hands)   └── money / other systems
   tool out ───┤              │  separation     │
   peer agent ─┘              └───────┬─────────┘
        ▲                             │  ▲
        │                    [orchestration loop]  ── autonomy / human gate
        │                             │  │
   long-term MEMORY  ◀────write───────┘  └───read──  long-term MEMORY  (poisoning, persistence)
        │
        └── multi-agent mesh (A2A)  ── transitive trust / confused deputy

   every ─── crossing into the context window is a place where
   untrusted data gains the authority of trusted instruction.
```

---

## 4. Mapping the anatomy to the OWASP Agentic Top 10 (ASI01–ASI10, 2026)

OWASP's *Top 10 for Agentic Applications (2026)* is the current benchmark. Every item maps cleanly onto a component boundary above — which is the point: the threats aren't exotic, they're each a named failure of one trust boundary in the anatomy.

| Component / boundary | OWASP Agentic 2026 |
|---|---|
| Instructions + reasoning (goal vs injected content) | **ASI01** Agent Goal Hijack |
| Perception / intake (trusted vs untrusted) | *entry vector for ASI01 & ASI06* |
| Model / reasoning core (flat context) | *root cause underlying ASI01, ASI05* |
| Tools / actions (intent vs system) | **ASI02** Tool Misuse & Exploitation · **ASI05** Unexpected Code Execution (RCE) |
| Identity (authority vs task need) | **ASI03** Identity & Privilege Abuse |
| Component provenance (yours vs third-party) | **ASI04** Agentic Supply Chain Vulnerabilities |
| Memory (this-turn vs persisted; tenant vs tenant) | **ASI06** Memory & Context Poisoning |
| Multi-agent mesh (agent vs agent) | **ASI07** Insecure Inter-Agent Communication · **ASI10** Rogue Agents |
| Orchestration loop (autonomous vs gated) | **ASI08** Cascading Failures · **ASI09** Human-Agent Trust Exploitation |
| Observability (action vs record) | *supports response across all; its absence enables repudiation* |

All ten land on a boundary the anatomy already named. OWASP also frames the whole thing across the **Agentic Development Lifecycle (ADLC)** — dev environment → runtime → governance — a reminder that ASI04 (supply chain) and identity live as much in *how the agent is built and deployed* as in *what it reads at runtime*.
---

## 5. The one-sentence takeaway (seed for the post)

> An AI agent is a model in a loop with memory, tools, and authority — and its
> defining flaw is that everything it reads shares one flat trust level, so any
> component that ingests untrusted data can rewrite what the whole system does.

Everything in the RAG → MCP → A2A post is a *specific traversal* of this anatomy.
This study is the map; that post walks one path across it.

---

## Sources
- **OWASP Gen AI Security Project — Agentic Security Initiative (ASI).** https://genai.owasp.org/initiatives/agentic-security-initiative/ — parent body; publishes the agentic guides below.
- **OWASP Top 10 for Agentic Applications (2026)** — ASI01–ASI10, the taxonomy used in §4. https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- OWASP ASI — *Agentic AI: Threats & Mitigations*; *State of Agentic AI Security & Governance*; *Secure MCP Server Development* guide + third-party-MCP cheat sheet. https://genai.owasp.org/
- Glean — 7 Core Components of an AI Agent Architecture. https://www.glean.com/blog/7-core-components-of-an-ai-agent-architecture-explained
- Simon Willison — the lethal trifecta (private data + untrusted content + external communication).
- Anthropic — Building Effective Agents (agent = model + tools + loop).
