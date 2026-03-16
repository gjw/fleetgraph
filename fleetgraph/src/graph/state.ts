import { Annotation } from '@langchain/langgraph';
import type {
  ShipIssue,
  ShipSprint,
  ShipSprintIssue,
  ShipScopeChanges,
  ShipProject,
  ShipProgram,
  ShipTeamGrid,
  ShipAccountabilityItems,
} from '../ship/index.js';

// ── Finding + Action types (produced by reasoning node) ──────────────────────

export interface Finding {
  findingType: string;
  severity: 'info' | 'warning' | 'critical';
  affectedEntityId: string;
  affectedEntityType: 'issue' | 'sprint' | 'project' | 'program' | 'person';
  title: string;
  reasoning: string;
  recommendedAction?: string;
}

export interface ProposedAction {
  type: string;
  params: Record<string, unknown>;
  description: string;
}

// ── Graph State ──────────────────────────────────────────────────────────────

export const GraphState = Annotation.Root({
  // Trigger
  mode: Annotation<'proactive' | 'on_demand'>,
  triggerId: Annotation<string>,

  // Context
  userId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  documentId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  documentType: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  userMessage: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Fetched data
  issues: Annotation<ShipIssue[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  sprints: Annotation<ShipSprint[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  sprintIssues: Annotation<ShipSprintIssue[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  scopeChanges: Annotation<ShipScopeChanges | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  projects: Annotation<ShipProject[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  programs: Annotation<ShipProgram[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  team: Annotation<ShipTeamGrid | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  accountabilityItems: Annotation<ShipAccountabilityItems | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Fetch errors
  fetchErrors: Annotation<Record<string, string>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Reasoning output
  findings: Annotation<Finding[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  classification: Annotation<'clean' | 'notify' | 'action_propose'>({
    reducer: (_prev, next) => next,
    default: () => 'clean',
  }),

  // Action
  proposedAction: Annotation<ProposedAction | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  humanDecision: Annotation<'confirmed' | 'dismissed' | 'snoozed' | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  executionResult: Annotation<Record<string, unknown> | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  // Persist
  findingDocIds: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  traceUrl: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type GraphStateType = typeof GraphState.State;
export type GraphUpdateType = typeof GraphState.Update;
