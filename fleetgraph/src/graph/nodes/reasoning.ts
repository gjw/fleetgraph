import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import { loadConfig } from '../../config.js';

const FindingSchema = z.object({
  findings: z.array(
    z.object({
      findingType: z
        .string()
        .describe(
          'Snake_case category: scope_creep, stale_triage, accountability_debt, blocked_sprint, overloaded_member, missing_estimate, sprint_velocity_drop, unplanned_work',
        ),
      severity: z.enum(['info', 'warning', 'critical']),
      affectedEntityId: z
        .string()
        .describe('UUID of the affected issue, sprint, project, program, or person'),
      affectedEntityType: z.enum(['issue', 'sprint', 'project', 'program', 'person']),
      title: z.string().describe('Short human-readable title, under 80 chars'),
      reasoning: z
        .string()
        .describe(
          'Detailed explanation of what was found, why it matters, and what is recommended. 2-4 sentences.',
        ),
      recommendedAction: z
        .string()
        .optional()
        .describe(
          'If a Ship mutation would help (reassign, change state, escalate), describe it here. Omit for informational findings.',
        ),
      recipientIds: z
        .array(z.string())
        .describe(
          'Person IDs (UUIDs) of the people who should be directly notified about this finding. Derive from entity ownership: assignee_id for issues, owner for sprints/projects, owner_id for programs. Use the actual IDs from the data.',
        ),
    }),
  ),
});

const SYSTEM_PROMPT = `You are FleetGraph, a project intelligence analyst for a government project management system called Ship. You analyze project data to detect problems, risks, and opportunities that humans might miss.

Your job: examine the provided workspace data and produce findings. Each finding identifies a specific, actionable condition.

## Finding Types You Detect

- **scope_creep** — Sprint scope increased significantly after start (>15% change). Look at scopeChanges data.
- **stale_triage** — Issues sitting in "triage" or "backlog" state for too long without movement. Look at issue states and dates.
- **accountability_debt** — Overdue action items or accountability items without owners. Look at accountabilityItems.
- **blocked_sprint** — Sprint with high percentage of blocked/stuck issues. Look at sprint issues by state.
- **overloaded_member** — Team member assigned to too many active issues or sprints. Look at team grid assignments.
- **missing_estimate** — Issues in active sprints without hour estimates. Look at sprintIssues estimate field.
- **sprint_velocity_drop** — Sprint completion rate significantly below historical average. Compare completed vs total.
- **unplanned_work** — High ratio of issues added mid-sprint vs original scope. Look at scopeChanges.

## Rollup Rule

Produce ONE finding per condition per entity, not one per item. For example:
- "Sprint 12 has 5 issues stuck in triage" → one finding, not 5 separate findings.
- "Person X is assigned to 12 active issues across 3 sprints" → one finding.
- "Sprint 14 scope increased 23%: 4 issues added after start" → one finding.
Cite individual items in the reasoning text, not as separate findings. This prevents notification flood.

## Recipients (recipientIds)

Every finding must include recipientIds — the people who should be directly notified.
Derive from entity ownership in the data:

| Finding type | Recipient(s) |
|---|---|
| scope_creep | Sprint owner |
| stale_triage | Sprint owner (rollup) or issue assignee_id (single) |
| accountability_debt | The person with overdue items |
| blocked_sprint | Owner of the blocking issue |
| overloaded_member | The person themselves (personId) |
| missing_estimate | Sprint owner |

Use the actual person UUIDs from the data (assignee_id, owner, owner_id, personId).
If no clear owner exists, use an empty array.

## Rules

- Only report findings backed by the data provided. Never speculate beyond what the numbers show.
- Severity guide: info = worth knowing, warning = should address soon, critical = blocking progress or creating risk.
- If the data shows a healthy workspace with no problems, return an empty findings array. Do NOT invent findings.
- Use the actual entity IDs from the data in affectedEntityId.
- recommendedAction should describe a concrete Ship mutation (e.g., "Reassign issue to person X", "Change issue state to blocked") only when appropriate. Omit for purely informational findings.
- Keep reasoning concise but specific — cite numbers from the data.`;

