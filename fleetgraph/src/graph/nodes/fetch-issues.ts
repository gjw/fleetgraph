import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import type { ShipIssue } from '../../ship/index.js';

/**
 * Fetch issues scoped by mode and context.
 *
 * Proactive: active issues only (triage, open, in_progress, in_review, blocked).
 * On-demand: scoped to what the user is viewing —
 *   - issue: that issue + its sprint's issues
 *   - sprint/weekly_review: issues in that sprint
 *   - project: issues in that project
 *   - program: issues filtered by program
 *   - userId only: issues assigned to that user
 *   - fallback: active issues (same as proactive)
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
    issues = await fetchOnDemandIssues(state);
  }

  console.log(`[fetch-issues] fetched ${issues.length} issues (mode=${state.mode})`);
  return { issues };
}

async function fetchOnDemandIssues(state: GraphStateType): Promise<ShipIssue[]> {
  const client = getProactiveClient()!;

  // If viewing a specific issue, fetch it + its sprint context
  if (state.documentType === 'issue' && state.documentId) {
    const issueResult = await client.getIssue(state.documentId);
    if (issueResult.error) {
      console.log(`[fetch-issues] error fetching issue: ${issueResult.error.message}`);
      return [];
    }

    const issues: ShipIssue[] = [issueResult.data];

    // Also fetch sibling issues from the same sprint
    if (state.contextSprintId) {
      const sprintIssuesResult = await client.getIssues({
        sprint_id: state.contextSprintId,
        state: 'triage,open,in_progress,in_review,blocked',
      });
      if (sprintIssuesResult.data) {
        for (const si of sprintIssuesResult.data) {
          if (si.id !== state.documentId) {
            issues.push(si);
          }
        }
      }
    }

    return issues;
  }

  // If viewing a sprint, fetch issues in that sprint
  if ((state.documentType === 'weekly_review' || state.documentType === 'sprint') && state.contextSprintId) {
    const result = await client.getIssues({
      sprint_id: state.contextSprintId,
      state: 'triage,open,in_progress,in_review,blocked',
    });
    return result.data ?? [];
  }

  // If viewing a project, fetch issues in that project
  if (state.documentType === 'project' && state.contextProjectId) {
    const result = await client.getProjectIssues(state.contextProjectId);
    return result.data ?? [];
  }

  // If viewing a program, fetch issues filtered by program
  if (state.documentType === 'program' && state.contextProgramId) {
    const result = await client.getIssues({
      program_id: state.contextProgramId,
      state: 'triage,open,in_progress,in_review,blocked',
    });
    return result.data ?? [];
  }

  // userId but no document context — fetch their assigned issues
  if (state.userId) {
    const result = await client.getIssues({
      assignee_id: state.userId,
      state: 'triage,open,in_progress,in_review,blocked',
    });
    return result.data ?? [];
  }

  // Fallback: active issues only
  const result = await client.getIssues({
    state: 'triage,open,in_progress,in_review,blocked',
  });
  return result.data ?? [];
}
