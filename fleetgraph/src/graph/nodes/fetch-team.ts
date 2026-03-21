import { getClientForState } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';

export async function fetchTeamNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  const client = getClientForState(state);
  if (!client) {
    console.log('[fetch-team] no client available (missing config)');
    return { fetchErrors: { 'fetch-team': 'No Ship client configured' } };
  }

  // Hot scan only needs sprint issues + scope changes; weekly only needs retros
  if (state.mode === 'proactive' && (state.scanType === 'hot' || state.scanType === 'weekly')) {
    console.log(`[fetch-team] ${state.scanType} scan — skipping team data`);
    return { team: null, accountabilityItems: null, programs: [] };
  }

  const errors: Record<string, string> = {};

  const [teamResult, accountabilityResult, programsResult] = await Promise.all([
    client.getTeamGrid(),
    client.getAccountabilityItems(),
    client.getPrograms(),
  ]);

  if (teamResult.error) {
    errors['team-grid'] = teamResult.error.message;
  }
  if (accountabilityResult.error) {
    errors['accountability'] = accountabilityResult.error.message;
  }
  if (programsResult.error) {
    errors['programs'] = programsResult.error.message;
  }

  console.log(
    `[fetch-team] team=${teamResult.data?.users ? teamResult.data.users.length + ' people' : 'error'}` +
    ` accountability=${accountabilityResult.data?.items ? accountabilityResult.data.items.length + ' items' : 'error'}` +
    ` programs=${programsResult.data ? programsResult.data.length : 'error'}`,
  );

  return {
    team: teamResult.data ?? null,
    accountabilityItems: accountabilityResult.data ?? null,
    programs: programsResult.data ?? [],
    ...(Object.keys(errors).length > 0 ? { fetchErrors: errors } : {}),
  };
}
