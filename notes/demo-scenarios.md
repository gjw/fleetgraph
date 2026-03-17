# Demo Scenarios — Master Catalog

Every demo scenario defines: Ship state to seed, what FleetGraph detects, expected
graph path, and the demo narrative. This document is the source of truth for test data
seeding, LangSmith trace capture, and the demo video.

**Tiering:**

- **Tier 1** (5 scenarios) — rubric minimum, must ship by Early Submission (Friday)
- **Tier 2** (2 scenarios) — full 7, ship if Tier 1 is solid
- **Tier 3** — extensions to existing scenarios, time permitting

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

**Expected detection:**

- Scope increased ~50% (4 of 12 issues added post-start)
- Names who added what and when
- Quantifies impact: "4 of your original 8 items are still in_progress"

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

**Expected detection:**

- Roll-up: "3 accountability gaps across your team this sprint"
- Person A: standup compliance dropping
- Person B: selective debt — plans yes, retros no
- Person C: approval bottleneck

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

**Expected detection:**

- Traces full chain: A ← B ← C, all stuck
- Identifies bottleneck: Engineer3's review queue (7 items)
- Quantifies blast radius: "This chain blocks 3 downstream issues"
- Proposes action: reassign Issue C's review to someone with capacity

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

**Expected detection:**

- "Finish Issue X first — you're close and it's in progress"
- "Then start Issue Y — it's P0 and unblocks 2 team members"
- "Don't start Issue Z yet — it's blocked on [blocker]"
- "Issue V is due in 2 days — slot it after Y"
- "Issue W can wait"

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

**Expected detection:**

- "Deploy friction" appears in 3 of 4 retros (sprints 10, 12, 13)
- Severity escalating: "painful" → "caused rollback" → "3-hour incident"
- Action item from sprint 10 ("Automate staging deploys") is still in backlog

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

## Test Data Seeding Checklist

Each scenario needs its Ship state created before the graph can run against it.
Seeding is either via Ship API calls or direct database seed script.

| Scenario | Documents needed | Issues needed | Other data |
|----------|-----------------|---------------|-----------|
| S1 | 1 sprint | 12 issues (8 pre-start, 4 post-start) | Sprint-issue associations |
| S3 | 4-5 person docs, 4+ sprint retros/plans | — | Standup records, approval records |
| S4 | — | 7 issues (chain of 3 + 2 downstream + 2 queue filler) | Issue dependencies |
| S6 | — | 5 issues for 1 engineer | Issue dependencies, due dates |
| S7 | 4 retro docs, 1 program doc | 1 action-item issue (R1) | Sprint-retro associations |
| S2 | — | 6 issues in triage | Created_by from external source |
| S5 | 1 project, 4 sprints | ~20 issues across sprints | Velocity data via closed issues |

**Total unique data:** ~5-6 person documents, ~50 issues, 4 retro documents,
4-5 sprints, 1 program, 1 project, various associations.

Some of this may already exist in Ship's seed data. Check before creating duplicates.

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
