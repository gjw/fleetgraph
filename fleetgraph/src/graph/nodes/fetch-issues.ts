import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function fetchIssuesNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[fetch-issues] stub');
  return { issues: [] };
}
