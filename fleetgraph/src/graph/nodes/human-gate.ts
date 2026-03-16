import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function humanGateNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[human-gate] stub — auto-confirming');
  return { humanDecision: 'confirmed' };
}
