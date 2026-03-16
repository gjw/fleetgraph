import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function fetchTeamNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[fetch-team] stub');
  return { team: null, accountabilityItems: null };
}
