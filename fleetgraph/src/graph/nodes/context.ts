import { getClientForState } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';

/**
 * Context node — resolves document details and associations for on-demand mode.
 * Extracts sprint/project/program IDs from associations so fetch nodes can scope queries.
 * For proactive mode, this is a pass-through (no user context to resolve).
 */
export async function contextNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (state.mode === 'proactive') {
    console.log('[context] proactive mode — no user context to resolve');
    return {};
  }

  console.log(
    `[context] on-demand: userId=${state.userId} docId=${state.documentId} type=${state.documentType}`,
  );

  if (!state.documentId) {
    console.log('[context] no documentId — skipping document resolution');
    return {};
  }

  const client = getClientForState(state);
  if (!client) return {};

  const [docResult, assocResult] = await Promise.all([
    client.getDocument(state.documentId),
    client.getDocumentAssociations(state.documentId),
  ]);

  if (docResult.error) {
    console.log(`[context] failed to fetch document: ${docResult.error.message}`);
    return {};
  }

  const doc = docResult.data;
  const associations = assocResult.data?.associations ?? [];

  console.log(
    `[context] resolved: "${doc.title}" (${doc.document_type})` +
    ` with ${associations.length} associations`,
  );

  // Extract scoping IDs from associations
  let contextSprintId: string | null = null;
  let contextProjectId: string | null = null;
  let contextProgramId: string | null = null;

  for (const assoc of associations) {
    if (assoc.relationship_type === 'sprint') {
      contextSprintId = assoc.related_id;
    } else if (assoc.relationship_type === 'project') {
      contextProjectId = assoc.related_id;
    } else if (assoc.relationship_type === 'program') {
      contextProgramId = assoc.related_id;
    }
  }

  // If the document itself is a sprint/project/program, use its own ID
  if (doc.document_type === 'issue') {
    // associations already handled above
  } else if (doc.document_type === 'weekly_review') {
    // The sprint document IS the sprint — use its own ID
    contextSprintId = state.documentId;
  } else if (doc.document_type === 'project') {
    contextProjectId = state.documentId;
  } else if (doc.document_type === 'program') {
    contextProgramId = state.documentId;
  }

  console.log(
    `[context] scoping: sprint=${contextSprintId} project=${contextProjectId} program=${contextProgramId}`,
  );

  return {
    documentType: doc.document_type,
    contextSprintId,
    contextProjectId,
    contextProgramId,
  };
}
