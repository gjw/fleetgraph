import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';

interface ChatRequest {
  message: string;
  documentId?: string;
  documentType?: string;
}

/**
 * Creates the chat router. Accepts the compiled graph so it can invoke
 * on-demand runs.
 */
export function createChatRouter(graph: { invoke: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }): RouterType {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    const body = req.body as ChatRequest;

    if (!body.message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    try {
      const userId = req.headers['x-user-id'] as string | undefined;
      const sessionCookie = req.headers.cookie as string | undefined;

      const result = await graph.invoke({
        mode: 'on_demand',
        triggerId: `chat-${Date.now()}`,
        userMessage: body.message,
        documentId: body.documentId ?? null,
        documentType: body.documentType ?? null,
        userId: userId ?? null,
        sessionCookie: sessionCookie ?? null,
      });

      res.json({
        classification: result.classification,
        findings: result.findings,
        findingDocIds: result.findingDocIds,
      });
    } catch (err) {
      console.error('[chat] graph invocation failed:', err);
      res.status(500).json({
        error: 'Graph invocation failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  return router;
}
