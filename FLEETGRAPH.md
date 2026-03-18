# FLEETGRAPH.md

Project intelligence agent for Ship — proactive monitoring and on-demand reasoning
via graph architecture.

---

## Agent Responsibility

FleetGraph watches Ship so the people running projects don't have to. It monitors
five domains, ordered by signal clarity:

1. **Issue lifecycle stalls** — triage backlog age, in_progress without updates,
   in_review duration, overdue items, state regressions (done to reopened)
2. **Sprint health** — scope creep (issues added mid-sprint), missing plans/retros,
   low pass rates, empty sprints
3. **Accountability gaps** — missing standups, unsubmitted plans/retros, approval
   bottlenecks with no follow-up
4. **Project drift** — stale projects (no activity for N days), unvalidated plans,
   missing RACI ownership, no success criteria
5. **Team load signals** — overloaded assignees, silent team members (no activity
   for N days)

### What it monitors proactively

The agent runs without a user present, scanning workspace-wide data on a hybrid
WebSocket + poll schedule. It looks for conditions where a competent PM, seeing
the data right now, would change what they do today. The filter:

- Connected to an upcoming deadline (sprint end, plan due date)
- Blocking other work or people
- Pattern, not one-off (second missed standup matters more than first)
- Exceeds a grace period (not the instant something goes stale)
- Responsible person hasn't been notified recently (cooldown)

If none of those are true, the agent stays quiet.

### What it reasons about on demand

When a user opens the chat from within Ship, the agent knows what they're looking
at and scopes its analysis accordingly:

| Current view | Agent knows |
|---|---|
| Issue | State, assignee, sprint, project, blockers, history |
| Sprint | All issues, plan status, team, scope changes, timeline |
| Project | All sprints, issues, RACI, ICE scores, velocity |
| Program | All projects, cross-project patterns, resource allocation |
| Dashboard | User's full portfolio, what's due, what's stuck |

The agent fetches the relevant subgraph from that starting point, not the whole
workspace.

### What it can do autonomously

- Read any Ship API data
- Compute health scores, risk assessments, trend analysis
- Persist its own findings as Ship documents (visible to the workspace)
- Generate structured analysis with severity, affected parties, recommendations

### What requires human approval

Every Ship mutation. The line is simple: reads are autonomous, writes need approval.

- Creating or modifying document content
- Changing issue state (moving stale issues, cancelling)
- Reassigning work
- Any notification to a team member ("I think you should tell Sarah about X" —
  not sending it directly)

### Who gets notified

Findings use a two-tier recipient model:

| Tier | Mechanism | Badge? | Purpose |
|---|---|---|---|
| **Direct** | `recipient_ids` in finding properties | Yes | People who should act on the finding |
| **Ambient** | `document_associations` link to entity | No | Visible when viewing the affected entity |

Direct recipients follow Ship's ownership graph:

| Finding scope | Direct recipient(s) |
|---|---|
| Issue-level | Assignee, then sprint owner if unassigned |
| Sprint-level | Sprint owner |
| Project-level | Project owner |
| Program-level | Program owner |
| Cross-cutting (team load) | The person themselves |

Conditions for notification: severity threshold met, grace period expired, not
already notified for this condition within the cooldown window.

### How it knows roles and team structure

- `GET /api/team/grid` — members with project allocations
- Person documents: `user_id`, `role`, `reports_to`
- RACI fields on projects/programs: `owner_id`, `accountable_id`
- Sprint `owner_id`, issue `assignee_id`

---

## Use Cases

Seven use cases, derived from role-specific pain points — not from features.

