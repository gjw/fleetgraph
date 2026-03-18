# FleetGraph

Project intelligence agent for [Ship](README-ORIGINAL.md) — proactive monitoring and on-demand reasoning via graph architecture.

> The original Ship README is at [README-ORIGINAL.md](README-ORIGINAL.md).

## Quick Start

```bash
# Install dependencies
pnpm install

# Build shared types (required first)
pnpm build:shared

# Start Ship (API + Web)
pnpm dev
```

## Public LangGraph Traces

https://smith.langchain.com/public/66289fad-0f58-4c62-b53f-f93f6d0ad98b/r

https://smith.langchain.com/public/03437ab1-8cbd-4178-8064-12daa759df6a/r

## Seeding Test Data

FleetGraph demo scenarios require specific Ship data. Seeding is a two-step process:

```bash
# 1. Seed Ship baseline (users, programs, projects, sprints, issues)
pnpm db:seed

# 2. Seed FleetGraph demo scenarios (S1–S7 with confounders)
pnpm db:seed:fg
```

Both steps are idempotent — safe to re-run. The FleetGraph seed requires the baseline seed to have run first (it looks up existing users and workspace).

### What the FleetGraph seed creates

All data lives under a **FleetGraph Demo** program (`FG` prefix) with four projects:

| Project | Scenarios | Purpose |
|---------|-----------|---------|
| Sprint Operations | S1, S2 | Sprint scope creep, stale triage |
| Team Health | S3 | Accountability debt tracking |
| Platform Engineering | S4 | Blocked work chains |
| Product Development | S5, S6, S7 | Risk assessment, next action, retro mining |

**~195 documents, ~125 associations.** Every scenario includes confounders — data that looks similar but should NOT trigger detection. This ensures queries are precise, not just "returning the only data that exists."

### Deterministic UUIDs

The seed generates document IDs via SHA-256 hashing of stable keys (e.g., `demoId('s1:sprint')` always produces the same UUID). This means:

- Same data every run, every environment
- IDs can be referenced in tests and trace captures
- Re-running the seed is a no-op (inserts use `ON CONFLICT DO NOTHING`)

### User role assignments

The seed reuses the 11 users from the baseline seed. Scenario roles:

| Role | User | Scenarios |
|------|------|-----------|
| Director | Dev User | S3 (org-wide view), S5 |
| PM / Sprint Owner | Alice Chen | S1, S6 |
| Engineer 1 | David Kim | S1, S4 (blocked), S5 |
| Engineer 2 | Emma Johnson | S1, S4 (chain), S5 |
| Engineer 3 (bottleneck) | Frank Garcia | S4 (review queue) |
| Compliant (control) | Grace Lee | S3, S4 |
| Newbie | Henry Patel | S3 (confounder) |
| Scope Adder | Bob Martinez | S1, S3 |
| Retro Author | Carol Williams | S7 |
| Target Engineer | Iris Nguyen | S3, S6 (smart next action) |
| Small Queue | Jack Brown | S4 (confounder) |

### Issue dependencies

S4 and S6 use issue dependencies stored as `properties.depends_on: string[]` in the JSONB properties column. The `relationship_type` enum does not yet include `depends_on`, so dependencies are tracked in properties rather than `document_associations`.

## Scenario Details

See [notes/demo-scenarios.md](notes/demo-scenarios.md) for full scenario specifications, expected detections, and confounder descriptions.

## Project Structure

```
fleetgraph/        # LangGraph agent (TypeScript)
api/               # Ship Express backend
web/               # Ship React frontend
shared/            # Shared TypeScript types
notes/             # Planning docs and scenario specs
docs/              # Architecture and reference docs
```

## Commands

```bash
pnpm dev                          # Ship: API + Web in parallel
pnpm build                        # Build all packages
pnpm --filter @ship/fleetgraph build  # Build FleetGraph only
pnpm db:seed                      # Seed Ship baseline data
pnpm db:seed:fg                   # Seed FleetGraph demo scenarios
pnpm test                         # Run API unit tests
```

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design
- [CONTEXT.md](CONTEXT.md) — Project constraints
- [notes/demo-scenarios.md](notes/demo-scenarios.md) — Demo scenario catalog
- [docs/architecture-who-needs-to-know.md](docs/architecture-who-needs-to-know.md) — Recipient model
