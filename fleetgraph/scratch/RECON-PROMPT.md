TOWER — recon mode. Do NOT produce architecture, task breakdown, or
ARCHITECTURE.md. Do NOT create beads issues. Instead produce a recon report
covering:

1. **Ship data model** — all entities and their relationships (projects, sprints,
   issues, documents, users, comments, labels, etc.)
2. **Ship REST API** — every endpoint, what it accepts, what it returns. Note
   which endpoints support filtering, pagination, or bulk queries.
3. **Ship frontend** — component structure, where contextual UI lives (issue
   detail, sprint board, project dashboard), existing chat/sidebar/panel
   mounting points or extension patterns.
4. **Ship event surface** — webhooks, realtime subscriptions, polling-friendly
   endpoints, anything that could trigger a proactive agent.
5. **Project health signals** — for each Ship capability, note what health
   signals it could expose: stale issues, empty sprints, unassigned blockers,
   silent team members, overdue milestones, unreviewed items, etc.

Output: a single `RECON.md` at repo root. This feeds Pre-Search, not
implementation. Do not make architecture decisions.
