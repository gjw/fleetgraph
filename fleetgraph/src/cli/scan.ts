/**
 * CLI for manually triggering cadenced scans.
 *
 * Usage:
 *   pnpm fg:scan hot       # scope creep + blocked chains (fast, cheap)
 *   pnpm fg:scan daily     # stale triage, accountability, workload (full scan)
 *   pnpm fg:scan weekly    # retro pattern analysis
 *   pnpm fg:scan all       # run all three sequentially
 */

import { loadConfig } from '../config.js';
import { buildGraph } from '../graph/graph.js';
import type { Finding } from '../graph/state.js';

const VALID_CADENCES = ['hot', 'daily', 'weekly', 'all'] as const;
type Cadence = typeof VALID_CADENCES[number];

async function runScan(
  graph: ReturnType<typeof buildGraph>,
  scanType: 'hot' | 'daily' | 'weekly',
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${scanType.toUpperCase()} SCAN`);
  console.log(`${'='.repeat(60)}\n`);

  const start = Date.now();
  const result = await graph.invoke({
    mode: 'proactive',
    scanType,
    triggerId: `cli-${scanType}-${Date.now()}`,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const findings = (result.findings ?? []) as Finding[];
  const classification = result.classification as string;

  console.log(`\n--- Results (${elapsed}s) ---`);
  console.log(`Classification: ${classification}`);
  console.log(`Findings: ${findings.length}`);

  if (findings.length > 0) {
    console.log('');
    for (const f of findings) {
      const icon = f.severity === 'critical' ? '!!!' : f.severity === 'warning' ? ' ! ' : '   ';
      console.log(`  [${icon}] ${f.findingType}: ${f.title}`);
      console.log(`        ${f.summary}`);
    }
  }

  console.log('');
}

async function main(): Promise<void> {
  const cadence = process.argv[2] as Cadence | undefined;

  if (!cadence || !VALID_CADENCES.includes(cadence)) {
    console.error('Usage: pnpm fg:scan <hot|daily|weekly|all>');
    console.error('');
    console.error('Cadences:');
    console.error('  hot     Scope creep + blocked chains (5-min backup, ~$0.01/run)');
    console.error('  daily   Stale triage, accountability, workload (~$0.05/run)');
    console.error('  weekly  Retro pattern analysis (~$0.03/run)');
    console.error('  all     Run all three sequentially');
    process.exit(1);
  }

  loadConfig();
  const graph = buildGraph();

  const cadences: Array<'hot' | 'daily' | 'weekly'> =
    cadence === 'all' ? ['hot', 'daily', 'weekly'] : [cadence];

  for (const c of cadences) {
    await runScan(graph, c);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Scan failed:', err);
  process.exit(1);
});
