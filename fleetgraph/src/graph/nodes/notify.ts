import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function notifyNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (state.findings.length === 0) {
    console.log('[notify] no findings to surface');
    return {};
  }

  for (const finding of state.findings) {
    const recipients = finding.recipientIds.length > 0
      ? finding.recipientIds.join(', ')
      : 'no direct recipients';
    console.log(
      `[notify] [${finding.severity}] ${finding.findingType}: ${finding.title} → ${recipients}`,
    );
  }

  console.log(`[notify] surfacing ${state.findings.length} findings for persistence`);
  return {};
}
