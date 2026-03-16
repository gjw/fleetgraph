import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function triggerNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log(`[trigger] mode=${state.mode} triggerId=${state.triggerId}`);
  return {};
}