| # | Role | Trigger | Detection | Human Decides |
|---|---|---|---|---|
| UC1 | PM | Proactive, mid-sprint | **Sprint scope creep** — issues added after sprint start, quantified as % of original scope, names who added what and when | Remove added scope, extend sprint, or accept and re-prioritize |
| UC2 | PM | Proactive, daily | **Stale triage backlog** — issues in triage >48hrs, grouped by project/program, with suggested accept/reject based on priority and capacity | Accept, reject, or reassign each issue |
| UC3 | Director | Proactive, weekly + on-demand | **Accountability debt roll-up** — missing plans, retros, standups, unresolved approvals across all teams, ranked by severity | Whether to escalate, which items to address first |
| UC4 | PM/Engineer | On-demand, from issue or sprint view | **Blocked work chain** — traces full dependency chain: what's blocked, what's blocking, who owns each link, how long each has been stuck | Priority reordering, reassignment, scope cuts |
| UC5 | Director/PM | On-demand, from project view | **Project risk assessment** — composite score from velocity trends, staleness, missing ownership, plan gaps, ICE drift. Explains *why* it's risky | Whether to intervene, how to reallocate |
| UC6 | Engineer | On-demand, from dashboard | **Smart next action** — given assigned issues, sprint priorities, blockers, and team state, recommends what to pick up next with reasoning | Whether to follow the recommendation |
| UC7 | PM/Director | On-demand, from program view | **Retro pattern mining** — across multiple sprint retros, surfaces recurring themes: repeated blockers, workarounds becoming permanent, same failures across sprints | Which patterns to address structurally vs. accept |

UC7 is the differentiator. Most agents do point-in-time health checks. Mining
*across* retros to find patterns that humans miss because they only read one retro
at a time — that's the graph reasoning worth building for.

### Rollup discipline

The reasoning node produces **one finding per condition per entity**, not one per
item. "Sprint 12 has 5 issues stuck in triage" is one finding. Individual items
are cited in the reasoning narrative, not as separate findings. This prevents
notification flood.

---

## Graph Architecture

Both proactive and on-demand modes share the same graph. The difference is the
trigger, not the graph.

### Graph Diagram

```
                    ┌─────────────┐
                    │   TRIGGER   │
                    │ (entrypoint)│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   CONTEXT   │
                    │  resolve    │
                    │  user/doc/  │
                    │  scope      │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ FETCH    │ │ FETCH    │ │ FETCH    │
        │ issues   │ │ sprint   │ │ team     │
        │          │ │ /project │ │ /people  │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             └─────────────┼────────────┘
                           │
                    ┌──────▼──────┐
                    │  REASONING  │
                    │  (GPT-4o)   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  CLASSIFY   │
                    │ (GPT-4o-    │
                    │   mini)     │
                    └──┬───┬───┬──┘
                       │   │   │
            ┌──────────┘   │   └──────────┐
            ▼              ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │  CLEAN   │  │ NOTIFY   │  │ ACTION   │
      │ (no      │  │ (surface │  │ PROPOSE  │
      │ problems)│  │ finding) │  │ (needs   │
      └──────────┘  └────┬─────┘  │ approval)│
                         │        └────┬─────┘
                         │             │
                         │      ┌──────▼──────┐
                         │      │   HUMAN     │
                         │      │   GATE      │
                         │      │ (confirm/   │
                         │      │  dismiss)   │
                         │      └──────┬──────┘
                         │             │
                         │      ┌──────▼──────┐
                         │      │  EXECUTE    │
                         │      │  ACTION     │
                         │      └──────┬──────┘
                         │             │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │   PERSIST   │
                         │ (save       │
                         │  finding +  │
                         │  state)     │
                         └─────────────┘
```

### Node Inventory

