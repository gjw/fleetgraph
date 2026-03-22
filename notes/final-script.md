# Final Video Script + Test Plan + Seed Data Notes

**Purpose:** Combined script that serves as: video recording guide, integration test
plan (dry run verifies everything works), and trace capture pass for FLEETGRAPH.md.

**Target video:** 5-7 minutes. One detailed story, two medium stories, quick mentions.
LinkedIn-worthy: shows product thinking AND technical depth.

**Grader requirements (from Derek Peters):**

- 5 use cases, 5 test cases, matching traces
- Proactive + on-demand + HITL working
- Clear chain: test case → trace → result
- Trace for both a finding AND a clean run
- One clear story, not a feature tour
- "detection → graph → decision → human step → result"

---

## Pre-Recording Setup

### 1. Fresh deploy

```bash
ssh root@agentforge
export PATH=/root/.nodenv/shims:/root/.nodenv/bin:$PATH
cd ~/fleetgraph
./scripts/deploy-linode.sh --fresh
```

### 2. Wait for first proactive scan (~5 min)

Watch logs: `pm2 logs fleetgraph --lines 5`

After the scan, check findings:

```bash
docker exec fleetgraph-postgres-1 psql -U ship -d ship_dev -c "
SELECT count(*) FROM documents WHERE document_type = 'fleetgraph_finding';"
```

Should be 5-15 findings (stale triage, accountability, overloaded member, etc.).

### 3. Acknowledge baseline findings

Open Ship UI → Findings inbox → Acknowledge all current findings. This clears
the deck so only NEW findings from the demo are visible. The acknowledged findings
stay tracked but won't re-badge.

### 4. Open tabs

- **Tab 1:** Ship UI — Findings page
- **Tab 2:** Ship UI — FleetGraph Demo program → Issues
- **Tab 3:** LangSmith — traces view, filtered to last 1 hour
- **Tab 4:** Ship UI — a blocked issue for on-demand demo (navigate to one of
  the S4 chain issues, e.g., "Add health check endpoint for connection pool")

### 5. Known issues to work around

**"No blocked chains detected" false positives:** The hot-loop scan sometimes
creates findings saying "no blocked chains detected in Week 14 (API Platform)"
— these are false positives where the LLM reports a CLEAN condition as a finding
instead of staying silent. If these appear during the demo, narrate past them:
"The agent occasionally over-reports — we're tuning the reasoning prompt to stay
quiet when there's nothing to say."

**Duplicate-looking titles:** "Dev User has overdue accountability items" appears
twice because it's linked to two different entity documents. Not a dedup bug,
but visually confusing. If it shows up, don't dwell on it.

---

## Script

### Act 1: Cold Open (30 seconds)

> Ship is a project management tool for government teams. It shows you what's
> happening — issues, sprints, people, plans. But it doesn't tell you what's wrong.
>
> FleetGraph is the intelligence layer. It watches Ship's data, detects conditions
> worth surfacing, and knows when to act and when to wait for a human.

### Act 2: The WebSocket Story — Scope Creep Detection (2 minutes)

**This is the main story. Detection → graph → decision → human → result.**

#### Setup narration

> FleetGraph has three trigger modes. Real-time detection via WebSocket — when
> someone changes something in Ship, the agent evaluates it within seconds.
> Scheduled scans for things like stale triage and accountability gaps. And
> on-demand — a user asks a question from any document they're looking at.
>
> Let me start with real-time. Watch what happens when someone adds issues to a
> sprint that's already running.

#### Step 1: Show the sprint

**Navigate to:** FleetGraph Demo → Week 14 sprint page (or Issues filtered to
FleetGraph Demo, Week 14)

> This is Week 14. It has [X] issues committed at sprint start.

**[CAPTURE: note the current issue count for narration]**

#### Step 2: Add issues mid-sprint

**From the Week 14 sprint page, click "New Issue" and create 3 issues quickly:**
- "Add push notification support" (medium priority)
- "Implement notification batching" (low priority)
- "Add notification analytics" (low priority)

Creating them FROM the sprint page assigns them directly to Week 14 with
today's timestamp — which is after the sprint started. This is scope creep.

