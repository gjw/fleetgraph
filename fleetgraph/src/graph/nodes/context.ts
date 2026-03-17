import { getProactiveClient } from '../../ship/index.js';
import type { GraphStateType, GraphUpdateType } from '../state.js';

/**
 * Context node — resolves document details for on-demand mode.
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

  // For on-demand, fetch the target document + its associations to enrich context
  if (!state.documentId) {
    console.log('[context] no documentId — skipping document resolution');
    return {};
  }

  const client = getProactiveClient();
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
  console.log(
    `[context] resolved: "${doc.title}" (${doc.document_type})` +
    (assocResult.data ? ` with ${Object.keys(assocResult.data).length} association groups` : ''),
  );

  // Store resolved context for fetch nodes to use
  return {
    documentType: doc.document_type,
  };
}
