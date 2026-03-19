import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const FLEETGRAPH_URL = process.env.FLEETGRAPH_URL || 'https://fleetgraph.foramerica.dev';

/**
 * POST /api/fleetgraph/chat
 * Proxies chat requests to the FleetGraph service, forwarding user session.
 */
router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  try {
    const response = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': req.userId!,
        'x-workspace-id': req.workspaceId!,
        'Cookie': req.headers.cookie || '',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[fleetgraph proxy] chat error:', err);
    res.status(502).json({ error: 'FleetGraph service unavailable' });
  }
});

/**
 * POST /api/fleetgraph/findings/:id/decide
 * Proxies HITL decisions to the FleetGraph service.
 */
router.post('/findings/:id/decide', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const response = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/findings/${id}/decide`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': req.userId!,
        'x-workspace-id': req.workspaceId!,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[fleetgraph proxy] decide error:', err);
    res.status(502).json({ error: 'FleetGraph service unavailable' });
  }
});

/**
 * GET /api/fleetgraph/health
 * Proxies health check to the FleetGraph service (no auth required).
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${FLEETGRAPH_URL}/api/fleetgraph/health`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'FleetGraph service unavailable' });
  }
});

export default router;
