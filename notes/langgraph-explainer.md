# FleetGraph LangGraph Explainer

How the graph works, what ShipClient does, why we have one graph instead of two,
and how permissions flow through the system.

---

## What Is LangGraph?

LangGraph is a framework for building stateful, multi-step AI workflows as directed
graphs. Think of it as a state machine where:

- **Nodes** are async functions that read state and return partial state updates
- **Edges** connect nodes — either unconditionally ("always go here next") or
  conditionally ("go here if X, there if Y")
- **State** is a typed object that accumulates as execution flows through nodes

The key insight: instead of writing a long procedural function that calls the LLM,
parses the result, calls another API, etc., you decompose that into discrete nodes.
LangGraph handles execution order, parallelism, error propagation, and tracing.

### Why Not Just Write Async Functions?

You could. LangGraph gives you three things you'd have to build yourself:

1. **Automatic tracing** — every node execution is traced in LangSmith with timing,
   inputs, outputs, token usage. You get a visual timeline of your graph run for free.
   This is a grading requirement (every run must be traced).

2. **Conditional branching** — the classify node returns "clean", "notify", or
   "action_propose" and the graph takes a different path for each. Without LangGraph
   you'd write `if/else` chains. With LangGraph the topology is declarative and
   visible in traces.

3. **Parallel execution** — the three fetch nodes (issues, sprints, team) run
   simultaneously. LangGraph handles the fan-out and fan-in automatically. You just
   say "these three nodes all follow this one node" and "this next node waits for
   all three."

4. **Human-in-the-loop** — LangGraph has a built-in interrupt/resume mechanism.
   When the graph proposes an action that needs human approval, it can pause, persist
   its state, and resume later when the human responds. Without this, you'd need to
   build your own checkpoint/resume system.

### The State Object

Here's what our graph state looks like (simplified):

```typescript
{
  // What triggered this run
  mode: 'proactive' | 'on_demand',
  triggerId: 'some-uuid',

  // Who/what is this about
  userId: string | null,
  documentId: string | null,
  userMessage: string | null,       // only in on-demand mode

  // Data fetched from Ship (populated by fetch nodes)
  issues: ShipIssue[],
  sprints: ShipSprint[],
  projects: ShipProject[],
  team: ShipTeamGrid | null,
  accountabilityItems: ShipAccountabilityItems | null,

  // What the LLM concluded (populated by reasoning + classify nodes)
  findings: Finding[],
  classification: 'clean' | 'notify' | 'action_propose',

  // Action flow (populated by action-propose + human-gate + execute nodes)
  proposedAction: ProposedAction | null,
  humanDecision: 'confirmed' | 'dismissed' | 'snoozed' | null,
  executionResult: Record<string, unknown> | null,

  // Errors from any node that failed
  fetchErrors: Record<string, string>,
}
```

Every node receives the full state and returns a partial update. For example,
the fetch-issues node receives all of the above but only returns
`{ issues: [...] }`. LangGraph merges that into the state before the next
node runs.

### What a Node Looks Like

```typescript
// fleetgraph/src/graph/nodes/fetch-issues.ts
export async function fetchIssuesNode(state: GraphStateType) {
  const client = getProactiveClient();
  if (!client) {
    return { fetchErrors: { 'fetch-issues': 'No Ship client configured' } };
  }

  const result = await client.getIssues();

  if (result.error) {
    return { fetchErrors: { 'fetch-issues': result.error.message } };
  }

  return { issues: result.data };
}
```

That's it. The node doesn't know what ran before it or what runs after it. It reads
what it needs from state, does its work, and returns what changed. LangGraph handles
the rest.

---

## What Is ShipClient?

