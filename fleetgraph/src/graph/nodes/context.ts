import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function contextNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log(`[context] userId=${state.userId} docId=${state.documentId}`);
  return {};
}
