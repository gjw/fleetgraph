# Early Submission Test Plan — Friday 2026-03-20

**Goal:** Capture fresh LangSmith traces and update FLEETGRAPH.md with Test Cases
and Architecture Decisions sections. Due 11:59 PM tonight.

---

## Deliverables Checklist

- [ ] **Test Cases section in FLEETGRAPH.md** — fresh traces, current behavior
- [ ] **Architecture Decisions section in FLEETGRAPH.md** — new section, doesn't exist yet
- [ ] **Fresh deploy with latest code** (fg-39o acknowledge/snooze/approve if done)
- [ ] **No video required** — PRD doesn't mention video for any submission

---

## Prerequisites

### 1. Deploy latest code

If fg-39o (acknowledge/snooze/approve) is done, deploy it. Otherwise deploy
what's merged. Use `--fresh` if the DB hasn't been wiped since the last round
of fixes:

```bash
ssh root@agentforge
export PATH=/root/.nodenv/shims:/root/.nodenv/bin:$PATH
cd ~/fleetgraph
./scripts/deploy-linode.sh --fresh
```

### 2. Wait for first proactive scan (~5 min)

Check findings populated:

```bash
docker exec fleetgraph-postgres-1 psql -U ship -d ship_dev -c "
SELECT count(*) as total,
  count(DISTINCT (properties->>'finding_type', properties->>'affected_entity_id')) as unique
FROM documents WHERE document_type = 'fleetgraph_finding';"
```

### 3. Verify dedup (wait for second scan, ~10 min total)

total should equal unique after both scans. May grow slightly (new conditions
found on second pass) but no duplicates.

---

## Test Cases to Capture

The PRD requires: Ship state, expected output, LangSmith trace link.
The grader verifies "your agent does what you said it would do."

**Strategy:** Be honest about what works. Don't claim detections that are flaky.
The current system reliably detects: stale triage, overloaded members, missing
estimates, velocity drops, blocked sprints, accountability debt. Scope creep
and retro mining are weaker (fg-3kh improvements may help).

### TC-1: Proactive Workspace Scan (captures multiple detections)

**How:** Wait for 5-min poller or restart FleetGraph.

**Ship state:** FleetGraph Demo program with seeded scenario data:
- 6 issues in triage for 5-7 days (S2 seed data)
- David Kim assigned 29 active issues across programs
- Active Week 14 sprints with issues missing estimates
- Sprint velocity declining across weeks 12-14

**Expected output:** Rolled-up findings:
- Stale triage backlog (one finding, not per-issue)
- Overloaded member (David Kim)
- Missing estimates in active weeks
- Sprint velocity drop

**Trace:** [capture from LangSmith after first proactive scan]

**What to verify in trace:** Fetch nodes run in parallel. Reasoning node
produces rolled-up findings. Classify routes to action_propose. Findings
persist as documents. Dedup prevents duplicates on next scan.

### TC-2: On-Demand — Smart Next Action (UC6)

**How:** Open FleetGraph chat on any document. Ask "What should I work on next?"
Must be logged in as a user with assigned issues (dev@ship.local or iris.nguyen).

**Ship state:** User has multiple assigned issues across priorities, some in
progress, some blocked, one with a due date.

**Expected output:** Prioritized recommendation — finish in-progress work first,
flag blocked issues, mention due dates. NOT a raw dump of all issues.

**Trace:** [capture from LangSmith]

**What to verify in trace:** Context node resolves userId. Fetch-issues scopes
to user's issues (not all 228). Reasoning prompt includes user's question.
Response is conversational, not a data dump.

### TC-3: On-Demand — Project/Sprint Analysis (UC1/UC5)

**How:** Navigate to a Week 14 sprint or the FleetGraph Demo program page.
Open chat. Ask "How is this sprint going?" or "What's the risk here?"

**Ship state:** Week 14 has scope creep (4 post-start issues), blocked issues,
velocity drop from prior weeks.

