import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import type { ShipIssue } from '../../ship/index.js';

/**
 * Fetch issues scoped by mode and context.
 *
 * Proactive: active issues only (triage, open, in_progress, in_review, blocked).
 * On-demand: depends on what the user is viewing —
 *   - issue: fetch that issue + its sprint's issues + dependency chain
 *   - sprint/weekly_review: fetch issues in that sprint
 *   - person: fetch issues assigned to that person
 *   - fallback: active issues only (same as proactive)
 */
export async function fetchIssuesNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  const client = getProactiveClient();
  if (!client) {
    console.log('[fetch-issues] no client available (missing config)');
    return { fetchErrors: { 'fetch-issues': 'No Ship client configured' } };
  }

  let issues: ShipIssue[] = [];

  if (state.mode === 'proactive') {
    // Proactive: only active issues, not done/cancelled/archived
    const result = await client.getIssues({
      state: 'triage,open,in_progress,in_review,blocked',
    });
    if (result.error) {
      console.log(`[fetch-issues] error: ${result.error.message}`);
      return { fetchErrors: { 'fetch-issues': result.error.message } };
    }
    issues = result.data;
  } else if (state.mode === 'on_demand') {
    // On-demand: scope based on document context
    if (state.documentType === 'issue' && state.documentId) {
      // Fetch the specific issue + its sprint context
      const issueResult = await client.getIssue(state.documentId);
      if (issueResult.error) {
        return { fetchErrors: { 'fetch-issues': issueResult.error.message } };
      }

      // Get all active issues for dependency chain analysis
      const activeResult = await client.getIssues({
        state: 'triage,open,in_progress,in_review,blocked',
      });
      issues = activeResult.data ?? [];
    } else if (state.userId) {
      // User asking about their work — fetch their assigned issues
      const result = await client.getIssues({
        assignee_id: state.userId,
        state: 'triage,open,in_progress,in_review,blocked',
      });
      issues = result.data ?? [];
    } else {
      // Fallback: active issues only
      const result = await client.getIssues({
        state: 'triage,open,in_progress,in_review,blocked',
      });
      issues = result.data ?? [];
    }
  }

  console.log(`[fetch-issues] fetched ${issues.length} issues (mode=${state.mode})`);
  return { issues };
}
