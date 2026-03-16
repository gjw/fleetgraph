# Ship Recon Report

Produced by Tower for FleetGraph pre-search. Not an architecture document — no
decisions made here. Raw inventory only.

---

## 1. Ship Data Model

### Core Design: Unified Document Model

Everything is stored in a single `documents` table with a `document_type` enum.
No type-specific content tables. Type-specific data lives in a JSONB `properties`
column. TipTap JSON content in `content`, Yjs binary state in `yjs_state`.

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **workspaces** | Multi-tenant container | id, name, sprint_start_date, archived_at |
| **users** | Global identity (cross-workspace) | id, email, password_hash, name, is_super_admin, x509_subject_dn, last_auth_provider |
| **workspace_memberships** | Authorization (who can access what) | workspace_id→workspaces, user_id→users, role (admin\|member) |
| **workspace_invites** | Pending invitations | workspace_id, email, token, x509_subject_dn, expires_at, used_at |
| **sessions** | Active sessions (15min inactivity / 12hr absolute) | id (hex string), user_id, workspace_id, expires_at, last_activity, ip_address |
| **documents** | All content types | See below |
| **document_associations** | Junction table for doc→doc relationships | document_id, related_id, relationship_type (parent\|project\|sprint\|program) |
| **document_history** | Field-level audit trail | document_id, field, old_value, new_value, changed_by, automated_by |
| **document_snapshots** | Pre-conversion state for undo | document_id, document_type, title, properties, snapshot_reason |
| **document_links** | Backlinks between documents | source_id, target_id |
| **comments** | Threaded inline comments (TipTap marks) | document_id, comment_id, parent_id, author_id, content, resolved_at |
| **sprint_iterations** | Work progress per sprint | sprint_id, story_id, story_title, status (pass\|fail\|in_progress), blockers_encountered |
| **issue_iterations** | Work progress per issue | issue_id, status, what_attempted, blockers_encountered |
| **files** | Uploads (S3/local) | workspace_id, uploaded_by, filename, mime_type, s3_key, cdn_url, status |
| **audit_logs** | Compliance-grade action log | workspace_id, actor_user_id, impersonating_user_id, action, resource_type, resource_id, details (JSONB) |
| **api_tokens** | Programmatic access | user_id, workspace_id, name, token_hash, token_prefix, expires_at, revoked_at |
| **oauth_state** | CAIA/PIV OAuth flow state | state_id, nonce, code_verifier, expires_at |

### Document Type Enum

```
wiki | issue | program | project | sprint | person | weekly_plan | weekly_retro | standup | weekly_review
```

### Documents Table Detail

**Identity:** id (UUID), workspace_id, document_type, title (default "Untitled")

**Content:** content (TipTap JSONB), yjs_state (BYTEA)

**Hierarchy:** parent_id (self-ref, circular-ref prevented by trigger), position

**Status:** ticket_number (auto-increment per workspace, issues only), archived_at,
deleted_at (soft delete, 30-day), visibility (private|workspace), created_by

**Issue lifecycle timestamps:** started_at, completed_at, cancelled_at, reopened_at

**Conversion tracking:** converted_to_id, converted_from_id, converted_at,
converted_by, original_type, conversion_count

**Properties (JSONB, varies by type):**

- **Issue:** state, priority, assignee_id, source, rejection_reason, due_date,
  is_system_generated, accountability_target_id, accountability_type
- **Program:** color, emoji, owner_id, accountable_id, consulted_ids, informed_ids
- **Project:** color, emoji, owner_id, accountable_id, consulted_ids, informed_ids,
  impact, confidence, ease (ICE scoring), plan_validated, monetary_impact_expected/actual,
  success_criteria, next_steps, plan_approval, retro_approval, has_design_review
- **Sprint:** sprint_number, owner_id, status, plan, success_criteria, confidence,
  plan_history, plan_approval, review_approval, review_rating
