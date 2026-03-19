import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type { GraphStateType, GraphUpdateType, Finding } from '../state.js';
import { loadConfig } from '../../config.js';

const ClassificationSchema = z.object({
  classification: z
    .enum(['clean', 'notify', 'action_propose'])
    .describe(
      'clean = no findings worth surfacing. notify = findings to show the user but no Ship mutation needed. action_propose = at least one finding recommends a concrete Ship mutation (reassign, change state, escalate).',
    ),
  actionFindingIndex: z
    .number()
    .nullable()
    .describe(
      'If classification is action_propose, the 0-based index of the highest-priority finding whose recommendedAction should be proposed. null otherwise.',
    ),
});

const SYSTEM_PROMPT = `You are a classification router for FleetGraph, a project intelligence system. Given a list of findings produced by the reasoning engine, classify the overall result into one of three categories:

- **clean** — The findings are empty or trivial. Nothing worth surfacing to the user.
- **notify** — There are meaningful findings to surface, but none require a Ship data mutation. The user should be informed.
- **action_propose** — At least one finding includes a recommendedAction that would mutate Ship data (e.g., reassign an issue, change state, escalate). The system should propose this action for human approval.

Rules:
- If the findings array is empty, always return clean.
- If ANY finding has a non-empty recommendedAction, return action_propose and set actionFindingIndex to the index of the most important one (prefer critical > warning > info severity).
- If findings exist but none have recommendedAction, return notify.
- Never return action_propose without a valid actionFindingIndex.`;

const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

function buildProposedAction(finding: Finding) {
  if (!finding.recommendedAction) return null;
  return {
    type: finding.findingType,
    params: {
      affectedEntityId: finding.affectedEntityId,
      affectedEntityType: finding.affectedEntityType,
    },
    description: finding.recommendedAction,
  };
}

export async function classifyNode(
  state: GraphStateType,
): Promise<Partial<GraphUpdateType>> {
  if (state.findings.length === 0) {
    console.log('[classify] no findings — classification=clean');
    return { classification: 'clean' };
  }

  const config = loadConfig();
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    apiKey: config.openaiApiKey,
  });

  const structured = llm.withStructuredOutput(ClassificationSchema, {
    name: 'classify_findings',
  });

  const findingsSummary = state.findings.map((f, i) => ({
    index: i,
    findingType: f.findingType,
    severity: f.severity,
    title: f.title,
    hasRecommendedAction: !!f.recommendedAction,
    recommendedAction: f.recommendedAction ?? null,
  }));

  console.log(
    `[classify] calling GPT-4o-mini to classify ${state.findings.length} findings...`,
  );

  let result;
  try {
    result = await structured.invoke([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Classify these findings:\n\n${JSON.stringify(findingsSummary, null, 2)}`,
      },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[classify] LLM call failed: ${message}`);
    return { classification: 'clean' as const, fetchErrors: { classify: message } };
  }

  console.log(`[classify] classification=${result.classification}`);

  const update: Partial<GraphUpdateType> = {
    classification: result.classification,
  };

  if (
    result.classification === 'action_propose' &&
    result.actionFindingIndex !== null
  ) {
    const targetFinding =
      state.findings[result.actionFindingIndex] ?? pickHighestSeverity(state.findings);
    const proposed = buildProposedAction(targetFinding);
    if (proposed) {
      update.proposedAction = proposed;
    }
  }

  return update;
}

function pickHighestSeverity(findings: Finding[]): Finding {
  return findings.reduce((best, f) =>
    (SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[best.severity] ?? 0)
      ? f
      : best,
  );
}
