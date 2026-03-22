# FLEETGRAPH.md

Project intelligence agent for Ship — proactive monitoring and on-demand reasoning
via graph architecture.

## Public LangSmith Traces

Until/unless we refactor for the final, multiple use cases are scanned for in a
single invocation. There are really only 2 different classes of calling the graph:
4 use cases are handled by the proactive scan, and 1 by the on-demand.

- **On-demand:** https://smith.langchain.com/public/8b727526-5e21-4cd5-8a86-67eb751ffedc/r
- **Proactive:** https://smith.langchain.com/public/2e3c94cc-22ef-4d83-ab61-f91e0af7d25f/r

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

## Security

### On-demand auth scoping

FleetGraph operates in two auth modes with deliberately different trust boundaries:

- **Proactive mode** (no user present): authenticates to Ship via a service account
  Bearer token. Sees the entire workspace. Findings are written as system-generated
  documents visible to all workspace members.

- **On-demand mode** (user-initiated chat): authenticates to Ship using the requesting
  user's forwarded session cookie. The LLM only reasons over data that user can see.

**Why this matters:** Ship applies per-document visibility filtering
(`visibility = 'workspace' OR created_by = $userId OR $isAdmin = TRUE`). A service
account with admin privileges would expose private documents from other users to the
LLM. In a federal PM tool, private documents may contain pre-decisional material
protected under deliberative process privilege. An agent that ingests User B's private
notes and surfaces reasoning to User A is a data leakage vector.

**Architecture decision:** Read nodes (context, fetch-issues, fetch-sprints, fetch-team)
use `getClientForState()`, which selects cookie-based auth for on-demand and token-based
auth for proactive. Write nodes (persist, human-gate, execute) always use the service
account — findings are system-generated workspace documents, not user-authored.

This is a deliberate enforcement of ARCHITECTURE.md invariant #6: "On-demand mode sees
only what the user sees."

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
                  ┌──────▼──────┐  ┌──▼──────────┐
                  │   PERSIST   │  │   HUMAN     │
                  │ (save       │  │   GATE      │
                  │  finding +  │  │ (creates    │
                  │  auto-      │  │  finding,   │
                  │  resolve)   │  │  awaits     │
                  └──────┬──────┘  │  decision)  │
                         │        └──────┬───────┘
                         ▼               ▼
                        END             END
                                         │
                              ┌──────────┘
                              │ (via REST: POST /findings/:id/decide)
                              ▼
                       ┌──────────────┐
                       │   EXECUTE    │
                       │   ACTION     │
                       │ (imperative, │
                       │  after human │
                       │  approval)   │
                       └──────────────┘
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
| **Human Gate** | HITL | Pauses graph execution. Presents proposed action with context. Waits for acknowledge/snooze/approve via `/findings/:id/decide` endpoint. | -- |
| **Execute Action** | Action | Carries out the approved action via Ship API (PATCH issue, POST comment). | -- |
| **Persist** | Output | Saves finding document to Ship + creates entity association + updates FleetGraph config state. | -- |

### Conditional Edges

| Edge | Condition |
|---|---|
| Classify -> Clean | Reasoning found no conditions worth surfacing |
| Classify -> Notify | Finding detected, informational only (health score, trend, pattern) |
| Classify -> Action Propose | Finding includes a concrete recommended action that would modify Ship state |
| Human Gate -> Execute | User confirms proposed action |
| Human Gate -> Persist | User acknowledges or snoozes — skip execution, still record the finding |

### Parallel Execution

All three fetch nodes run in parallel — they're independent API calls. The
Reasoning node waits for all three to complete before executing.

### State Shape

Matches `fleetgraph/src/graph/state.ts` — LangGraph `Annotation.Root`, all camelCase.

