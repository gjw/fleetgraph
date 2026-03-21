import type { GraphStateType, GraphUpdateType, Finding } from '../state.js';
import type { BelongsToType } from '@ship/shared';
import { getProactiveClient } from '../../ship/factory.js';
import type { ShipClient } from '../../ship/client.js';
import {
  loadExistingFindings,
  shouldCreateFinding,
  updateExistingFinding,
  resolvePersonEntityId,
  autoResolveStaleFindings,
} from './finding-dedup.js';

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

/**
 * Resolve the human-readable name of the affected entity from
 * already-fetched state data. No extra API calls needed.
 */
function resolveEntityName(finding: Finding, state: GraphStateType): string {
  const id = finding.affectedEntityId;
  switch (finding.affectedEntityType) {
    case 'issue': {
      const issue = state.issues.find((i) => i.id === id);
      return issue?.title ?? id;
    }
    case 'sprint': {
      const sprint = state.sprints.find((s) => s.id === id);
      if (!sprint) return id;
      const programName = sprint.program_name
        ?? state.programs.find((p) => p.id === sprint.program_id)?.name;
      return programName ? `${sprint.name} (${programName})` : sprint.name;
    }
    case 'project': {
      const project = state.projects.find((p) => p.id === id);
      return project?.title ?? id;
    }
    case 'program': {
      const program = state.programs.find((p) => p.id === id);
      return program?.name ?? id;
    }
    case 'person': {
      const people = state.team?.users ?? state.team?.people ?? [];
      const person = people.find((p) => p.personId === id || p.id === id);
      return person?.name ?? id;
    }
  }
}

/**
 * Append program name to finding title when the affected entity is a sprint,
 * so findings for "Week 14" across different programs are distinguishable.
 */
function disambiguateTitle(finding: Finding, state: GraphStateType): string {
  if (finding.affectedEntityType !== 'sprint') return finding.title;
  const sprint = state.sprints.find((s) => s.id === finding.affectedEntityId);
  if (!sprint) return finding.title;
  const programName = sprint.program_name
    ?? state.programs.find((p) => p.id === sprint.program_id)?.name;
  if (!programName || finding.title.includes(programName)) return finding.title;
  return `${finding.title} (${programName})`;
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


export async function persistNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  // Suppress add_comment fallback — it's meaningless to the user
  const proposedAction =
    state.proposedAction?.type === 'add_comment' ? null : (state.proposedAction ?? null);
  const client = getProactiveClient();
  if (!client) {
    console.error('[persist] no Ship client available — cannot persist findings');
    return { findingDocIds: [] };
  }

  // A clean proactive scan (0 findings) should still auto-resolve stale findings
  if (state.findings.length === 0) {
    console.log('[persist] no findings to persist');
    if (state.mode === 'proactive' && state.scanType) {
      const existingFindings = await loadExistingFindings(client);
      const resolvedCount = await autoResolveStaleFindings(
        client,
        existingFindings,
        new Set(),
        state.scanType,
      );
      if (resolvedCount > 0) {
        console.log(`[persist] auto-resolved ${resolvedCount} stale findings (clean scan)`);
      }
    }
    return { findingDocIds: [] };
  }

  // Load existing findings for dedup
  const existingFindings = await loadExistingFindings(client);
  console.log(`[persist] loaded ${existingFindings.size} existing findings for dedup`);

  const findingDocIds: string[] = [];
  const reproducedKeys = new Set<string>();
  let skippedCount = 0;

  for (const finding of state.findings) {
    // Resolve person user UUIDs → person document UUIDs
    resolvePersonEntityId(finding, state.team);

    const displayTitle = disambiguateTitle(finding, state);

    // Dedup check: does a finding with this type + entity already exist?
    const dedupKey = `${finding.findingType}::${finding.affectedEntityId}`;
    reproducedKeys.add(dedupKey);
    const existing = existingFindings.get(dedupKey);
    if (existing) {
      const decision = shouldCreateFinding(existing);
      if (decision === 'skip') {
        console.log(
          `[persist] dedup hit: ${dedupKey} — updating in place`,
        );
        // Use disambiguated title for dedup update
        const titleFinding = { ...finding, title: displayTitle };
        await updateExistingFinding(client, existing, titleFinding, '[persist]', {
          affected_entity_name: resolveEntityName(finding, state),
          summary: finding.summary,
        });
        skippedCount++;
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
      affected_entity_name: resolveEntityName(finding, state),
      summary: finding.summary,
      proposed_action: proposedAction,
      human_decision: state.humanDecision ?? null,
      recipient_ids: finding.recipientIds,
      reasoning_model: 'gpt-4o',
      token_usage: { input: 0, output: 0 },
      trace_url: state.traceUrl ?? null,
      last_validated_at: new Date().toISOString(),
    };

    const belongsTo = await resolveAssociation(client, finding);

    const result = await client.createDocument({
      title: disambiguateTitle(finding, state),
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

  // Auto-resolve stale findings (proactive scans only)
  if (state.mode === 'proactive' && state.scanType) {
    const resolvedCount = await autoResolveStaleFindings(
      client,
      existingFindings,
      reproducedKeys,
      state.scanType,
    );
    if (resolvedCount > 0) {
      console.log(`[persist] auto-resolved ${resolvedCount} stale findings`);
    }
  }

  return { findingDocIds };
}
