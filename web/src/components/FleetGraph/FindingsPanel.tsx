import { cn } from '@/lib/cn';
import { useFleetGraphDecide } from '@/hooks/useFleetGraph';
import type { Finding } from '@/hooks/useFleetGraph';

const severityStyles = {
  info: 'border-blue-500/30 bg-blue-500/10',
  warning: 'border-orange-500/30 bg-orange-500/10',
  critical: 'border-red-500/30 bg-red-500/10',
} as const;

const severityBadge = {
  info: 'bg-blue-600/20 text-blue-400',
  warning: 'bg-orange-600/20 text-orange-400',
  critical: 'bg-red-600/20 text-red-400',
} as const;

interface FindingCardProps {
  finding: Finding;
  docId?: string;
}

function FindingCard({ finding, docId }: FindingCardProps) {
  const decideMutation = useFleetGraphDecide();
  const decided = decideMutation.isSuccess;

  return (
    <div className={cn('rounded border p-3 space-y-2', severityStyles[finding.severity])}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', severityBadge[finding.severity])}>
            {finding.severity}
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {finding.title || finding.finding_type}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted leading-relaxed">{finding.reasoning}</p>

      {finding.proposed_action && (
        <p className="text-[11px] text-muted italic">
          Proposed: {finding.proposed_action.type}
        </p>
      )}

      {docId && !decided && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => decideMutation.mutate({ findingId: docId, decision: 'acknowledge' })}
            disabled={decideMutation.isPending}
            className="rounded bg-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-border/80 disabled:opacity-50 transition-colors"
          >
            Acknowledge
          </button>
          {finding.proposed_action && finding.proposed_action.type !== 'add_comment' && (
            <button
              onClick={() => decideMutation.mutate({ findingId: docId, decision: 'approve' })}
              disabled={decideMutation.isPending}
              className="rounded bg-green-600/20 px-2.5 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
          )}
        </div>
      )}

      {decided && (
        <p className="text-[11px] font-medium text-muted">
          {decideMutation.data?.status === 'approved' ? 'Approved' : 'Acknowledged'}
        </p>
      )}

      {decideMutation.isError && (
        <p className="text-[11px] text-red-400">
          {decideMutation.error instanceof Error ? decideMutation.error.message : 'Action failed'}
        </p>
      )}
    </div>
  );
}

interface FindingsPanelProps {
  findings: Finding[];
  findingDocIds?: string[];
}

export function FindingsPanel({ findings, findingDocIds = [] }: FindingsPanelProps) {
  if (findings.length === 0) return null;

  return (
    <div className="space-y-2">
      {findings.map((finding, i) => (
        <FindingCard
          key={findingDocIds[i] || i}
          finding={finding}
          docId={findingDocIds[i]}
        />
      ))}
    </div>
  );
}
