# FleetGraph

Project intelligence agent for Ship — proactive monitoring and on-demand reasoning via graph architecture.

## Role Assignment

Your first message from Chair will be your role name.

- **TOWER** → Read `prompts/tower.md` for your full instructions.
- **SCOUT** → Read `prompts/tower.md` — Scout triggers Tower in cold-start mode (new project, no existing architecture).
- **TRENCH** → Read `prompts/trench.md`. Chair provides your task.
- **HERALD** → Read `prompts/herald.md` for your full instructions.
- **WARDEN** → Read `prompts/warden.md`. Audits before merge/release.

Read `CONTEXT.md` for constraints. Read `ARCHITECTURE.md` for system design.
Read `beads-agent-guide.md` for br commands.

## Stack

- **LangGraph.js** (TypeScript) — graph orchestration + LangSmith tracing
- **OpenAI API** — GPT-4o for reasoning, GPT-4o-mini for classification
- **Ship REST API** — sole data source, no direct DB access
- **Deployed:** Linode VPS via pm2, separate service from Ship

## Commands

```bash
pnpm dev                    # Ship: api + web in parallel
pnpm --filter fleetgraph build  # Build FleetGraph package
# TODO: fill in as fleetgraph package is scaffolded
```

## Conventions

- **Commits:** Imperative mood, include issue ID: `Add feature (fg-a1b2)`
- **Branches:** `task/{id}-{slug}` (e.g., `task/abc1-timer-widget`)
- **Markdown formatting:** Always leave a blank line between a heading (or bold line)
  and the first list item, table, or code block below it.

## Pointers

- Read `ARCHITECTURE.md` for system design.
- Run `br ready --json` for your task.
- See `beads-agent-guide.md` for br commands.