- **Person:** email, role, capacity_hours, reports_to, user_id (→users.id)
- **Wiki:** maintainer_id
- **Weekly Plan:** person_id, project_id, week_number, submitted_at
- **Weekly Retro:** person_id, project_id, week_number, submitted_at
- **Standup:** author_id, date, submitted_at
- **Weekly Review:** sprint_id, owner_id, plan_validated

### Relationship Types (document_associations)

```
parent | project | sprint | program
```

Unique on (document_id, related_id, relationship_type). Legacy direct FK columns
(project_id, sprint_id, program_id) were dropped in migrations 027-029.

### Enums

- **IssueState:** triage → backlog → todo → in_progress → in_review → done | cancelled
- **IssuePriority:** low | medium | high | urgent
- **IssueSource:** internal | external | action_items
- **Approval states:** null → approved | changed_since_approved | changes_requested

### Key Relationship Map

```
workspaces ──1:M──→ users (via workspace_memberships)
           ──1:M──→ documents
           ──1:M──→ sessions
           ──1:M──→ audit_logs

documents  ──M:M──→ documents (via document_associations)
           ──1:M──→ document_history
           ──1:M──→ document_snapshots
           ──1:M──→ comments
           ──M:M──→ documents (via document_links / backlinks)
           ──1:M──→ sprint_iterations (sprint docs)
           ──1:M──→ issue_iterations (issue docs)

person docs ──→ users (via properties.user_id)
```

---

## 2. Ship REST API

### Authentication

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/auth/login | None | email+password, rate-limited 5/15min |
| POST | /api/auth/logout | Session | End session |
| GET | /api/auth/me | Session | Current user + workspace list |
| POST | /api/auth/extend-session | Session | Stay-logged-in button |
| GET | /api/auth/session | Session | Session metadata (expiry, activity) |
| GET | /api/auth/caia/status | None | PIV auth availability check |
| GET | /api/auth/caia/login | None | Initiate CAIA OAuth flow |
| GET | /api/auth/caia/callback | None | OAuth callback, sets session cookie |
| GET | /api/csrf-token | None | CSRF token for state-changing ops |

### Documents (Core CRUD)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/documents | Session | Filter: type, search, archived, limit, offset |
| GET | /api/documents/:id | Session | include_content param |
| POST | /api/documents | Session+CSRF | title, document_type, content, properties, visibility, parent_id |
| PATCH | /api/documents/:id | Session+CSRF | title, content, properties, visibility, archived_at |
| DELETE | /api/documents/:id | Session+CSRF | Soft delete |
| GET | /api/documents/:id/backlinks | Session | Documents linking to this one |
| GET | /api/documents/:id/associations | Session | Grouped by relationship type |
| POST | /api/documents/:id/associations | Session+CSRF | related_id + relationship_type |
| DELETE | /api/documents/:id/associations/:related_id | Session+CSRF | Remove association |
| GET | /api/documents/:id/comments | Session | Threaded comments |
| POST | /api/documents/:id/comments | Session+CSRF | comment_id, content, parent_id |
| PATCH | /api/documents/:id/comments/:commentId | Session+CSRF | Update content |
| DELETE | /api/documents/:id/comments/:commentId | Session+CSRF | Delete comment |

### Issues

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/issues | Session | Filter: state, priority, assigned_to, sprint_id, program_id, search. Pagination. |
| GET | /api/issues/:id | Session | Full details with assignee, associations |
| POST | /api/issues | Session+CSRF | title, state, priority, assignee_id, due_date, belongs_to, source |
| PATCH | /api/issues/:id | Session+CSRF | Any issue field |
| DELETE | /api/issues/:id | Session+CSRF | |
| POST | /api/issues/:id/accept | Session+CSRF | Triage→backlog |
| POST | /api/issues/:id/reject | Session+CSRF | With rejection reason |

