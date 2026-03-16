import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import type { ShipSprint, ShipSprintIssue } from '../../ship/index.js';

export async function fetchSprintsNode(
  _state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  const client = getProactiveClient();
  if (!client) {
    console.log('[fetch-sprints] no client available (missing config)');
    return { fetchErrors: { 'fetch-sprints': 'No Ship client configured' } };
  }

  const errors: Record<string, string> = {};

  // Get all projects to discover their sprints
  const projectsResult = await client.getProjects();
  if (projectsResult.error) {
    console.log(`[fetch-sprints] error fetching projects: ${projectsResult.error.message}`);
    return { fetchErrors: { 'fetch-sprints': projectsResult.error.message } };
  }

  const projects = projectsResult.data;
  const allSprints: ShipSprint[] = [];
  const allSprintIssues: ShipSprintIssue[] = [];

  for (const project of projects) {
    const sprintsResult = await client.getProjectSprints(project.id);
    if (sprintsResult.error) {
      errors[`sprints-${project.id}`] = sprintsResult.error.message;
      continue;
    }

    for (const ps of sprintsResult.data) {
      const sprintResult = await client.getSprint(ps.id);
      if (sprintResult.error) {
        errors[`sprint-${ps.id}`] = sprintResult.error.message;
        continue;
      }
      allSprints.push(sprintResult.data);

      const issuesResult = await client.getSprintIssues(ps.id);
      if (issuesResult.error) {
        errors[`sprint-issues-${ps.id}`] = issuesResult.error.message;
        continue;
      }
      allSprintIssues.push(...issuesResult.data);
    }
  }

  // Scope changes for active sprints
  const activeSprints = allSprints.filter(s => s.status === 'active');
  const scopeChanges = activeSprints.length > 0
    ? await client.getSprintScopeChanges(activeSprints[0]!.id)
    : null;

  console.log(`[fetch-sprints] fetched ${allSprints.length} sprints, ${allSprintIssues.length} sprint issues, ${projects.length} projects`);

  return {
    sprints: allSprints,
    sprintIssues: allSprintIssues,
    scopeChanges: scopeChanges?.data ?? null,
    projects,
    ...(Object.keys(errors).length > 0 ? { fetchErrors: errors } : {}),
  };
}
