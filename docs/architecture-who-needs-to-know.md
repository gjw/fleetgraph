# Architecture Decision: Who Needs to Know?

## The Question

Do we need more than one `recipient_id` per finding? The current Finding interface has
a single `affectedEntityId` — is it really 1:1, or is it sometimes 1:many?

## Discovery

A finding's **affected entity** is where the problem lives — a sprint, an issue, a
project. But affected entities can't be notified. Only people can be notified. A sprint
can't see a badge count. So "who the finding is about" and "who should see the finding"
are fundamentally different questions.

Walking through each finding type makes this clear:

| Finding Type | Affected Entity | But who actually needs to know? |
|---|---|---|
| scope_creep | Sprint | Sprint owner, PM, possibly the person adding scope |
| stale_triage | Issue (or rollup: sprint) | Assignee, project owner, sprint owner |
| accountability_debt | Person | That person, possibly their manager |
| blocked_sprint | Sprint | Owner of the blocking issue, sprint owner |
| overloaded_member | Person | The person themselves, their manager |
| missing_estimate | Sprint | Assignees of unestimated issues, sprint owner |

It's almost always 1:many. And the recipients vary by finding type — there's no single
rule that maps entity → recipients.

## The Flood Problem

If stale_triage produces one finding per stale issue, and a project owner is listed as
recipient on all of them, they get 15 badge increments for one underlying condition.
That's noise, not signal.

Two levers control this:

1. **Rollup at the reasoning level** — produce one finding per condition per entity
   ("Sprint 12 has 5 issues stuck in triage") instead of one per item. The individual
   issues are cited in the reasoning narrative, not as separate findings.

2. **Tiered notification** — not everyone needs the same level of alert.

## Decision: Two-Tier Recipient Model

### Tier 1: Direct (badge + ding)

A `recipient_ids: string[]` field on finding properties. These people see the finding
in their notification feed and get a badge count increment.

Direct recipients are people who should **act** on the finding:

| Finding Type | Direct Recipient(s) |
|---|---|
| scope_creep | Sprint owner |
| stale_triage | Sprint owner (rollup), or assignee (single issue) |
| accountability_debt | The person with overdue items |
| blocked_sprint | Owner of the blocking issue |
| overloaded_member | The person themselves |
| missing_estimate | Sprint owner |

**Badge count query:**

```sql
SELECT COUNT(*) FROM documents
WHERE document_type = 'fleetgraph_finding'
  AND properties->>'status' = 'active'
  AND properties->'recipient_ids' @> '["<user_id>"]'
  AND properties->>'human_decision' IS NULL;
```

### Tier 2: Ambient (visible on entity pages, no badge)

Findings are linked to affected entities via `document_associations`. If you're viewing
a sprint page, you see its findings. No extra field needed — this is free from the
existing association model.

This is the "if you really want to see what's going on with the sprint, check this"
level. No badge increment, no ding. Just visible when you navigate to the entity.

### Summary

| Tier | Mechanism | Badge? | Ding? | How it works |
|---|---|---|---|---|
| Direct | `recipient_ids` in properties | Yes | Yes | Person explicitly listed |
| Ambient | `document_associations` | No | No | Finding linked to entity you're viewing |

## Impact on Data Model

### Finding interface (state.ts)

Add `recipientIds: string[]` to the `Finding` interface. The reasoning node already has
access to person IDs via `assignee_id` (issues), `owner` (sprints/projects),
`owner_id` (programs), and the team grid.

### fleetgraph_finding document properties

Add `recipient_ids: string[]` to the JSONB properties schema:

```typescript
{
  // existing fields...
  recipient_ids: string[];  // Person IDs who get badge + ding
}
```

### Reasoning node (reasoning.ts)

Update the structured output schema and prompt to produce `recipientIds` per finding.
The prompt already receives all the entity data with person IDs — it just needs to be
told to include them.

### Persist node (bd-1ed)

When creating a fleetgraph_finding document:

1. Set `recipient_ids` in properties from the finding's `recipientIds`
2. Create a `document_association` linking finding → affected entity (ambient tier)
3. No separate associations needed for recipients — `recipient_ids` in properties is
   sufficient for badge queries

### Rollup guidance for reasoning prompt

Instruct the reasoning node to produce **one finding per condition per entity**, not one
per item. Examples:

- "Sprint 12 has 5 issues stuck in triage" (one finding) — not 5 separate findings
- "Person X is assigned to 12 active issues across 3 sprints" (one finding)
- "Sprint 14 scope increased 23% after start: 4 issues added" (one finding)

Individual items are cited in the reasoning narrative text, not as separate findings.

## Beads Potentially Impacted

- **bd-1ed** (this task) — persist node needs to write `recipient_ids` to properties
- **bd-3ox** (done) — reasoning node needs `recipientIds` added to Finding schema + prompt
- **fg-1wr** — finding re-validation uses badge count query, needs to filter by `recipient_ids`
- **bd-196** — Human Gate / decide endpoint may need to check recipient permissions
- **bd-5b2** — Ship UI findings panel queries need `recipient_ids` filter
- **bd-1lu** — on-demand chat scopes findings by user, may use `recipient_ids`