### Programs

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/programs | Session | Filter: archived |
| GET | /api/programs/:id | Session | With counts |
| POST | /api/programs | Session+CSRF | title, color, emoji, RACI fields |
| PATCH | /api/programs/:id | Session+CSRF | Any program field |
| DELETE | /api/programs/:id | Session+CSRF | |
| GET | /api/programs/:id/issues | Session | Sorted by priority |
| GET | /api/programs/:id/projects | Session | With ICE scores |
| GET | /api/programs/:id/sprints | Session | With issue counts, plan/retro status |
| GET | /api/programs/:id/merge-preview | Session | Preview merge with target_id |
| POST | /api/programs/:id/merge | Session+CSRF | Merge into target program |

### Projects

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/projects | Session | Filter: program_id, search, archived |
| GET | /api/projects/:id | Session | With properties, owner, associations |
| POST | /api/projects | Session+CSRF | title, program_id, owner_id, ICE scores, color, emoji |
| PATCH | /api/projects/:id | Session+CSRF | Any project field |
| DELETE | /api/projects/:id | Session+CSRF | |
| GET | /api/projects/:id/issues | Session | Issues in project |
| GET | /api/projects/:id/sprints | Session | Sprints in project |

### Weeks/Sprints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/weeks | Session | Filter: program_id, sprint_number, limit, offset |
| GET | /api/weeks/:id | Session | With issue counts, plan/retro status |
| POST | /api/weeks | Session+CSRF | program_id, sprint_number, owner_id |
| PATCH | /api/weeks/:id | Session+CSRF | title, owner_id, status, plan |
| GET | /api/weeks/:id/issues | Session | Issues in sprint |
| POST | /api/weeks/:id/iterations | Session+CSRF | Create iteration checkpoint |
| GET | /api/weeks/:id/standups | Session | Week's standups |
| GET | /api/weeks/:id/review | Session | Weekly review data |
| GET | /api/weeks/:id/scope-changes | Session | Issue adds/removals during week |

### Standups

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/standups | Session+CSRF | Idempotent by date |
| GET | /api/standups | Session | date_from, date_to (required) |
| GET | /api/standups/status | Session | Check if standup is due |
| PATCH | /api/standups/:id | Session+CSRF | content, title |
| DELETE | /api/standups/:id | Session+CSRF | |

### Weekly Plans & Retros

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/weekly-plans | Session+CSRF | person_id, week_number, project_id. Upsert. |
| GET | /api/weekly-plans/:id | Session | Plan with content |
| PATCH | /api/weekly-plans/:id | Session+CSRF | content, submitted_at |
| POST | /api/weekly-retros | Session+CSRF | person_id, week_number, project_id. Upsert. |
| GET | /api/weekly-retros/:id | Session | Retro with content |
| PATCH | /api/weekly-retros/:id | Session+CSRF | content, submitted_at |

### Feedback (Public)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/feedback | None | title, program_id, submitter_email, content |
| GET | /api/feedback/program/:programId | None | Program info for feedback form |
| GET | /api/feedback/:id | Session | Feedback issue details |

### Accountability & Dashboard

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/accountability/action-items | Session | 7 item types with urgency |
| GET | /api/activity/:entityType/:entityId | Session | 30-day daily activity counts |
| GET | /api/dashboard/my-work | Session | Issues grouped by urgency |
| GET | /api/dashboard/my-focus | Session | Current week context |
| GET | /api/dashboard/my-week | Session | Detailed week dashboard (plans, retros, standups) |

### Search

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/search/mentions | Session | Search people + documents by query |
| GET | /api/search/learnings | Session | Search learning wiki docs (q, program_id, limit) |

### AI Analysis

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/ai/status | Session | AI availability check |
| POST | /api/ai/analyze-plan | Session+CSRF | Plan quality feedback |
| POST | /api/ai/analyze-retro | Session+CSRF | Retro quality feedback |

### Files

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/files/upload | Session+CSRF | Request presigned URL. 1GB max. |
| POST | /api/files/:id/local-upload | Session+CSRF | Dev-only local upload |
| POST | /api/files/:id/confirm | Session+CSRF | Confirm S3 upload |
| GET | /api/files/:id/serve | Session | Serve file (dev) |
| GET | /api/files/:id | Session | File metadata |
| DELETE | /api/files/:id | Session+CSRF | |

