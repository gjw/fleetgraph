import type { Finding } from '../state.js';
import type { ShipClient } from '../../ship/client.js';
import type { ShipDocument } from '../../ship/types.js';

export interface FindingProps {
  finding_type?: string;
  affected_entity_id?: string;
  severity?: 'info' | 'warning' | 'critical';
  status?: string;
  human_decision?: string | null;
  snooze_until?: string | null;
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * Fetch all existing fleetgraph_finding documents and build a lookup map
 * keyed by "finding_type::affected_entity_id" for O(1) dedup checks.
 */
export async function loadExistingFindings(
  client: ShipClient,
): Promise<Map<string, ShipDocument>> {
  const result = await client.getDocuments({ type: 'fleetgraph_finding' });
  const map = new Map<string, ShipDocument>();

  if (result.error) {
    console.warn('[dedup] failed to fetch existing findings:', result.error.message);
    return map;
  }

  for (const doc of result.data) {
    const props = doc.properties as FindingProps;
    if (props.finding_type && props.affected_entity_id) {
      const key = `${props.finding_type}::${props.affected_entity_id}`;
      // Keep the most recent one if there are multiple
      const existing = map.get(key);
      if (!existing || new Date(doc.updated_at) > new Date(existing.updated_at)) {
        map.set(key, doc);
      }
    }
  }

  return map;
}

/**
 * Status-agnostic dedup: if ANY existing finding matches, skip —
 * unless it's resolved (condition returned) or snooze expired.
 */
export function shouldCreateFinding(existing: ShipDocument): 'skip' | 'create' {
  const props = existing.properties as FindingProps;

  // Resolved findings can be re-created (condition returned)
  if (props.status === 'resolved') return 'create';

  // Expired snooze — re-create
  if (props.human_decision === 'snoozed' && props.snooze_until) {
    if (new Date(props.snooze_until) < new Date()) return 'create';
  }

  // Everything else: active, pending_decision, dismissed, confirmed, snoozed — skip
  return 'skip';
}

/**
 * Update an existing finding's title, content, and severity in place.
 * Severity only upgrades (takes the higher of existing vs new).
 * Returns true if an update was performed.
 */
export async function updateExistingFinding(
  client: ShipClient,
  existing: ShipDocument,
  finding: Finding,
  logPrefix: string,
): Promise<boolean> {
  const props = existing.properties as FindingProps;
  const existingSeverity = props.severity ?? 'info';

  const titleChanged = existing.title !== finding.title;
  const severityUpgrade =
    (SEVERITY_RANK[finding.severity] ?? 0) > (SEVERITY_RANK[existingSeverity] ?? 0);

  // Always update content (reasoning may have changed), but skip API call
  // if title and severity are also unchanged
  if (!titleChanged && !severityUpgrade) {
    console.log(`${logPrefix} existing finding ${existing.id} unchanged — skip update`);
    return false;
  }

  const patch: Record<string, unknown> = {};
  if (titleChanged) patch.title = finding.title;
  if (severityUpgrade) {
    patch.properties = { ...existing.properties, severity: finding.severity };
  }

  const result = await client.updateDocument(existing.id, patch);
  if (result.error) {
    console.error(
      `${logPrefix} failed to update finding ${existing.id}: ${result.error.message}`,
    );
    return false;
  }

  const changes = [
    titleChanged ? `title='${finding.title}'` : null,
    severityUpgrade ? `severity=${existingSeverity}→${finding.severity}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`${logPrefix} updated finding ${existing.id}: ${changes}`);
  return true;
}
