import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { getProactiveClient } from '../../ship/factory.js';
import { executeMutation } from '../../graph/nodes/execute.js';
import type { ProposedAction } from '../../graph/state.js';

interface DecideRequest {
  decision: 'acknowledge' | 'snooze' | 'approve';
  snooze_until?: string;
}

/**
 * Creates the findings router for HITL decide endpoint.
 */
export function createFindingsRouter(): RouterType {
  const router = Router();

  router.post('/findings/:id/decide', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = req.body as DecideRequest;

    const validDecisions = ['acknowledge', 'snooze', 'approve'];
    if (!body.decision || !validDecisions.includes(body.decision)) {
      res.status(400).json({ error: 'decision must be "acknowledge", "snooze", or "approve"' });
      return;
    }

    if (body.decision === 'snooze' && !body.snooze_until) {
      res.status(400).json({ error: 'snooze_until is required for snooze decisions' });
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

    // Acknowledge: "I've seen this" — finding stays alive, clears badge
    if (body.decision === 'acknowledge') {
      const updateResult = await client.updateDocument(id, {
        properties: { ...props, human_decision: 'acknowledged', status: 'acknowledged' },
      });

      if (updateResult.error) {
        res.status(500).json({ error: 'Failed to update finding', details: updateResult.error.message });
        return;
      }

      console.log(`[findings] acknowledged finding ${id}`);
      res.json({ status: 'acknowledged', findingId: id });
      return;
    }

    // Snooze: defer until a specific time
    if (body.decision === 'snooze') {
      const updateResult = await client.updateDocument(id, {
        properties: {
          ...props,
          human_decision: 'snoozed',
          status: 'snoozed',
          snooze_until: body.snooze_until,
        },
      });

      if (updateResult.error) {
        res.status(500).json({ error: 'Failed to update finding', details: updateResult.error.message });
        return;
      }

      console.log(`[findings] snoozed finding ${id} until ${body.snooze_until}`);
      res.json({ status: 'snoozed', findingId: id, snooze_until: body.snooze_until });
      return;
    }

    // Approve: execute the proposed action, then mark as resolved
    const proposedAction = props.proposed_action as ProposedAction | null;

    if (!proposedAction || !proposedAction.type || !proposedAction.params) {
      res.status(400).json({ error: 'Finding has no proposed action to approve' });
      return;
    }

    console.log(`[findings] executing action: ${proposedAction.type} for finding ${id}`);
    const executionResult = await executeMutation(client, proposedAction);

    const approveResult = await client.updateDocument(id, {
      properties: {
        ...props,
        human_decision: 'confirmed',
        status: 'resolved',
        execution_result: executionResult,
      },
    });

    if (approveResult.error) {
      res.status(500).json({ error: 'Failed to update finding', details: approveResult.error.message });
      return;
    }

    console.log(`[findings] approved finding ${id} — action executed`);
    res.json({
      status: 'approved',
      findingId: id,
      executionResult,
    });
  });

  return router;
}