```typescript
{
  // Trigger
  mode: "proactive" | "on_demand",
  scanType: "hot" | "daily" | "weekly" | null,  // cadence tier
  triggerId: string,

  // Context (on-demand fields null for proactive)
  userId: string | null,
  documentId: string | null,
  documentType: string | null,
  userMessage: string | null,        // on-demand: user's chat message
  sessionCookie: string | null,      // on-demand: forwarded session for auth

  // Context associations (resolved by context node for scoped fetching)
  contextSprintId: string | null,
  contextProjectId: string | null,
  contextProgramId: string | null,

  // Fetched data (populated by parallel fetch nodes)
  issues: ShipIssue[],
  sprints: ShipSprint[],
  sprintIssues: ShipSprintIssue[],
  scopeChanges: Array<{ sprintId, sprintName } & ShipScopeChanges>,
  projects: ShipProject[],
  programs: ShipProgram[],
  team: ShipTeamGrid | null,
  accountabilityItems: ShipAccountabilityItems | null,
  retroContent: Array<{ sprintId, sprintName, text }>,
  dependencyChain: Array<{ id, title, state, dependsOn }>,

  // Fetch errors (additive reducer — each node appends its key)
  fetchErrors: Record<string, string>,

  // Reasoning output
  findings: Finding[],               // structured findings from GPT-4o
  classification: "clean" | "notify" | "action_propose",

  // Action (HITL path)
  proposedAction: ProposedAction | null,   // singular, not array
  humanDecision: "confirmed" | "dismissed" | "snoozed" | null,
  executionResult: Record<string, unknown> | null,

  // On-demand response
  response: string | null,           // conversational answer to user's question

  // Persist output
  findingDocIds: string[],           // IDs of created/updated finding documents
  traceUrl: string | null,           // LangSmith trace link
}
```

