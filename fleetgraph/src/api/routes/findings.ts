import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { getProactiveClient } from '../../ship/factory.js';

interface DecideRequest {
  decision: 'confirm' | 'dismiss';
}

/**
 * Creates the findings router for HITL decide endpoint.
 */
export function createFindingsRouter(): RouterType {
  const router = Router();

  router.post('/findings/:id/decide', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = req.body as DecideRequest;

    if (!body.decision || !['confirm', 'dismiss'].includes(body.decision)) {
      res.status(400).json({ error: 'decision must be "confirm" or "dismiss"' });
      return;
    }

    const client = getProactiveClient();
    if (!client) {
      res.status(503).json({ error: 'Ship client unavailable' });
      return;
    }

    // Fetch the finding document
    const docResult = await client.getDocument(id);
    if (docResult.error) {
      res.status(404).json({ error: `Finding ${id} not found` });
      return;
    }

    const doc = docResult.data;
    const props = (doc.properties ?? {}) as Record<string, unknown>;

    if (props.human_decision !== null) {
      res.status(409).json({
        error: 'Decision already made',
        current_decision: props.human_decision,
      });
      return;
    }

    if (body.decision === 'dismiss') {
      const updateResult = await client.updateDocument(id, {
        properties: { ...props, human_decision: 'dismissed', status: 'dismissed' },
      });

      if (updateResult.error) {
        res.status(500).json({ error: 'Failed to update finding', details: updateResult.error.message });
        return;
      }

      console.log(`[findings] dismissed finding ${id}`);
      res.json({ status: 'dismissed', findingId: id });
      return;
    }

    // Confirm path: mark as confirmed, execute action (stub for MVP), then resolve
    const confirmResult = await client.updateDocument(id, {
      properties: {
        ...props,
        human_decision: 'confirmed',
        status: 'resolved',
        execution_result: { stubbed: true, executed_at: new Date().toISOString() },
      },
    });

    if (confirmResult.error) {
      res.status(500).json({ error: 'Failed to update finding', details: confirmResult.error.message });
      return;
    }

    console.log(`[findings] confirmed finding ${id} — action executed (stub)`);
    res.json({
      status: 'confirmed',
      findingId: id,
      executionResult: { stubbed: true },
    });
  });

  return router;
}
