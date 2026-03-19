import type { GraphStateType, GraphUpdateType, ProposedAction } from '../state.js';
import { getProactiveClient } from '../../ship/factory.js';
import type { ShipClient } from '../../ship/client.js';

/**
 * Execute node — performs the approved Ship API mutation.
 * Only called after human confirmation via the decide endpoint.
 */
export async function executeNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (!state.proposedAction) {
    console.log('[execute] no proposed action — nothing to execute');
    return { executionResult: { error: 'No proposed action' } };
  }

  const client = getProactiveClient();
  if (!client) {
    console.error('[execute] no Ship client available');
    return { executionResult: { error: 'Ship client unavailable' } };
  }

  const result = await executeMutation(client, state.proposedAction);
  return { executionResult: result };
}

/**
 * Execute a proposed action against the Ship API.
 * Exported so the findings decide endpoint can call it directly.
 */
export async function executeMutation(
  client: ShipClient,
  action: ProposedAction,
): Promise<Record<string, unknown>> {
  const targetId = action.params.target_entity_id as string;
  if (!targetId) {
    return { error: 'No target_entity_id in action params' };
  }

  switch (action.type) {
    case 'change_state': {
      const newState = action.params.new_state as string;
      if (!newState) {
        return { error: 'change_state requires new_state param' };
      }
      console.log(`[execute] changing issue ${targetId} state to ${newState}`);
      const result = await client.updateIssue(targetId, { state: newState as never });
      if (result.error) {
        return { error: result.error.message, status: result.error.status };
      }
      return {
        action: 'change_state',
        target: targetId,
        new_state: newState,
        executed_at: new Date().toISOString(),
      };
    }

    case 'reassign': {
      const newAssigneeId = action.params.new_assignee_id as string;
      if (!newAssigneeId) {
        return { error: 'reassign requires new_assignee_id param' };
      }
      console.log(`[execute] reassigning issue ${targetId} to ${newAssigneeId}`);
      const result = await client.updateIssue(targetId, { assignee_id: newAssigneeId });
      if (result.error) {
        return { error: result.error.message, status: result.error.status };
      }
      return {
        action: 'reassign',
        target: targetId,
        new_assignee_id: newAssigneeId,
        executed_at: new Date().toISOString(),
      };
    }

    case 'add_comment': {
      const content = action.params.content as string ?? action.description;
      console.log(`[execute] adding comment to ${targetId}`);
      const result = await client.createComment(targetId, {
        comment_id: crypto.randomUUID(),
        content: `[FleetGraph] ${content}`,
      });
      if (result.error) {
        return { error: result.error.message, status: result.error.status };
      }
      return {
        action: 'add_comment',
        target: targetId,
        executed_at: new Date().toISOString(),
      };
    }

    default:
      console.log(`[execute] unknown action type: ${action.type} — falling back to comment`);
      const fallbackContent = action.description ?? `FleetGraph recommended: ${action.type}`;
      const fallbackResult = await client.createComment(targetId, {
        comment_id: crypto.randomUUID(),
        content: `[FleetGraph] ${fallbackContent}`,
      });
      if (fallbackResult.error) {
        return { error: fallbackResult.error.message };
      }
      return {
        action: 'add_comment_fallback',
        original_type: action.type,
        target: targetId,
        executed_at: new Date().toISOString(),
      };
  }
}
