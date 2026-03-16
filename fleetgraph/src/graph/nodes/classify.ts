import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function classifyNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  // Stub: pass through the classification from state.
  // The test script sets this directly to exercise each path.
  console.log(`[classify] stub — classification=${state.classification}`);
  return {};
}
