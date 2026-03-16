# FleetGraph — Architecture

Project intelligence agent for Ship. Proactive monitoring and on-demand reasoning
via graph architecture.

---

## Stack

**LangGraph.js (TypeScript)** — graph orchestration framework with conditional
branching, parallel node execution, state management, and native LangSmith tracing.
v1, ~400K weekly npm downloads, feature parity with the Python counterpart.

**Why TypeScript over Python:** Ship is a TypeScript monorepo (Express + React + Vite).
FleetGraph lives in the same repo and shares types via the existing `shared/`
package. One language means unified types, unified tests, one dependency manager
(pnpm). LangGraph.js is at full feature parity — no capability is sacrificed.

**OpenAI API** for LLM reasoning. Different models at different graph nodes:

- **Reasoning nodes** (deep analysis): GPT-4o or equivalent — needs strong analytical
  capability for relationship reasoning, risk assessment, pattern detection
- **Classification nodes** (routing): GPT-4o-mini — fast, cheap, just needs to
  categorize the reasoning output into clean/notify/action-propose

**LangSmith** for observability. Traces every graph run automatically via LangGraph's
native integration. No manual instrumentation needed.

**Ship REST API** as the sole data source. FleetGraph never touches the database
directly — all reads and writes go through Ship's HTTP endpoints.

**Ship WebSocket** (`/events`) for real-time event triggers.

---

## Directory Structure

```
fleetgraph/
├── package.json              # pnpm workspace member
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point — starts proactive listener + API server
│   ├── graph/
│   │   ├── state.ts          # LangGraph state definition (TypeScript types)
│   │   ├── graph.ts          # Graph construction — nodes, edges, conditionals
│   │   ├── nodes/
│   │   │   ├── trigger.ts    # Entry node — routes proactive vs. on-demand
│   │   │   ├── context.ts    # Resolves user, document, scope
│   │   │   ├── fetch-issues.ts
│   │   │   ├── fetch-sprints.ts
│   │   │   ├── fetch-team.ts
│   │   │   ├── reasoning.ts  # LLM reasoning (GPT-4o)
│   │   │   ├── classify.ts   # Conditional routing (GPT-4o-mini)
│   │   │   ├── notify.ts     # Surface finding, no action needed
│   │   │   ├── action-propose.ts  # Propose mutation, needs HITL
│   │   │   ├── human-gate.ts # Pause for human confirmation
│   │   │   ├── execute.ts    # Carry out approved action via Ship API
│   │   │   └── persist.ts    # Save finding document + update state
│   │   └── edges.ts          # Conditional edge functions
│   ├── ship/
│   │   ├── client.ts         # Ship API client (typed, handles auth)
│   │   ├── websocket.ts      # /events WebSocket listener with reconnection
│   │   └── types.ts          # Ship API response types (or import from shared/)
│   ├── trigger/
│   │   ├── listener.ts       # WebSocket event handler — debounce + dispatch
│   │   └── poller.ts         # 5-minute safety net poll
│   ├── api/
│   │   ├── server.ts         # Express server for on-demand chat endpoint
│   │   └── routes/
│   │       ├── chat.ts       # POST /api/fleetgraph/chat — on-demand entry point
│   │       └── findings.ts   # GET /api/fleetgraph/findings — list findings
│   └── config.ts             # Environment variables, model selection, intervals
├── tests/
│   ├── graph/                # Graph execution tests
│   ├── nodes/                # Individual node unit tests
│   └── ship/                 # Ship API client tests
├── FleetGraph_PRD.pdf
└── scratch/
    ├── RECON.md
    └── RECON-PROMPT.md
```

Ship-side additions (minimal — thin integration layer):

```
web/src/components/FleetGraph/
├── ChatPanel.tsx             # Embedded chat UI component
├── FindingsPanel.tsx         # Proactive findings display
└── hooks/
    └── useFleetGraph.ts      # React Query hooks for FleetGraph API

api/src/routes/
└── fleetgraph.ts             # Proxy routes to FleetGraph service
```

