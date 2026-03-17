# FLEETGRAPH.md

Project intelligence agent for Ship — proactive monitoring and on-demand reasoning
via graph architecture.

<!-- Sections below are filled incrementally. See bd-1mb for full deliverable. -->

## Test Cases

Test cases run against seeded Ship data (`pnpm db:seed && pnpm db:seed:fg`).
Each case invokes the FleetGraph graph and captures a LangSmith trace showing
the execution path.

**Runner:** `tsx fleetgraph/src/graph/run-scenarios.ts all`

**Trace diversity requirement:** At least 2 traces showing visibly different
execution paths (different classify branches: Clean, Notify, Action Propose).

### TC-1: Sprint Scope Creep (S1)

- **Mode:** Proactive
- **Graph path:** Trigger → Fetch → Reasoning → Classify → Notify → Persist
- **Ship state:** Sprint with 8 original issues + 4 added post-start. Clean sprint confounder (no creep).
- **Expected:** `scope_creep` finding, sprint owner as recipient. Clean sprint produces no finding.
- **Actual:** _pending_
- **Trace:** _pending_
- **Confounders verified:** _pending_

### TC-2: Accountability Debt Roll-up (S3)

- **Mode:** Proactive
- **Graph path:** Trigger → Fetch → Reasoning → Classify → Notify → Persist
- **Ship state:** 4 team members — Person A (missing standups), Person B (skips retros), Person C (stale approval), Person D (fully compliant).
- **Expected:** 3 rollup findings (one per person A/B/C). Person D: no finding. Newbie: no finding (insufficient data).
- **Actual:** _pending_
- **Trace:** _pending_ (shared with TC-1 — same proactive run)
- **Confounders verified:** _pending_

### TC-3: Blocked Work Chain (S4)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Action Propose → Human Gate → Execute → Persist
- **Ship state:** 3-link chain (A←B←C), Issue C in_review 5+ days, reviewer (Engineer3) has 6 other items. 2 downstream issues.
- **Expected:** Chain finding with proposed action (reassign review). Direct recipients: blocked engineer + bottleneck owner.
- **Actual:** _pending_
- **Trace:** _pending_
- **Confounders verified:** _pending_ (fresh review, resolved chain, small-queue engineer)

### TC-4: Smart Next Action (S6)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Clean (END)
- **Ship state:** Engineer with 5 assigned issues (in_progress/open/blocked/low-priority/due-soon).
- **Expected:** Clean or Notify classification. Informational response with prioritized work order. May not persist a finding.
- **Actual:** _pending_
- **Trace:** _pending_
- **Confounders verified:** _pending_ (other engineers' issues, completed issues, cancelled issue)

### TC-5: Retro Pattern Mining (S7)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Notify → Persist
- **Ship state:** 4 retros — "deploy friction" appears in 3/4, escalating severity. Action item R1 still in backlog.
- **Expected:** Recurring pattern finding. Direct recipients: program/project owner.
- **Actual:** _pending_
- **Trace:** _pending_
- **Confounders verified:** _pending_ (positive deploy retro, all-green retro, completed action item)

### Trace Diversity Matrix

| Classify Branch | Test Case | Status |
|----------------|-----------|--------|
| Clean | TC-4 (S6) | _pending_ |
| Notify | TC-1 (S1), TC-2 (S3), TC-5 (S7) | _pending_ |
| Action Propose | TC-3 (S4) | _pending_ |
