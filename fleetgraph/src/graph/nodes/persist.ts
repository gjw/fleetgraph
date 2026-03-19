import type { GraphStateType, GraphUpdateType, Finding } from '../state.js';
import type { BelongsToType } from '@ship/shared';
import { getProactiveClient } from '../../ship/factory.js';
import type { ShipClient } from '../../ship/client.js';
import type { ShipDocument } from '../../ship/types.js';

function entityTypeToBelongsTo(
  entityType: Finding['affectedEntityType'],
): BelongsToType {
  switch (entityType) {
    case 'sprint':
      return 'sprint';
    case 'project':
      return 'project';
    case 'program':
      return 'program';
    case 'issue':
    case 'person':
      return 'parent';
  }
}

function buildTipTapContent(reasoning: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: reasoning }],
      },
    ],
  };
}

/**
 * Check if the affected entity exists as a document before creating
 * an association. Person findings often reference user UUIDs (from team
 * grid) rather than person document UUIDs, which would violate the FK.
 */
async function resolveAssociation(
  client: ShipClient,
  finding: Finding,
): Promise<Array<{ id: string; type: BelongsToType }>> {
  const docResult = await client.getDocument(finding.affectedEntityId);
  if (docResult.error) {
    console.log(
      `[persist] entity ${finding.affectedEntityId} (${finding.affectedEntityType}) not found as document — skipping association`,
    );
    return [];
  }
  return [
    {
      id: finding.affectedEntityId,
      type: entityTypeToBelongsTo(finding.affectedEntityType),
    },
  ];
}

interface FindingProps {
  finding_type?: string;
  affected_entity_id?: string;
  status?: string;
  human_decision?: string | null;
  snooze_until?: string | null;
}

/**
 * Determine whether an existing finding should block creation of a new one
 * with the same finding_type + affected_entity_id.
 *
 * Returns 'skip' to suppress the duplicate, 'create' to allow it.
 */
function shouldCreateFinding(existing: ShipDocument): 'skip' | 'create' {
  const props = existing.properties as FindingProps;

  // Active finding already exists — don't duplicate
  if (props.status === 'active' && props.human_decision === null) {
    return 'skip';
  }

  // User dismissed this finding — respect their decision
  if (props.human_decision === 'dismissed') {
    return 'skip';
  }

  // User confirmed — finding was acted on, don't re-create
  if (props.human_decision === 'confirmed') {
    return 'skip';
  }

  // Snoozed — check if snooze has expired
  if (props.human_decision === 'snoozed' && props.snooze_until) {
    const snoozedUntil = new Date(props.snooze_until);
    if (snoozedUntil > new Date()) {
      return 'skip'; // still snoozed
    }
    return 'create'; // snooze expired, re-create
  }

  // Resolved findings can be re-created (condition returned)
  if (props.status === 'resolved') {
    return 'create';
  }

  // Default: allow creation
  return 'create';
}

/**
 * Fetch all existing fleetgraph_finding documents and build a lookup map
 * keyed by "finding_type::affected_entity_id" for O(1) dedup checks.
 */
async function loadExistingFindings(
  client: ShipClient,
): Promise<Map<string, ShipDocument>> {
  const result = await client.getDocuments({ type: 'fleetgraph_finding' });
  const map = new Map<string, ShipDocument>();

  if (result.error) {
    console.warn('[persist] failed to fetch existing findings for dedup:', result.error.message);
    return map;
  }

  for (const doc of result.data) {
    const props = doc.properties as FindingProps;
    if (props.finding_type && props.affected_entity_id) {
      const key = `${props.finding_type}::${props.affected_entity_id}`;
      // Keep the most recent one if there are multiple (shouldn't happen after fix)
      const existing = map.get(key);
      if (!existing || new Date(doc.updated_at) > new Date(existing.updated_at)) {
        map.set(key, doc);
      }
    }
  }

  return map;
}

export async function persistNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (state.findings.length === 0) {
    console.log('[persist] no findings to persist');
    return { findingDocIds: [] };
  }

  const client = getProactiveClient();
  if (!client) {
    console.error('[persist] no Ship client available — cannot persist findings');
    return { findingDocIds: [] };
  }

  // Load existing findings for dedup
  const existingFindings = await loadExistingFindings(client);
  console.log(`[persist] loaded ${existingFindings.size} existing findings for dedup`);

  const findingDocIds: string[] = [];
  let skippedCount = 0;

  for (const finding of state.findings) {
    // Dedup check: does a finding with this type + entity already exist?
    const dedupKey = `${finding.findingType}::${finding.affectedEntityId}`;
    const existing = existingFindings.get(dedupKey);
    if (existing) {
      const decision = shouldCreateFinding(existing);
      if (decision === 'skip') {
        const props = existing.properties as FindingProps;
        console.log(
          `[persist] skipping duplicate: ${dedupKey} (existing status=${props.status}, decision=${props.human_decision})`,
        );
        skippedCount++;
        // Still return existing doc ID so callers know the finding exists
        findingDocIds.push(existing.id);
        continue;
      }
    }

    const properties: Record<string, unknown> = {
      finding_type: finding.findingType,
      severity: finding.severity,
      status: 'active',
      affected_entity_id: finding.affectedEntityId,
      affected_entity_type: finding.affectedEntityType,
      proposed_action: state.proposedAction ?? null,
      human_decision: state.humanDecision ?? null,
      recipient_ids: finding.recipientIds,
      reasoning_model: 'gpt-4o',
      token_usage: { input: 0, output: 0 },
      trace_url: state.traceUrl ?? null,
    };

    const belongsTo = await resolveAssociation(client, finding);

    const result = await client.createDocument({
      title: finding.title,
      document_type: 'fleetgraph_finding',
      properties,
      content: buildTipTapContent(finding.reasoning),
      ...(belongsTo.length > 0 ? { belongs_to: belongsTo } : {}),
    });

    if (result.error) {
      console.error(
        `[persist] failed to create finding doc: ${result.error.message}`,
        result.error.details ? JSON.stringify(result.error.details) : '',
      );
      continue;
    }

    console.log(
      `[persist] created finding doc ${result.data.id} — ${finding.title}`,
    );
    findingDocIds.push(result.data.id);
  }

  console.log(
    `[persist] persisted ${findingDocIds.length - skippedCount} new, ${skippedCount} skipped (dedup), ${findingDocIds.length}/${state.findings.length} total`,
  );

  return { findingDocIds };
}
