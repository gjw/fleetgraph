import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function executeNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[execute] stub');
  return { executionResult: { stubbed: true } };
}