---

## Data Model

FleetGraph state lives in Ship's unified document model. Two new document types
added to the `document_type` enum:

### `fleetgraph_finding`

Each finding is a Ship document. Gets history, associations, comments, audit trail,
search, and backlinks for free.

**Properties (JSONB):**

```typescript
{
  finding_type: string;           // e.g., "scope_creep", "stale_triage", "accountability_debt"
  severity: "info" | "warning" | "critical";
  status: "active" | "dismissed" | "snoozed" | "resolved";
  affected_entity_id: string;     // UUID of the issue/sprint/project this is about
  affected_entity_type: string;   // "issue" | "sprint" | "project" | "program" | "person"
  proposed_action: {              // null if informational only
    type: string;                 // e.g., "change_state", "reassign", "escalate"
    params: Record<string, unknown>;
  } | null;
  human_decision: "confirmed" | "dismissed" | "snoozed" | null;
  snooze_until: string | null;    // ISO timestamp
  reasoning_model: string;        // which model produced this finding
  token_usage: { input: number; output: number };
  trace_url: string | null;       // LangSmith trace link
}
```

**Content:** The LLM's reasoning narrative — human-readable explanation of what was
found, why it matters, and what's recommended.

**Associations:** Linked to the affected entity via `document_associations`
(relationship_type: `parent` or a new `finding` type).

### `fleetgraph_config`

Singleton per workspace. Operational state for the proactive agent.

**Properties (JSONB):**

```typescript
{
  last_check_at: string | null;         // ISO timestamp of last proactive scan
  notification_cooldowns: Record<string, string>;  // entity_id → last_notified_at
  agent_token_id: string;               // API token used by the proactive agent
  poll_interval_ms: number;             // default 300000 (5 min)
  debounce_window_ms: number;           // default 30000 (30 sec)
  enabled_detections: string[];         // which finding_types are active
}
```

### Migration

One migration file adds:

- Two values to the `document_type` enum
- (Optionally) a new `finding` value to the association `relationship_type` enum

No new tables. No schema.sql changes.

---

## API Surface

### FleetGraph Service API

FleetGraph runs its own lightweight Express server (separate port from Ship).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/fleetgraph/chat | User session (proxied) | On-demand: user sends a message, gets agent response |
| GET | /api/fleetgraph/findings | User session (proxied) | List findings for current scope (doc/workspace) |
| POST | /api/fleetgraph/findings/:id/decide | User session (proxied) | HITL: confirm/dismiss/snooze a finding |
| GET | /api/fleetgraph/health | None | Service health check |

### Ship Proxy Routes

Ship's API proxies requests to FleetGraph, forwarding the user's session:

| Method | Path | Proxies To |
|--------|------|-----------|
| POST | /api/fleetgraph/chat | FleetGraph POST /api/fleetgraph/chat |
| GET | /api/fleetgraph/findings | FleetGraph GET /api/fleetgraph/findings |
| POST | /api/fleetgraph/findings/:id/decide | FleetGraph POST /api/fleetgraph/findings/:id/decide |

### Ship API Endpoints Consumed by FleetGraph

Core reads (fetch nodes):

- `GET /api/issues` — filtered by state, priority, assignee, sprint, program
- `GET /api/issues/:id` — full issue detail
- `GET /api/weeks/:id` — sprint detail
- `GET /api/weeks/:id/issues` — issues in sprint
- `GET /api/weeks/:id/scope-changes` — scope creep detection
- `GET /api/projects/:id` — project detail with ICE scores
- `GET /api/projects/:id/issues` — issues in project
- `GET /api/projects/:id/sprints` — sprints in project
- `GET /api/programs/:id` — program detail
- `GET /api/team/grid` — team members with allocations
- `GET /api/accountability/action-items` — accountability debt
- `GET /api/dashboard/my-work` — user's issue portfolio (on-demand)
- `GET /api/standups/status` — standup compliance
- `GET /api/documents/:id` — any document by ID
- `GET /api/documents/:id/associations` — document relationships

