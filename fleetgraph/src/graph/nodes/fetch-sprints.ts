import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';
import type { ShipSprint, ShipSprintIssue } from '../../ship/index.js';

/**
 * Fetch sprint data scoped by mode.
 *
 * Proactive: all projects → active sprints → sprint issues + scope changes.
 * On-demand: scoped to context — specific sprint, project's sprints, or program's projects.
 */
export async function fetchSprintsNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  const client = getProactiveClient();
  if (!client) {
    console.log('[fetch-sprints] no client available (missing config)');
    return { fetchErrors: { 'fetch-sprints': 'No Ship client configured' } };
  }

  if (state.mode === 'on_demand') {
    return fetchOnDemandSprints(state);
  }

  return fetchProactiveSprints();
}

async function fetchProactiveSprints(): Promise<Partial<GraphUpdateType>> {
  const client = getProactiveClient()!;
  const errors: Record<string, string> = {};

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
    `[fetch-sprints] proactive: ${allSprints.length} sprints (${activeSprints.length} active), ` +
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

async function fetchOnDemandSprints(state: GraphStateType): Promise<Partial<GraphUpdateType>> {
  const client = getProactiveClient()!;
  const errors: Record<string, string> = {};

  // If we have a specific sprint from context, just fetch that one
  if (state.contextSprintId) {
    const sprintResult = await client.getSprint(state.contextSprintId);
    if (sprintResult.error) {
      return { fetchErrors: { 'fetch-sprints': sprintResult.error.message } };
    }

    const sprint = sprintResult.data;
    const sprintIssues: ShipSprintIssue[] = [];
    const scopeChanges: GraphUpdateType['scopeChanges'] = [];

    const issuesResult = await client.getSprintIssues(state.contextSprintId);
    if (issuesResult.data) {
      sprintIssues.push(...issuesResult.data);
    }

    if (sprint.status === 'active') {
      const scResult = await client.getSprintScopeChanges(state.contextSprintId);
      if (scResult.data) {
        scopeChanges.push({
          sprintId: sprint.id,
          sprintName: sprint.name ?? `Sprint ${sprint.sprint_number}`,
          ...scResult.data,
        });
      }
    }

    console.log(
      `[fetch-sprints] on-demand (sprint): "${sprint.name}", ${sprintIssues.length} issues`,
    );

    return { sprints: [sprint], sprintIssues, scopeChanges };
  }

  // If we have a project, fetch its sprints
  if (state.contextProjectId) {
    const sprintsResult = await client.getProjectSprints(state.contextProjectId);
    if (sprintsResult.error) {
      return { fetchErrors: { 'fetch-sprints': sprintsResult.error.message } };
    }

    const allSprints: ShipSprint[] = [];
    const allSprintIssues: ShipSprintIssue[] = [];
    const scopeChanges: GraphUpdateType['scopeChanges'] = [];

    for (const ps of sprintsResult.data) {
      const sr = await client.getSprint(ps.id);
      if (sr.error) {
        errors[`sprint-${ps.id}`] = sr.error.message;
        continue;
      }
      allSprints.push(sr.data);

      if (sr.data.status === 'active') {
        const ir = await client.getSprintIssues(ps.id);
        if (ir.data) allSprintIssues.push(...ir.data);

        const scr = await client.getSprintScopeChanges(ps.id);
        if (scr.data) {
          scopeChanges.push({
            sprintId: sr.data.id,
            sprintName: sr.data.name ?? `Sprint ${sr.data.sprint_number}`,
            ...scr.data,
          });
        }
      }
    }

    // Also fetch the project itself
    const projectResult = await client.getProject(state.contextProjectId);
    const projects = projectResult.data ? [projectResult.data] : [];

    console.log(
      `[fetch-sprints] on-demand (project): ${allSprints.length} sprints, ${allSprintIssues.length} sprint issues`,
    );

    return {
      sprints: allSprints,
      sprintIssues: allSprintIssues,
      scopeChanges,
      projects,
      ...(Object.keys(errors).length > 0 ? { fetchErrors: errors } : {}),
    };
  }

  // No specific context — fall back to proactive-style fetch
  console.log('[fetch-sprints] on-demand: no sprint/project context, falling back to full fetch');
  return fetchProactiveSprints();
}
