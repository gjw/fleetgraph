import { loadConfig } from '../config.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 10_000; // 10 seconds — wait for Ship API to be ready
const HEALTH_RETRY_MS = 3_000;
const MAX_HEALTH_RETRIES = 10;

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
 * Starts the proactive poller. Waits for Ship API to be ready,
 * then fires every 5 minutes.
 */
export function startProactivePoller(
  graph: { invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
): void {
  console.log(`[poller] will start proactive poll after Ship API is ready`);

  const poll = async () => {
    const triggerId = `poll-${Date.now()}`;
    console.log(`[poller] invoking graph — triggerId=${triggerId}`);
    try {
      const result = await graph.invoke({
        mode: 'proactive',
        triggerId,
      });
      const findings = result.findings as unknown[];
      const classification = result.classification as string;
      console.log(
        `[poller] complete — classification=${classification}, findings=${findings.length}`,
      );
    } catch (err) {
      console.error('[poller] graph invocation failed:', err);
    }
  };

  // Wait for Ship, then start polling
  waitForShip().then(() => {
    console.log(`[poller] starting proactive poll every ${POLL_INTERVAL_MS / 1000}s`);
    poll();
    setInterval(poll, POLL_INTERVAL_MS);
  });
}
