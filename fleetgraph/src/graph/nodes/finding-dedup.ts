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
  last_validated_at?: string | null;
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
 * Always stamps last_validated_at so the staleness auto-resolve window
 * stays fresh for re-detected findings.
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

  const patch: Record<string, unknown> = {};
  if (titleChanged) patch.title = finding.title;

  const propsUpdate: Record<string, unknown> = { ...existing.properties };
  // Always stamp last_validated_at — this keeps the staleness window fresh
  propsUpdate.last_validated_at = new Date().toISOString();
  let propsChanged = true; // always true now due to last_validated_at

  if (severityUpgrade) {
    propsUpdate.severity = finding.severity;
    // Re-badge acknowledged findings on severity escalation
    if (props.human_decision === 'acknowledged') {
      propsUpdate.human_decision = null;
      propsUpdate.status = 'active';
      console.log(`${logPrefix} severity escalated on acknowledged finding — re-badging`);
    }
  }
  if (enrichment?.affected_entity_name) {
    propsUpdate.affected_entity_name = enrichment.affected_entity_name;
  }
  if (enrichment?.summary) {
    propsUpdate.summary = enrichment.summary;
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
    !titleChanged && !severityUpgrade && !hasEnrichment ? 'last_validated_at' : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`${logPrefix} updated finding ${existing.id}: ${changes}`);
  return true;
}

// ── Staleness auto-resolve ──────────────────────────────────────────────────

/** Staleness windows: 3 cycles per cadence before auto-resolve */
const STALENESS_WINDOWS_MS: Record<string, number> = {
  hot: 15 * 60 * 1000,           // 15 min (3 × 5 min)
  daily: 72 * 60 * 60 * 1000,    // 72h (3 × 24h)
  weekly: 21 * 24 * 60 * 60 * 1000, // 21 days (3 × 7d)
};

/** Cadence → finding types covered by that cadence */
const CADENCE_TYPES: Record<string, Set<string>> = {
  hot: new Set(['scope_creep', 'blocked_chain']),
  daily: new Set(['stale_triage', 'accountability_debt', 'blocked_sprint', 'overloaded_member', 'missing_estimate', 'sprint_velocity_drop', 'unplanned_work']),
  weekly: new Set(['retro_patterns']),
};

/**
 * Auto-resolve stale findings after a proactive scan.
 *
 * A finding is stale if:
 * 1. Its finding_type is covered by the current scan's cadence
 * 2. Its status is 'active' (not acknowledged, snoozed, or already resolved)
 * 3. Its last_validated_at is older than the staleness window (3 cycles)
 * 4. It was NOT reproduced in this scan (not in reproducedKeys)
 *
 * Returns the number of findings auto-resolved.
 */
export async function autoResolveStaleFindings(
  client: ShipClient,
  existingFindings: Map<string, ShipDocument>,
  reproducedKeys: Set<string>,
  scanType: 'hot' | 'daily' | 'weekly',
): Promise<number> {
  const coveredTypes = CADENCE_TYPES[scanType];
  const stalenessMs = STALENESS_WINDOWS_MS[scanType];
  if (!coveredTypes || !stalenessMs) return 0;

  const now = Date.now();
  let resolvedCount = 0;

  for (const [key, doc] of existingFindings) {
    const props = doc.properties as FindingProps;

    // Only auto-resolve active findings (not acknowledged, snoozed, etc.)
    if (props.status !== 'active') continue;

    // Only for finding types covered by this cadence
    if (!props.finding_type || !coveredTypes.has(props.finding_type)) continue;

    // Skip if this finding was reproduced in the current scan
    if (reproducedKeys.has(key)) continue;

    // Check staleness: last_validated_at must be older than the window
    const lastValidated = props.last_validated_at
      ? new Date(props.last_validated_at).getTime()
      : new Date(doc.created_at).getTime(); // fallback for findings created before this feature

    if (now - lastValidated < stalenessMs) continue;

    // Auto-resolve
    const result = await client.updateDocument(doc.id, {
      properties: {
        ...doc.properties as Record<string, unknown>,
        status: 'resolved',
        human_decision: null,
        resolved_reason: 'auto',
      },
    });

    if (result.error) {
      console.error(`[auto-resolve] failed to resolve ${doc.id}: ${result.error.message}`);
      continue;
    }

    console.log(`[auto-resolve] resolved stale finding ${doc.id} (${props.finding_type}::${props.affected_entity_id}) — not seen in ${Math.round((now - lastValidated) / 60000)}min`);
    resolvedCount++;
  }

  return resolvedCount;
}