| Node | Type | Purpose | Parallel? |
|---|---|---|---|
| **Trigger** | Entry | Routes proactive (event/poll) vs. on-demand (user chat). Sets mode flag in state. | -- |
| **Context** | Context | Resolves who's asking, what they're looking at, their role, scope of analysis. Proactive: workspace. On-demand: current document + neighbors. | -- |
| **Fetch Issues** | Fetch | `GET /api/issues` filtered by scope. Returns issue state, priority, assignee, timestamps. | Yes |
| **Fetch Sprint/Project** | Fetch | Sprint detail, project detail, scope-changes, associations. | Yes |
| **Fetch Team/People** | Fetch | Team grid, person documents, accountability items. | Yes |
| **Reasoning** | LLM (GPT-4o) | Analyzes relationships, gaps, risk across all fetched data. Produces structured findings with severity, affected entities, recommended actions, and recipient IDs. | -- |
| **Classify** | LLM (GPT-4o-mini) | Routes based on reasoning output: clean / notify / action-propose. | -- |
| **Clean** | Terminal | No problems found. Proactive: silent. On-demand: "Everything looks healthy, here's why." | -- |
| **Notify** | Action | Persists informational finding, surfaces it in UI. No human gate needed. | -- |
| **Action Propose** | Action | Proposes a concrete Ship mutation (reassign, change state, escalate). Requires human approval. | -- |
| **Human Gate** | HITL | Pauses graph execution. Presents proposed action with context. Waits for confirm/dismiss/snooze via `/findings/:id/decide` endpoint. | -- |
| **Execute Action** | Action | Carries out the approved action via Ship API (PATCH issue, POST comment). | -- |
| **Persist** | Output | Saves finding document to Ship + creates entity association + updates FleetGraph config state. | -- |

### Conditional Edges

| Edge | Condition |
|---|---|
| Classify -> Clean | Reasoning found no conditions worth surfacing |
| Classify -> Notify | Finding detected, informational only (health score, trend, pattern) |
| Classify -> Action Propose | Finding includes a concrete recommended action that would modify Ship state |
| Human Gate -> Execute | User confirms proposed action |
| Human Gate -> Persist | User dismisses or snoozes — skip execution, still record the finding |

### Parallel Execution

All three fetch nodes run in parallel — they're independent API calls. The
Reasoning node waits for all three to complete before executing.

### State Shape

```
{
  mode: "proactive" | "on_demand",
  trigger_event: { type, data, timestamp },

  // Context
  user_id: string | null,          // null for proactive
  document_id: string | null,      // null for proactive
  document_type: string | null,
  scope: "workspace" | "program" | "project" | "sprint" | "issue",

  // Fetched data (populated by fetch nodes)
  issues: Issue[],
  sprints: Sprint[],
  projects: Project[],
  team_members: Person[],
  accountability_items: ActionItem[],

  // Reasoning output
  findings: Finding[],
  proposed_actions: Action[],

  // HITL
  human_decision: "pending" | "confirmed" | "dismissed" | "snoozed" | null,

  // Chat history (on-demand only)
  messages: Message[],
}
```

### Error Handling and Graceful Degradation

The graph handles failures at two levels: fetch failures (Ship API down or
partially available) and LLM failures (OpenAI API down or rate-limited).

**Fetch node failures:**

- Each fetch node returns an error flag instead of crashing the graph
- If all fetches fail: proactive mode silently retries next cycle; on-demand mode
  tells the user "Ship API is unreachable, try again in a few minutes"
- If some fetches fail: the Reasoning node receives partial data + error flags,
  reasons on what it has, and flags reduced confidence in the finding

**Partial data degradation:**

| Missing data | What gets skipped | What still works |
|---|---|---|
| Team grid | Team load analysis, role resolution | Issue/sprint health checks |
| Sprint data | Scope creep detection, sprint health | Issue lifecycle checks |
| Issue data | Issue-specific findings | Sprint-level and project-level analysis |

**LLM failures:**

- Proactive mode skips the cycle entirely — no partial reasoning, no noise
- On-demand mode returns: "I'm temporarily unable to analyze — here are the raw
  data links so you can check manually"

**Reconnection (WebSocket):**

- Exponential backoff on disconnect
- Poll safety net catches events missed during reconnection gaps
- No silent failure — if the WebSocket stays down, polling continues to trigger
  graph runs

### Data Model

FleetGraph state lives in Ship's unified document model. Two new document types:

