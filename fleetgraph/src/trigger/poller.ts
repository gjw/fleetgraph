const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Starts the proactive poller. Fires immediately on startup, then every
 * 5 minutes. Each invocation runs the full graph in proactive mode.
 */
export function startProactivePoller(
  graph: { invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
): NodeJS.Timeout {
  console.log(`[poller] starting proactive poll every ${POLL_INTERVAL_MS / 1000}s`);

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

  // Fire immediately
  poll();

  // Then every 5 minutes
  return setInterval(poll, POLL_INTERVAL_MS);
}
