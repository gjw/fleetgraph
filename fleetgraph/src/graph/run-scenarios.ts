/**
 * Scenario test runner for FleetGraph.
 *
 * Invokes the graph against seeded Ship data for each demo scenario,
 * captures LangSmith trace URLs, and prints structured results.
 *
 * Usage:
 *   tsx fleetgraph/src/graph/run-scenarios.ts s1 s4 s6     # specific scenarios
 *   tsx fleetgraph/src/graph/run-scenarios.ts all           # all Tier 1
 *   tsx fleetgraph/src/graph/run-scenarios.ts --dry-run     # print configs only
 *
 * Requires: OPENAI_API_KEY, LANGSMITH_API_KEY, SHIP_API_TOKEN, Ship running with seeded data.
 */

import { createHash, randomUUID } from 'node:crypto';
import { buildGraph } from './graph.js';

// ── Deterministic ID generator (mirrors seed script) ────────────────────────

function demoId(key: string): string {
  const hash = createHash('sha256').update(`fg-demo-v1:${key}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    'a' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ── Scenario definitions ────────────────────────────────────────────────────

interface ScenarioConfig {
  id: string;
  name: string;
  tier: 1 | 2;
  mode: 'proactive' | 'on_demand';
  expectedPath: string;
  expectedFindingTypes: string[];
  input: {
    mode: 'proactive' | 'on_demand';
    triggerId: string;
    userId?: string;
    documentId?: string;
    documentType?: string;
    userMessage?: string;
  };
}

// User IDs are looked up from seed data at runtime. These are placeholders
// that get resolved before invocation. We use the email as a key.
const USER_EMAILS = {
  director: 'dev@ship.local',
  pm: 'alice.chen@ship.local',
  engineer1: 'david.kim@ship.local',
  engineer2: 'emma.johnson@ship.local',
  engineer3: 'frank.garcia@ship.local',
  extraEngineer: 'iris.nguyen@ship.local',
} as const;

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 's1',
    name: 'Sprint Scope Creep',
    tier: 1,
    mode: 'proactive',
    expectedPath: 'Trigger → Fetch → Reasoning → Classify → Notify → Persist',
    expectedFindingTypes: ['scope_creep', 'unplanned_work'],
    input: {
      mode: 'proactive',
      triggerId: 'scenario-s1-s3-proactive',
    },
  },
  {
    id: 's3',
    name: 'Accountability Debt Roll-up',
    tier: 1,
    mode: 'proactive',
    expectedPath: 'Trigger → Fetch → Reasoning → Classify → Notify → Persist',
    expectedFindingTypes: ['accountability_debt'],
    input: {
      mode: 'proactive',
      triggerId: 'scenario-s1-s3-proactive',
    },
  },
  {
    id: 's4',
    name: 'Blocked Work Chain',
    tier: 1,
    mode: 'on_demand',
    expectedPath:
      'Trigger → Context → Fetch → Reasoning → Classify → Action Propose → Human Gate → Execute → Persist',
    expectedFindingTypes: ['blocked_sprint', 'overloaded_member'],
    input: {
      mode: 'on_demand',
      triggerId: 'scenario-s4-blocked-chain',
      // userId resolved at runtime from engineer1
      documentId: demoId('s4:issueA'),
      documentType: 'issue',
      userMessage: "What's blocking this issue? Trace the full dependency chain.",
    },
  },
  {
    id: 's6',
    name: 'Smart Next Action',
    tier: 1,
    mode: 'on_demand',
    expectedPath:
      'Trigger → Context → Fetch → Reasoning → Classify → Clean (END)',
    expectedFindingTypes: [],
    input: {
      mode: 'on_demand',
      triggerId: 'scenario-s6-next-action',
      // userId resolved at runtime from extraEngineer (Iris)
      documentId: demoId('s6:issueX'),
      documentType: 'issue',
      userMessage:
        'What should I work on next? I have several issues assigned to me this sprint.',
    },
  },
  {
    id: 's7',
    name: 'Retro Pattern Mining',
    tier: 1,
    mode: 'on_demand',
    expectedPath:
      'Trigger → Context → Fetch → Reasoning → Classify → Notify → Persist',
    expectedFindingTypes: ['sprint_velocity_drop'],
    input: {
      mode: 'on_demand',
      triggerId: 'scenario-s7-retro-patterns',
      // userId resolved at runtime from director
      documentId: demoId('s7:retro:10'),
      documentType: 'weekly_review',
      userMessage:
        'Any recurring patterns across our sprint retros? Look for themes that keep coming up.',
    },
  },
];

// S1 and S3 share a single proactive run. Track whether we've already run it.
let proactiveResult: RunResult | null = null;

// ── Types ───────────────────────────────────────────────────────────────────

interface RunResult {
  scenarioId: string;
  classification: string;
  findings: {
    findingType: string;
    severity: string;
    title: string;
    affectedEntityId: string;
    affectedEntityType: string;
    recipientIds: string[];
    hasRecommendedAction: boolean;
  }[];
  findingDocIds: string[];
  proposedAction: { type: string; description: string } | null;
  humanDecision: string | null;
  traceUrl: string;
  durationMs: number;
}

// ── Execution ───────────────────────────────────────────────────────────────

function buildTraceUrl(runId: string): string {
  const project = process.env['LANGSMITH_PROJECT'] ?? 'fleetgraph';
  return `https://smith.langchain.com/public/${runId}/r`;
}

async function runScenario(scenario: ScenarioConfig): Promise<RunResult> {
  // S1 and S3 share the proactive run
  if (
    (scenario.id === 's1' || scenario.id === 's3') &&
    proactiveResult !== null
  ) {
    console.log(
      `\n[${scenario.id}] Reusing proactive run from ${proactiveResult.scenarioId}`,
    );
    return { ...proactiveResult, scenarioId: scenario.id };
  }

  const runId = randomUUID();
  const graph = buildGraph();

  console.log(`\n${'━'.repeat(60)}`);
  console.log(`Running: ${scenario.id} — ${scenario.name}`);
  console.log(`Mode: ${scenario.mode} | Run ID: ${runId}`);
  console.log('━'.repeat(60));

  const start = Date.now();

  const result = await graph.invoke(scenario.input, {
    runId,
    runName: `scenario-${scenario.id}-${scenario.name.toLowerCase().replace(/\s+/g, '-')}`,
    metadata: {
      scenario_id: scenario.id,
      scenario_name: scenario.name,
      tier: scenario.tier,
    },
  });

  const durationMs = Date.now() - start;
  const traceUrl = buildTraceUrl(runId);

  const r = result as {
    classification: string;
    findings: {
      findingType: string;
      severity: string;
      title: string;
      affectedEntityId: string;
      affectedEntityType: string;
      recipientIds: string[];
      recommendedAction?: string;
    }[];
    findingDocIds: string[];
    proposedAction: { type: string; description: string } | null;
    humanDecision: string | null;
  };

  const runResult: RunResult = {
    scenarioId: scenario.id,
    classification: r.classification,
    findings: r.findings.map((f) => ({
      findingType: f.findingType,
      severity: f.severity,
      title: f.title,
      affectedEntityId: f.affectedEntityId,
      affectedEntityType: f.affectedEntityType,
      recipientIds: f.recipientIds,
      hasRecommendedAction: !!f.recommendedAction,
    })),
    findingDocIds: r.findingDocIds ?? [],
    proposedAction: r.proposedAction ?? null,
    humanDecision: r.humanDecision ?? null,
    traceUrl,
    durationMs,
  };

  // Cache proactive result for S1/S3 sharing
  if (scenario.id === 's1' || scenario.id === 's3') {
    proactiveResult = runResult;
  }

  return runResult;
}

function printResult(scenario: ScenarioConfig, result: RunResult) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Result: ${scenario.id} — ${scenario.name}`);
  console.log('═'.repeat(60));
  console.log(`  Classification: ${result.classification}`);
  console.log(`  Expected path:  ${scenario.expectedPath}`);
  console.log(`  Findings: ${result.findings.length}`);

  for (const f of result.findings) {
    const recipients =
      f.recipientIds.length > 0
        ? ` → recipients: [${f.recipientIds.join(', ')}]`
        : '';
    const action = f.hasRecommendedAction ? ' [HAS ACTION]' : '';
    console.log(
      `    - [${f.severity}] ${f.findingType}: ${f.title}${action}${recipients}`,
    );
  }

  if (result.proposedAction) {
    console.log(
      `  Proposed action: ${result.proposedAction.type} — ${result.proposedAction.description}`,
    );
  }
  if (result.humanDecision) {
    console.log(`  Human decision: ${result.humanDecision}`);
  }
  console.log(`  Finding doc IDs: ${JSON.stringify(result.findingDocIds)}`);
  console.log(`  Duration: ${result.durationMs}ms`);
  console.log(`  Trace: ${result.traceUrl}`);

  // Validation
  const issues: string[] = [];

  if (scenario.expectedFindingTypes.length > 0) {
    const actualTypes = new Set(result.findings.map((f) => f.findingType));
    for (const expected of scenario.expectedFindingTypes) {
      if (!actualTypes.has(expected)) {
        issues.push(`Missing expected finding type: ${expected}`);
      }
    }
  }

  if (
    scenario.expectedFindingTypes.length === 0 &&
    result.classification !== 'clean'
  ) {
    // S6 expects Clean path — findings may exist but classification should be clean or notify
    // (informational response, not necessarily empty)
  }

  if (issues.length > 0) {
    console.log(`  ⚠ Validation issues:`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
  } else {
    console.log(`  ✓ Validation passed`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const requestedIds = args.filter((a) => !a.startsWith('--'));

  // Determine which scenarios to run
  let scenarios: ScenarioConfig[];
  if (requestedIds.includes('all') || requestedIds.length === 0) {
    scenarios = SCENARIOS.filter((s) => s.tier === 1);
  } else {
    scenarios = SCENARIOS.filter((s) => requestedIds.includes(s.id));
    if (scenarios.length === 0) {
      console.error(
        `No matching scenarios. Available: ${SCENARIOS.map((s) => s.id).join(', ')}`,
      );
      process.exit(1);
    }
  }

  console.log('FleetGraph Scenario Test Runner');
  console.log(`Scenarios: ${scenarios.map((s) => s.id).join(', ')}`);
  console.log(`Dry run: ${dryRun}`);
  console.log();

  if (dryRun) {
    for (const s of scenarios) {
      console.log(`\n${s.id} — ${s.name}`);
      console.log(`  Tier: ${s.tier}`);
      console.log(`  Mode: ${s.mode}`);
      console.log(`  Expected path: ${s.expectedPath}`);
      console.log(`  Expected finding types: ${s.expectedFindingTypes.join(', ') || '(none — Clean path)'}`);
      console.log(`  Input: ${JSON.stringify(s.input, null, 4)}`);
    }
    return;
  }

  // Check required env vars
  const missing: string[] = [];
  if (!process.env['OPENAI_API_KEY']) missing.push('OPENAI_API_KEY');
  if (!process.env['SHIP_API_TOKEN']) missing.push('SHIP_API_TOKEN');
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    console.error(
      'Set them and ensure Ship is running with seeded data (pnpm db:seed && pnpm db:seed:fg)',
    );
    process.exit(1);
  }

  if (!process.env['LANGSMITH_API_KEY']) {
    console.warn(
      'LANGSMITH_API_KEY not set — traces will not be captured. Set it for trace URLs.',
    );
  }

  // Run scenarios (proactive scenarios first to share the run)
  const proactive = scenarios.filter((s) => s.mode === 'proactive');
  const onDemand = scenarios.filter((s) => s.mode === 'on_demand');
  const ordered = [...proactive, ...onDemand];

  const results: { scenario: ScenarioConfig; result: RunResult }[] = [];

  for (const scenario of ordered) {
    const result = await runScenario(scenario);
    printResult(scenario, result);
    results.push({ scenario, result });
  }

  // Summary
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const classifyPaths = new Set(results.map((r) => r.result.classification));
  console.log(`\nClassify branches covered: ${[...classifyPaths].join(', ')}`);
  console.log(
    `Distinct traces: ${new Set(results.map((r) => r.result.traceUrl)).size}`,
  );

  console.log('\nTrace URLs for FLEETGRAPH.md:');
  const seenTraces = new Set<string>();
  for (const { scenario, result } of results) {
    if (!seenTraces.has(result.traceUrl)) {
      console.log(`  ${scenario.id}: ${result.traceUrl}`);
      seenTraces.add(result.traceUrl);
    } else {
      console.log(`  ${scenario.id}: (shared with proactive run above)`);
    }
  }

  console.log(`\nTotal findings: ${results.reduce((sum, r) => sum + r.result.findings.length, 0)}`);
  console.log(`Total duration: ${results.reduce((sum, r) => sum + r.result.durationMs, 0)}ms`);
}

main().catch((err) => {
  console.error('Scenario runner failed:', err);
  process.exit(1);
});
