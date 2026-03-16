import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function actionProposeNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[action-propose] stub');
  return {
    proposedAction: {
      type: 'stub_action',
      params: {},
      description: 'Stub proposed action for graph testing',
    },
  };
}
