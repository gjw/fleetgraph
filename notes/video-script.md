# FleetGraph MVP Demo — Video Script

**Target length:** 3-4 minutes
**Format:** Screen recording with voiceover
**Tone:** Sardonic technical. Honest about what works. No hype.

---

## Pre-Recording Setup

1. Fresh seed data: `pnpm db:seed && pnpm db:seed:fg`
2. FleetGraph running on Linode (verify: `curl https://fleetgraph.foramerica.dev/api/fleetgraph/health`)
3. Run proactive scan to generate findings: `npx tsx fleetgraph/src/graph/run-scenarios.ts proactive`
4. Confirm at least one finding exists with `status: 'pending_decision'` for the HITL demo
5. Have both LangSmith trace URLs ready in browser tabs:
   - Action Propose: https://smith.langchain.com/public/4e8ea445-ff89-4bcb-a651-f1aa6ea65a40/r
   - Clean: https://smith.langchain.com/public/d01ec045-280f-425b-a2f6-fab4191fba5e/r

---

## Script

### 1. Cold Open (15 seconds)

> "Ship shows you what's happening. FleetGraph tells you what's wrong."
>
> "It's a project intelligence agent — a LangGraph state graph that monitors
> Ship proactively and reasons on demand. Two modes, same graph, every run
> traced in LangSmith."

**Screen:** FLEETGRAPH.md title + one-liner, or the graph diagram.

---

### 2. It's Deployed (15 seconds)

> "FleetGraph runs on its own server, separate from Ship. Let me prove it's
> real."

**Action:**

```bash
curl -s https://fleetgraph.foramerica.dev/api/fleetgraph/health | jq
```

Show `{ "status": "ok" }`.

**Bullet satisfied:** #7 (deployed and publicly accessible)

---

### 3. Proactive Detection (60 seconds)

> "The agent runs without anyone asking. It connects to Ship's WebSocket,
> watches for events, and runs the graph when something changes. There's a
> 5-minute poll as a safety net."
>
> "Here's what a proactive scan looks like."

**Action:** Show the proactive trace already open in LangSmith. Walk through
the nodes visually — don't narrate each one, just let the graph structure
speak for itself.

> "It found four issues. These are real findings from real seeded data — no
> mocked responses."

**Bullets satisfied:** #1 (proactive end-to-end), #6 (real Ship data)

---

### 4. On-Demand Chat (45 seconds)

> "The other mode: a user asks a question from inside Ship. The chat knows
> what they're looking at."

**Action:**

```bash
curl -s -X POST https://fleetgraph.foramerica.dev/api/fleetgraph/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What should I work on next?", "documentType": "issue"}' | jq
```

Show the request and response. The agent reasons about the user's workload
and produces a recommendation.

> "Same graph, different entry point. The context node scopes everything to
> what this user can see."

**Bullet reinforced:** #6 (real data), different execution path visible

---

### 5. Human-in-the-Loop Gate (45 seconds)

> "FleetGraph *reads* autonomously, but it never writes to Ship without asking."

**Action:** Find a finding with a pending decision:

```bash
# Query Ship for fleetgraph_finding documents with pending decisions
curl -s 'https://ship.foramerica.dev/api/documents?document_type=fleetgraph_finding' \
  -H "Cookie: <SESSION_COOKIE>" | jq '.[] | select(.properties.human_decision == null) | {id, title, properties}'
```

Pick one. Point out `human_decision: null` in the finding.

> "This finding proposes reassigning work. The graph paused here — it wrote
> the finding, surfaced it, and waited."

**Action:** Dismiss it:

```bash
curl -s -X POST https://fleetgraph.foramerica.dev/api/fleetgraph/findings/<FINDING_ID>/decide \
  -H "Content-Type: application/json" \
  -d '{"decision": "dismiss"}' | jq
```

Response: `{ "status": "dismissed", "findingId": "<id>" }`.

> "I dismissed it. The finding stays in the record for audit, but the agent
> won't execute the action. If I'd confirmed, it would have made the change
> through Ship's API."

**Bullet satisfied:** #5 (HITL gate implemented)

---

### 6. Two Traces, Two Paths (30 seconds)

> "Every graph run is traced in LangSmith. Here are two runs that took
> different paths."

**Action:** Open both LangSmith traces side by side (or switch between tabs):

- **Trace 1 (proactive):** Trigger → Fetch → Reasoning → Classify → **Action Propose** → Persist
- **Trace 2 (on-demand):** Trigger → Context → Fetch → Reasoning → Classify → **Clean**

> "Same graph, different conditions, different branches. That's the point of
> a graph — not a pipeline."

**Bullet satisfied:** #2 (two traces, different paths)

---

### 7. Documentation Flash (30 seconds)

> "Everything is documented in FLEETGRAPH.md."

**Action:** Quick scroll through the document, pausing briefly on:

- **Agent Responsibility** — what it monitors, autonomy boundaries, notification model
- **Use Cases** — table with all 7 (point out "at least 5 required, we defined 7")
- **Graph Architecture** — the ASCII diagram, node inventory, conditional edges
- **Trigger Model** — hybrid WebSocket + poll, with the tradeoff defense

> "Agent responsibility, seven use cases, full graph outline with branching
> conditions, and a defended trigger model."

**Bullets satisfied:** #3 (agent responsibility + use cases), #4 (graph outline),
#8 (trigger model)

---

### 8. Close (15 seconds)

> "FleetGraph is MVP. The graph runs, the detections work, the traces prove
> it. The reasoning isn't perfectly tuned for every scenario yet — scope creep
> detection gets outcompeted by triage signals, dependency chains need richer
> data in the fetch pipeline. But the architecture is sound and every piece
> is wired end-to-end."

**Screen:** Graph diagram or health endpoint response.

---

## Total Runtime

| Segment | Duration |
|---|---|
| Cold open | 15s |
| Deployed | 15s |
| Proactive detection | 60s |
| On-demand chat | 45s |
| HITL gate | 45s |
| Two traces | 30s |
| Documentation flash | 30s |
| Close | 15s |
| **Total** | **~4:15** |

## Pre-Recording Checklist

- [ ] Database seeded fresh
- [ ] FleetGraph service running on Linode
- [ ] Health endpoint responding
- [ ] At least one finding with `pending_decision` status
- [ ] Both LangSmith trace URLs loaded in browser tabs
- [ ] FLEETGRAPH.md open in editor for scroll-through
- [ ] Terminal ready for curl commands