ShipClient is a pre-configured widget for talking to Ship. You create one with
an identity baked in (either a service account token or a user's session cookie),
and from that point on, nodes just push method calls onto it — `client.getProjects()`,
`client.getIssues()` — and get typed data back. The node doesn't know or care about
auth headers, URL construction, or error parsing. Push a method name in, get data out.

It exists because FleetGraph is a separate service that talks to Ship over HTTP —
it never touches Ship's database directly.

### The Two Auth Modes

This is the core of the permissions question. ShipClient supports two ways to
authenticate:

**1. Bearer Token (proactive mode)**

```typescript
const client = ShipClient.withToken('http://localhost:3000', 'fg-service-token-xxx');
// Sends: Authorization: Bearer fg-service-token-xxx
```

This is a service account. FleetGraph uses it when it's running on its own —
scanning the workspace, detecting problems, creating findings. It has its own
identity in Ship, like a bot user. It sees what a workspace admin sees.

**2. Forwarded Cookie (on-demand mode)**

```typescript
const client = ShipClient.withCookie('http://localhost:3000', req.headers.cookie);
// Sends: Cookie: __session=abc123...
```

When a user opens the chat panel in Ship and asks FleetGraph a question, Ship's
frontend sends the request to Ship's API, which proxies it to FleetGraph. The
user's session cookie comes along for the ride. FleetGraph forwards that same
cookie when it calls Ship's API, so Ship thinks the request is coming from the
user. **The user only sees what they're allowed to see.**

### Why This Matters for Security

The ARCHITECTURE.md invariant says: "On-demand mode sees only what the user sees."
By forwarding the user's cookie, we don't have to implement our own permission
system. Ship already has one — visibility rules, workspace scoping, admin checks.
We just pass through the user's identity and Ship enforces its own rules.

The proactive mode (Bearer token) is the privileged path. It runs as a service
account, sees everything, and can create finding documents. But it can never
*execute actions* without human approval — that's what the Human Gate node enforces.

### The Result Pattern

ShipClient methods never throw. They return `{ data, error }`:

```typescript
const result = await client.getIssues();
if (result.error) {
  // result.error = { status: 404, message: 'Not found' }
  // Handle gracefully — don't crash the graph
} else {
  // result.data = ShipIssue[]
}
```

This is intentional. The fetch nodes run in parallel. If one fails (say, the team
endpoint is down), the others should still complete. Throwing exceptions would
kill the entire parallel group. Instead, each node writes its errors into
`fetchErrors` and the reasoning node can see what data it has and what's missing.

---

## The Graph Topology

Here's what the graph looks like:

```
START
  │
  ▼
trigger ─── "What kind of run is this? Set mode + triggerId"
  │
  ▼
context ─── "Who is the user? What document are they viewing?"
  │
  ├───────────────┼───────────────┐
  ▼               ▼               ▼
fetch-issues  fetch-sprints  fetch-team    ← these three run IN PARALLEL
  │               │               │
  └───────────────┼───────────────┘
                  │
                  ▼
              reasoning ─── "GPT-4o analyzes all fetched data, produces findings"
                  │
                  ▼
               classify ─── "GPT-4o-mini categorizes: clean / notify / action_propose"
                  │
          ┌───────┼───────────────┐
          │       │               │
     clean│  notify│        action_propose│
          │       │               │
          ▼       ▼               ▼
         END    notify      action-propose ─── "Package proposed mutation"
                  │               │
                  ▼               ▼
               persist       human-gate ─── "Pause. Wait for human confirm/dismiss"
                  │               │
                  ▼               ▼
                 END           execute ─── "Carry out the approved action via Ship API"
                                  │
                                  ▼
                               persist ─── "Save finding document to Ship"
                                  │
                                  ▼
                                 END
```

### The Three Paths

**Clean path:** Reasoning finds nothing wrong → classify says "clean" → graph ends.
No output, no noise. This is the most common path in a healthy workspace.

**Notify path:** Reasoning finds something worth surfacing (e.g., "3 issues have been
in triage for 2 weeks") → classify says "notify" → notify node packages it up →
persist node creates a `fleetgraph_finding` document in Ship. Users see it in the
findings panel. No action needed.

**Action path:** Reasoning finds something that needs intervention (e.g., "Sprint 7
has 40% scope creep, recommend removing the 3 lowest-priority issues") → classify
says "action_propose" → action-propose packages the proposed mutation → human-gate
pauses and waits → user confirms or dismisses → if confirmed, execute node calls
Ship's API to make the change → persist saves the finding.

---

## Why One Graph, Not Two?

Your instinct is reasonable. The proactive and on-demand modes have different:

- **Triggers** — WebSocket events vs. user chat message
- **Auth** — service account vs. user session
- **Scope** — workspace-wide vs. current document
- **Entry data** — no user message vs. a user's question

So why not two separate graphs?

### What Actually Overlaps

Let's map it out:

| Node | Proactive | On-Demand | Different? |
|------|-----------|-----------|------------|
| trigger | Sets mode=proactive, triggerId from event | Sets mode=on_demand, triggerId from request | **Yes** — different initial state, but same node just reads from input |
| context | No userId, no documentId. Workspace-wide. | userId from session, documentId from request body | **Yes** — different scope resolution |
| fetch-issues | Fetches ALL issues (service account) | Fetches issues visible to THIS USER | **Sort of** — same API call, different auth token means different results |
| fetch-sprints | All sprints | User-visible sprints | Same as above |
| fetch-team | Full team grid | User-visible team | Same as above |
| reasoning | "Analyze this workspace" | "Answer this question about what I'm looking at" | **Yes** — different system prompts |
| classify | Same logic | Same logic | No |
| notify | Same | Same | No |
| action-propose | Same | Same | No |
| human-gate | Same | Same | No |
| execute | Same | Same | No |
| persist | Same | Same | No |

So about 4-5 nodes have meaningfully different behavior. The other 7 are identical.

### The Case for One Graph

**1. The conditional logic is already in the graph.**

The trigger node checks `state.mode` and sets context accordingly. The fetch nodes
already use different auth based on mode (proactive uses `getProactiveClient()`,
on-demand will use `getOnDemandClient()` — not implemented yet but the factory
exists). The reasoning node will use different system prompts based on mode.
These are `if (state.mode === 'proactive')` checks inside the node, not different
graph topologies.

**2. Two graphs means maintaining two topologies.**

If you add a new node (say, a "check-for-duplicates" node between reasoning and
classify), you'd add it to both graphs. If you change the edge from classify to
notify, you'd change it in both. The topology is the same — the differences are
in node internals.

**3. LangSmith tracing is per-graph.**

With one graph, every run — proactive or on-demand — appears in the same LangSmith
project with the same node names. You can filter by `mode` tag. With two graphs,
you'd have two separate trace streams. When something breaks in reasoning, you want
to compare proactive and on-demand traces side by side.

**4. The Human Gate works the same way regardless of trigger.**

Whether a proactive scan or a user chat proposes an action, the pause/resume
mechanism is identical. Same endpoint, same finding document, same decision flow.

### Nodes as Multi-Arity Functions

Each node is really two functions in a one-function box. The `fetchIssuesNode` does
different work depending on whether it's proactive (service account, fetch everything)
or on-demand (user session, fetch what they can see). Right now that's a simple
`if/else` on `state.mode`, and for most nodes the difference is just which
ShipClient gets created. But if a node's two modes ever diverge enough that the
branching becomes ugly — that's the signal that the node should split, or that the
graph should split.

### When to Add a Second Graph

The PRD has 7 use cases. Some — like cross-sprint velocity analysis or program-level
accountability rollups — could involve aggregation steps (extra nodes, different
edge wiring) that the on-demand "tell me about this issue" path would never touch.
If we hit a use case where the **topology** genuinely differs, not just the prompts,
a second graph is the right call. The architecture supports it cleanly:
`buildGraph()` is just a function. We'd add `buildAggregationGraph()` and they'd
share node functions where they overlap. For now: one graph, watch for the seam.

### How the Branching Actually Works

The mode-based branching happens inside individual nodes, not at the graph level:

```typescript
// In the context node (simplified future implementation)
export async function contextNode(state: GraphStateType) {
  if (state.mode === 'proactive') {
    // Workspace-wide scope — no specific document
    return { documentId: null, documentType: null };
  } else {
    // On-demand — scope to what the user is viewing
    // documentId and userId already set by trigger from the request
    return {};
  }
}
```

```typescript
// In a fetch node (simplified future implementation)
export async function fetchIssuesNode(state: GraphStateType) {
  // Auth mode determined by how the client was created
  const client = state.mode === 'proactive'
    ? getProactiveClient()          // Bearer token, sees everything
    : getOnDemandClient(baseUrl, state.cookieHeader);  // User's session

  // Same API call — Ship enforces visibility based on auth
  const result = await client.getIssues();
  return { issues: result.data };
}
```

The graph topology stays the same. The nodes adapt internally.

---

## How Data Flows Through a Real Run

Let's trace a proactive run from start to finish:

**1. Something happens in Ship.** A user moves an issue to "done", or the
5-minute poll fires.

**2. The trigger pipeline dispatches a graph run.** It creates initial state:

```typescript
graph.invoke({
  mode: 'proactive',
  triggerId: 'poll-2026-03-16T22:00:00Z',
})
```

**3. Trigger node** — logs the run, no state changes needed.

**4. Context node** — proactive mode, so no user/document context to resolve.

**5. Three fetch nodes run in parallel:**

- `fetch-issues` calls `GET /api/issues` → gets 47 issues across all states
- `fetch-sprints` calls `GET /api/projects` → finds 3 projects → for each,
  fetches sprints, sprint issues, scope changes → gets 8 sprints, 31 sprint
  issues, scope change data for the active sprint
- `fetch-team` calls `GET /api/team/grid`, `GET /api/accountability/action-items`,
  `GET /api/programs` in parallel → gets 6 team members, 4 accountability items,
  2 programs

All three write their results into state. If `fetch-team` fails (say, the
team endpoint times out), the other two still succeed. `fetchErrors` captures
what went wrong.

**6. Reasoning node** — constructs a prompt like:

> You are a project intelligence agent analyzing a workspace.
> Here are 47 issues, 8 sprints, 6 team members, 4 accountability items...
> Identify problems: scope creep, stale triage, accountability gaps,
> unbalanced workloads, blocked sprints.

Sends this to GPT-4o. Gets back structured findings:

```json
[
  {
    "findingType": "scope_creep",
    "severity": "warning",
    "affectedEntityId": "sprint-uuid-7",
    "title": "Sprint 7 scope increased 35% since planning",
    "reasoning": "3 high-priority issues were added after sprint start..."
  },
  {
    "findingType": "stale_triage",
    "severity": "info",
    "affectedEntityId": "issue-uuid-42",
    "title": "Issue #42 has been in triage for 14 days",
    "reasoning": "This issue was created two weeks ago and hasn't been..."
  }
]
```

**7. Classify node** — sends the findings to GPT-4o-mini:

> Given these findings, should the agent: do nothing (clean), surface them
> to the team (notify), or propose a specific action (action_propose)?

GPT-4o-mini says: `"notify"` — there are problems worth surfacing but nothing
urgent enough to propose a mutation.

**8. Classify router** — the conditional edge reads `state.classification` and
routes to the "notify" node.

**9. Notify node** — packages findings for display.

**10. Persist node** — for each finding, calls `POST /api/documents` to create
a `fleetgraph_finding` document in Ship. Now the findings are visible in Ship's
UI, searchable, commentable, linked to the affected sprint/issue.

**11. Graph ends.** The entire run is traced in LangSmith — you can see the
parallel fetch timing, both LLM calls with their prompts and responses, and the
final persist calls.

---

## The Files

```
fleetgraph/src/
├── config.ts                     # Env vars: API keys, URLs, port
├── ship/
│   ├── client.ts                 # ShipClient class — typed HTTP wrapper
│   ├── factory.ts                # getProactiveClient() / getOnDemandClient()
│   ├── types.ts                  # Response types matching Ship's API
│   └── index.ts                  # Barrel export
└── graph/
    ├── state.ts                  # GraphState annotation — the typed state object
    ├── graph.ts                  # buildGraph() — wires nodes + edges, compiles
    ├── edges.ts                  # classifyRouter — conditional edge function
    ├── nodes/
    │   ├── trigger.ts            # Entry point — sets mode
    │   ├── context.ts            # Resolves user/document scope
    │   ├── fetch-issues.ts       # GET /api/issues
    │   ├── fetch-sprints.ts      # GET /api/projects → sprints → sprint issues
    │   ├── fetch-team.ts         # GET /api/team/grid + accountability + programs
    │   ├── reasoning.ts          # GPT-4o analysis (currently stub)
    │   ├── classify.ts           # GPT-4o-mini routing (currently stub)
    │   ├── notify.ts             # Package findings for display (currently stub)
    │   ├── action-propose.ts     # Package proposed mutation (currently stub)
    │   ├── human-gate.ts         # Pause for human confirmation (currently stub)
    │   ├── execute.ts            # Carry out approved action (currently stub)
    │   └── persist.ts            # Save finding document to Ship (currently stub)
    └── run-stub.ts               # Test script — exercises all 3 paths
```

### What's Real vs. Stub

As of right now:

- **Real:** ShipClient, all fetch nodes (issues, sprints, team), graph topology,
  state types, conditional edges, parallel execution
- **Stub:** reasoning (returns fake finding), classify (passes through), notify,
  action-propose, human-gate, execute, persist (all pass-through)

Next task (`bd-3ox`) replaces reasoning and classify with real OpenAI calls.
After that, the graph will actually think.
