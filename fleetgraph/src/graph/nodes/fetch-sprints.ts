import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import type { ShipSprint, ShipSprintIssue } from '../../ship/index.js';

/**
 * Fetch sprint data scoped by mode.
 *
 * Proactive: all projects → active sprints → sprint issues + scope changes.
 * On-demand: same data (sprints provide context for any question).
 *   For retro scenarios, also fetches sprint documents.
 *
 * Only fetches sprint issues for active sprints to limit data volume.
 */
export async function fetchSprintsNode(
  state: GraphStateType,
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

      // Only fetch sprint issues for active sprints (reduces data volume)
      if (sprintResult.data.status === 'active') {
        const issuesResult = await client.getSprintIssues(ps.id);
        if (issuesResult.error) {
          errors[`sprint-issues-${ps.id}`] = issuesResult.error.message;
          continue;
        }
        allSprintIssues.push(...issuesResult.data);
      }
    }
  }

  // Scope changes for all active sprints (critical for scope_creep detection)
  const activeSprints = allSprints.filter(s => s.status === 'active');
  const scopeChanges: GraphUpdateType['scopeChanges'] = [];

  for (const sprint of activeSprints) {
    const scResult = await client.getSprintScopeChanges(sprint.id);
    if (scResult.data) {
      scopeChanges.push({
        sprintId: sprint.id,
        sprintName: sprint.name ?? `Sprint ${sprint.sprint_number}`,
        ...scResult.data,
      });
    }
  }

  console.log(
    `[fetch-sprints] fetched ${allSprints.length} sprints (${activeSprints.length} active), ` +
    `${allSprintIssues.length} sprint issues, ${scopeChanges.length} scope change sets, ${projects.length} projects`,
  );

  return {
    sprints: allSprints,
    sprintIssues: allSprintIssues,
    scopeChanges,
    projects,
    ...(Object.keys(errors).length > 0 ? { fetchErrors: errors } : {}),
  };
}
