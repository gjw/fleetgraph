import { loadConfig } from './config.js';
import { buildGraph } from './graph/graph.js';
import { createApp } from './api/server.js';
import { startPollers, stopPollers, resetHotTimer } from './trigger/poller.js';
import { createShipWebSocket } from './ship/websocket.js';
import { startListener } from './trigger/listener.js';

const config = loadConfig();
const graph = buildGraph();
const app = createApp(graph);

const server = app.listen(config.port, () => {
  console.log(`FleetGraph listening on port ${config.port}`);
  console.log(`Ship API: ${config.shipApiUrl}`);
  console.log(`Ship WS:  ${config.shipWsUrl}`);
  console.log(`LangSmith: ${config.langsmithProject} (tracing: ${config.langsmithTracing})`);

  // Start proactive polling after server is ready
  startPollers(graph);

  // Start WebSocket event listener for near-instant hot scans
  const ws = createShipWebSocket(config.shipWsUrl, config.shipApiToken);
  const listener = startListener({ ws, graph, onScanComplete: resetHotTimer });
  ws.connect();

  // Graceful shutdown on SIGTERM (pm2 restart) and SIGINT (ctrl-c)
  function shutdown(signal: string): void {
    console.log(`[shutdown] ${signal} received — cleaning up`);
    stopPollers();
    listener.stop();
    ws.close();
    server.close(() => {
      console.log('[shutdown] complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
