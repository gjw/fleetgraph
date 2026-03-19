# FleetGraph Integration Test Plan

**Purpose:** Chair builds genuine understanding of FleetGraph by walking each use case
end-to-end. Test against Linode (agentforge) with real seeded data.

**Date:** 2026-03-19 (updated after day's fixes)

---

## What Changed Today

Before testing, know what was fixed — this affects what you expect to see:

- **fg-3ah (closed):** On-demand scoping. userId now extracted from proxy headers.
  Fetch nodes scope by sprint/project/program associations. Reasoning prompt is
  tighter. The spaghetti problem should be fixed.
- **fg-3aw (closed):** On-demand auth. Forwarded session cookie instead of service
  account for on-demand reads. Users now only see data they have access to.
  Proactive mode still uses service account (correct — system-generated findings).
- **fg-1ml (closed):** Findings inbox. Nav link with badge count, filter tabs
  (active/dismissed/all), confirm/dismiss actions inline, click-through to affected
  entity.
- **fg-32c (closed):** Migration runner fix. Schema.sql "already exists" errors
  no longer kill subsequent migrations.

**Still open (may affect test results):**

- **fg-38a:** Duplicate of fg-3aw (on-demand auth) — may still be open if Warden
  created it separately. Verify the fix landed.
- **fg-3kh:** Reasoning enrichment. 5 detection gaps remain: S1 scope_creep
  dominated by stale_triage, S3 accountability needs standup/plan/retro data,
  S4 blocked_chain needs dependency fetching, S7 retro content not fetched,
  persist person association uses user UUID not person doc UUID.
- **fg-3ki:** Persist dedup doesn't handle `pending_decision` status from
  human-gate. Dedup checks for `status='active'` but human-gate creates findings
  with `status='pending_decision'`.
- **fg-26l:** FLEETGRAPH.md claims WebSocket trigger that doesn't exist. Doc
  integrity issue — won't affect functionality but matters for submission.
- **fg-aom:** FLEETGRAPH.md error handling claims exceed implementation. Same —
  doc integrity.

---

## Prerequisites (BLOCKING)

### 1. Redeploy to Linode

Migrations are now applied (including 038_fleetgraph_document_types). Redeploy
to pick up today's code fixes:

```bash
ssh root@agentforge
export PATH=/root/.nodenv/shims:/root/.nodenv/bin:$PATH
cd ~/fleetgraph
git pull
pnpm install && pnpm build:shared && pnpm build:api && pnpm build:web && pnpm --filter fleetgraph build
pm2 restart all
```

### 2. Verify services are healthy

```bash
curl http://127.0.0.1:3000/health                    # ship-api
curl http://127.0.0.1:3100/api/fleetgraph/health     # fleetgraph
```

### 3. Confirm seed data exists

```bash
export DATABASE_URL=postgresql://ship:ship_dev_password@localhost:5432/ship_dev
pnpm db:seed       # Ship baseline
pnpm db:seed:fg    # FleetGraph demo scenarios
```

---

## How to Read Results

For each test, check three layers:

- **Ship UI** — Does the findings inbox show the finding? Can you confirm/dismiss?
  Can you click through to the affected entity? Is the badge count correct?
- **LangSmith** — Open the trace. Walk each node: what data was fetched, what the
  LLM reasoned, how it classified, what was persisted.
  Traces at: https://smith.langchain.com (project: fleetgraph)
- **Database** — Spot-check findings:
  ```sql
  SELECT id, title, properties->>'finding_type', properties->>'severity',
         properties->>'status', created_at
  FROM documents WHERE document_type = 'fleetgraph_finding'
  ORDER BY created_at DESC;
  ```

---

## Test Sequence

Ordered simplest → most complex. Each test builds on understanding from the previous.

---

### Test 1: Health Check + Proactive Scan Basics

**Goal:** Confirm the graph runs at all. Understand what a proactive scan produces.

**What to do:**

1. Verify FleetGraph is running: `curl http://127.0.0.1:3100/api/fleetgraph/health`
2. Wait for the 5-minute poller to fire (or restart FleetGraph to trigger immediately)
3. Check LangSmith for a new trace in the `fleetgraph` project
4. Open the trace — walk through each node:
   - **Trigger** — mode=proactive
   - **Fetch nodes** (parallel) — what data was pulled? How much?
   - **Reasoning** — read the GPT-4o prompt and response. What findings did it produce?
   - **Classify** — what classification? (clean/notify/action_propose)
   - **Persist** (if notify/action_propose) — was a finding document created?
5. Check the database for any new `fleetgraph_finding` documents
6. **Check the findings inbox** — navigate to the findings page in Ship UI.
   Do findings appear? Does the badge count match? Can you see severity and
   affected entity?

**What to look for:**

- Does the trace show a complete execution path?
- Is the reasoning output coherent? Does it identify real problems?
- Are findings actually persisted to Ship's database?
- Does the findings inbox (fg-1ml) work? Badge count, filter tabs, click-through?

**Known data in scope (active Week 14):**

- 35 issues across multiple Week 14 sprints
- 4 issues added post-sprint-start (scope creep signal)
- 7 in_review issues (potential bottleneck)
- Multiple dependency chains

---

### Test 2: UC2 — Stale Triage Backlog (simplest proactive detection)

**Goal:** Verify FleetGraph detects stale triage issues. This is the simplest
detection — just "issues stuck in triage too long."

**Seeded data:**

| Issue | Age | Source | Program |
|-------|-----|--------|---------|
| Bug: login fails with special characters | 7 days | external | FleetGraph Demo |
| Feature: add dark mode toggle | 6 days | internal | FleetGraph Demo |
| Bug: export CSV drops unicode columns | 6 days | external | FleetGraph Demo |
| Bug: notification badge count wrong | 6 days | external | FleetGraph Demo |
| Bug: search results don't update | 5 days | external | FleetGraph Demo |
| Feature: keyboard shortcut for quick issue create | 5 days | internal | FleetGraph Demo |
| Bug: tooltip overlaps on mobile | 2 days (confounder — too fresh) | external | FleetGraph Demo |

**Expected finding (ONE rollup):**

"6 issues in triage for 3+ days in FleetGraph Demo. 4 external bugs, 2 internal
requests." The 2-day-old tooltip bug should NOT be included (too fresh).

**What to check:**

- Does the proactive scan produce a stale_triage finding?
- Is it a rollup (one finding, not six)?
- Does it correctly exclude the 2-day-old issue?
- Does the finding appear in the inbox?

**Known risk:** fg-3kh notes that stale_triage findings dominate over other
detection types. You may see stale_triage but miss scope_creep in the same run.

---

### Test 3: UC1 — Sprint Scope Creep (proactive, quantified)

**Goal:** Verify FleetGraph detects mid-sprint scope additions.

**Seeded data (Week 14 in FleetGraph Demo):**

- ~17 issues created before sprint start (2026-03-10)
- 4 issues created after sprint start:
  - "Validate pool config schema" (2026-03-11)
  - "Add pool error categorization" (2026-03-11)
  - "Fix notification delivery reliability" (2026-03-11)
  - "Add connection timeout configuration" (2026-03-14)

**Expected finding:**

"Sprint scope increased ~19% (4 issues added post-start out of ~21 total)."
Should name the issues and when they were added. One rollup finding, not four.

**What to check:**

- Does the finding quantify scope change as a percentage?
- Does it name which issues were added and when?
- Is it linked to the sprint document via associations?

**Known risk:** fg-3kh notes scope_creep is not reliably detected — stale_triage
dominates the reasoning output. This test may produce stale_triage instead of
scope_creep. If so, that's a fg-3kh problem (reasoning prompt weighting), not a
graph problem.

---

### Test 4: UC6 — Smart Next Action (simplest on-demand)

**Goal:** Test on-demand chat with a scoped question. This validates the fg-3ah
scoping fix and fg-3aw auth fix together.

**How to trigger:**

1. Log in as Iris Nguyen (iris.nguyen@ship.local) — or navigate to one of her issues
2. Open the FleetGraph chat panel on any document
3. Ask: "What should I work on next?"

**Seeded data (Iris's open issues):**

| Issue | State | Priority | Due | Blocked? |
|-------|-------|----------|-----|----------|
| Create error handling | in_progress | high | — | No |
| Finalize user onboarding flow | in_progress | high | — | No |
| Build notification preference API | todo | high | — | No |
| Configure CI/CD pipeline | todo | high | — | No |
| Security audit fixes | todo | high | — | No |
| Fix notification delivery reliability | todo | medium | 2026-03-19 (TODAY) | No |
| Implement notification rendering engine | todo | medium | — | Yes (blocked by "Define notification template schema") |
| Add unit tests | todo | medium | — | No |
| Performance optimization | todo | medium | — | No |
| Add connection timeout configuration | in_review | medium | — | No |
| Add export functionality | backlog | low | — | No |
| Add notification sound preferences | todo | low | — | No |

**Expected response:**

1. "Finish what's in progress first — Create error handling and Finalize user
   onboarding flow are both high priority and already started"
2. "Fix notification delivery reliability is due TODAY"
3. "Don't start Implement notification rendering engine — it's blocked"
4. Should NOT just dump all 12 issues as findings

**What to check:**

- Does the response address Iris's actual workload? (fg-3ah: userId now populated)
- Does it prioritize intelligently (not just sort by priority)?
- Does it mention the due date and the blocker?
- Is the response conversational or a raw data dump? (fg-3ah: prompt tightened)
- Check LangSmith trace: did fetch-issues scope to Iris's issues, not all 228?
- **Auth check (fg-3aw):** does the trace show session cookie auth, not Bearer token?

---

### Test 5: UC3 — Accountability Debt Roll-up (proactive, multi-person)

**Goal:** Verify FleetGraph detects accountability gaps across people.

**Seeded data:**

| Person | Standups (7d) | Total Plans | Total Retros | Signal |
|--------|--------------|-------------|--------------|--------|
| Grace Lee | 6 | 7 | 5 | Compliant (control — no finding) |
| Iris Nguyen | 5 | 7 | 6 | Mostly compliant (control) |
| Alice Chen | 2 | 4 | 3 | Low standup frequency |
| Bob Martinez | 2 | 0 | 0 | Zero plans, zero retros |
| David Kim | 2 | 2 | 3 | Low standups |
| Frank Garcia | 0 | 3 | 1 | Missing standups + retros |
| Emma Johnson | 0 | 6 | 4 | Missing standups |
| Henry Patel | 0 | 4 | 3 | Missing standups |
| Jack Brown | 0 | 4 | 3 | Missing standups |

**Expected findings (one per person with a problem, NOT one per violation):**

- Bob Martinez: "Zero plans and zero retros submitted — complete accountability gap"
- Frank Garcia: "No standups, only 1 retro out of 3 plans — selective compliance"
- Grace Lee, Iris Nguyen: NO finding (compliant)
- Others: findings for missing standups proportional to severity

**What to check:**

- Are findings rolled up per person, not per missed item?
- Are compliant people correctly excluded?
- Does Bob's finding reflect a PATTERN, not just "missed standup on Tuesday"?
- Does severity scale appropriately (Bob > Frank > Alice)?

**Known risk:** fg-3kh notes accountability_debt detection needs standup/plan/retro
submission data that may not be in the fetch pipeline yet. This test may partially
fail — the question is whether enough data reaches the reasoning node.

---

### Test 6: UC4 — Blocked Work Chain (on-demand, HITL)

**Goal:** Test the full action-propose → human-gate → execute path. This is
the HITL demo. fg-584 wired this path — verify it actually works.

**Seeded data (dependency chain):**

```
"Document pool configuration for ops" (todo)
  └── depends on: "Add health check endpoint" (in_progress)
      └── depends on: "Implement connection retry logic" (in_review)
          └── depends on: "Migrate database connection pooling" (in_review)
```

All 4 issues are in FleetGraph Demo, Week 14. The chain is 4 links deep, bottom
two are stuck in review.

**How to trigger:**

1. Navigate to "Document pool configuration for ops" or "Add health check endpoint"
2. Open FleetGraph chat
3. Ask: "What's blocking this?" or "Why is this stuck?"

**Expected behavior:**

1. Graph traces the full dependency chain
2. Identifies the bottleneck (review queue depth)
3. Proposes action: reassign review or escalate
4. Finding created with `status: pending_decision`, `human_decision: null`
5. Finding appears in inbox with Confirm/Dismiss buttons
6. **Confirm:** executes the proposed action via Ship API (e.g., reassigns the issue)
7. **Dismiss:** marks finding as dismissed, no action taken

**What to check:**

- Does the graph detect the full chain (not just the immediate blocker)?
- Does it identify the root cause (bottom of chain in review)?
- Does the proposed action make sense?
- Does Confirm actually mutate Ship data? (fg-584 wired execute node)
- Does Dismiss correctly skip execution?
- LangSmith trace: does it show the action-propose → human-gate path?
- **Dedup check (fg-3ki):** if you trigger this twice, does the second run create
  a duplicate finding or respect the existing one? Note: fg-3ki says dedup doesn't
  handle `pending_decision` status — may get duplicates on re-run.

**Known risk:** fg-3kh notes blocked_chain detection needs issue dependency data
(`properties.depends_on`) which the list endpoint doesn't return. The graph may
need to fetch individual issues to get dependency data. If the chain isn't detected,
that's the data gap, not a graph wiring issue.

---

### Test 7: UC5 — Project Risk Assessment (on-demand, composite)

**Goal:** Test composite analysis across multiple signals.

**Candidate project: "Legacy Migration"**

- No owner (owner_id is null)
- No success criteria
- 38 total issues: 17 done, 4 active, 17 pending
- Likely declining velocity (check sprint-by-sprint completion)

**How to trigger:**

1. Navigate to the Legacy Migration project page
2. Open FleetGraph chat
3. Ask: "How is this project doing?" or "What's the risk here?"

**Expected response:**

- Missing ownership flagged
- Missing success criteria flagged
- Velocity analysis (if sprint data is linked)
- Overall risk assessment: HIGH

**What to check:**

- Does the analysis cite multiple signals (not just one)?
- Does it flag the missing owner and success criteria?
- Is the assessment honest about risk vs. rubber-stamping "on track"?
- **Scoping check:** does the response focus on Legacy Migration, or does it dump
  data about all 21 projects? (fg-3ah should have fixed this)

---

### Test 8: UC7 — Retro Pattern Mining (on-demand, cross-document)

**Goal:** Test the most ambitious detection — mining across multiple retro docs.

**Seeded data:**

- 34 retro documents across weeks 11-14
- At least 3 retros mention "deploy" issues (weeks 12 and 13)
- Content is TipTap JSON (the reasoning node needs to extract text from it)

**How to trigger:**

1. Navigate to a program page (FleetGraph Demo)
2. Open FleetGraph chat
3. Ask: "Any patterns in our retros?" or "What keeps coming up in retrospectives?"

**Expected behavior:**

- Graph fetches retro documents across multiple sprints
- Reasoning node reads TipTap JSON content and extracts themes
- Identifies recurring "deploy" theme across sprints 12-13
- Ideally links to unfulfilled action items

**What to check:**

- Does the graph actually fetch retro content? (fg-3kh flagged this as missing)
- Can GPT-4o extract themes from TipTap JSON?
- Does it find the cross-sprint pattern?
- This is the **most likely to fail** — fg-3kh explicitly says retro content is
  not fetched. If it fails, note WHAT failed: no data fetched? data fetched but
  LLM missed it? wrong classification?

---

## Regression Tests

### Spaghetti Test

Verify the on-demand scoping fix (fg-3ah) works:

1. Open any document
2. Open FleetGraph chat
3. Ask: "Do you like spaghetti?"

**Expected:** Empty findings array or a polite deflection. NOT 30 issues dumped.

### Auth Isolation Test

Verify the auth fix (fg-3aw) works:

1. Log in as a non-admin user
2. Open FleetGraph chat on a document
3. Ask any project question
4. Check LangSmith trace: verify the fetch nodes used session cookie, not Bearer token
5. Confirm the response only references data that user can see

---

## After Testing

For each test, record:

- **Result:** Pass / Partial / Fail
- **What surprised you:** anything unexpected, good or bad
- **Gap identified:** what's missing or broken (becomes a bead)
- **LangSmith trace URL:** for reference

Update fg-215 with observations. Create beads for gaps discovered.