function buildUserPrompt(state: GraphStateType): string {
  const sections: string[] = [];

  if (state.issues.length > 0) {
    sections.push(`## Issues (${state.issues.length} total)\n${JSON.stringify(
      state.issues.map((i) => ({
        id: i.id,
        title: i.title,
        state: i.state,
        priority: i.priority,
        assignee_id: i.assignee_id,
        estimate: i.estimate,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })),
      null,
      2,
    )}`);
  }

  if (state.sprints.length > 0) {
    sections.push(`## Sprints (${state.sprints.length} total)\n${JSON.stringify(
      state.sprints.map((s) => ({
        id: s.id,
        name: s.name,
        sprint_number: s.sprint_number,
        status: s.status,
        owner: s.owner,
        issue_count: s.issue_count,
        completed_count: s.completed_count,
        started_count: s.started_count,
        total_estimate_hours: s.total_estimate_hours,
        has_plan: s.has_plan,
        has_retro: s.has_retro,
      })),
      null,
      2,
    )}`);
  }

  if (state.sprintIssues.length > 0) {
    sections.push(`## Sprint Issues (${state.sprintIssues.length} total)\n${JSON.stringify(
      state.sprintIssues.map((i) => ({
        id: i.id,
        title: i.title,
        state: i.state,
        priority: i.priority,
        assignee_id: i.assignee_id,
        estimate: i.estimate,
      })),
      null,
      2,
    )}`);
  }

  if (state.scopeChanges) {
    sections.push(
      `## Scope Changes\n${JSON.stringify(state.scopeChanges, null, 2)}`,
    );
  }

  if (state.projects.length > 0) {
    sections.push(`## Projects (${state.projects.length} total)\n${JSON.stringify(
      state.projects.map((p) => ({
        id: p.id,
        title: p.title,
        ice_score: p.ice_score,
        owner: p.owner,
        issue_count: p.issue_count,
        sprint_count: p.sprint_count,
      })),
      null,
      2,
    )}`);
  }

  if (state.programs.length > 0) {
    sections.push(`## Programs (${state.programs.length} total)\n${JSON.stringify(
      state.programs.map((p) => ({
        id: p.id,
        name: p.name,
        owner_id: p.owner_id,
        issue_count: p.issue_count,
        sprint_count: p.sprint_count,
      })),
      null,
      2,
    )}`);
  }

  if (state.team) {
    sections.push(
      `## Team Grid\n${JSON.stringify(
        {
          people: state.team.people.map((p) => ({
            personId: p.personId,
            name: p.name,
            isArchived: p.isArchived,
          })),
          assignmentCount: Object.keys(state.team.assignments).length,
          assignments: state.team.assignments,
        },
        null,
        2,
      )}`,
    );
  }

  if (state.accountabilityItems) {
    sections.push(
      `## Accountability Items\n${JSON.stringify(state.accountabilityItems, null, 2)}`,
    );
  }

  if (Object.keys(state.fetchErrors).length > 0) {
    sections.push(
      `## Fetch Errors (some data may be missing)\n${JSON.stringify(state.fetchErrors, null, 2)}`,
    );
  }

  if (sections.length === 0) {
    return 'No data was fetched from the workspace. Return an empty findings array.';
  }

  return `Analyze the following Ship workspace data and produce findings.\n\n${sections.join('\n\n')}`;
}

function hasData(state: GraphStateType): boolean {
  return (
    state.issues.length > 0 ||
    state.sprints.length > 0 ||
    state.sprintIssues.length > 0 ||
    state.scopeChanges !== null ||
    state.projects.length > 0 ||
    state.programs.length > 0 ||
    state.team !== null ||
    state.accountabilityItems !== null
  );
}

export async function reasoningNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (!hasData(state)) {
    console.log('[reasoning] no data fetched — skipping LLM call');
    return { findings: [] };
  }

  const config = loadConfig();
  const llm = new ChatOpenAI({
    model: 'gpt-4o',
    temperature: 0.2,
    apiKey: config.openaiApiKey,
  });

  const structured = llm.withStructuredOutput(FindingSchema, {
    name: 'analyze_workspace',
  });

  console.log('[reasoning] calling GPT-4o for workspace analysis...');

  const result = await structured.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(state) },
  ]);

  console.log(`[reasoning] produced ${result.findings.length} findings`);

  return { findings: result.findings };
}
