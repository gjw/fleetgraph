import { loadConfig } from './config.js';
import { buildGraph } from './graph/graph.js';
import { createApp } from './api/server.js';
import { startPollers, resetHotTimer } from './trigger/poller.js';
import { createShipWebSocket } from './ship/websocket.js';
import { startListener } from './trigger/listener.js';

const config = loadConfig();
const graph = buildGraph();
const app = createApp(graph);

app.listen(config.port, () => {
  console.log(`FleetGraph listening on port ${config.port}`);
  console.log(`Ship API: ${config.shipApiUrl}`);
  console.log(`Ship WS:  ${config.shipWsUrl}`);
  console.log(`LangSmith: ${config.langsmithProject} (tracing: ${config.langsmithTracing})`);

  // Start proactive polling after server is ready
  startPollers(graph);

  // Start WebSocket event listener for near-instant hot scans
  const ws = createShipWebSocket(config.shipWsUrl, config.shipApiToken);
  startListener({ ws, graph, onScanComplete: resetHotTimer });
  ws.connect();
});
