import type { GraphStateType, GraphUpdateType, Finding } from '../state.js';
import type { BelongsToType } from '@ship/shared';
import { getProactiveClient } from '../../ship/factory.js';
import type { ShipClient } from '../../ship/client.js';

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

async function resolveAssociation(
  client: ShipClient,
  finding: Finding,
): Promise<Array<{ id: string; type: BelongsToType }>> {
  const docResult = await client.getDocument(finding.affectedEntityId);
  if (docResult.error) {
    console.log(
      `[human-gate] entity ${finding.affectedEntityId} (${finding.affectedEntityType}) not found as document — skipping association`,
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

/**
 * Human Gate node — creates finding documents with human_decision=null
 * for the action-propose path. The graph terminates here; the decide
 * endpoint handles confirm/dismiss imperatively.
 */
export async function humanGateNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (state.findings.length === 0) {
    console.log('[human-gate] no findings to persist');
    return { findingDocIds: [], humanDecision: null };
  }

  const client = getProactiveClient();
  if (!client) {
    console.error('[human-gate] no Ship client available — cannot persist findings');
    return { findingDocIds: [], humanDecision: null };
  }

  const findingDocIds: string[] = [];

  for (const finding of state.findings) {
    const properties: Record<string, unknown> = {
      finding_type: finding.findingType,
      severity: finding.severity,
      status: 'pending_decision',
      affected_entity_id: finding.affectedEntityId,
      affected_entity_type: finding.affectedEntityType,
      proposed_action: state.proposedAction ?? null,
      human_decision: null,
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
        `[human-gate] failed to create finding doc: ${result.error.message}`,
        result.error.details ? JSON.stringify(result.error.details) : '',
      );
      continue;
    }

    console.log(
      `[human-gate] created finding doc ${result.data.id} — ${finding.title} (pending_decision)`,
    );
    findingDocIds.push(result.data.id);
  }

  console.log(
    `[human-gate] persisted ${findingDocIds.length}/${state.findings.length} findings awaiting human decision`,
  );

  return { findingDocIds, humanDecision: null };
}
