# FleetGraph MVP Demo — Video Script

**Target length:** 3-4 minutes
**Format:** Screen recording with voiceover
**Tone:** Sardonic technical. Honest about what works. No hype.

---

## Pre-Recording Setup

1. Fresh seed data: `pnpm db:seed && pnpm db:seed:fg`
2. FleetGraph running on Linode (verify: `curl https://fleetgraph.foramerica.dev/api/fleetgraph/health`)
3. Wait for the 5-minute poller to fire (or trigger manually: `npx tsx fleetgraph/src/graph/run-scenarios.ts proactive`)
4. Export the token for curl commands:
   ```bash
   export SHIP_API_TOKEN="<token from fleetgraph/.env>"
   ```
5. Grab a finding ID for the HITL demo:
   ```bash
   curl -s 'https://ship.foramerica.dev/api/documents?document_type=fleetgraph_finding' \
     -H "Authorization: Bearer $SHIP_API_TOKEN" \
     | jq '[.[] | select(.properties.human_decision == null)] | .[0].id'
   ```
6. Have the proactive LangSmith trace open in a browser tab
7. Have FLEETGRAPH.md open in an editor for scroll-through
8. Terminal ready with the curl commands below pre-typed

---

## Script

### 1. Cold Open (15 seconds)

> "Ship shows you what's happening. FleetGraph tells you what's wrong."
>
> "It's a project intelligence agent — a LangGraph state graph that monitors
> Ship proactively and reasons on demand. Two modes, same graph, every run
> traced in LangSmith."

**Screen:** FLEETGRAPH.md title or the graph diagram.

---

### 2. It's Deployed (15 seconds)

> "FleetGraph runs on its own server, separate from Ship. Let me prove it's
> real."

```bash
curl -s https://fleetgraph.foramerica.dev/api/fleetgraph/health | jq
```

---

### 3. Proactive Detection (60 seconds)

> "The agent runs without anyone asking. Every five minutes it polls Ship,
> runs the graph, and looks for problems."
>
> "Here's what a proactive scan looks like."

**Action:** Switch to the LangSmith trace tab. Walk through the nodes
visually — don't narrate each one, just let the graph structure speak.

> "It found four issues. These are real findings from real seeded data — no
> mocked responses."

---

### 4. On-Demand Chat (45 seconds)

> "The other mode: a user asks a question from inside Ship. The chat knows
> what they're looking at."

```bash
curl -s -X POST https://fleetgraph.foramerica.dev/api/fleetgraph/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What should I work on next?", "documentType": "issue"}' | jq
```

> "Same graph, different entry point. The context node scopes the analysis
> to the document the user is viewing."

---

### 5. Human-in-the-Loop Gate (45 seconds)

> "FleetGraph *reads* autonomously, but it never writes to Ship without asking."

First, show a finding with a pending decision:

```bash
curl -s 'https://ship.foramerica.dev/api/documents?document_type=fleetgraph_finding' \
  -H "Authorization: Bearer $SHIP_API_TOKEN" \
  | jq '[.[] | select(.properties.human_decision == null)] | .[0] | {id, title, finding_type: .properties.finding_type, human_decision: .properties.human_decision}'
```

Point out `human_decision: null` in the output.

> "This finding proposes an action. The graph paused here — it wrote the
> finding, surfaced it, and waited."

Dismiss it (paste the finding ID from setup):

```bash
curl -s -X POST https://fleetgraph.foramerica.dev/api/fleetgraph/findings/FINDING_ID/decide \
  -H "Content-Type: application/json" \
  -d '{"decision": "dismiss"}' | jq
```

> "I dismissed it. The finding stays in the record for audit, but the agent
> won't execute the action. If I'd confirmed, it would have made the change
> through Ship's API."

---

### 6. Two Traces, Two Paths (30 seconds)

> "Every graph run is traced in LangSmith. Here are two runs that took
> different paths."

**Action:** Switch between two LangSmith trace tabs:

- **Trace 1 (proactive):** Trigger → Fetch → Reasoning → Classify → **Action Propose** → Persist
- **Trace 2 (on-demand):** Trigger → Context → Fetch → Reasoning → Classify → **Clean**

> "Same graph, different conditions, different branches. That's the point of
> a graph — not a pipeline."

*Skip this section if the on-demand trace from step 4 hasn't appeared in
LangSmith yet. The proactive trace alone shows the full graph structure.*

---

### 7. Documentation Flash (30 seconds)

> "Everything is documented in FLEETGRAPH.md."

**Action:** Quick scroll through, pausing briefly on:

- **Agent Responsibility** — what it monitors, autonomy boundaries
- **Use Cases** — table with all 7
- **Graph Architecture** — ASCII diagram, node inventory, conditional edges
- **Trigger Model** — hybrid WebSocket + poll, tradeoff defense

> "Agent responsibility, seven use cases, full graph outline with branching
> conditions, and a defended trigger model."

---

### 8. Close (15 seconds)

> "FleetGraph is MVP. The graph runs, the detections work, the traces prove
> it. The architecture is sound and every piece is wired end-to-end."

---

## Pre-Recording Checklist

- [ ] Database seeded fresh
- [ ] FleetGraph service running on Linode, health endpoint responding
- [ ] At least one proactive scan has fired (check LangSmith for trace)
- [ ] `SHIP_API_TOKEN` exported in terminal
- [ ] Finding ID noted for HITL demo (run the query from setup step 5)
- [ ] LangSmith trace(s) open in browser tabs
- [ ] FLEETGRAPH.md open in editor
- [ ] Curl commands pre-typed in terminal (steps 2, 4, 5)
