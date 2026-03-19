import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export interface FindingDocument {
  id: string;
  title: string;
  document_type: 'fleetgraph_finding';
  properties: {
    finding_type: string;
    severity: 'info' | 'warning' | 'critical';
    status: 'active' | 'dismissed' | 'snoozed' | 'resolved';
    affected_entity_id: string;
    affected_entity_type: string;
    proposed_action: {
      type: string;
      params: Record<string, unknown>;
    } | null;
    human_decision: 'confirmed' | 'dismissed' | 'snoozed' | null;
    snooze_until: string | null;
    reasoning_model: string;
    token_usage: { input: number; output: number };
    trace_url: string | null;
  };
  created_at: string;
  updated_at: string;
}

export const findingsKeys = {
  all: ['findings'] as const,
  list: () => [...findingsKeys.all, 'list'] as const,
};

export function useFindingsQuery() {
  return useQuery({
    queryKey: findingsKeys.list(),
    queryFn: async (): Promise<FindingDocument[]> => {
      const res = await apiGet('/api/documents?type=fleetgraph_finding');
      if (!res.ok) {
        throw new Error('Failed to fetch findings');
      }
      const data = await res.json();
      // API returns array of documents
      const docs: FindingDocument[] = Array.isArray(data) ? data : [];
      // Sort: critical first, then warning, then info; within same severity, newest first
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return docs.sort((a, b) => {
        const sa = severityOrder[a.properties?.severity] ?? 3;
        const sb = severityOrder[b.properties?.severity] ?? 3;
        if (sa !== sb) return sa - sb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
    staleTime: 30_000,
  });
}

export function useFindingsActiveCount(): number {
  const { data: findings } = useFindingsQuery();
  if (!findings) return 0;
  return findings.filter(f => f.properties?.human_decision === null && f.properties?.status === 'active').length;
}

export function useInvalidateFindings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: findingsKeys.all });
}
