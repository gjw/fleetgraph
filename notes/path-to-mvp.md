# Path to MVP

**Deadline:** Tuesday 2026-03-18, 11:59 PM (target: 8 hours from now)

---

## Current State

**What works:**

- Graph runs end-to-end: fetch → GPT-4o reasoning → GPT-4o-mini classify → conditional routing → persist
- 4 LangSmith traces captured (Clean + Action Propose branches)
- FLEETGRAPH.md has Test Cases section with 5 test cases and 4 trace URLs
- Real Ship data seeded (`pnpm db:seed:fg`)
- 7 fleetgraph_finding documents persisted to Ship database
- Scoped fetching, context resolution, persist with FK validation

**What doesn't work yet:**

- No proactive trigger (timer or WebSocket) — graph only runs via manual invocation
- No chat endpoint — no Express server for on-demand requests
- No HITL decide endpoint — findings persist but humans can't confirm/dismiss
- Not deployed — no public URL
- FLEETGRAPH.md missing 4 required sections (Agent Responsibility, Use Cases, Graph Diagram, Trigger Model)

**What works but not as designed (fg-3kh, NOT MVP-blocking):**

- Scenario-specific detections (scope_creep, accountability_debt, blocked_chain, retro_patterns) miss because fetch pipeline doesn't provide the right data
- Graph detects stale_triage and overloaded_member instead — these are real, valid detections
- Notify classify branch not yet exercised (only Clean and Action Propose)

---

## MVP Rubric Checklist

| # | Requirement | Status | What closes it |
|---|-------------|--------|---------------|
| 1 | Graph running with 1+ proactive detection end-to-end | **BLOCKED** | `fg-3up` — timer that auto-invokes graph. Detection already works (stale_triage). |
| 2 | LangSmith tracing, 2+ traces, different paths | **DONE** | 4 traces, Clean + Action Propose branches. URLs in FLEETGRAPH.md. |
| 3 | FLEETGRAPH.md: Agent Responsibility + Use Cases (5+) | **BLOCKED** | `fg-1ub` — writing task, pull from PRESEARCH.md + ARCHITECTURE.md |
| 4 | FLEETGRAPH.md: Graph outline (nodes, edges, branching) | **BLOCKED** | `fg-1ub` — same bead, Mermaid diagram from ARCHITECTURE.md |
| 5 | 1+ Human-in-the-loop gate | **BLOCKED** | `fg-3ml` — decide endpoint + human-gate node |
| 6 | Running against real Ship data | **DONE** | Seed data + real API calls verified in traces |
| 7 | Deployed and publicly accessible | **BLOCKED** | `fg-2pi` — build, scp, pm2 on Linode |
| 8 | Trigger model documented in FLEETGRAPH.md | **BLOCKED** | `fg-1ub` — same bead |

**4 of 8 requirements are met. 4 need work.**

---

## Critical Path

```
NOW ──────────────────────────────────────────────── 8 hrs ──→ SUBMIT
│                                                              │
├─ TRACK A (Trench, code) ─────────────────────────────────────┤
│  fg-3up + fg-tlj + fg-3ml  (~3-4 hrs combined)               │
│  ↓                                                           │
│  fg-2pi  deploy to Linode  (~1-2 hrs)                        │
│  ↓                                                           │
│  Verify: health endpoint, proactive timer fires, trace shows │
│                                                              │
├─ TRACK B (Herald, writing) ──────────────────────────────────┤
│  fg-1ub  FLEETGRAPH.md sections  (~2-3 hrs)                  │
│  ↓                                                           │
│  Add deployed URL to FLEETGRAPH.md                           │
│                                                              │
├─ BUFFER ─────────────────────────────────────────────────────┤
│  ~2-3 hrs for debugging, deploy issues, doc polish           │
└──────────────────────────────────────────────────────────────┘
```

**Track A and Track B are fully independent.** No shared dependencies.
Launch both simultaneously.

---

## Track A: Code (Trench)

### Phase 1: Service endpoints (fg-3up + fg-tlj + fg-3ml)

These three beads touch different files and can be done in a single Trench session:

| Bead | What | Files | Time est |
|------|------|-------|----------|
| `fg-3up` | `setInterval` → `graph.invoke({mode: 'proactive'})` every 5 min | `src/index.ts` or `src/trigger/poller.ts` | Small |
| `fg-tlj` | Express POST `/api/fleetgraph/chat` → `graph.invoke({mode: 'on_demand'})` | `src/api/server.ts`, `src/api/routes/chat.ts` | Medium |
| `fg-3ml` | `human-gate.ts` node (creates finding, returns ID) + POST `/api/fleetgraph/findings/:id/decide` | `src/graph/nodes/human-gate.ts`, `src/api/routes/findings.ts` | Medium |

