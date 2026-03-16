import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function persistNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[persist] stub');
  return { findingDocIds: ['stub-finding-id'] };
}
