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
        .describe('UUID of the affected entity. For person findings, use personId from the team grid (the person document UUID), NOT assignee_id or user UUIDs from issues.'),
      affectedEntityType: z.enum(['issue', 'sprint', 'project', 'program', 'person']),
      title: z.string().describe('Short human-readable title, under 80 chars'),
      summary: z
        .string()
        .describe(
          'One to two sentence detail line beneath the title. Provides the "so what" — cite specific numbers, names, and timeframes. E.g., "29 active issues across 2 programs. 79h estimated in FleetGraph Demo Week 14."',
        ),
      reasoning: z
        .string()
        .describe(
          'Detailed explanation of what was found, why it matters, and what is recommended. 2-4 sentences.',
        ),
      recommendedAction: z
        .string()
        .nullable()
        .describe(
          'If a Ship mutation would help (reassign, change state, escalate), describe it here. Null for informational findings.',
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

## Output Fields

Each finding has three text fields:
- **title**: headline (under 80 chars). E.g., "David Kim is overloaded"
- **summary**: 1-2 sentence supporting detail with specific numbers. E.g., "29 active issues across 2 programs. 79h estimated in FleetGraph Demo Week 14."
- **reasoning**: full narrative (2-4 sentences) explaining what was found, why it matters, and what is recommended.

## Terminology

In finding titles and summaries, refer to sprints as **weeks** (e.g., "Week 14", not "Sprint 14" or "Sprint Week 14"). This matches the Ship UI terminology. The underlying data uses "sprint" as the document type, but users see "Week N".

## Finding Types You Detect (in priority order)

- **scope_creep** — Sprint scope increased significantly after start. Check scopeChanges data: if added_after_start / original_count > 0.15 (15%), this is a finding. This is HIGH PRIORITY — scope creep directly threatens sprint delivery. Do not let stale_triage findings crowd this out.
- **accountability_debt** — Three signals: (1) overdue action items in accountabilityItems, (2) active sprints missing a sprint plan (has_plan=false), (3) completed sprints missing a retrospective (has_retro=false). Check ALL three. Sprint plan/retro gaps are accountability debt even when there are no overdue action items.
- **blocked_sprint** — Sprint with high percentage of blocked/stuck issues. Look at sprint issues by state.
- **overloaded_member** — Team member assigned to too many active issues or sprints. Look at team grid assignments.
- **stale_triage** — Issues sitting in "triage" or "backlog" state for too long without movement. Look at issue states and dates.
- **missing_estimate** — Issues in active sprints without hour estimates. Look at sprintIssues estimate field.
- **sprint_velocity_drop** — Sprint completion rate significantly below historical average. Compare completed vs total.
- **unplanned_work** — High ratio of issues added mid-sprint vs original scope. Look at scopeChanges.
- **blocked_chain** — An issue depends on another issue (via dependencyChain data) where the blocker is itself blocked, stuck, or unassigned. Look at the dependency chain: if issue A depends on B, and B's state is not in_progress/in_review/done, flag it. Longer chains (A→B→C all blocked) are higher severity.
- **retro_patterns** — Recurring themes across multiple retrospectives. Look at retroContent for repeated blockers, unresolved action items, or systemic problems mentioned in 2+ retros. Only produce this finding when retro content is provided and a clear pattern spans multiple sprints.

## Rollup Rule (CRITICAL — read carefully)

You MUST roll up findings to the highest meaningful entity level. Never produce multiple findings for the same condition across sibling entities.

**Cross-entity rollup:** When the same condition (e.g., missing_estimate, blocked_sprint) affects multiple sprints in the same program or workspace, produce ONE finding at the program or workspace level — NOT one finding per sprint. Cite the individual sprints in the reasoning text.

**Examples of CORRECT rollup:**

- 3 sprints in Program X all have missing estimates → ONE finding: "Program X: 3 sprints have unestimated issues" (affectedEntityType=program, affectedEntityId=program UUID)
- 5 sprints across the workspace have scope creep → ONE finding: "Workspace-wide scope creep across 5 active sprints" (use the program UUID if all are in one program, or pick the most affected program)
- 8 issues in Sprint 12 are stuck in triage → ONE finding per sprint, not per issue

**Examples of WRONG output (DO NOT DO THIS):**

- ❌ One missing_estimate finding for each of 11 sprints
- ❌ One blocked_sprint finding for Sprint 14-A AND another for Sprint 14-B in the same program
- ❌ One stale_triage finding per issue

**Target:** A typical proactive scan of an active workspace should produce 3-8 findings total, not 10+. If you're producing more than 8 findings, you're not rolling up enough.

## Recipients (recipientIds)

Every finding must include recipientIds — the people who should be directly notified.
Derive from entity ownership in the data:

| Finding type | Recipient(s) |
|---|---|
| scope_creep | Sprint owner (or program owner_id if rolled up to program) |
| stale_triage | Sprint owner (rollup) or issue assignee_id (single) |
| accountability_debt | The person with overdue items, or sprint owner for missing plan/retro |
| blocked_sprint | Sprint owner |
| overloaded_member | The person themselves (personId) |
| missing_estimate | Sprint owner (or program owner_id if rolled up) |
| sprint_velocity_drop | Sprint owner |
| blocked_chain | Assignee of the blocked issue + assignee of the blocker |
| retro_patterns | Sprint/program owner |

Use the actual person UUIDs from the data (assignee_id, owner, owner_id, personId).
If no clear owner exists, use an empty array.

## Rules

- Only report findings backed by the data provided. Never speculate beyond what the numbers show.
- Severity guide: info = worth knowing, warning = should address soon, critical = blocking progress or creating risk.
- If the data shows a healthy workspace with no problems, return an empty findings array. Do NOT invent findings.
- Use the actual entity IDs from the data in affectedEntityId. **For person findings (overloaded_member, accountability_debt), use personId from the team grid — NOT assignee_id or user UUIDs from issues.** The personId is the person document UUID that links correctly in the UI.
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
        assignee_name: i.assignee_name,
        estimate: i.estimate,
        due_date: i.due_date,
        started_at: i.started_at,
        created_at: i.created_at,
        updated_at: i.updated_at,
        created_by: i.created_by,
        belongs_to: i.belongs_to,
      })),
      null,
      2,
    )}`);
  }

  if (state.sprints.length > 0) {
    sections.push(`## Sprints (${state.sprints.length} total)\nNote: has_plan=false on an active sprint means no sprint plan was written. has_retro=false on a completed sprint means no retrospective was written. Both are accountability_debt signals.\n${JSON.stringify(
      state.sprints.map((s) => ({
        id: s.id,
        name: s.name,
        program_id: s.program_id,
        program_name: s.program_name,
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

  if (state.scopeChanges.length > 0) {
    sections.push(
      `## Scope Changes (${state.scopeChanges.length} active sprints)\n${JSON.stringify(state.scopeChanges, null, 2)}`,
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
          people: (state.team.users ?? state.team.people ?? []).map((p) => ({
            personId: p.personId,
            name: p.name,
            isArchived: p.isArchived,
          })),
          assignmentCount: Object.keys(state.team.associations ?? state.team.assignments ?? {}).length,
          assignments: state.team.associations ?? state.team.assignments ?? {},
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

  if (state.dependencyChain.length > 0) {
    sections.push(
      `## Dependency Chain (${state.dependencyChain.length} nodes)\nEach node shows its depends_on links. Look for chains where blockers are themselves blocked or stuck.\n${JSON.stringify(state.dependencyChain, null, 2)}`,
    );
  }

  if (state.retroContent.length > 0) {
    sections.push(
      `## Retrospective Content (${state.retroContent.length} retros)\nLook for recurring themes, repeated blockers, or unresolved issues across these retrospectives.\n${state.retroContent
        .map(r => `### ${r.sprintName}\n${r.text}`)
        .join('\n\n')}`,
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

  let preamble = 'Analyze the following Ship workspace data and produce findings.';

  if (state.mode === 'on_demand' && state.userMessage) {
    preamble = `The user is asking: "${state.userMessage}"`;
    if (state.documentId) {
      preamble += `\nThey are viewing document ID: ${state.documentId} (type: ${state.documentType ?? 'unknown'}).`;
    }
    preamble += `

## On-demand constraints

- Focus ONLY on data relevant to the user's question. The data below is already scoped to what they're viewing.
- If the question is not about project data (e.g., greetings, off-topic), return an empty findings array.
- Do NOT produce a dump of all issues as findings. Only flag genuine problems relevant to the user's context.
- If the user asks about a specific entity, findings should relate to that entity and its immediate neighbors (same sprint, same project).
- Prefer fewer, higher-quality findings over comprehensive coverage.`;
  }

  return `${preamble}\n\n${sections.join('\n\n')}`;
}

function hasData(state: GraphStateType): boolean {
  return (
    state.issues.length > 0 ||
    state.sprints.length > 0 ||
    state.sprintIssues.length > 0 ||
    state.scopeChanges.length > 0 ||
    state.projects.length > 0 ||
    state.programs.length > 0 ||
    state.team !== null ||
    state.accountabilityItems !== null ||
    state.retroContent.length > 0 ||
    state.dependencyChain.length > 0
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

  try {
    const result = await structured.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(state) },
    ]);

    console.log(`[reasoning] produced ${result.findings.length} findings`);
    return { findings: result.findings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[reasoning] LLM call failed: ${message}`);
    return { findings: [], fetchErrors: { reasoning: message } };
  }
}