> I'm adding 3 new issues to this sprint mid-week. In a real team, this is a PM
> cramming scope, or a stakeholder adding urgent requests. Watch what happens.

**[SPLIT SCREEN or switch to LangSmith immediately — viewer should SEE the
trace appear in real-time as the WebSocket fires]**

**[WAIT: 10-30 seconds for WebSocket trigger + debounce + graph run]**

**[AS SOON AS the trace appears in LangSmith, point at it:]**

> There — the WebSocket event just fired and the graph started automatically.
> You can see the trace appearing in real time in LangSmith. This is the hot-loop
> scan — a focused prompt that only checks for scope creep and blocked chains.
> It doesn't analyze the entire workspace, just the conditions that need
> real-time detection.

#### Step 3: Finding appears

**Switch to:** Findings inbox tab

> There it is — scope creep detected. [Read the finding title and summary.]
> It quantifies the change and names which issues were added.

**If finding doesn't appear yet:** Check LangSmith for the trace.

> The graph ran — let me show you what happened inside.

**If a CLEAN run happened first (no finding on first trigger):**

> First trigger came back clean — scope was still within tolerance. But now...

This is actually ideal — shows both paths.

**[CAPTURE: LangSmith trace URL — make public. This is TC-1.]**

#### Step 4: Show the trace

**Switch to:** LangSmith tab → click the most recent trace

> Every graph run is traced in LangSmith. Let me walk through what happened.

Point out:

- **Trigger:**

> WebSocket event, not a poll timer.

- **Fetch nodes:**

> Three parallel fetches: issues, sprints, team data.

- **Reasoning:**

> GPT-4o analyzed the sprint. [X] seconds, [X]K tokens.

- **Classify:**

> GPT-4o-mini classified the output. It chose [action_propose/notify] because a
> concrete condition was detected.

- **Persist/Human Gate:**

> Finding persisted as a Ship document. Waiting for human decision.

Then:

> Same graph, different conditions produce different paths. If the sprint had been
> healthy, the classify node would have chosen Clean and stayed silent.

#### Step 5: Human decision

**Switch to:** Findings inbox

> The user has three choices. Acknowledge — I've seen it, keep tracking. Snooze —
> remind me tomorrow or next week. Or Approve, if the agent proposed a specific
> action.

**Click Acknowledge on the scope creep finding.**

> I've acknowledged it. The badge clears, but FleetGraph keeps watching. If this
> sprint gets worse — more issues added, completion rate drops — it'll escalate the
> severity and re-badge me.

> There is no dismiss button. You can't permanently silence a finding. In a
> government project management tool, that's intentional.

---

### Act 3: On-Demand — Blocked Chain Analysis (1 minute)

**This shows on-demand mode + the Approve action.**

#### Navigate to the blocked issue

