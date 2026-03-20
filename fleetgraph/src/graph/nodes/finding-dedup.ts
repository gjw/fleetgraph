import type { Finding } from '../state.js';
import type { ShipClient } from '../../ship/client.js';
import type { ShipDocument, ShipTeamGrid } from '../../ship/types.js';

export interface FindingProps {
  finding_type?: string;
  affected_entity_id?: string;
  affected_entity_name?: string;
  summary?: string;
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
 * Dedup logic: determines whether to create a new finding or skip (update in place).
 *
 * - acknowledged → 'skip' (update in place; re-badge only on severity escalation)
 * - snoozed + expired → 'create' (snooze window passed, treat as new)
 * - snoozed + not expired → 'skip'
 * - resolved (from approve) → 'create' (condition returned after fix)
 * - active/pending_decision → 'skip' (already visible)
 */
export function shouldCreateFinding(existing: ShipDocument): 'skip' | 'create' {
  const props = existing.properties as FindingProps;

  // Resolved findings can be re-created (condition returned after approved fix)
  if (props.status === 'resolved') return 'create';

  // Expired snooze — re-create (treat as new)
  if (props.human_decision === 'snoozed' && props.snooze_until) {
    if (new Date(props.snooze_until) < new Date()) return 'create';
  }

  // Everything else: acknowledged, active, pending_decision, snoozed (not expired) — skip
  return 'skip';
}

/**
 * Resolve person findings that use user UUIDs to person document UUIDs.
 * GPT-4o sometimes outputs assignee_id (users table) instead of personId
 * (documents table). This ensures the finding references a real document.
 *
 * Mutates finding.affectedEntityId in place. Returns true if resolved.
 */
export function resolvePersonEntityId(
  finding: Finding,
  team: ShipTeamGrid | null,
): boolean {
  if (finding.affectedEntityType !== 'person' || !team) return false;

  const people = team.users ?? team.people ?? [];

  // Check if the ID already matches a personId (document UUID) — no resolution needed
  if (people.some((p) => p.personId === finding.affectedEntityId)) return false;

  // Try to match against user UUID (id field)
  const match = people.find((p) => p.id === finding.affectedEntityId);
  if (match) {
    console.log(
      `[dedup] resolved person user UUID ${finding.affectedEntityId} → person doc ${match.personId} (${match.name})`,
    );
    finding.affectedEntityId = match.personId;
    return true;
  }

  console.warn(
    `[dedup] person finding references unknown ID ${finding.affectedEntityId} — not in team grid`,
  );
  return false;
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
  enrichment?: { affected_entity_name?: string; summary?: string },
): Promise<boolean> {
  const props = existing.properties as FindingProps;
  const existingSeverity = props.severity ?? 'info';

  const titleChanged = existing.title !== finding.title;
  const severityUpgrade =
    (SEVERITY_RANK[finding.severity] ?? 0) > (SEVERITY_RANK[existingSeverity] ?? 0);
  const hasEnrichment = enrichment?.affected_entity_name || enrichment?.summary;

  // Skip API call if nothing changed
  if (!titleChanged && !severityUpgrade && !hasEnrichment) {
    console.log(`${logPrefix} existing finding ${existing.id} unchanged — skip update`);
    return false;
  }

  const patch: Record<string, unknown> = {};
  if (titleChanged) patch.title = finding.title;

  const propsUpdate: Record<string, unknown> = { ...existing.properties };
  let propsChanged = false;
  if (severityUpgrade) {
    propsUpdate.severity = finding.severity;
    propsChanged = true;
    // Re-badge acknowledged findings on severity escalation
    if (props.human_decision === 'acknowledged') {
      propsUpdate.human_decision = null;
      propsUpdate.status = 'active';
      console.log(`${logPrefix} severity escalated on acknowledged finding — re-badging`);
    }
  }
  if (enrichment?.affected_entity_name) {
    propsUpdate.affected_entity_name = enrichment.affected_entity_name;
    propsChanged = true;
  }
  if (enrichment?.summary) {
    propsUpdate.summary = enrichment.summary;
    propsChanged = true;
  }
  if (propsChanged) {
    patch.properties = propsUpdate;
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
