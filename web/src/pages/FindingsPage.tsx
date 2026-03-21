import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useFindingsQuery, type FindingDocument } from '@/hooks/useFindingsQuery';
import { useFleetGraphDecide } from '@/hooks/useFleetGraph';
import { useInvalidateFindings } from '@/hooks/useFindingsQuery';

type FilterTab = 'all' | 'active' | 'acknowledged' | 'snoozed' | 'resolved';

const severityStyles = {
  info: 'border-blue-500/30 bg-blue-500/5',
  warning: 'border-orange-500/30 bg-orange-500/5',
  critical: 'border-red-500/30 bg-red-500/5',
} as const;

const severityBadge = {
  info: 'bg-blue-600/20 text-blue-400',
  warning: 'bg-orange-600/20 text-orange-400',
  critical: 'bg-red-600/20 text-red-400',
} as const;

const actionLabels: Record<string, string> = {
  reassign: 'Proposed: Reassign',
  change_state: 'Proposed: Change status',
  escalate: 'Proposed: Escalate',
};

function getEntityLink(entityType: string, entityId: string, findingType?: string): string {
  if (entityType === 'person') {
    return `/team/${entityId}/issues`;
  }

  if (entityType === 'sprint') {
    if (findingType === 'retro_patterns') return `/documents/${entityId}/review`;
    // scope_creep, stale_triage, blocked_sprint, missing_estimate, unplanned_work, blocked_chain
    return `/documents/${entityId}/issues`;
  }

  if (entityType === 'program') {
    return `/documents/${entityId}/issues`;
  }

  // issue (no tabs) and project (default tab is already issues)
  return `/documents/${entityId}`;
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getTomorrowAt8AM(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

function getNextMondayAt8AM(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

function SplitSnoozeButton({
  disabled,
  onSnooze,
}: {
  disabled: boolean;
  onSnooze: (snoozeUntil: string) => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        onClick={() => onSnooze(getTomorrowAt8AM())}
        disabled={disabled}
        className="rounded-l bg-yellow-600/20 px-3 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-600/30 disabled:opacity-50 transition-colors"
      >
        Snooze
      </button>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={disabled}
        className="rounded-r border-l border-yellow-600/30 bg-yellow-600/20 px-1.5 py-1.5 text-xs font-medium text-yellow-400 hover:bg-yellow-600/30 disabled:opacity-50 transition-colors"
      >
        ▾
      </button>
      {showDropdown && (
        <div className="absolute top-full left-0 mt-1 z-10 rounded border border-border bg-surface shadow-lg">
          <button
            onClick={() => {
              onSnooze(getNextMondayAt8AM());
              setShowDropdown(false);
            }}
            className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground hover:bg-border/50 transition-colors"
          >
            Until next week
          </button>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: FindingDocument }) {
  const decideMutation = useFleetGraphDecide();
  const invalidateFindings = useInvalidateFindings();
  const props = finding.properties;
  const severity = props?.severity || 'info';
  const isUndecided = props?.human_decision === null && (props?.status === 'active' || props?.status === 'pending_decision');
  const hasActionableProposal = props?.proposed_action && props.proposed_action.type !== 'add_comment';

  const handleDecide = (decision: 'acknowledge' | 'snooze' | 'approve', snoozeUntil?: string) => {
    decideMutation.mutate(
      { findingId: finding.id, decision, snooze_until: snoozeUntil },
      { onSuccess: () => invalidateFindings() },
    );
  };

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', severityStyles[severity])}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={cn(
            'inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            severityBadge[severity],
          )}>
            {severity}
          </span>
          <span className="text-sm font-medium text-foreground truncate">
            {finding.title || props?.finding_type || 'Finding'}
          </span>
        </div>
        <span className="text-xs text-muted shrink-0">
          {formatTimeAgo(finding.created_at)}
        </span>
      </div>

      {/* Summary */}
      {props?.summary && (
        <p className="text-xs text-muted mt-1">{props.summary}</p>
      )}

      {/* Resolution links or fallback entity link */}
      {props?.resolution_links && props.resolution_links.length > 0 ? (
        <div className="flex flex-col gap-1 text-xs">
          <span className="text-muted">
            Affects: {props.affected_entity_name ?? `${props.affected_entity_type} ${props.affected_entity_id?.slice(0, 8)}...`}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {props.resolution_links.map((link, i) => (
              <Link
                key={i}
                to={link.path}
                className="text-accent hover:underline"
              >
                {link.label} &rarr;
              </Link>
            ))}
          </div>
        </div>
      ) : props?.affected_entity_id ? (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted">Affects:</span>
          <Link
            to={getEntityLink(props.affected_entity_type, props.affected_entity_id, props.finding_type)}
            className="text-accent hover:underline truncate"
          >
            {props.affected_entity_name ?? `${props.affected_entity_type} ${props.affected_entity_id.slice(0, 8)}...`}
          </Link>
        </div>
      ) : null}

      {/* Proposed action */}
      {hasActionableProposal && (
        <p className="text-xs text-muted italic">
          {actionLabels[props.proposed_action!.type] ?? `Proposed: ${props.proposed_action!.type}`}
        </p>
      )}

      {/* Actions */}
      {isUndecided && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => handleDecide('acknowledge')}
            disabled={decideMutation.isPending}
            className="rounded bg-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-border/80 disabled:opacity-50 transition-colors"
          >
            Acknowledge
          </button>
          <SplitSnoozeButton
            disabled={decideMutation.isPending}
            onSnooze={(until) => handleDecide('snooze', until)}
          />
          {hasActionableProposal && (
            <button
              onClick={() => handleDecide('approve')}
              disabled={decideMutation.isPending}
              className="rounded bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
          )}
        </div>
      )}

      {/* Status badge for decided/resolved findings */}
      {(props?.human_decision || props?.status === 'resolved') && (
        <span className={cn(
          'inline-flex rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
          props.status === 'resolved' && !props.human_decision ? 'bg-green-600/20 text-green-400' :
          props.human_decision === 'confirmed' ? 'bg-green-600/20 text-green-400' :
          props.human_decision === 'acknowledged' ? 'bg-border text-muted' :
          props.human_decision === 'snoozed' ? 'bg-yellow-600/20 text-yellow-400' :
          'bg-border text-muted',
        )}>
          {props.status === 'resolved' && !props.human_decision ? 'auto-resolved' :
           props.human_decision === 'confirmed' ? 'approved' :
           props.human_decision}
        </span>
      )}

      {decideMutation.isError && (
        <p className="text-[11px] text-red-400">
          {decideMutation.error instanceof Error ? decideMutation.error.message : 'Action failed'}
        </p>
      )}

      {/* Trace link */}
      {props?.trace_url && (
        <a
          href={props.trace_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted hover:text-foreground transition-colors"
        >
          View trace
        </a>
      )}
    </div>
  );
}

export function FindingsPage() {
  const { data: findings, isLoading, error } = useFindingsQuery();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const filtered = (findings || []).filter(f => {
    const props = f.properties;
    switch (activeTab) {
      case 'active': return props?.human_decision === null && (props?.status === 'active' || props?.status === 'pending_decision');
      case 'acknowledged': return props?.human_decision === 'acknowledged';
      case 'snoozed': return props?.human_decision === 'snoozed';
      case 'resolved': return props?.status === 'resolved';
      default: return true;
    }
  });

  const counts = {
    all: findings?.length || 0,
    active: findings?.filter(f => f.properties?.human_decision === null && (f.properties?.status === 'active' || f.properties?.status === 'pending_decision')).length || 0,
    acknowledged: findings?.filter(f => f.properties?.human_decision === 'acknowledged').length || 0,
    snoozed: findings?.filter(f => f.properties?.human_decision === 'snoozed').length || 0,
    resolved: findings?.filter(f => f.properties?.status === 'resolved').length || 0,
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'acknowledged', label: 'Acknowledged' },
    { key: 'snoozed', label: 'Snoozed' },
    { key: 'resolved', label: 'Resolved' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">FleetGraph Findings</h1>
          <p className="text-sm text-muted mt-0.5">Proactive insights from project intelligence</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border px-6 pt-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-muted">
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted">
            Loading findings...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12 text-red-400">
            Failed to load findings
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted">
            <FleetGraphEmptyIcon />
            <p className="mt-3 text-sm">
              {activeTab === 'all' ? 'No findings yet' : `No ${activeTab} findings`}
            </p>
            {activeTab === 'all' && (
              <p className="mt-1 text-xs">
                FleetGraph will surface insights here when it detects noteworthy patterns
              </p>
            )}
          </div>
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <div className="space-y-3 max-w-3xl">
            {filtered.map(finding => (
              <FindingCard key={finding.id} finding={finding} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FleetGraphEmptyIcon() {
  return (
    <svg className="h-10 w-10 text-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}