**`fleetgraph_finding`** — each finding is a Ship document. Properties store
finding_type, severity, status, affected_entity_id, proposed_action,
human_decision, recipient_ids, snooze_until, trace_url, and token_usage. Content
stores the LLM's reasoning narrative. Gets history, associations, comments,
search, and audit trail for free.

**`fleetgraph_config`** — singleton per workspace. Stores last_check_at,
notification_cooldowns, poll_interval_ms, debounce_window_ms, and
enabled_detections. Operational state for the proactive agent.

No new tables. No schema changes beyond two enum values.

---

## Trigger Model

**Decision: Hybrid — WebSocket listener + scheduled poll.**

### How it works

Ship's `/events` WebSocket broadcasts `accountability:updated` on every document
create/update, issue state change, plan/retro update, and approval action.
FleetGraph connects as a client and receives near-real-time triggers.

1. **WebSocket listener** receives events, debounces them in a 30-second window,
   and dispatches a single graph run for the batch.
2. **5-minute poll** hits lightweight Ship endpoints to detect anything missed
   during reconnection gaps.
3. **On-demand** requests bypass the trigger pipeline entirely — they invoke the
   graph directly from the chat endpoint.

### Why not pure poll?

To hit <5min detection latency with polling alone, you need <=5min intervals.
That's 288 polls/day per workspace, most returning "nothing changed." Wasteful
and still has up to 5min lag.

### Why not webhooks?

Ship has no webhook infrastructure. Building it would be significant Ship-side
work for MVP when the WebSocket channel already exists and carries the events
FleetGraph needs.

### Why not pure WebSocket?

WebSocket connections drop. Network blips, deploys, restarts. The 5-minute poll
guarantees no event is missed for longer than 5 minutes regardless of connection
state.

### Detection Latency

| Component | Latency |
|---|---|
| WebSocket event delivery | <1 second |
| Debounce window | 30 seconds (batches rapid events) |
| Context + parallel fetches | 1-3 seconds |
| LLM reasoning (GPT-4o) | 5-15 seconds |
| Classification + persist | 1-2 seconds |
| **Total (WebSocket path)** | **~10-20 seconds** |
| **Worst case (poll safety net)** | **~5 minutes + pipeline** |

### Cost at Scale

- **100 projects:** 1 WebSocket connection per workspace (not per project). Poll
  hits 3-4 lightweight endpoints per cycle. Negligible.
- **1,000 projects:** Same model. Connections scale with workspaces, not projects.
  Poll cost is linear but each call is a timestamp comparison, not a full data
  fetch.

### Reconnection

WebSocket reconnects with exponential backoff. Ship's `/events` channel has
30-second ping/pong keepalive. On reconnect, the poll safety net catches anything
missed during the gap.

---

## Test Cases

Test cases run against seeded Ship data (`pnpm db:seed && pnpm db:seed:fg`).
Each case invokes the FleetGraph graph and captures a LangSmith trace showing
the execution path.

**Runner:** `npx tsx fleetgraph/src/graph/run-scenarios.ts all`

**Trace diversity requirement:** At least 2 traces showing visibly different
execution paths (different classify branches: Clean, Notify, Action Propose).

### TC-1: Sprint Scope Creep (S1)

- **Mode:** Proactive
- **Graph path:** Trigger → Fetch → Reasoning → Classify → Action Propose → Persist
- **Ship state:** 11 active sprints, 41 active issues, 11 scope change sets, 90 sprint issues
- **Expected:** `scope_creep` finding for sprint with 50% post-start additions
- **Actual:** 8 findings — 7x `stale_triage` (issues stuck in triage), 1x `overloaded_member` (David Kim). GPT-4o prioritized triage backlog over scope changes. Scope change data was present but the stale_triage signal dominated.
- **Trace:** https://smith.langchain.com/public/4e8ea445-ff89-4bcb-a651-f1aa6ea65a40/r
- **Confounders:** Not yet validated — clean sprint not separately tested
- **Status:** Graph path exercised (action_propose). Finding type differs from expected — reasoning prompt tuning needed for scope_creep detection priority.

