import express from 'express';
import type { Express } from 'express';
import { createChatRouter } from './routes/chat.js';
import { createFindingsRouter } from './routes/findings.js';

/**
 * Creates the FleetGraph Express app.
 * @param graph — compiled LangGraph instance for on-demand invocations
 */
export function createApp(graph: { invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }): Express {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/api/fleetgraph/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Routes
  app.use('/api/fleetgraph', createChatRouter(graph));
  app.use('/api/fleetgraph', createFindingsRouter());

  return app;
}
