import { loadConfig } from './config.js';
import { buildGraph } from './graph/graph.js';
import { createApp } from './api/server.js';
import { startProactivePoller } from './trigger/poller.js';

const config = loadConfig();
const graph = buildGraph();
const app = createApp(graph);

app.listen(config.port, () => {
  console.log(`FleetGraph listening on port ${config.port}`);
  console.log(`Ship API: ${config.shipApiUrl}`);
  console.log(`LangSmith: ${config.langsmithProject} (tracing: ${config.langsmithTracing})`);

  // Start proactive polling after server is ready
  startProactivePoller(graph);
});
