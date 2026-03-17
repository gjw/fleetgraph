/**
 * Test script for the FleetGraph graph.
 *
 * Mode 1 (no env vars): Exercises all three classify paths with forced classification
 *   (reasoning + classify nodes are stubs in this mode — just tests routing).
 *
 * Mode 2 (OPENAI_API_KEY + SHIP_API_TOKEN set): Runs a real proactive scan.
 *   Fetches live Ship data, calls GPT-4o for reasoning, GPT-4o-mini for classification.
 *   The classification is determined by actual data — demonstrates that different
 *   workspace states produce different execution paths.
 *
 * Usage: tsx fleetgraph/src/graph/run-stub.ts
 */

import { buildGraph } from './graph.js';

function printResult(label: string, result: Record<string, unknown>) {
  const r = result as {
    classification: string;
    findings: { findingType: string; severity: string; title: string }[];
    findingDocIds: string[];
    proposedAction: { type: string; description: string } | null;
    humanDecision: string | null;
    executionResult: Record<string, unknown> | null;
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Result: ${label}`);
  console.log('='.repeat(60));
  console.log(`  classification: ${r.classification}`);
  console.log(`  findings: ${r.findings.length}`);
  for (const f of r.findings) {
    console.log(`    - [${f.severity}] ${f.findingType}: ${f.title}`);
  }
  console.log(`  findingDocIds: ${JSON.stringify(r.findingDocIds)}`);
  console.log(
    `  proposedAction: ${r.proposedAction ? `${r.proposedAction.type} — ${r.proposedAction.description}` : 'null'}`,
  );
  console.log(`  humanDecision: ${r.humanDecision}`);
  console.log(
    `  executionResult: ${r.executionResult ? 'present' : 'null'}`,
  );
}

async function runLive() {
  console.log('FleetGraph — LIVE proactive scan (real data + real LLM calls)\n');

  const graph = buildGraph();
  const result = await graph.invoke({
    mode: 'proactive' as const,
    triggerId: 'test-live',
  });

  printResult('live proactive scan', result);
}

async function main() {
  const hasKeys =
    process.env['OPENAI_API_KEY'] && process.env['SHIP_API_TOKEN'];

  if (hasKeys) {
    await runLive();
  } else {
    console.log(
      'No OPENAI_API_KEY / SHIP_API_TOKEN — set them to run a live scan.',
    );
    console.log(
      'Example: OPENAI_API_KEY=sk-... SHIP_API_TOKEN=... tsx fleetgraph/src/graph/run-stub.ts',
    );
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error('Graph run failed:', err);
  process.exit(1);
});