### TC-2: Accountability Debt Roll-up (S3)

- **Mode:** Proactive (shared run with TC-1)
- **Graph path:** Same as TC-1
- **Ship state:** Same proactive scan
- **Expected:** 3 rollup findings for persons A/B/C, none for compliant Person D
- **Actual:** Same findings as TC-1 (stale_triage + overloaded_member). Accountability data present (1 item from API) but standup/retro compliance data not in reasoning prompt.
- **Trace:** https://smith.langchain.com/public/4e8ea445-ff89-4bcb-a651-f1aa6ea65a40/r (shared)
- **Status:** Accountability-specific fetching needed — standup status and plan/retro submission history not yet included in fetch pipeline.

### TC-3: Blocked Work Chain (S4)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Clean (END)
- **Ship state:** User viewing issue A (demoId s4:issueA), asking "What's blocking this?"
- **Expected:** Chain finding (A←B←C), bottleneck identification, proposed reassignment
- **Actual:** 0 findings, classification=clean. GPT-4o found nothing relevant to the user's question.
- **Trace:** https://smith.langchain.com/public/d01ec045-280f-425b-a2f6-fab4191fba5e/r
- **Confounders:** N/A (no findings produced)
- **Status:** Dependency data (`properties.depends_on`) not included in issue list payload. Need to fetch issue detail with properties for on-demand issue context.

### TC-4: Smart Next Action (S6)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Action Propose → Persist
- **Ship state:** User viewing issue X (Iris Nguyen's in_progress issue), asking "What should I work on next?"
- **Expected:** Informational prioritized work order, Clean path
- **Actual:** 1 finding — `overloaded_member` for Iris Nguyen. Classification: action_propose.
- **Trace:** https://smith.langchain.com/public/d9064fd6-0e81-4b88-af38-349be75b6ef2/r
- **Status:** Partially correct — identified the right person (Iris) and recognized workload issue. Expected Clean path but got Action Propose (Iris has too many high-priority issues).

### TC-5: Retro Pattern Mining (S7)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Clean (END)
- **Ship state:** User viewing Week 10 retro, asking "Any patterns across our retros?"
- **Expected:** Recurring "deploy friction" theme across 3/4 retros, unfulfilled action item
- **Actual:** 0 findings, classification=clean.
- **Trace:** https://smith.langchain.com/public/0458de99-e5b4-4ac5-aea1-356829ee4031/r
- **Status:** Retro document content not fetched — fetch pipeline only retrieves issues and sprint metadata, not document bodies. Need document content fetching for retro analysis.

### Trace Diversity Matrix

| Classify Branch | Test Case | Status |
|----------------|-----------|--------|
| Clean | TC-3 (S4), TC-5 (S7) | Exercised |
| Notify | — | Not yet exercised |
| Action Propose | TC-1 (S1), TC-2 (S3), TC-4 (S6) | Exercised |

**2 of 3 classify branches covered.** Notify path requires findings without `recommendedAction`.

### Findings Persisted

7 `fleetgraph_finding` documents created in Ship database. 1 failed due to
`affectedEntityId` referencing a person UUID not present as a document.

### Known Gaps for Follow-up

1. **Scope creep detection** — Scope change data is fetched but stale_triage dominates reasoning. Prompt tuning or separate detection pass needed.
2. **Dependency chain analysis** — `properties.depends_on` not in issue list payload. Need `getIssue()` for on-demand context.
3. **Retro content** — Document bodies not fetched. Need document content fetching for S7.
4. **Accountability specifics** — Standup status and plan/retro submission history not in fetch pipeline for S3.
5. **Rollup enforcement** — GPT-4o produces per-item findings instead of per-entity rollups despite prompt instruction.
