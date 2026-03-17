import type { GraphStateType, GraphUpdateType, Finding } from '../state.js';
import type { BelongsToType } from '@ship/shared';
import { getProactiveClient } from '../../ship/factory.js';

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

  const findingDocIds: string[] = [];

  for (const finding of state.findings) {
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

    const result = await client.createDocument({
      title: finding.title,
      document_type: 'fleetgraph_finding',
      properties,
      content: buildTipTapContent(finding.reasoning),
      belongs_to: [
        {
          id: finding.affectedEntityId,
          type: entityTypeToBelongsTo(finding.affectedEntityType),
        },
      ],
    });

    if (result.error) {
      console.error(
        `[persist] failed to create finding doc: ${result.error.message}`,
      );
      continue;
    }

    console.log(
      `[persist] created finding doc ${result.data.id} — ${finding.title}`,
    );
    findingDocIds.push(result.data.id);
  }

  console.log(
    `[persist] persisted ${findingDocIds.length}/${state.findings.length} findings`,
  );

  return { findingDocIds };
}