### Workspaces & Admin

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/workspaces | Session | User's workspaces |
| GET | /api/workspaces/current | Session | Current workspace |
| POST | /api/workspaces/:id/switch | Session+CSRF | Switch workspace |
| GET | /api/workspaces/:id/members | Admin | List members |
| POST | /api/workspaces/:id/members | Admin+CSRF | Add member |
| PATCH | /api/workspaces/:id/members/:userId | Admin+CSRF | Update role |
| DELETE | /api/workspaces/:id/members/:userId | Admin+CSRF | Remove member |
| POST | /api/workspaces/:id/members/:userId/restore | Admin+CSRF | Restore archived |
| GET | /api/workspaces/:id/invites | Admin | List invites |
| POST | /api/workspaces/:id/invites | Admin+CSRF | Create invite |
| DELETE | /api/workspaces/:id/invites/:inviteId | Admin+CSRF | Revoke invite |
| GET | /api/workspaces/:id/audit-logs | Admin | Paginated audit logs |
| GET | /api/admin/workspaces | Super-admin | All workspaces |
| POST | /api/admin/workspaces | Super-admin+CSRF | Create workspace |

### API Tokens

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | /api/api-tokens | Session+CSRF | Generate token (returned once) |
| GET | /api/api-tokens | Session | List tokens (no secrets) |
| DELETE | /api/api-tokens/:id | Session+CSRF | Revoke |

### Team

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /api/team/grid | Session | Team members with project allocations |

### Infrastructure

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /health | None | `{ status: 'ok' }` |
| GET | /api/docs | None | Swagger UI |
| GET | /api/openapi.json | None | OpenAPI spec |
| GET | /api/setup/status | None | Workspace setup check |
| POST | /api/setup/initialize | CSRF | First-time workspace setup |

### Security Summary

- **Auth:** Session cookies (web) + Bearer tokens (API)
- **CSRF:** X-CSRF-Token header on all mutations, skipped for Bearer auth
- **Rate limits:** 100 req/min prod, 5 login attempts/15min
- **Input validation:** Zod schemas, parameterized SQL, UUID validation

---

## 3. Ship Frontend

### Tech Stack

React + Vite + TypeScript. TipTap editor with Yjs CRDTs. React Query for server
state. React Context for UI state. No Redux.

### Routing

```
/documents/:id              → UnifiedDocumentPage (all doc types)
/documents/:id/:tab         → Tab views (issues, details, weeks, overview, etc.)
/docs, /issues, /projects   → List pages
/team/*                     → Team directory, allocation, reviews, status
/my-week                    → Weekly dashboard
/dashboard                  → Overview dashboard
/settings                   → Workspace settings
/login, /invite/:token      → Public routes
```

### 4-Panel Layout (Always Visible)

```
┌──────┬──────────────┬─────────────────────┬────────────┐
│ Icon │ Left Sidebar │ Main Content        │ Properties │
│ Rail │ (224px)      │ (flex-1)            │ Sidebar    │
│(48px)│ Collapsible  │ <Outlet />          │ (256px)    │
│      │              │                     │ Collapsible│
│ Nav  │ Mode-specific│ Editor / List /     │ Type-      │
│ modes│ item lists   │ Dashboard / Tab     │ specific   │
│      │              │                     │ properties │
└──────┴──────────────┴─────────────────────┴────────────┘
```

**Icon Rail:** Navigation mode buttons, workspace switcher, settings/logout.

**Left Sidebar:** Changes per mode — DocumentsTree, IssuesSidebar, ProjectsSidebar,
ProgramsSidebar, TeamSidebar, DashboardSidebar, SettingsSidebar.

**Main Content:** React Router Outlet. Renders the active page.

**Properties Sidebar:** Rendered via React Portal into `<aside id="properties-portal">`.
Type-specific: WikiSidebar, IssueSidebar, ProjectSidebar, SprintSidebar, WeekSidebar.

### Editor Architecture

**UnifiedDocumentPage** → **UnifiedEditor** → **Editor** (TipTap + WebSocket)

