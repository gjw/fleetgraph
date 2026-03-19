import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import { loadConfig } from '../../config.js';

const MutationSchema = z.object({
  mutation_type: z
    .enum(['change_state', 'reassign', 'add_comment'])
    .describe(
      'change_state = change an issue state (e.g., to blocked, in_progress). ' +
      'reassign = reassign an issue to a different person. ' +
      'add_comment = add a comment to the entity with the recommendation.',
    ),
  target_entity_id: z
    .string()
    .describe('UUID of the entity to mutate'),
  params: z
    .object({
      new_state: z.string().nullable().describe(
        'Required when mutation_type is change_state. Valid: blocked, triage, open, in_progress, in_review, done, cancelled. Null otherwise.',
      ),
      new_assignee_id: z.string().nullable().describe(
        'Required when mutation_type is reassign. UUID of the person to assign to. Null otherwise.',
      ),
      content: z.string().nullable().describe(
        'Required when mutation_type is add_comment. The comment text. Null otherwise.',
      ),
    })
    .describe('Set the field matching mutation_type, null for the others.'),
});

const SYSTEM_PROMPT = `You extract a concrete Ship mutation from a FleetGraph finding's recommended action.

Given a finding with its recommended action description, affected entity, and the available team/issue data, produce a structured mutation.

Rules:
- Pick the mutation_type that best matches the recommendation.
- Use the exact UUIDs from the data for target_entity_id and params.
- If the recommendation says to reassign but you don't have the target person's UUID, fall back to add_comment.
- If the recommendation is vague or informational, use add_comment with a summary.
- For change_state, valid states are: triage, open, in_progress, in_review, blocked, done, cancelled.`;

/**
 * Action-propose node — structures the proposed action into a concrete
 * Ship API mutation that the execute node can perform after HITL approval.
 */
export async function actionProposeNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (!state.proposedAction) {
    console.log('[action-propose] no proposed action from classify — skipping');
    return {};
  }

  const config = loadConfig();
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    apiKey: config.openaiApiKey,
  });

  const structured = llm.withStructuredOutput(MutationSchema, {
    name: 'extract_mutation',
  });

  // Build context for the LLM
  const actionFinding = state.findings.find(
    (f) => f.affectedEntityId === state.proposedAction?.params.affectedEntityId,
  ) ?? state.findings[0];

  const context: Record<string, unknown> = {
    finding: actionFinding
      ? {
          findingType: actionFinding.findingType,
          severity: actionFinding.severity,
          affectedEntityId: actionFinding.affectedEntityId,
          affectedEntityType: actionFinding.affectedEntityType,
          title: actionFinding.title,
          recommendedAction: actionFinding.recommendedAction,
        }
      : null,
    proposedDescription: state.proposedAction.description,
  };

  // Include team data if available (for resolving person UUIDs in reassign)
  if (state.team) {
    context.teamMembers = (state.team.users ?? state.team.people ?? []).map((p) => ({
      personId: p.personId,
      name: p.name,
    }));
  }

  console.log(
    `[action-propose] extracting mutation from: "${state.proposedAction.description}"`,
  );

  try {
    const result = await structured.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(context, null, 2) },
    ]);

    console.log(
      `[action-propose] mutation: ${result.mutation_type} on ${result.target_entity_id}`,
    );

    return {
      proposedAction: {
        type: result.mutation_type,
        params: {
          target_entity_id: result.target_entity_id,
          ...result.params,
        },
        description: state.proposedAction.description,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[action-propose] LLM call failed: ${message}`);
    return { fetchErrors: { actionPropose: message } };
  }
}
