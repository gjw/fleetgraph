import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function fetchIssuesNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  const client = getProactiveClient();
  if (!client) {
    console.log('[fetch-issues] no client available (missing config)');
    return { fetchErrors: { 'fetch-issues': 'No Ship client configured' } };
  }

  const result = await client.getIssues();

  if (result.error) {
    console.log(`[fetch-issues] error: ${result.error.message}`);
    return { fetchErrors: { 'fetch-issues': result.error.message } };
  }

  console.log(`[fetch-issues] fetched ${result.data.length} issues`);
  return { issues: result.data };
}