- Title: large editable textarea
- Sync status indicator (Saved/Cached/Offline)
- Connected users avatars
- TipTap extensions: Collaboration, CollaborationCursor, MentionExtension,
  SlashCommands, DragHandle, CommentDisplay, TableOfContents, Tables, TaskLists,
  CodeBlocks, Callouts, Image/File upload
- WebSocket: `/collaboration/{docType}:{docId}` — Yjs sync + awareness

### Tab System

Documents with tabs (lazy-loaded):

- **Project:** Issues, Details, Weeks, Retro
- **Program:** Overview, Issues, Projects, Weeks
- **Sprint:** Overview, Plan (planning) | Overview, Issues, Review, Standups (active)

### State Management

**React Context (UI state):**

- CurrentDocumentContext — active doc ID/type for sidebar highlighting
- WorkspaceContext — current workspace
- SelectionPersistenceContext — multi-select in lists

**React Query (server state):**

- useDocumentsQuery, useIssuesQuery, useProjectsQuery, useProgramsQuery,
  useTeamMembersQuery, useCommentsQuery, useContentHistoryQuery, etc.
- Invalidation-based cache updates after mutations

**Local persistence:** localStorage for sidebar collapse, IndexedDB for Yjs doc cache.

### Global UI

- **Command Palette** (Cmd+K): create docs, search, navigate
- **Accountability Banner**: shows when action items are due
- **Session Timeout Warning**: modal before expiry
- **Toast notifications**: success/error
- **Context menus**: right-click on documents/issues

### Extension Points (Where an Agent Could Mount)

1. **Command Palette** — add intelligence commands (analyze, forecast, risk)
2. **Slash Commands** — in-editor `/analyze`, `/summary`, `/risk` etc.
3. **Properties Sidebar** — add "Intelligence" section per doc type
4. **Tab System** — add Intelligence/Forecast tabs to projects/programs
5. **Portal system** — `#properties-portal` for injecting panels
6. **React Query** — subscribe to / invalidate query keys for real-time updates
7. **WebSocket awareness** — agent presence indicator
8. **Context menus** — add agent actions to document right-click

---

## 4. Ship Event Surface

### Real-Time Channels

**A. Document Collaboration WebSocket** — `/collaboration/{docType}:{docId}`

- Yjs CRDT sync protocol (message type 0)
- Awareness/presence (message type 1, cursors + user info)
- Custom events (message type 2, unused currently)
- Cache clear signal (message type 3, IndexedDB invalidation)
- Debounced persistence to DB every 2 seconds
- Content history logging for weekly_plan/weekly_retro (1x/min max)
- Close codes: 4100 (converted), 4101 (content updated via API), 4403 (access revoked)
- Rate limits: 30 connections/min per IP, 50 messages/sec per connection

**B. Global Events WebSocket** — `/events`

- JSON messages: `{ type: string, data: Record<string, unknown> }`
- Event types: `accountability:updated`, `connected`, `pong`
- 30-second ping/pong keepalive
- `broadcastToUser(userId, eventType, data)` function sends to all user's connections

### Broadcast Triggers

`accountability:updated` is broadcast on:

- Document create/update (properties or state change)
- Issue create in sprint, issue state change (→ assignee)
- Project plan/retro updates
- Week standup/review/approve/request-changes actions

### Database Event Stores

| Store | What It Captures | Query Pattern |
|-------|-----------------|---------------|
| **audit_logs** | All state-changing actions, compliance-grade | By workspace+time, actor+time, action |
| **document_history** | Field-level changes on documents | By document+time, changed_by+time |
| **document_snapshots** | Pre-conversion document state | By document (undo stack) |

### Polling-Friendly Endpoints

