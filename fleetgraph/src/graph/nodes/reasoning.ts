import type { GraphStateType, GraphUpdateType } from '../state.js';
import type { Finding } from '../state.js';

const STUB_FINDING: Finding = {
  findingType: 'stub_finding',
  severity: 'info',
  affectedEntityId: 'stub-entity-id',
  affectedEntityType: 'issue',
  title: 'Stub finding for graph testing',
  reasoning: 'This is a placeholder finding produced by the stub reasoning node.',
};

export async function reasoningNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  console.log('[reasoning] stub — producing 1 finding');
  return { findings: [STUB_FINDING] };
}