**Switch to:** Tab 4 — the blocked issue ("Add health check endpoint for
connection pool" or "Document pool configuration for ops")

> The other mode is on-demand. I'm looking at an issue that seems stuck.

#### Ask the question

**Open FleetGraph chat panel** (footer toggle or predefined button)

**Click:** "What's blocking this?" button (predefined) or type it

**[WAIT: ~10-15 seconds]**

> The agent is analyzing — it fetches this issue's context, traces the dependency
> chain, checks who owns each link.

#### Show the response

> It found the chain: [read the response]. The bottleneck is [person/issue]. It's
> proposing [action — reassign, escalate, etc.].

**If the response is a finding with Approve button:**

> I can approve this action and FleetGraph will execute it through Ship's API.

**If the response is conversational without Approve:**

> It analyzed the chain and gave me the information I need to make the call.

**[CAPTURE: LangSmith trace URL. This is TC-2. Note: different path from
proactive — context node resolves document, scoped fetch.]**

---

### Act 4: Proactive Detection — Stale Triage (30 seconds)

**This shows the daily-cadence proactive scan result.**

**Navigate to:** Findings inbox → show an existing stale triage finding

> FleetGraph also runs proactive scans. This morning's scan found 7 issues stuck
> in triage for over 5 days. [Read the finding summary.] Four external bug reports,
> two internal feature requests.

**Click through** to the affected entity → navigate to the issues list →
filter to triage status

> Here are the actual issues. The agent flagged them, the PM triages them.

**[CAPTURE: proactive trace URL if not already captured. This is TC-3.]**

---

### Act 5: Quick Mentions (30-45 seconds)

Rapid-fire, no deep dives:

> Findings are Ship documents — they're searchable, commentable, linked to affected
> entities via associations. Not a shadow database.

> Dual auth model — proactive mode uses a service account. On-demand mode forwards
> the user's session. The agent can't see documents the user can't see. In a federal
> context, this prevents data leakage of pre-decisional material.

> Cadenced scans — not everything runs every 5 minutes. Scope creep and blocked
> chains are real-time via WebSocket. Stale triage and accountability run daily.
> Retro mining runs weekly. Right cadence for the right condition.

> No permanent dismiss — acknowledge and snooze only. The system keeps watching. A
> government team can't silence institutional memory.

---

### Act 6: Architecture + Cost (30 seconds)

**Show:** FLEETGRAPH.md briefly, or just narrate

> Full documentation in FLEETGRAPH.md — 7 use cases, 5 test cases with LangSmith
> traces, architecture decisions, and cost analysis.

> Current cost: approximately $[X] per graph run, $[X] per day with cadenced
> scanning. At 100 users, $[X]/month. At 1,000, $[X]/month.

**[Numbers from bd-3hf — fill in after cost analysis is done]**

---

### Act 7: Close (15 seconds)

> FleetGraph turns Ship from a dashboard into a system that watches, reasons, and
> knows when to wait for a human. Test cases, traces, and architecture decisions
> are all in the repo.

---

## Test Cases for FLEETGRAPH.md

Capture these traces during the dry run. Each needs a public LangSmith link.

### TC-1: WebSocket-Triggered Scope Creep (UC1)

- **Mode:** Proactive (WebSocket trigger)
- **Ship state:** Active Week 14 sprint in FleetGraph Demo. 3-4 issues added
  mid-sprint via "Move to Week" bulk action.
- **Expected:** scope_creep finding with quantified impact (% increase, which
  issues added)
- **Graph path:** Trigger (WebSocket) → Fetch (hot-loop: issues + sprints) →
  Reasoning → Classify → Action Propose → Human Gate → Persist
- **Trace:** [CAPTURE DURING DRY RUN]

### TC-2: On-Demand Blocked Chain (UC4)

- **Mode:** On-demand
- **Ship state:** User viewing "Add health check endpoint" issue, asking
  "What's blocking this?" Issue depends on "Implement connection retry logic"
  (in_review) which depends on "Migrate database connection pooling" (in_review).
- **Expected:** Chain analysis identifying the dependency bottleneck, proposed
  action (reassign or escalate)
- **Graph path:** Trigger → Context (resolves issue + associations) → Fetch
  (scoped to issue context) → Reasoning → Classify → Action Propose
- **Trace:** [CAPTURE DURING DRY RUN]

### TC-3: Proactive Stale Triage (UC2)

- **Mode:** Proactive (5-min poll or daily scan)
- **Ship state:** 6 issues in triage status for 4-7 days in FleetGraph Demo.
  4 external bugs, 2 internal features. 1 confounder (1-day-old issue).
- **Expected:** Rolled-up stale_triage finding. Confounder excluded.
- **Graph path:** Trigger (poll) → Fetch → Reasoning → Classify → Notify → Persist
- **Trace:** [CAPTURE — use trace from first proactive scan after deploy]

### TC-4: Proactive Accountability Debt (UC3)

- **Mode:** Proactive (same scan as TC-3)
- **Ship state:** Multiple team members with missing plans/retros. Active
  sprints (Week 14) and completed sprints (Weeks 12-13) with gaps.
- **Expected:** Accountability findings per person/sprint. Compliant members
  NOT flagged.
- **Graph path:** Same as TC-3 (shared proactive scan)
- **Trace:** [SHARED with TC-3]

### TC-5: Clean Run

- **Mode:** Proactive (WebSocket trigger) or On-demand
- **Ship state:** Either: (a) WebSocket trigger on a sprint with no problems,
  or (b) on-demand question about a healthy document
- **Expected:** No findings. Classify → Clean. Graph stays silent.
- **Graph path:** Trigger → Fetch → Reasoning → Classify → Clean (END)
- **Trace:** [CAPTURE — this proves the graph is conditional, not a pipeline]
- **How to trigger:** OPTION A: Add one issue to a healthy sprint (API Platform
  Week 14 with 6 issues is fine — one more shouldn't trigger scope creep).
  OPTION B: Ask "what's blocking this?" on an issue with no dependencies.
  OPTION C: First WebSocket trigger in the scope creep demo may be clean
  (below threshold) — capture that trace.

---

## Trace Capture Strategy

During the dry run, capture traces in this order:

1. **First proactive scan** after fresh deploy → TC-3 + TC-4 trace (shared)
2. **WebSocket trigger — clean** (if it happens) → TC-5 trace
3. **WebSocket trigger — scope creep** → TC-1 trace
4. **On-demand blocked chain** → TC-2 trace
5. **If TC-5 not captured:** trigger an on-demand clean run (ask a question
   about a healthy document) → TC-5 trace

Make ALL traces public in LangSmith before updating FLEETGRAPH.md.

---

## Seed Data Notes

### Current state (adequate for demo, no changes needed)

**Scope creep demo (WebSocket):**

- FleetGraph Demo has 12 unassigned backlog issues available to move into Week 14
- API Platform, Authentication, etc. each have 3 unassigned issues
- "Move to Week" works when filtered to a single program
- Week 14 in FleetGraph Demo already has 57 issues (24 post-start) — scope
  creep may already be detected in baseline. After acknowledging baseline
  findings, adding MORE issues should trigger a new detection (dedup update
  with severity escalation → re-badge)

**TRADEOFF:** Use FleetGraph Demo (lots of data, complex) vs API Platform
(clean, simple, 6 issues + 3 unassigned). API Platform is cleaner for the
demo but less impressive. FleetGraph Demo is messier but shows real-world
complexity. **Recommendation: API Platform for the WebSocket demo** — cleaner
story, easier to narrate, and the 3 unassigned issues being moved to a
6-issue sprint is a clear 50% scope increase.

**Blocked chain demo (on-demand):**

- S4 chain exists: "Document pool config" → "Health check endpoint" →
  "Retry logic" → "DB migration pooling"
- Bottom two are in_review — stuck
- Issue assignees are null in the data — this may weaken the "reassign"
  proposal. During dry run, verify the agent identifies the chain.

**Stale triage demo (proactive):**

- 6 stale issues in FleetGraph Demo, 4-7 days old
- 1 fresh confounder (1 day old)
- This reliably detects on every proactive scan

### Potential seed data improvement (only if time allows)

- Assign people to the S4 blocked chain issues — makes the "reassign" proposal
  more concrete ("reassign review from Frank Garcia to Grace Lee")
- Not required for the demo to work, just makes it better

---

## Post-Recording Checklist

- [ ] All LangSmith traces made public (share links)
- [ ] FLEETGRAPH.md Test Cases updated with fresh trace links
- [ ] FLEETGRAPH.md accuracy pass (fg-2ah) — verify all claims match code
- [ ] Cost Analysis section written (bd-3hf) — dev costs + projections
- [ ] Final commit + push
- [ ] Submit

---

## Execution Order

```
1. Deploy --fresh                               (~10 min)
2. Wait for proactive scan, capture TC-3/TC-4    (~5 min)
3. Acknowledge baseline findings                 (~2 min)
4. Dry run Acts 2-4 (testing)                    (~20 min)
   - Fix any issues found
   - Capture TC-1, TC-2, TC-5 traces
5. Cost analysis (bd-3hf)                        (~30 min)
6. Update FLEETGRAPH.md (traces + accuracy)      (~30 min)
7. Write final video script tweaks               (~10 min)
8. Record video                                  (~20 min with pauses)
9. Commit + push + submit                        (~5 min)
```

**Total: ~2.5 hours of focused work.**