| Endpoint | Freshness | What It Shows |
|----------|-----------|---------------|
| GET /api/accountability/action-items | Computed live | Missing standups, plans, retros; overdue items |
| GET /api/activity/:type/:id | 30-day window | Daily activity counts per entity |
| GET /api/dashboard/my-work | Live | User's issues grouped by urgency |
| GET /api/dashboard/my-focus | Live | Current week context |
| GET /api/dashboard/my-week | Live | Plans, retros, standups for current week |
| GET /api/standups/status | Live | Whether standup is due |
| GET /api/issues (filtered) | Live | Issues by state, priority, assignee, sprint |
| GET /api/weeks/:id/scope-changes | Live | Issue additions/removals during week |

### Scheduled / Periodic Tasks

- 30-second cleanup loop for connection rate-limit sliding window
- 2-second debounced Yjs persistence after edits
- 30-second doc memory retention after last connection
- 30-second frontend ping/pong to /events WebSocket
- 15-minute session inactivity timeout, 12-hour absolute timeout

### What's NOT There

- No webhooks (outbound HTTP callbacks)
- No SSE endpoints
- No database LISTEN/NOTIFY or change-data-capture
- No cron jobs or background workers
- No message queue (Redis, RabbitMQ, etc.)
- No event bus beyond the two WebSocket channels
- No activity feed endpoint (activity is computed from document timestamps)

---

## 5. Project Health Signals

For each Ship capability, what health signals could a proactive agent detect:

### Issue Tracking

- **Stale issues** — issues in todo/in_progress with no updates for N days
  (compare updated_at to now)
- **Triage backlog** — issues stuck in `triage` state (not accepted or rejected)
- **Unassigned blockers** — high/urgent priority issues with no assignee_id
- **Cancelled spike** — sudden increase in cancelled issues (rejection_reason patterns)
- **Overdue issues** — issues past due_date still not done
- **State regression** — issues moving backward (done→in_progress, done→todo)
- **Long in-review** — issues in `in_review` for extended periods

### Sprint/Week Health

- **Empty sprints** — sprints with zero associated issues
- **Scope creep** — issues added after sprint start (via scope-changes endpoint)
- **Low iteration pass rate** — sprint_iterations with many `fail` statuses
- **Missing plans** — sprints without plan content or with plan not submitted
- **Missing retros** — completed sprints without retro content
- **Plan/retro staleness** — plans submitted but never approved, or
  `changed_since_approved` lingering

### Project Health

- **Stale projects** — no document updates or issue activity for N days
- **ICE score drift** — impact/confidence/ease changing without explanation
- **Unvalidated plans** — plan_validated still false after sprint start
- **Missing RACI** — no owner_id or accountable_id set
- **Success criteria gap** — project has no success_criteria in properties
- **Monetary impact tracking** — expected vs actual monetary impact divergence

### Program Health

- **Orphan projects** — projects not associated with any program
- **Program imbalance** — programs with wildly different issue/project counts
- **Stale programs** — programs with no recent activity across all children

### Team/People Signals

- **Silent team members** — person docs with no associated standups, plans,
  or retros for N days
- **Missing standups** — standup_status endpoint shows `due: true` for extended periods
- **Overloaded assignees** — team members with disproportionate in_progress issue counts
- **Capacity gaps** — person docs with capacity_hours set but no active assignments
- **Accountability debt** — action-items endpoint returning items with high days_overdue

### Document & Content Health

- **Untitled documents** — documents still titled "Untitled" after N days
- **Empty documents** — documents with default empty content that were never edited
- **Orphan documents** — documents with no parent and no associations
- **Private island** — workspace-relevant docs set to private visibility
- **Unreviewed items** — comments with resolved_at = null for extended periods
- **Stale wikis** — wiki documents with no maintainer_id or not updated recently

### Collaboration Health

- **Low collaboration** — documents rarely edited by more than one person
  (yjs_state + document_history.changed_by diversity)
- **Approval bottlenecks** — plan_approval or retro_approval stuck in
  `changes_requested` without follow-up
- **Review queue depth** — weekly_review documents pending review

### System/Operational

- **Session concentration** — audit_logs showing all activity from one user
  (bus factor = 1)
- **API token hygiene** — tokens with no last_used_at or long-expired tokens
  still active
- **Audit gap** — periods with no audit_log entries (system down or
  logging broken)
