import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { findingsKeys } from '@/hooks/useFindingsQuery';

interface ChatRequest {
  message: string;
  documentId?: string;
  documentType?: string;
}

interface Finding {
  finding_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  reasoning: string;
  proposed_action?: {
    type: string;
    params: Record<string, unknown>;
  } | null;
}

interface ChatResponse {
  classification: string;
  findings: Finding[];
  findingDocIds: string[];
}

interface DecideRequest {
  findingId: string;
  decision: 'confirm' | 'dismiss';
}

interface DecideResponse {
  status: string;
  findingId: string;
  executionResult?: Record<string, unknown>;
}

export type { Finding, ChatResponse };

export function useFleetGraphChat() {
  return useMutation({
    mutationFn: async (req: ChatRequest): Promise<ChatResponse> => {
      const res = await apiPost('/api/fleetgraph/chat', req);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Chat request failed');
      }
      return res.json();
    },
  });
}

export function useFleetGraphDecide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ findingId, decision }: DecideRequest): Promise<DecideResponse> => {
      const res = await apiPost(`/api/fleetgraph/findings/${findingId}/decide`, { decision });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Decision failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: findingsKeys.all });
    },
  });
}
