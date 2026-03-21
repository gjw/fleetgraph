import type { ShipWebSocket, ShipEvent } from '../ship/websocket.js';

type GraphLike = {
  invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export interface ListenerOptions {
  ws: ShipWebSocket;
  graph: GraphLike;
  debounceMs?: number;
  onScanComplete?: () => void;
}

const DEFAULT_DEBOUNCE_MS = 30_000;

// Protocol messages — not domain events
const PROTOCOL_TYPES = new Set(['connected', 'pong']);

export function startListener(options: ListenerOptions): { stop: () => void } {
  const { ws, graph, debounceMs = DEFAULT_DEBOUNCE_MS, onScanComplete } = options;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingEvents: ShipEvent[] = [];
  let scanInProgress = false;
  let pendingRescan = false;
  let stopped = false;

  function clearDebounce(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  async function dispatchScan(batch: ShipEvent[]): Promise<void> {
    const triggerId = `ws-${Date.now()}`;
    const eventTypes = batch.map((e) => e.data?.type ?? e.type).join(', ');
    console.log(`[listener] dispatching hot scan — ${triggerId} (${batch.length} events: ${eventTypes})`);

    scanInProgress = true;
    try {
      const result = await graph.invoke({
        mode: 'proactive',
        scanType: 'hot',
        triggerId,
      });
      const findings = result.findings as unknown[];
      const classification = result.classification as string;
      console.log(
        `[listener] scan complete — classification=${classification}, findings=${findings.length}`,
      );
    } catch (err) {
      console.error('[listener] graph invocation failed:', err);
    } finally {
      scanInProgress = false;
      onScanComplete?.();

      // If events accumulated during the scan, dispatch again
      if (pendingRescan && pendingEvents.length > 0 && !stopped) {
        pendingRescan = false;
        const nextBatch = pendingEvents.splice(0);
        dispatchScan(nextBatch);
      } else {
        pendingRescan = false;
      }
    }
  }

  function onEvent(event: ShipEvent): void {
    if (stopped) return;
    if (PROTOCOL_TYPES.has(event.type)) return;

    pendingEvents.push(event);

    // If a scan is in progress, just accumulate — we'll rescan after it finishes
    if (scanInProgress) {
      pendingRescan = true;
      return;
    }

    // Trailing-edge debounce: reset timer on each event
    clearDebounce();
    debounceTimer = setTimeout(() => {
      if (stopped) return;
      const batch = pendingEvents.splice(0);
      if (batch.length > 0) {
        dispatchScan(batch);
      }
    }, debounceMs);
  }

  ws.onEvent(onEvent);

  return {
    stop(): void {
      stopped = true;
      clearDebounce();
      pendingEvents = [];
    },
  };
}
