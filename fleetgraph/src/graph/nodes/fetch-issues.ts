import { getClientForState } from '../../ship/index.js';
import { ShipClient } from '../../ship/index.js';
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
  const client = getClientForState(state);
  if (!client) {
    console.log('[fetch-issues] no client available (missing config)');
    return { fetchErrors: { 'fetch-issues': 'No Ship client configured' } };
  }

  // Weekly scan only analyzes retro content — no issues needed
  if (state.mode === 'proactive' && state.scanType === 'weekly') {
    console.log('[fetch-issues] weekly scan — skipping issues');
    return { issues: [], dependencyChain: [] };
  }

  let issues: ShipIssue[] = [];
  let dependencyChain: GraphUpdateType['dependencyChain'] = [];

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
    issues = await fetchOnDemandIssues(client, state);

    // For on-demand issue views, resolve the dependency chain
    if (state.documentType === 'issue' && state.documentId) {
      dependencyChain = await fetchDependencyChain(client, state.documentId);
    }
  }

  console.log(`[fetch-issues] fetched ${issues.length} issues, ${dependencyChain.length} deps (mode=${state.mode})`);
  return { issues, dependencyChain };
}

async function fetchOnDemandIssues(client: ShipClient, state: GraphStateType): Promise<ShipIssue[]> {

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

// ── Dependency chain fetching ───────────────────────────────────────────────

interface DependencyNode {
  id: string;
  title: string;
  state: string;
  dependsOn: string[];
}

/**
 * Fetch the dependency chain for an issue using the issue API (which now
 * includes depends_on). Walks up to maxDepth levels deep.
 */
async function fetchDependencyChain(
  client: ShipClient,
  issueId: string,
  maxDepth = 3,
): Promise<DependencyNode[]> {
  const visited = new Set<string>();
  const chain: DependencyNode[] = [];

  async function walk(id: string, depth: number): Promise<void> {
    if (depth > maxDepth || visited.has(id)) return;
    visited.add(id);

    const result = await client.getIssue(id);
    if (result.error || !result.data) return;

    const issue = result.data;
    const dependsOn = issue.depends_on ?? [];

    chain.push({
      id: issue.id,
      title: issue.title,
      state: issue.state,
      dependsOn,
    });

    for (const depId of dependsOn) {
      await walk(depId, depth + 1);
    }
  }

  await walk(issueId, 0);
  console.log(`[fetch-issues] dependency chain: ${chain.length} nodes (max depth ${maxDepth})`);
  return chain;
}