Writes (execute node, after HITL approval):

- `PATCH /api/issues/:id` — change state, reassign
- `POST /api/documents/:id/comments` — add agent comment
- `POST /api/documents` — create finding documents
- `PATCH /api/documents/:id` — update finding status

---

## Key Abstractions

A Trench agent working on FleetGraph needs to understand these five concepts:

1. **The Graph** — a LangGraph `StateGraph` with typed state. Nodes are async
   functions that read/write state. Edges are conditional functions that route
   execution. Both modes (proactive and on-demand) enter the same graph through
   the Trigger node with different initial state.

2. **Ship Client** — a typed HTTP client that wraps Ship's REST API. Handles two
   auth modes: Bearer token (proactive) and forwarded session cookie (on-demand).
   All Ship data access goes through this client — never raw fetch calls.

3. **Findings as Documents** — FleetGraph's output is Ship documents of type
   `fleetgraph_finding`. They live in the same system as everything else: visible
   to users, searchable, commentable, linked to the entities they concern via
   associations. The agent's memory is the workspace's memory.

4. **The Trigger Pipeline** — WebSocket listener receives events, debounces them
   (30-second window), and dispatches graph runs. The 5-minute poller is a safety
   net, not the primary trigger. On-demand requests bypass this entirely and invoke
   the graph directly.

5. **Human Gate** — the graph pauses at this node when an action is proposed. The
   finding document is created with `status: "active"` and `human_decision: null`.
   The `/findings/:id/decide` endpoint receives the user's choice and resumes or
   terminates the graph.

---

## Glossary

| Term | Definition | Not To Be Confused With |
|------|-----------|------------------------|
| **Finding** | A FleetGraph output — an analyzed condition with severity, reasoning, and optional proposed action. Stored as a `fleetgraph_finding` document. | A raw metric or alert — findings include reasoning about *why* something matters |
| **Graph Run** | A single execution of the LangGraph state graph, from Trigger through Persist. Produces zero or more findings. Every run is traced in LangSmith. | A "query" or "API call" — a graph run may make many API calls and LLM invocations |
| **Proactive Mode** | FleetGraph runs on its own, triggered by Ship events or poll schedule. No user present. Uses service account auth. | A cron job — proactive runs are event-driven with poll as safety net |
| **On-Demand Mode** | FleetGraph runs in response to a user's chat message. Context-aware: scoped to what the user is viewing. Uses user's session. | A chatbot — on-demand mode runs the same analytical graph, not a conversation model |
| **Human Gate** | A graph node that pauses execution and waits for human confirmation before performing a Ship mutation. | An approval workflow — the gate is immediate and binary (confirm/dismiss/snooze) |
| **Ship Client** | FleetGraph's typed HTTP client for Ship's REST API. Two auth modes. | Ship's own API routes — the client is a consumer, not a provider |
| **Scope** | The boundary of a graph run's analysis. Proactive: workspace-wide. On-demand: current document + its neighbors (associated sprint, project, program, assignee). | A permission scope — scope determines what data to fetch, not what the user can see |

---

## Invariants

1. **FleetGraph never writes to Ship's database directly.** All mutations go through
   Ship's REST API, which enforces its own validation, auth, and audit logging.

2. **No Ship mutation without human approval.** The Human Gate node must be traversed
   before any write to Ship. Reads are autonomous.

3. **Every graph run is traced.** LangSmith tracing is always on. No untraceable
   code paths.

4. **Findings are documents.** FleetGraph's state is visible to workspace members.
   No shadow databases, no hidden state files.

5. **The graph is not a pipeline.** Different inputs must produce visibly different
   execution paths. The Classify node's conditional edges are the mechanism — a
   clean workspace and a problem-filled workspace must take different branches.

6. **On-demand mode sees only what the user sees.** The forwarded session scopes
   Ship API responses to the user's permissions. The agent cannot escalate privilege.

7. **Proactive mode stays quiet when there's nothing to say.** A graph run that
   finds no problems produces no output. No "everything is fine" noise.
