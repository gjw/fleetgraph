# Demo Scenarios — Master Catalog

Every demo scenario defines: Ship state to seed, what FleetGraph detects, expected
graph path, and the demo narrative. This document is the source of truth for test data
seeding, LangSmith trace capture, and the demo video.

**Tiering:**

- **Tier 1** (5 scenarios) — rubric minimum, must ship by Early Submission (Friday)
- **Tier 2** (2 scenarios) — full 7, ship if Tier 1 is solid
- **Tier 3** — extensions to existing scenarios, time permitting

**Recipient model:** See `docs/architecture-who-needs-to-know.md`. Findings have
two tiers: **Direct** (`recipient_ids: string[]` in properties — badge + ding) and
**Ambient** (linked to affected entity via `document_associations` — visible on entity
pages, no badge). Reasoning node must produce **one finding per condition per entity**
(rollup), not one per item. Individual items cited in narrative text.

---

## Tier 1 Scenarios

### S1: Sprint Scope Creep (UC1)

**Mode:** Proactive | **Role:** PM | **Graph path:** Trigger → Fetch → Reasoning → Classify → Notify → Persist

**Ship state to seed:**

- Sprint (week) with `start_date` ~7 days ago, `end_date` ~7 days from now
- 8 issues created before `start_date`, associated to sprint
- 4 issues added after `start_date` (different `created_at` timestamps)
- At least 2 of the added issues should be by the same person (for actor-aware stretch)
- One of the added issues should be P2 or lower (unnecessary scope)

**Expected detection (ONE rollup finding, not 4):**

- Scope increased ~50% (4 of 12 issues added post-start)
- Names who added what and when
- Quantifies impact: "4 of your original 8 items are still in_progress"
- **Direct recipients:** `[sprint_owner_id]` — sprint owner gets badge
- **Ambient:** finding linked to sprint doc — visible on sprint page

**Stretch — actor-aware:**

- "Maria added 3 of the 4 post-start issues. She also added 2 issues mid-sprint
  last sprint. Those additions correlated with 2 missed commitments."

**Demo narrative:**

"Watch what happens when someone adds issues to a sprint that's already running.
FleetGraph detects scope creep in real time, quantifies it, and tells the PM exactly
what changed and who changed it."

---

### S3: Accountability Debt Roll-up (UC3)

**Mode:** Proactive | **Role:** Director | **Graph path:** Trigger → Fetch → Reasoning → Classify → Notify → Persist

**Ship state to seed:**

- 4-5 team members (person documents with `user_id`, `role`, `reports_to`)
- Person A: missing standups for 3 consecutive days
- Person B: submitted plans on time for 4 sprints but skipped retros for last 3
- Person C: has a pending approval request (`changes_requested`) with no follow-up for 4 days
- Person D: fully compliant (control — agent should NOT flag this person)
- Multiple sprints with plan/retro documents to establish the pattern

**Expected detection (ONE rollup finding per person, 3 total):**

- Person A finding: standup compliance dropping → **direct:** `[person_a_id]`
- Person B finding: selective debt — plans yes, retros no → **direct:** `[person_b_id]`
- Person C finding: approval bottleneck → **direct:** `[person_c_id, approver_id]`
- Person D: fully compliant — NO finding (agent stays quiet)
- **Ambient:** each finding linked to the respective person doc

**Stretch — actor-aware:**

- "Person B has skipped retros since joining the Platform team 3 sprints ago.
  Plans remain on time — this is selective, not general disengagement."

**Demo narrative:**

"The director logs in and FleetGraph has already scanned the organization. It doesn't
just list what's missing — it notices patterns. One person skips retros but does
everything else. That's not laziness, that's a signal something changed."

---

### S4: Blocked Work Chain (UC4)

**Mode:** On-demand | **Role:** Engineer | **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Action Propose → Human Gate → (confirm) → Execute → Persist

**Ship state to seed:**

- Issue A: `in_progress`, assigned to Engineer1, depends on Issue B
- Issue B: `in_review`, assigned to Engineer2, depends on Issue C
- Issue C: `in_review` for 5+ days, reviewer (Engineer3) has 6 other items `in_review`
- Issue D and E: also `in_review`, assigned to Engineer3 (establishes queue depth)
- 2 additional issues downstream of Issue A (to show blast radius)

