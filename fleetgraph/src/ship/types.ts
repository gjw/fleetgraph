import type {
  IssueState,
  IssuePriority,
  IssueSource,
  BelongsToType,
  DocumentType,
  AccountabilityType,
  ApprovalTracking,
} from '@ship/shared';

// ── Error ────────────────────────────────────────────────────────────────────

export interface ShipError {
  status: number;
  message: string;
  code?: string;
}

export type Result<T> = { data: T; error: null } | { data: null; error: ShipError };

// ── Issues ───────────────────────────────────────────────────────────────────

export interface ShipBelongsTo {
  id: string;
  type: BelongsToType;
  title?: string;
  color?: string;
}

export interface ShipIssue {
  id: string;
  title: string;
  ticket_number: number;
  display_id: string;
  state: IssueState;
  priority: IssuePriority;
  assignee_id: string | null;
  assignee_name?: string;
  assignee_archived?: boolean;
  estimate: number | null;
  source: IssueSource;
  created_at: string;
  updated_at: string;
  created_by: string;
  belongs_to?: ShipBelongsTo[];
}

export interface ShipIssueDetail extends ShipIssue {
  content: Record<string, unknown>;
  created_by_name?: string;
  converted_to_id?: string | null;
  converted_from_id?: string | null;
  belongs_to: ShipBelongsTo[];
}

export interface ShipIssuePatch {
  title?: string;
  state?: IssueState;
  priority?: IssuePriority;
  assignee_id?: string | null;
  estimate?: number | null;
}

// ── Sprints (Weeks) ──────────────────────────────────────────────────────────

export interface ShipSprint {
  id: string;
  name: string;
  sprint_number: number;
  status?: 'planning' | 'active' | 'completed';
  owner: { id: string; name: string; email: string } | null;
  program_id: string | null;
  program_name?: string;
  issue_count: number;
  completed_count: number;
  started_count: number;
  total_estimate_hours: number;
  has_plan: boolean;
  has_retro: boolean;
  plan?: string | null;
  success_criteria?: string[] | null;
  confidence?: number | null;
  plan_approval?: ApprovalTracking | null;
  review_approval?: ApprovalTracking | null;
  review_rating?: { value: number; rated_by: string; rated_at: string } | null;
}

export interface ShipSprintIssue {
  id: string;
  title: string;
  state: string;
  priority: string;
  assignee_id: string | null;
  estimate: number | null;
  ticket_number: number;
  display_id: string;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
  assignee_archived?: boolean;
  carryover_from_sprint_id?: string | null;
  carryover_from_sprint_name?: string | null;
}

export interface ShipScopeChange {
  timestamp: string;
  scopeAfter: number;
  changeType: 'added' | 'removed';
  estimateChange: number;
}

export interface ShipScopeChanges {
  originalScope: number;
  currentScope: number;
  scopeChangePercent: number;
  scopeChanges: ShipScopeChange[];
}

// ── Projects ─────────────────────────────────────────────────────────────────

export interface ShipOwner {
  id: string;
  name: string;
  email: string;
}

export interface ShipProject {
  id: string;
  title: string;
  impact: number | null;
  confidence: number | null;
  ease: number | null;
  ice_score: number | null;
  color: string;
  emoji?: string | null;
  program_id: string | null;
  program_name?: string;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  owner?: ShipOwner | null;
  sprint_count: number;
  issue_count: number;
  plan_validated?: boolean | null;
  success_criteria?: string[] | null;
  plan_approval?: ApprovalTracking | null;
  retro_approval?: ApprovalTracking | null;
}

export interface ShipProjectSprint {
  id: string;
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  owner?: ShipOwner | null;
  issue_count: number;
  completed_count: number;
  started_count: number;
}

// ── Programs ─────────────────────────────────────────────────────────────────

export interface ShipProgram {
  id: string;
  name: string;
  color: string;
  emoji?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  owner?: ShipOwner | null;
  owner_id: string | null;
  accountable_id: string | null;
  consulted_ids: string[];
  informed_ids: string[];
  issue_count: number;
  sprint_count: number;
}

