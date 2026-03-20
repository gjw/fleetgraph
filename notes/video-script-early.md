# Early Submission Video Script

**Target:** 4-6 minutes. Check-in, not polished final. Show what works, be
honest about what's in progress. This script doubles as the testing walkthrough.

**Before recording:** Walk through this live once. Fix issues as you find them.
Capture LangSmith trace URLs at each step — you need them for FLEETGRAPH.md too.

---

## Setup (before you start)

- [ ] Fresh deploy with `--fresh` flag (clean DB, latest code)
- [ ] Wait for first proactive scan (~5 min after deploy)
- [ ] Verify findings exist in inbox
- [ ] Have LangSmith open in another tab (https://smith.langchain.com)
- [ ] Log in to Ship as dev@ship.local

---

## Script

### 1. Cold Open (30s)

"Ship shows you what's happening in your projects. FleetGraph tells you what's
wrong — and what to do about it."

"It's a project intelligence agent. It watches Ship's data proactively, detects
conditions worth surfacing, and knows when to act and when to wait for a human."

"Two modes: proactive — the agent pushes findings to you. On-demand — you ask
it a question from any document you're looking at."

### 2. Findings Inbox — Proactive Results (60-90s)

**Navigate to:** Findings page (nav link with badge)

"FleetGraph has been running proactive scans every 5 minutes against our
seeded project data. Here's what it found."

**Walk through the findings:**

- Point out severity badges (warning/info/critical)
- Read a finding title and its summary line
- "Each finding is rolled up — one finding per condition, not one per issue.
  'Stale triage backlog' is one finding covering 6 issues, not 6 separate alerts."
- Click into the affected entity link — show it navigates to the right
  sprint/person/program page
- Show the filter tabs (Active / Acknowledged / Snoozed / All)

**Capture:** Note how many findings, which types. This is your TC-1 data.

### 3. Acknowledge + Snooze (45-60s)

"When a finding surfaces, you have three choices."

**Acknowledge a finding:**
- Click Acknowledge on one finding
- "I've seen this. The badge clears, but FleetGraph keeps tracking it. If the
  condition gets worse — severity escalates — it'll re-badge me."
- Show it moved to the Acknowledged tab

**Snooze a finding:**
- Click the Snooze button on another finding (default = tomorrow)
- "Snooze defers it until tomorrow morning. I can also snooze until next week."
- Click the ▾ dropdown to show the "Until next week" option (don't need to
  actually click it)
- Show it moved to the Snoozed tab

"There's no dismiss button. You can't permanently silence a finding. In a
government PM tool, that's intentional — the system keeps watching. If you
acknowledged something and it gets worse, you'll hear about it again."

### 4. On-Demand Chat — Smart Next Action (60-90s)

**Navigate to:** Any issue or sprint page (something with interesting data)

"The other mode is on-demand. The chat window on every document knows what
you're looking at."

**Open the FleetGraph chat panel** (footer toggle)

**Ask:** "What should I work on next?"

**While waiting (~10-15s):** "The graph is running — fetching this user's
assigned issues, checking priorities, blockers, due dates, then reasoning
about what matters most."

**When response arrives:**
- Read the response — highlight that it prioritizes intelligently (not just
  sorting by priority)
- "It knows I have something due today. It knows one of my issues is blocked.
  It doesn't just give me a sorted list — it thinks like a teammate."

**Capture:** Trace URL from LangSmith. This is your TC-2 data.

### 5. On-Demand Chat — Scoped Analysis (45-60s)

**Navigate to:** A Week 14 sprint page or the FleetGraph Demo program page

**Ask:** "How is this sprint going?" or "What risks do you see here?"

**When response arrives:**
- "The response is scoped to what I'm looking at — it analyzed this sprint's
  issues, not the entire workspace."
- Point out any specific insights (scope creep, blocked issues, velocity)

**Capture:** Trace URL. This is your TC-3 data.

### 6. LangSmith Traces (45-60s)

**Switch to LangSmith tab**

"Every graph run is traced in LangSmith. Let me show you two traces with
different execution paths."

**Show proactive trace (from step 2):**
- Point out: trigger → parallel fetch nodes → reasoning (GPT-4o, ~9s, ~40K
  tokens) → classify (GPT-4o-mini) → action-propose → human-gate → persist
- "This is the proactive path — it found problems and persisted findings."

**Show on-demand trace (from step 4 or 5):**
- Point out: trigger → context (resolves user + document) → fetch (scoped) →
  reasoning → classify
- "Different path — on-demand starts with context resolution, scopes the
  fetch to what the user is looking at."
- If classify took a different branch (clean vs action_propose), call it out:
  "Different conditions produce visibly different execution paths. This isn't
  a pipeline — it's a graph."

### 7. Architecture Flash (30-45s)

"Quick look at the architecture decisions — these are documented in
FLEETGRAPH.md."

You can either show the FLEETGRAPH.md file or just talk through:

- "LangGraph.js for the graph framework — TypeScript, same monorepo as Ship,
  native LangSmith tracing."
- "Dual auth model — proactive mode uses a service account, on-demand forwards
  the user's session. The agent can't see documents the user can't see."
- "Findings are Ship documents — not a shadow database. They're visible,
  searchable, commentable."
- "No permanent dismiss — only acknowledge and snooze. The system keeps watching."

### 8. Close (15s)

"This is our early submission. Test cases and architecture decisions are
documented in FLEETGRAPH.md. Cost analysis comes Sunday."

---

## After Recording

1. **Make traces public** in LangSmith (Share button → public link)
2. **Update FLEETGRAPH.md Test Cases** — replace TC-1 through TC-5 with
   the traces you captured, noting Ship state and actual output
3. **Write Architecture Decisions section** — the content from step 7,
   expanded with the dual auth security insight, cadenced scan design,
   and findings-as-documents rationale
4. **Commit and push**
5. **Submit**

---

## Fallback Plans

**If proactive scan produces no findings:** Restart FleetGraph, wait 5 min.
If still nothing, check logs (`pm2 logs fleetgraph --lines 30`).

**If on-demand chat dumps raw data:** The fg-3ah scoping fix should prevent
this. If it happens, try a more specific question or a different document.

**If acknowledge/snooze buttons don't appear:** Findings are probably in
`pending_decision` status. If fg-39o didn't deploy, the old Confirm/Dismiss
buttons may still be there — use those and narrate "we're transitioning to
acknowledge/snooze."

**If something breaks:** Narrate what happened honestly. "This is our early
submission — we identified this gap during testing and it's queued for the
final submission." The grader will respect honesty over a polished lie.