**Combined:** One Express server that starts on `pnpm start`:

- GET `/api/fleetgraph/health` → ok
- POST `/api/fleetgraph/chat` → invoke graph on-demand
- POST `/api/fleetgraph/findings/:id/decide` → confirm/dismiss
- On startup: `setInterval` fires proactive scans every 5 minutes

**Entry point** (`src/index.ts`): start Express server + start proactive timer.

**Acceptance:** `pnpm start` runs, health endpoint responds, proactive timer fires
within 5 minutes and produces a LangSmith trace.

### Phase 2: Deploy (fg-2pi)

After Phase 1 works locally:

1. `pnpm --filter fleetgraph build`
2. scp to Linode VPS
3. Configure pm2 with env vars:
   - `OPENAI_API_KEY`
   - `LANGCHAIN_API_KEY`, `LANGCHAIN_TRACING_V2=true`, `LANGCHAIN_PROJECT=fleetgraph`
   - `SHIP_API_URL` (production Ship URL)
   - `SHIP_SERVICE_TOKEN` (from create-fg-token.ts)
   - `PORT` (whatever's available)
4. `pm2 start dist/index.js --name fleetgraph`
5. Verify: health endpoint from public URL, first proactive trace appears

---

## Track B: Writing (Herald)

### fg-1ub: FLEETGRAPH.md sections

Add these sections ABOVE the existing Test Cases section:

**1. Agent Responsibility** — Pull from PRESEARCH.md §1:

- What it monitors proactively (5 domains)
- What it reasons about on-demand (context-scoped analysis)
- What it does autonomously (read, compute, persist findings)
- What needs human approval (any Ship mutation)
- Who gets notified (ownership routing table)

**2. Use Cases** — Pull from PRESEARCH.md §2:

- All 7 use cases in table format (role, trigger, detection, human decides)
- Brief narrative per use case

**3. Graph Diagram** — Pull from ARCHITECTURE.md §4:

- Mermaid version of the ASCII node diagram
- Node inventory table
- Conditional edge table

**4. Trigger Model** — Pull from PRESEARCH.md §3:

- Hybrid WebSocket + poll decision
- Why not pure poll, why not pure WebSocket, why not webhooks
- Detection latency analysis

**Sources are all written.** This is assembly + formatting, not original writing.

---

## What Is NOT on the MVP Path

These are deferred — do not touch until after MVP submission:

| Bead | Why deferred |
|------|-------------|
| `fg-3kh` | Scenario-specific detections. Graph already detects stale_triage — good enough for MVP rubric. Fix for Early Submission. |
| `bd-3ql` | Full WebSocket + debounce trigger. fg-3up (timer) satisfies MVP. |
| `bd-1lu` | Full chat endpoint with session forwarding. fg-tlj (minimal) satisfies MVP. |
| `bd-196` | Full Human Gate with snooze + checkpoint. fg-3ml (minimal) satisfies MVP. |
| `bd-5b2` | Ship UI integration. MVP doesn't require UI — just the backend. |
| `fg-1wr` | Login re-validation. Post-MVP feature. |
| `bd-1mb` | Full FLEETGRAPH.md with test cases + arch decisions. fg-1ub covers MVP sections. |
| `bd-i42` | Full 7-scenario test cases. Already have 5 test cases with 4 traces — MVP done. |

---

## If Time Runs Out

**Cut order (last resort):**

1. Drop deployment polish — if it's running on Linode with health endpoint, ship it
2. FLEETGRAPH.md Graph Diagram can be the ASCII version from ARCHITECTURE.md, not Mermaid
3. The proactive timer can be 1-minute interval for demo purposes (change to 5min later)
4. The decide endpoint can be POST-only with no GET listings

**Do NOT cut:**

- The 4 FLEETGRAPH.md sections — these are literally on the rubric checklist
- The proactive trigger — "at least one proactive detection" is a rubric checkbox
- The HITL gate — "at least one human-in-the-loop gate" is a rubric checkbox
- Deployment — "deployed and publicly accessible" is a rubric checkbox

---

## Launch Order

1. **NOW:** Launch Trench on fg-3up + fg-tlj + fg-3ml (single session, all three)
2. **NOW:** Launch Herald on fg-1ub (FLEETGRAPH.md writing)
3. **After Phase 1:** Launch Trench on fg-2pi (deploy)
4. **After deploy:** Verify proactive trace appears, add deployed URL to FLEETGRAPH.md
5. **Submit**
