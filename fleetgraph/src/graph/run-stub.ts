/**
 * Standalone test script for the graph skeleton.
 * Runs all three classify paths and prints node visits.
 *
 * Usage: tsx fleetgraph/src/graph/run-stub.ts
 */

import { buildGraph } from './graph.js';

async function runPath(
  label: string,
  classification: 'clean' | 'notify' | 'action_propose',
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Path: ${label} (classification=${classification})`);
  console.log('='.repeat(60));

  const graph = buildGraph();
  const result = await graph.invoke({
    mode: 'proactive' as const,
    triggerId: `test-${label}`,
    classification,
  });

  console.log(`\nResult:`);
  console.log(`  classification: ${result.classification}`);
  console.log(`  findings: ${result.findings.length}`);
  console.log(`  findingDocIds: ${JSON.stringify(result.findingDocIds)}`);
  console.log(`  proposedAction: ${result.proposedAction ? result.proposedAction.type : 'null'}`);
  console.log(`  humanDecision: ${result.humanDecision}`);
  console.log(`  executionResult: ${result.executionResult ? 'present' : 'null'}`);
}

async function main() {
  console.log('FleetGraph stub graph — exercising all paths\n');

  await runPath('clean', 'clean');
  await runPath('notify', 'notify');
  await runPath('action_propose', 'action_propose');

  console.log(`\n${'='.repeat(60)}`);
  console.log('All paths completed successfully.');
}

main().catch((err) => {
  console.error('Graph run failed:', err);
  process.exit(1);
});