**Expected output:** Analysis scoped to the sprint/program — scope change
quantified, blocked issues identified, velocity trend noted.

**Trace:** [capture from LangSmith]

**What to verify in trace:** Context node scopes to the document being viewed.
Fetch is scoped (not full workspace). Different execution path from TC-1
(on-demand vs proactive).

### TC-4: On-Demand — Off-Topic Deflection (Regression)

**How:** Open chat on any document. Ask "Do you like spaghetti?"

**Ship state:** Irrelevant — testing that the agent handles non-project queries.

**Expected output:** Empty findings or polite deflection. NOT 30 issues dumped.

**Trace:** [capture — should show Clean path, minimal tokens]

**What to verify in trace:** Classify returns clean. No findings produced.
Fast execution (< 5s). Minimal token usage.

### TC-5: HITL Gate — Acknowledge/Snooze Flow

**How:** From findings inbox, click Acknowledge on a finding. Verify badge
clears. Wait for next proactive scan — verify finding updates in place
without re-badging (same severity).

If fg-39o is deployed: also test Snooze (tomorrow default). Verify finding
disappears from active view.

**Ship state:** Active findings from TC-1.

**Expected output:** Acknowledged findings stay alive but don't re-badge.
Snoozed findings disappear until snooze expires.

**Trace:** No LangSmith trace needed — this is a UI/API interaction, not a
graph run. But the NEXT proactive scan's trace should show dedup skipping
the acknowledged finding.

---

## Architecture Decisions Section

Write this in FLEETGRAPH.md. Content to include (you already have all of this
from Tower discussions):

### 1. Framework: LangGraph.js
- TypeScript for unified monorepo types
- Native LangSmith tracing without manual instrumentation
- Conditional branching, parallel node execution, typed state

### 2. Node Design
- Parallel fetch nodes (issues, sprints, team) — not sequential
- Error isolation: individual node failures don't crash the graph
- Conditional edges from classify node: clean/notify/action_propose

### 3. Dual Auth Model
- Proactive mode: service account API token (Bearer auth)
- On-demand mode: forwarded user session cookie
- Why: on-demand must respect per-user document visibility (Ship applies
  visibility filtering). Service account in on-demand path = data leakage
  vector. In a federal tool, private documents may contain pre-decisional
  material under deliberative process privilege.

### 4. Findings as Documents
- FleetGraph output stored in Ship's unified document model
- No shadow databases — findings are visible, searchable, commentable
- Dedup by (finding_type, affected_entity_id) — update in place, re-badge
  only on severity escalation

### 5. Human Decision Model
- Acknowledge / Snooze / Approve — no permanent dismiss
- Why no dismiss: in a government PM tool, permanent suppression of findings
  is an audit liability. The system keeps watching. If the condition worsens,
  it escalates.

### 6. Cadenced Scan Architecture (designed, not yet implemented)
- The cadence analysis: hot (scope creep, blocked chains), daily (triage,
  accountability), weekly (retro patterns)
- Why uniform 5-min polling is wrong for most use cases
- Cost and responsiveness comparison
- This is documented as the production-ready design; MVP uses uniform polling

### 7. Deployment
- Linode VPS via pm2, separate from Ship's AWS Elastic Beanstalk
- Ship proxies FleetGraph requests, forwarding session auth
- Why separate: FleetGraph has different scaling characteristics, doesn't
  need EB's auto-scaling, and shouldn't be coupled to Ship's deploy cycle

---

## Workflow

1. **Deploy** (if needed) — ensure latest code is running
2. **Wait for proactive scan** — capture TC-1 trace
3. **Run on-demand tests** — TC-2, TC-3, TC-4 via Ship UI chat
4. **Test HITL flow** — TC-5 via findings inbox
5. **Make all traces public** in LangSmith (share link)
6. **Update FLEETGRAPH.md Test Cases** — replace stale TC-1 through TC-5 with
   fresh results and trace links
7. **Write Architecture Decisions** — new section in FLEETGRAPH.md
8. **Commit and push** — before 11:59 PM
