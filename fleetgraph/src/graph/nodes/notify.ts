import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function notifyNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[notify] stub');
  return {};
}
