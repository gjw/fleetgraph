# Ship Data Model — Plain English

## The Hierarchy

**Workspace** — the tenant. One per organization/department. Defines the calendar
(`sprint_start_date` = day 1, everything counts forward in 7-day windows). Users
are invited to a workspace via `workspace_memberships`. A user can belong to
multiple workspaces, but all existing seed data lives in a single one.

**Program** — a long-lived area of work. Think "Auth" or "Reporting" or
"FleetGraph." Has an owner, a color, a prefix for ticket numbers (AUTH-1, AUTH-2).
Programs don't end.

**Project** — a time-bounded deliverable within a program. Roughly an epic — a bag
of issues with an end. Has ICE scores, success criteria, plan/retro approval
workflows. Projects are bound to a single program; they can't span multiple.
Because this is Ship, a project is also a document — it has its own page, its own
TipTap content, its own editor. It's not just a label on issues.

**Sprint / Week** — a 7-day window. One per program per week number. Dates aren't
stored — they're computed from `workspace.sprint_start_date + (sprint_number - 1) * 7`.
Has an owner, a status (planning/active/completed), and plan/retro docs attached.
"Sprint" in the database = "week" in the UI. Week 5 of Auth and Week 5 of
Reporting are different documents with different owners.

**Issue** — a work item. Has a state machine:
`triage → backlog → todo → in_progress → in_review → done` (or `cancelled`).
Must belong to a program (always). May belong to a project and/or a week.
An issue in a program but not in any project or week is floating in the backlog.
Assigning it to a week is what schedules it.

**Document** — not a separate concept. Everything above IS a document. Programs,
projects, sprints, issues, wikis, people, standups, plans, retros — they're all
rows in one `documents` table with a `document_type` field. Same content column,
same TipTap editor, same association system, same audit trail.

## Relationships

```
Program (long-lived area)
  ├── Project (bounded deliverable / "epic")
  ├── Sprint/Week (7-day window)
  │     ├── weekly_plan (per person)
  │     └── weekly_retro (per person)
  └── Issue (work item)
        ├── belongs to Program (always)
        ├── belongs to Project (optional)
        └── belongs to Sprint (optional = "assigned to this week")
```

Issues are linked to programs/projects/sprints via the `document_associations`
junction table, not foreign keys. Two relationship patterns exist:

- **`parent_id` column** — pure containment (weekly_plan → week, nested wiki pages)
- **`document_associations`** — organizational membership (issue → program/project/week)

An issue's lifecycle:

```
Created → belongs to Program (mandatory)
         → optionally assigned to Project (the "epic")
         → optionally assigned to Week (the "sprint")
```
