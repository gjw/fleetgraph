import { loadConfig } from '../config.js';

const HOT_INTERVAL_MS = 5 * 60 * 1000;             // 5 minutes
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;     // 24 hours
const WEEKLY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const HEALTH_RETRY_MS = 3_000;
const MAX_HEALTH_RETRIES = 10;

type GraphLike = {
  invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

let graphRef: GraphLike | null = null;
let hotIntervalHandle: ReturnType<typeof setInterval> | null = null;
let dailyIntervalHandle: ReturnType<typeof setInterval> | null = null;
let weeklyIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Wait for Ship API to be reachable before starting polls.
 */
async function waitForShip(): Promise<boolean> {
  const config = loadConfig();
  const healthUrl = `${config.shipApiUrl}/health`;

  for (let i = 0; i < MAX_HEALTH_RETRIES; i++) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        console.log('[poller] Ship API is ready');
        return true;
      }
    } catch {
      // not ready yet
    }
    console.log(`[poller] waiting for Ship API... (${i + 1}/${MAX_HEALTH_RETRIES})`);
    await new Promise((r) => setTimeout(r, HEALTH_RETRY_MS));
  }

  console.warn('[poller] Ship API not reachable after retries — starting polls anyway');
  return false;
}

/**
 * Run a single cadence poll and log results.
 */
async function runCadence(
  graph: GraphLike,
  scanType: 'hot' | 'daily' | 'weekly',
): Promise<void> {
  const triggerId = `${scanType}-${Date.now()}`;
  console.log(`[poller:${scanType}] invoking graph — triggerId=${triggerId}`);
  try {
    const result = await graph.invoke({
      mode: 'proactive',
      scanType,
      triggerId,
    });
    const findings = result.findings as unknown[];
    const classification = result.classification as string;
    console.log(
      `[poller:${scanType}] complete — classification=${classification}, findings=${findings.length}`,
    );
  } catch (err) {
    console.error(`[poller:${scanType}] graph invocation failed:`, err);
  }
}

/**
 * Reset the hot-loop poll timer. Called after a WebSocket-triggered scan
 * to avoid a redundant poll at the old interval.
 */
export function resetHotTimer(): void {
  if (!hotIntervalHandle || !graphRef) return;
  clearInterval(hotIntervalHandle);
  hotIntervalHandle = setInterval(() => runCadence(graphRef!, 'hot'), HOT_INTERVAL_MS);
  console.log('[poller:hot] timer reset after WS-triggered scan');
}

/**
 * Starts all three proactive pollers: hot (5min), daily (24h), weekly (7d).
 * Waits for Ship API to be ready, then staggers first runs to avoid
 * concurrent initial invocations.
 */
export function startPollers(graph: GraphLike): void {
  graphRef = graph;
  console.log('[poller] will start cadenced polls after Ship API is ready');

  waitForShip().then(() => {
    // Hot: every 5 minutes, starts immediately
    console.log(`[poller:hot] starting — interval=${HOT_INTERVAL_MS / 1000}s`);
    runCadence(graph, 'hot');
    hotIntervalHandle = setInterval(() => runCadence(graph, 'hot'), HOT_INTERVAL_MS);

    // Daily: every 24 hours, staggered 30s after hot
    // NOTE: setInterval drifts on restart — acceptable for MVP since CLI covers demo
    setTimeout(() => {
      console.log(`[poller:daily] starting — interval=${DAILY_INTERVAL_MS / 1000}s`);
      runCadence(graph, 'daily');
      dailyIntervalHandle = setInterval(() => runCadence(graph, 'daily'), DAILY_INTERVAL_MS);
    }, 30_000);

    // Weekly: every 7 days, staggered 60s after hot
    setTimeout(() => {
      console.log(`[poller:weekly] starting — interval=${WEEKLY_INTERVAL_MS / 1000}s`);
      runCadence(graph, 'weekly');
      weeklyIntervalHandle = setInterval(() => runCadence(graph, 'weekly'), WEEKLY_INTERVAL_MS);
    }, 60_000);
  });
}

/**
 * Stop all pollers. Clears interval handles so in-flight runs can finish
 * but no new runs are scheduled.
 */
export function stopPollers(): void {
  if (hotIntervalHandle) { clearInterval(hotIntervalHandle); hotIntervalHandle = null; }
  if (dailyIntervalHandle) { clearInterval(dailyIntervalHandle); dailyIntervalHandle = null; }
  if (weeklyIntervalHandle) { clearInterval(weeklyIntervalHandle); weeklyIntervalHandle = null; }
  graphRef = null;
  console.log('[poller] all pollers stopped');
}

/**
 * @deprecated Use startPollers() instead. Kept for backwards compatibility.
 */
export function startProactivePoller(graph: GraphLike): void {
  startPollers(graph);
}
