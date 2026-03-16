import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function fetchSprintsNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[fetch-sprints] stub');
  return { sprints: [], sprintIssues: [], scopeChanges: null };
}