**Expected detection (ONE finding for the chain, not per link):**

- Traces full chain: A ← B ← C, all stuck
- Identifies bottleneck: Engineer3's review queue (7 items)
- Quantifies blast radius: "This chain blocks 3 downstream issues"
- Proposes action: reassign Issue C's review to someone with capacity
- **Direct recipients:** `[engineer1_id, engineer3_id]` — blocked person + bottleneck owner
- **Ambient:** finding linked to Issue A (the user's entry point)

**Stretch — proactive version:**

- Same detection fires proactively before Engineer1 asks, because the agent
  notices the chain forming during a routine scan

**Demo narrative:**

"An engineer is stuck. They open their issue and ask FleetGraph 'what's blocking this?'
The agent traces the entire dependency chain, finds the bottleneck — a reviewer with
7 items in their queue — and proposes reassigning the review. The engineer confirms,
and the agent makes the change through Ship's API."

**This is the HITL demo.** The confirm/dismiss flow happens here.

---

### S6: Smart Next Action (UC6)

**Mode:** On-demand | **Role:** Engineer | **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Clean (or Notify) → Persist

**Ship state to seed:**

- Engineer with 5 assigned issues across current sprint:
  - Issue X: `in_progress`, recent activity (updated today), nearly done
  - Issue Y: `open`, high priority (P0), unblocks 2 downstream issues
  - Issue Z: `open`, medium priority, but BLOCKED (depends on unresolved issue)
  - Issue W: `open`, low priority (P3), no dependencies
  - Issue V: `open`, medium priority, `due_date` in 2 days
- Sprint context with priorities set

**Expected detection (on-demand response, may not produce a persisted finding):**

- "Finish Issue X first — you're close and it's in progress"
- "Then start Issue Y — it's P0 and unblocks 2 team members"
- "Don't start Issue Z yet — it's blocked on [blocker]"
- "Issue V is due in 2 days — slot it after Y"
- "Issue W can wait"
- **Graph path note:** This may take the Clean path (informational response,
  no finding persisted) — which is good, it demonstrates that path in the traces

**Demo narrative:**

"An engineer finishes a task and asks 'what should I work on next?' FleetGraph
doesn't just sort by priority — it considers what's blocked, what unblocks others,
what's due soon, and what you're already close to finishing. It thinks like a
teammate, not a Kanban board."

---

### S7: Retro Pattern Mining (UC7)

**Mode:** On-demand | **Role:** Director/PM | **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Notify → Persist

**Ship state to seed:**

- 4 sprint retro documents with TipTap JSON content:
  - Sprint 10 retro: mentions "deploy process is painful, takes 2 hours"
    - Action item created as an issue: "Automate staging deploys" (Issue R1)
  - Sprint 11 retro: mentions "onboarding docs outdated" (different topic)
  - Sprint 12 retro: mentions "deploy friction again, manual steps caused rollback"
  - Sprint 13 retro: mentions "deploy broke Friday, 3-hour incident"
- Issue R1 (from sprint 10 action item): still in backlog, status `open`, never started
- Program document that groups all these sprints

**Expected detection (ONE finding for the pattern, not per retro):**

- "Deploy friction" appears in 3 of 4 retros (sprints 10, 12, 13)
- Severity escalating: "painful" → "caused rollback" → "3-hour incident"
- Action item from sprint 10 ("Automate staging deploys") is still in backlog
- **Direct recipients:** `[program_owner_id, project_owner_id]`
- **Ambient:** finding linked to program doc

**Stretch — loop closure:**

- "You committed to fixing this 3 sprints ago. Issue R1 was created and has never
  been started. The same problem has now caused a production incident."

**Demo narrative:**

"A director asks 'any patterns in our retros?' FleetGraph reads across all sprint
retros — something humans never do because they only look at one at a time. It finds
a recurring theme, notices it's getting worse, and discovers that the team already
committed to fixing it but never followed through. That's institutional memory."

---

## Tier 2 Scenarios

### S2: Stale Triage Backlog (UC2)

**Mode:** Proactive | **Role:** PM | **Graph path:** Trigger → Fetch → Reasoning → Classify → Notify → Persist

**Ship state to seed:**

- 6 issues in `triage` status, `created_at` 3-5 days ago
- 4 of them are bug reports from an external team (different `created_by`)
- 2 are internal feature requests
- No team member has "triage" in their role description
- Current sprint has capacity (not overloaded)

**Expected detection:**

- "6 issues in triage for 3+ days"
- Groups by source: 4 external bugs, 2 internal requests
- Suggests: accept high-priority items into current sprint, reject or defer low-priority

**Stretch — structural gap:**

- "External bug reports average 4.1 days in triage vs 0.9 days for internal items.
  No one on the team has triage responsibilities defined."

---

### S5: Project Risk Assessment (UC5)

**Mode:** On-demand | **Role:** Director | **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Notify → Persist

**Ship state to seed:**

- Project with 3 completed sprints + 1 active sprint
- Velocity declining: sprint 1 closed 8 issues, sprint 2 closed 6, sprint 3 closed 3
- 4 issues `in_progress` for 5+ days with no state changes
- `owner_id` missing on the project
- No success criteria defined (empty `properties.success_criteria`)
- Project status field: "on_track" (status theater)

**Expected detection:**

- Composite risk score: HIGH
- Velocity declining 62% over 3 sprints
- 4 stale in-progress issues
- Missing ownership and success criteria
- "This project is marked 'on track' but signals suggest otherwise"

---

## Tier 3 Extensions

These are prompt engineering + slightly wider data fetching within existing scenarios.
Not separate scenarios — they make the Tier 1/2 scenarios richer.

| Extension | Applies to | What it adds |
|-----------|-----------|-------------|
| Actor-aware reasoning | S1, S3 | Names the person behind the pattern, tracks repeat behavior |
| Retro loop closure | S7 | Checks if past action items were completed |
| Proactive blocked chains | S4 | Same detection, proactive trigger instead of on-demand |
| Engagement signals | S3, S5 | Activity trends as supporting evidence for findings |
| Login re-validation | All proactive | Stale findings auto-resolve before user sees them |

---

## Test Data Seeding

**Seed script:** `api/src/db/seed-fleetgraph-demos.ts`

```bash
pnpm db:seed      # Ship baseline (users, workspace, programs)
pnpm db:seed:fg   # FleetGraph demo scenarios (this data)
```

Both are idempotent (safe to re-run). The FG seed uses deterministic UUIDs via
SHA-256 hashing — same IDs every run, every environment. All data lives under
a **FleetGraph Demo** program with prefix `FG`.

### Target data per scenario

| Scenario | Target data | Confounders | Key IDs |
|----------|------------|-------------|---------|
| S1 | 3 sprints (active + clean + historical), 25 issues | Clean sprint (6, no creep), historical sprint (7, completed creep) | `demoId('s1:sprint')`, `demoId('s1:post-issue:0')` |
| S2 | 6 triage issues (4 external, 2 internal, 3-5 days old) | 1 fresh triage (today), 3 already-triaged | `demoId('s2:triage:0')` |
| S3 | 4 sprints, standups/plans/retros for persons A-D | Newbie (1 sprint), Person F (1 missed standup only) | `demoId('s3:sprint:0')`, `demoId('s3:approval-issue')` |
| S4 | 1 sprint, 3-link chain (A←B←C), 2 downstream, 4 queue filler | Fresh review, resolved chain, small queue (2 items) | `demoId('s4:issueA')`, `demoId('s4:issueB')`, `demoId('s4:issueC')` |
| S5 | 2 projects (risk + healthy), 7 sprints, ~58 issues | Healthy project with increasing velocity | `demoId('s5:project')`, `demoId('s5:healthy-project')` |
| S6 | 1 sprint, 5 issues (X/Y/Z/W/V) + 2 downstream + 1 blocker | 3 other-engineer, 2 done, 1 cancelled | `demoId('s6:issueX')` through `demoId('s6:issueV')` |
| S7 | 6 sprints, 6 retros (deploy pain in 3/4), issue R1 in backlog | Positive deploy retro, all-green retro, completed action item | `demoId('s7:retro:10')`, `demoId('s7:issueR1')` |

### User role assignments

| Role | User | Email | Scenarios |
|------|------|-------|-----------|
| Director | Dev User | dev@ship.local | S3, S5 |
| PM / Sprint Owner | Alice Chen | alice.chen@ship.local | S1, S6 |
| Engineer 1 (blocked) | David Kim | david.kim@ship.local | S1, S4, S5 |
| Engineer 2 (chain) | Emma Johnson | emma.johnson@ship.local | S1, S4, S5 |
| Engineer 3 (bottleneck) | Frank Garcia | frank.garcia@ship.local | S4 (5 items in_review) |
| Compliant (control) | Grace Lee | grace.lee@ship.local | S3 (fully compliant), S4 |
| Newbie (confounder) | Henry Patel | henry.patel@ship.local | S3 (1 sprint only) |
| Scope Adder | Bob Martinez | bob.martinez@ship.local | S1 (adds 3/4 post-start), S3 |
| Retro Author | Carol Williams | carol.williams@ship.local | S7 |
| Target Engineer | Iris Nguyen | iris.nguyen@ship.local | S3, S6 (smart next action) |
| Small Queue (confounder) | Jack Brown | jack.brown@ship.local | S4 (2 items in_review) |

### Issue dependencies

S4 and S6 store dependencies as `properties.depends_on: string[]` (array of
issue UUIDs). The `relationship_type` enum does not include `depends_on`, so
this uses JSONB properties rather than `document_associations`.

### Confounder philosophy

Every scenario includes data that should NOT trigger detection. This validates
query precision — we know results aren't just "the only data that exists."

- **S1:** A clean sprint with zero scope creep, a historical sprint where creep already resolved
- **S2:** A triage issue created today (too fresh), issues that were triaged (now in todo)
- **S3:** Person D does everything right (no finding). Newbie has 1 sprint of data (insufficient). Person F missed 1 standup (not a pattern)
- **S4:** A fresh in_review issue (not stale), a dependency chain where the blocker is done, an engineer with only 2 in_review (not a bottleneck)
- **S5:** A healthy project with increasing velocity and proper ownership
- **S6:** Issues assigned to other engineers, completed issues, a cancelled issue
- **S7:** A retro mentioning deploy positively, an all-green retro, an action item that was completed

**Total:** ~195 documents, ~125 associations.

---

## Demo Video Script (Draft)

**Target length:** 5-7 minutes

1. **Cold open (30s):** "Ship shows you what's happening. FleetGraph tells you what's wrong."
   Brief context: project intelligence agent, proactive + on-demand, graph architecture.

2. **Proactive: scope creep — S1 (60s):** WebSocket event triggers graph. Finding appears
   in UI. "Your sprint scope increased 50%. Here's who added what."

3. **Proactive: accountability — S3 (60s):** Director's view. Org-wide roll-up. "Alex does
   plans but skips retros. This started when he moved teams."

4. **On-demand: blocked chain — S4 (90s):** Engineer asks "what's blocking me?" Agent traces
   chain, finds bottleneck, proposes reassignment. **Show HITL: confirm button.**
   Agent executes via Ship API.

5. **On-demand: smart next action — S6 (45s):** "What should I work on?" Agent recommends
   based on priority, blockers, downstream impact. Not just a sorted list.

6. **On-demand: retro mining — S7 (60s):** "Any patterns across our retros?" Agent finds
   recurring theme, discovers unfulfilled action item. "You committed to fixing this
   3 sprints ago."

7. **LangSmith traces (30s):** Show 2 traces with visibly different execution paths.
   "Every graph run is fully traced."

8. **Architecture + cost (30s):** Brief flash of FLEETGRAPH.md. Graph diagram.
   "~$0.025 per graph run. $180/month at 100 users."

**If time for Tier 2/3:** Insert S2 and S5 between steps 3 and 4. Insert login
re-validation demo after step 3 (badge spinner resolving to updated count).
