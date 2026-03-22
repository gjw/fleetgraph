import WebSocket from 'ws';

export interface ShipEvent {
  type: string;
  data: Record<string, unknown>;
}

export type EventHandler = (event: ShipEvent) => void;

export interface ShipWebSocket {
  connect(): void;
  close(): void;
  onEvent(handler: EventHandler): void;
  readonly connected: boolean;
}

const INITIAL_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 60_000;
const JITTER_FACTOR = 0.25;
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const STABLE_CONNECTION_MS = 60_000;

export function createShipWebSocket(wsUrl: string, token: string): ShipWebSocket {
  let ws: WebSocket | null = null;
  let handler: EventHandler | null = null;
  let reconnectDelay = INITIAL_RECONNECT_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;
  let connectedAt: number | null = null;
  let closed = false;

  function clearTimers(): void {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  }

  function jitter(ms: number): number {
    const range = ms * JITTER_FACTOR;
    return ms + (Math.random() * 2 - 1) * range;
  }

  function scheduleReconnect(): void {
    if (closed) return;
    const delay = jitter(reconnectDelay);
    console.log(`[ws] reconnecting in ${Math.round(delay)}ms`);
    reconnectTimer = setTimeout(() => doConnect(), delay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
  }

  function startKeepalive(): void {
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping' }));
      pongTimer = setTimeout(() => {
        console.log('[ws] pong timeout — forcing close');
        ws?.terminate();
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  function doConnect(): void {
    if (closed) return;
    const eventsUrl = `${wsUrl}/events`;
    console.log(`[ws] connecting to ${eventsUrl}`);

    ws = new WebSocket(eventsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    ws.on('open', () => {
      console.log('[ws] connected to Ship /events');
      connectedAt = Date.now();
      reconnectDelay = INITIAL_RECONNECT_MS;
      startKeepalive();
    });

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'connected') {
          console.log('[ws] auth confirmed');
          return;
        }

        if (msg.type === 'pong') {
          if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
          // Reset backoff if connection has been stable
          if (connectedAt && Date.now() - connectedAt > STABLE_CONNECTION_MS) {
            reconnectDelay = INITIAL_RECONNECT_MS;
          }
          return;
        }

        if (handler) {
          handler(msg as ShipEvent);
        }
      } catch {
        // Ignore unparseable messages
      }
    });

    ws.on('close', () => {
      console.log('[ws] disconnected');
      clearTimers();
      ws = null;
      scheduleReconnect();
    });

    ws.on('ping', () => {
      ws?.pong();
    });

    ws.on('error', (err: Error & { code?: string }) => {
      console.error('[ws] error:', err.message || err.code || 'unknown', err);
      // close event will fire after this, triggering reconnect
    });
  }

  return {
    connect(): void {
      closed = false;
      doConnect();
    },

    close(): void {
      closed = true;
      clearTimers();
      if (ws) {
        ws.close();
        ws = null;
      }
    },

    onEvent(h: EventHandler): void {
      handler = h;
    },

    get connected(): boolean {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}