// ── Documents ────────────────────────────────────────────────────────────────

export interface ShipDocument {
  id: string;
  workspace_id: string;
  document_type: DocumentType;
  title: string;
  content: Record<string, unknown>;
  parent_id?: string | null;
  position: number;
  properties: Record<string, unknown>;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  visibility: 'private' | 'workspace';
}

export interface ShipDocumentAssociations {
  document_id: string;
  associations: Array<{
    related_id: string;
    relationship_type: BelongsToType;
    related_title?: string;
    related_color?: string;
    document_type?: string;
  }>;
}

export interface ShipCreateDocument {
  title?: string;
  document_type?: DocumentType;
  parent_id?: string | null;
  program_id?: string | null;
  sprint_id?: string | null;
  properties?: Record<string, unknown>;
  visibility?: 'private' | 'workspace';
  content?: Record<string, unknown>;
  belongs_to?: Array<{ id: string; type: BelongsToType }>;
}

export interface ShipUpdateDocument {
  title?: string;
  content?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface ShipComment {
  id: string;
  document_id: string;
  comment_id: string;
  parent_id?: string | null;
  content: string;
  resolved_at?: string | null;
  author: ShipOwner;
  created_at: string;
  updated_at: string;
}

export interface ShipCreateComment {
  comment_id: string;
  content: string;
  parent_id?: string;
}

// ── Team Grid ────────────────────────────────────────────────────────────────

export interface ShipTeamPerson {
  personId: string;
  id: string | null;
  name: string;
  email: string;
  isArchived: boolean;
  isPending: boolean;
  reportsTo?: string | null;
}

export interface ShipTeamSprint {
  number: number;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface ShipTeamAssignment {
  programs: Array<{
    id: string;
    name: string;
    emoji?: string;
    color: string;
    issueCount: number;
  }>;
  issues: Array<{
    id: string;
    title: string;
    displayId: string;
    state: string;
  }>;
}

export interface ShipTeamGrid {
  people: ShipTeamPerson[];
  sprints: ShipTeamSprint[];
  assignments: Record<string, Record<number, ShipTeamAssignment>>;
}

export interface ShipTeamGridParams {
  fromSprint?: number;
  toSprint?: number;
  includeArchived?: boolean;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface ShipMyWorkItem {
  id: string;
  title: string;
  type: 'issue' | 'project' | 'sprint';
  urgency: 'overdue' | 'this_sprint' | 'later';
  state?: string;
  priority?: string;
  ticket_number?: number;
  sprint_id?: string | null;
  sprint_name?: string | null;
  ice_score?: number | null;
  inferred_status?: string;
  sprint_number?: number;
  days_remaining?: number;
  program_name?: string | null;
}

export interface ShipMyWork {
  items: ShipMyWorkItem[];
  grouped: {
    overdue: ShipMyWorkItem[];
    this_sprint: ShipMyWorkItem[];
    later: ShipMyWorkItem[];
  };
  current_sprint_number: number;
  days_remaining: number;
}

// ── Accountability ───────────────────────────────────────────────────────────

export interface ShipAccountabilityItem {
  id: string;
  title: string;
  state: 'todo';
  priority: 'high';
  ticket_number: 0;
  display_id: '';
  is_system_generated: true;
  accountability_type: AccountabilityType;
  accountability_target_id: string;
  target_title: string;
  due_date?: string | null;
  days_overdue: number;
  person_id?: string | null;
  project_id?: string | null;
  week_number?: number | null;
}

export interface ShipAccountabilityItems {
  items: ShipAccountabilityItem[];
  total: number;
  has_overdue: boolean;
  has_due_today: boolean;
}

// ── Standups ─────────────────────────────────────────────────────────────────

export interface ShipStandupStatus {
  [key: string]: unknown;
}

// ── Query params ─────────────────────────────────────────────────────────────

export interface ShipIssueParams {
  sort?: string;
  dir?: 'asc' | 'desc';
  archived?: boolean;
}
