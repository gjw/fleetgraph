# FleetGraph — Project Context

## Situation

- Project intelligence agent for Ship — proactive monitoring and on-demand reasoning via graph architecture
- **GFA Week 5 project.** Ship is a US Treasury project management app. Week 4 (shipshape/) was auditing/improving it. Week 5 is building FleetGraph on top of it.
- **MVP due:** Tue 2026-03-17 11:59 PM — running graph, LangSmith tracing, FLEETGRAPH.md, HITL gate, real data, deployed
- **Early Submission:** Fri 2026-03-20 — + test cases, architecture decisions
- **Final Submission:** Sun 2026-03-22 — + cost analysis

## Constraints

- **Solo + agents.** One person coordinating multiple Claude Code instances.
- **Cost-aware.** Agent sessions should be purposeful, not exploratory sprawl.
- **Ship API only.** FleetGraph reads/writes Ship data through its REST API, never direct DB access.
- **OpenAI for LLM.** Anthropic is a federal supply chain risk. All AI integration uses OpenAI API.
- **LangGraph.js + LangSmith.** TypeScript graph framework with native tracing. Every graph run must be traced.
- **DB amendments allowed.** We can add document types, tables, API endpoints to Ship. The agent just can't bypass the API.
- **Deployed to Linode VPS via pm2.** Don't break Ship's AWS deployment stack.

## Roles

- **Chair** — the human. Coordinates agents, merges branches, makes final calls.
- **Tower** — planning/architecture agent. Reads requirements, designs stack, produces plans and interface code. See prompts/tower.md.
- **Trench** — coding agent(s). Receives a task, writes code on a feature branch. Multiple can run in parallel. See prompts/trench.md.
- **Herald** — communications agent. Writing, messaging, brand voice, content creation. See prompts/herald.md.
- **Warden** — quality defense agent. Audits changes, hunts risk, enforces readiness before merges/releases. See prompts/warden.md.

## Defaults

- **Always monorepo.** One repo, one issue database, one CLAUDE.md.
- **Git init is Chair's job.** Repo is initialized before Tower/Scout starts.
- **Chair may be voice-transcribing.** Expect conversational style with filler words.
  Parse for intent, not exact phrasing.
- **Issue tracking: beads (`br`).** Tower creates issues, Trench claims and closes.
  See `beads-agent-guide.md` for full command reference.
- **Chair merges** — agents commit to task branches, Chair spot-checks and merges.

## Workflow

- **Issue tracking** via beads (br) for work breakdown and status
- **CLAUDE.md per project** so agents have shared context
- **Frequent integration** — short-lived branches, merge to main often
- **Chair merges** — agents commit to task branches, Chair spot-checks and merges