Note: `human_decision` and `status` also exist as **finding document properties**
(stored in Ship's JSONB), with values `acknowledged | snoozed | confirmed | null`
and `active | pending_decision | acknowledged | snoozed | resolved` respectively.
These are distinct from the graph state's `humanDecision` field.

### Error Handling and Graceful Degradation

The graph handles failures at two levels: fetch failures (Ship API down or
partially available) and LLM failures (OpenAI API down or rate-limited).

**Fetch node failures (implemented):**

- Each fetch node catches errors and writes to `fetchErrors` state (additive
  reducer — `{ issues: "timeout", team: "401 Unauthorized" }`)
- The graph continues with whatever data arrived. Reasoning receives partial
  data and produces findings based on available information.
- A single fetch failure doesn't crash the graph — this was validated in
  production when the action-propose node's OpenAI schema error was caught
  while the rest of the graph completed successfully.

**Partial data degradation:**

| Missing data | What gets skipped | What still works |
|---|---|---|
| Team grid | Team load analysis, role resolution | Issue/sprint health checks |
| Sprint data | Scope creep detection, sprint health | Issue lifecycle checks |
| Issue data | Issue-specific findings | Sprint-level and project-level analysis |

**LLM failures (implemented):**

- Classify node defaults to `'clean'` on LLM error — proactive stays silent,
  on-demand produces no findings
- Reasoning node catches errors into `fetchErrors.reasoning`

**Not yet implemented** (designed but deferred):

- On-demand user-facing error message when all fetches fail ("Ship API is
  unreachable, try again in a few minutes")
- Reduced confidence flagging when reasoning on partial data
- Raw data link fallback for on-demand LLM failures

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

All proactive use cases (TC-1 through TC-4) are detected in a single graph
invocation — the proactive scan analyzes the full workspace and produces
rolled-up findings across multiple detection types. On-demand (TC-5) is a
separate invocation scoped to the user's current context.

### TC-1: Stale Triage Backlog (UC2)

- **Mode:** Proactive
- **Graph path:** Trigger → Fetch (parallel) → Reasoning (GPT-4o) → Classify (GPT-4o-mini) → Action Propose → Human Gate → Persist
- **Ship state:** 6 issues in `triage` status for 4-7 days in FleetGraph Demo program (4 external bugs, 2 internal feature requests). 1 confounder: fresh triage issue (1 day old).
- **Expected:** Rolled-up finding identifying stale triage backlog
- **Actual:** `stale_triage` finding at program and sprint level. Correctly identifies issues stuck in triage. Confounder (1-day-old issue) not flagged.
- **Trace:** https://smith.langchain.com/public/2e3c94cc-22ef-4d83-ab61-f91e0af7d25f/r

### TC-2: Overloaded Team Member (UC1/UC5)

- **Mode:** Proactive (same scan as TC-1)
- **Ship state:** David Kim assigned 29 active issues across 2 programs, 79h estimated in FleetGraph Demo Week 14 alone.
- **Expected:** Finding identifying overloaded team member with workload quantified
- **Actual:** `overloaded_member` finding for David Kim (warning). Title and summary reflect actual issue count.
- **Trace:** https://smith.langchain.com/public/2e3c94cc-22ef-4d83-ab61-f91e0af7d25f/r (shared proactive scan)

### TC-3: Accountability Debt (UC3)

- **Mode:** Proactive (same scan as TC-1)
- **Ship state:** Multiple team members with missing sprint plans, retros, and standups. Active and completed sprints with accountability gaps. Compliant members (Grace Lee, Iris Nguyen) present as confounders.
- **Expected:** Per-person and per-sprint accountability findings, compliant members excluded
- **Actual:** `accountability_debt` findings for Alice Chen, Dev User, and Weeks 12-14 missing plans/retros. Rolled up per entity. Program-level finding summarizing missing documentation.
- **Trace:** https://smith.langchain.com/public/2e3c94cc-22ef-4d83-ab61-f91e0af7d25f/r (shared proactive scan)

### TC-4: Blocked Work / Missing Estimates (UC4)

- **Mode:** Proactive (same scan as TC-1)
- **Ship state:** 4-link dependency chain in FleetGraph Demo (Document pool config → Health check → Retry logic → DB migration pooling), bottom 2 stuck in review. Multiple Week 14 sprints with unestimated issues.
- **Expected:** Blocked chain detection and missing estimate findings
- **Actual:** `blocked_chain` finding for "Create error handling" issue (critical). `missing_estimate` findings at sprint and program level identifying unestimated issues in active weeks.
- **Trace:** https://smith.langchain.com/public/2e3c94cc-22ef-4d83-ab61-f91e0af7d25f/r (shared proactive scan)

### TC-5: On-Demand Scoped Analysis (UC6)

- **Mode:** On-demand
- **Graph path:** Trigger → Context (resolves user + document) → Fetch (scoped to sprint) → Reasoning → Classify → Action Propose → Persist
- **Ship state:** User on a Week 14 sprint page, asking "What should I work on next?"
- **Expected:** Analysis scoped to the current sprint's issues, prioritized recommendations
- **Actual:** Response scoped to sprint context. Fetches sprint issues (not full workspace). Different execution path from proactive — context node resolves document associations before fetching.
- **Trace:** https://smith.langchain.com/public/8b727526-5e21-4cd5-8a86-67eb751ffedc/r

### Trace Diversity

| Path | Trace | Key Difference |
|------|-------|----------------|
| Proactive (workspace-wide) | [Proactive trace](https://smith.langchain.com/public/2e3c94cc-22ef-4d83-ab61-f91e0af7d25f/r) | No context node, full workspace fetch, multi-finding rollup |
| On-demand (scoped) | [On-demand trace](https://smith.langchain.com/public/8b727526-5e21-4cd5-8a86-67eb751ffedc/r) | Context resolves user + document, scoped fetch, user question shapes reasoning |

### Findings Dedup Verification

After 3+ consecutive proactive scans: total finding count equals unique
`(finding_type, affected_entity_id)` count. No duplicates created. Existing
findings updated in place when conditions persist — severity escalation
re-badges the user, same-severity updates are silent.

### Known Gaps for Final Submission

1. **Scope creep detection** — scope change data is fetched but stale_triage dominates reasoning in the monolithic prompt. Cadenced scan architecture (separating hot-loop detections from daily digest) will fix this.
2. **Retro pattern mining** — retro document content not yet fetched. Need document body fetching for UC7.
3. **On-demand chat responsiveness** — the graph produces findings but doesn't directly answer the user's question in conversational form. Response format improvement queued.

---

## Architecture Decisions

### Framework: LangGraph.js (TypeScript)

Ship is a TypeScript monorepo (Express + React + Vite). FleetGraph lives in the
same repo and shares types via the existing `shared/` package. LangGraph.js
provides conditional branching, parallel node execution, typed state management,
and native LangSmith tracing without manual instrumentation. No capability is
sacrificed vs. the Python counterpart.

### Node Design: Parallel Fetch + Error Isolation

Three fetch nodes (issues, sprints, team) run in parallel — wall clock time
equals the slowest fetch, not the sum. Each fetch node catches its own errors
and reports them in `fetchErrors` state. A single fetch failure doesn't crash the
graph — the reasoning node works with whatever data arrived. This was validated
in production: the action-propose node's OpenAI schema error was caught and
isolated while the rest of the graph completed successfully.

### Dual Auth Model

Two authentication paths, chosen by mode:

- **Proactive mode:** service account API token (Bearer auth). The agent scans
  workspace-wide data autonomously.
- **On-demand mode:** forwarded user session cookie. The agent sees only what the
  requesting user can see.

This distinction matters in a federal PM tool. Ship applies per-document visibility
filtering: `(visibility = 'workspace' OR created_by = $userId OR $isAdmin)`. If
on-demand mode used the service account, the LLM could ingest User B's private
documents and surface reasoning to User A — a data leakage vector. In a government
context, private documents may contain pre-decisional material protected under
deliberative process privilege. The dual auth model ensures the agent cannot
escalate privilege.

### Findings as Documents

FleetGraph output is stored in Ship's unified document model as `fleetgraph_finding`
documents. No shadow databases, no hidden state files. Findings are visible to
workspace members, searchable, commentable, and linked to affected entities via
`document_associations`. The agent's memory is the workspace's memory.

Dedup keys on `(finding_type, affected_entity_id)`. When a condition persists
across scans, the existing finding is updated in place (title, severity, content)
rather than creating a duplicate. Severity escalation (warning → critical)
re-badges the user; same-severity updates are silent.

### Human Decision Model: No Permanent Suppress

Three actions available on findings:

- **Acknowledge** — "I've seen this." Clears badge. Finding stays alive. Future
  scans update in place. Only re-badges on severity escalation.
- **Snooze** — time-boxed deferral (tomorrow morning or next week). Self-reversing.
- **Approve** — only on findings with proposed mutations (reassign, change state).
  Executes the action via Ship API.

There is no dismiss/ignore. You cannot permanently silence a finding. This is
intentional: in a government PM tool, permanent suppression of system-detected
conditions is an audit liability. The system keeps watching. If you acknowledged
something and it gets worse, you hear about it again.

### Cadenced Scan Architecture

#### The problem with uniform polling

The MVP runs all 7 detection types in a single 5-minute poll. This is
simultaneously too slow for some conditions and too fast for others, and it
forces GPT-4o to detect everything at once — reducing per-type accuracy.

Scope creep happens in real time (a PM adds issues to an active sprint), but
the uniform poll won't catch it for up to 5 minutes. Stale triage, by contrast,
is a slow-moving condition — the same issues have been stuck for days — yet the
poll re-scans them 288 times/day, producing identical findings each time.

#### Cadence-to-use-case mapping

| Cadence | Use Cases | Why This Cadence | Prompt Strategy |
|---------|-----------|------------------|-----------------|
| Real-time/event (5-min backup) | UC1 Scope Creep, UC4 Blocked Chain | Scope creep needs seconds (interrupt the decision). Chains form over hours. | Focused: sprint assignments + state transitions only |
| Daily digest (morning) | UC2 Stale Triage, UC3 Accountability, UC5 Risk | Triage staleness is time-based, not event-based. Accountability matches management rhythm. Risk changes weekly. | Full workspace scan, one comprehensive analysis |
| Weekly/event | UC7 Retro Patterns | Retros written once/sprint. Trigger on retro submission. | Deep cross-document analysis, rare |
| On-demand | UC4-7 | User-initiated, scoped to current context | Context-aware, instant |

#### Why splitting improves detection quality

The current kitchen-sink prompt asks GPT-4o to detect scope creep AND stale
triage AND accountability AND blocked chains simultaneously. In practice,
`stale_triage` dominates because it's the most obvious pattern — issues stuck
for days are easy to spot, while scope creep requires comparing sprint start
state to current state. Focused prompts eliminate this competition: the hot-loop
prompt ONLY looks for scope creep and blocked chains, so the LLM's full
attention is on time-sensitive conditions.

This is validated by the `scanType` routing in `reasoning.ts`:

- **hot**: `scope_creep`, `blocked_chain` only (uses GPT-4o-mini for speed)
- **daily**: `stale_triage`, `accountability_debt`, `blocked_sprint`,
  `overloaded_member`, `missing_estimate`, `sprint_velocity_drop`,
  `unplanned_work` (uses GPT-4o for depth)
- **weekly**: `retro_patterns` only (uses GPT-4o for cross-document analysis)

Fetch nodes also vary by cadence — hot scans fetch only active sprints, daily
scans fetch all sprints for accountability coverage, weekly scans pull retro
document content.

#### Cost analysis (before/after)

| Approach | Runs/day | Cost/run | Est. cost/day |
|----------|----------|----------|---------------|
| Uniform 5-min poll (current MVP) | 288 full scans | ~$0.05 | ~$14.40 |
| Hot loop (5-min, focused prompt) | ~288 | ~$0.01 | ~$2.88 |
| Daily digest (1×/morning) | 1 | ~$0.05 | ~$0.05 |
| Weekly/event (retro trigger) | ~0.14 | ~$0.03 | ~$0.004 |
| **Cadenced total** | | | **~$2.93** |

**79% reduction** with better responsiveness and detection quality.

The hot-loop cost drops from $0.05 to $0.01 because the prompt is smaller
(fewer detection types, less context to inject) and uses GPT-4o-mini instead
of GPT-4o. The daily scan stays at $0.05 but runs once instead of 288 times.

#### Responsiveness analysis

More frequent is not always more responsive. For conditions that change slowly,
high-frequency polling creates noise without adding value:

| Condition | Uniform (current) | Cadenced | Why cadenced is better |
|-----------|-------------------|----------|----------------------|
| Scope creep | Up to 5 min lag | Seconds (event-driven) | PM sees finding while still on sprint page |
| Blocked chain | Up to 5 min lag | Seconds (event-driven) | Intervention happens before the chain grows |
| Stale triage | 288 pings/day about same items | 1 morning notification | One summary is more actionable than constant repetition |
| Accountability debt | 288 pings/day | 1 morning notification | Matches 1:1 and standup rhythm. Higher frequency is surveillance, not intelligence |
| Retro patterns | Checked 288×/day, changes ~weekly | On retro submission | Retro content changes once per sprint. 288 checks find nothing 287 times |

**The key insight:** The right cadence matches the natural rhythm of the
condition AND the workflow of the person who acts on it. A PM checking their
morning summary acts on accountability debt. A PM interrupted mid-sprint-edit
acts on scope creep. Different rhythms, different cadences.

#### Implementation status

The cadence routing is **implemented in code** — `state.ts` defines
`scanType: 'hot' | 'daily' | 'weekly' | null`, reasoning.ts constrains finding
types and selects models per cadence, and fetch nodes vary their data retrieval
by scanType. What's not yet implemented is the **scheduler**: the trigger
currently dispatches all scans as a single type. Wiring the scheduler to invoke
the graph with different `scanType` values on different schedules is the
remaining work.

### Deployment: Separate Service on Linode VPS

FleetGraph runs on a Linode VPS via pm2, separate from Ship's AWS Elastic
Beanstalk deployment. Ship's API proxies FleetGraph requests, forwarding session
auth. Separation because: FleetGraph has different scaling characteristics (LLM
latency, not request throughput), doesn't need EB's auto-scaling, and shouldn't
be coupled to Ship's deploy cycle. A FleetGraph restart doesn't take Ship down.
