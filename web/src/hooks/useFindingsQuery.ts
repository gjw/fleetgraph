import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTeamMembersQuery } from '@/hooks/useTeamMembersQuery';

export interface FindingDocument {
  id: string;
  title: string;
  document_type: 'fleetgraph_finding';
  properties: {
    finding_type: string;
    severity: 'info' | 'warning' | 'critical';
    status: 'active' | 'acknowledged' | 'snoozed' | 'resolved' | 'pending_decision';
    affected_entity_id: string;
    affected_entity_type: string;
    affected_entity_name?: string;
    summary?: string;
    proposed_action: {
      type: string;
      params: Record<string, unknown>;
    } | null;
    human_decision: 'confirmed' | 'acknowledged' | 'snoozed' | null;
    snooze_until: string | null;
    recipient_ids?: string[];
    resolution_links?: { label: string; path: string }[];
    resolved_reason?: 'auto' | null;
    last_validated_at?: string | null;
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

/**
 * Count of active findings addressed to the current user.
 * Maps auth user ID → person document ID via team members, then filters
 * findings by recipient_ids. Falls back to total active count if the
 * mapping isn't available yet.
 */
export function useFindingsActiveCount(): number {
  const { data: findings } = useFindingsQuery();
  const { user } = useAuth();
  const { data: teamMembers } = useTeamMembersQuery();

  if (!findings) return 0;

  // Map current user to their person document ID
  const personId = user?.id && teamMembers
    ? teamMembers.find(m => m.user_id === user.id)?.id ?? null
    : null;

  return findings.filter(f => {
    const props = f.properties;
    if (!props) return false;
    if (props.human_decision !== null) return false;
    if (props.status !== 'active' && props.status !== 'pending_decision') return false;
    // Filter by recipient if we can resolve the person ID
    if (personId && props.recipient_ids) {
      return props.recipient_ids.includes(personId);
    }
    // Fallback: show all active if mapping unavailable
    return true;
  }).length;
}

export function useInvalidateFindings() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: findingsKeys.all });
}
