import { describe, it, expect, vi } from 'vitest';
import {
  shouldCreateFinding,
  resolvePersonEntityId,
  autoResolveStaleFindings,
} from '../src/graph/nodes/finding-dedup.js';
import type { ShipDocument } from '../src/ship/types.js';
import type { ShipClient } from '../src/ship/client.js';
import type { Finding } from '../src/graph/state.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFindingDoc(overrides: Record<string, unknown> = {}): ShipDocument {
  return {
    id: 'doc-1',
    workspace_id: 'ws-1',
    document_type: 'fleetgraph_finding' as ShipDocument['document_type'],
    title: 'Test Finding',
    content: {},
    position: 0,
    properties: {
      finding_type: 'stale_triage',
      affected_entity_id: 'entity-1',
      severity: 'warning',
      status: 'active',
      human_decision: null,
      snooze_until: null,
      last_validated_at: null,
      ...overrides,
    },
    created_at: '2026-03-20T00:00:00.000Z',
    updated_at: '2026-03-20T00:00:00.000Z',
    visibility: 'workspace',
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingType: 'stale_triage',
    severity: 'warning',
    affectedEntityId: 'entity-1',
    affectedEntityType: 'issue',
    title: 'Test Finding',
    summary: 'Test summary',
    reasoning: 'Test reasoning',
    recommendedAction: null,
    recipientIds: [],
    ...overrides,
  };
}

// ── shouldCreateFinding ──────────────────────────────────────────────────────

describe('shouldCreateFinding', () => {
  it('returns skip for active findings', () => {
    const doc = makeFindingDoc({ status: 'active' });
    expect(shouldCreateFinding(doc)).toBe('skip');
  });

  it('returns skip for pending_decision findings', () => {
    const doc = makeFindingDoc({ status: 'pending_decision' });
    expect(shouldCreateFinding(doc)).toBe('skip');
  });

  it('returns skip for acknowledged findings', () => {
    const doc = makeFindingDoc({ status: 'acknowledged', human_decision: 'acknowledged' });
    expect(shouldCreateFinding(doc)).toBe('skip');
  });

  it('returns create for resolved findings', () => {
    const doc = makeFindingDoc({ status: 'resolved' });
    expect(shouldCreateFinding(doc)).toBe('create');
  });

  it('returns create for expired snooze', () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const doc = makeFindingDoc({
      human_decision: 'snoozed',
      snooze_until: pastDate,
    });
    expect(shouldCreateFinding(doc)).toBe('create');
  });

  it('returns skip for unexpired snooze', () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const doc = makeFindingDoc({
      human_decision: 'snoozed',
      snooze_until: futureDate,
    });
    expect(shouldCreateFinding(doc)).toBe('skip');
  });

  it('returns skip for snoozed without snooze_until (no expiry)', () => {
    const doc = makeFindingDoc({
      human_decision: 'snoozed',
      snooze_until: null,
    });
    expect(shouldCreateFinding(doc)).toBe('skip');
  });
});

// ── resolvePersonEntityId ────────────────────────────────────────────────────

describe('resolvePersonEntityId', () => {
  const team = {
    users: [
      { personId: 'person-doc-1', id: 'user-uuid-1', name: 'Alice', email: 'a@t.co', isArchived: false, isPending: false },
      { personId: 'person-doc-2', id: 'user-uuid-2', name: 'Bob', email: 'b@t.co', isArchived: false, isPending: false },
    ],
    weeks: [],
    associations: {},
    currentSprintNumber: 1,
  };

  it('returns false for non-person entity types', () => {
    const finding = makeFinding({ affectedEntityType: 'issue', affectedEntityId: 'user-uuid-1' });
    expect(resolvePersonEntityId(finding, team)).toBe(false);
  });

  it('returns false when team is null', () => {
    const finding = makeFinding({ affectedEntityType: 'person', affectedEntityId: 'user-uuid-1' });
    expect(resolvePersonEntityId(finding, null)).toBe(false);
  });

  it('returns false when ID already matches personId', () => {
    const finding = makeFinding({ affectedEntityType: 'person', affectedEntityId: 'person-doc-1' });
    expect(resolvePersonEntityId(finding, team)).toBe(false);
    expect(finding.affectedEntityId).toBe('person-doc-1');
  });

  it('resolves user UUID to person document ID', () => {
    const finding = makeFinding({ affectedEntityType: 'person', affectedEntityId: 'user-uuid-2' });
    expect(resolvePersonEntityId(finding, team)).toBe(true);
    expect(finding.affectedEntityId).toBe('person-doc-2');
  });

  it('returns false for unknown UUID', () => {
    const finding = makeFinding({ affectedEntityType: 'person', affectedEntityId: 'unknown-id' });
    expect(resolvePersonEntityId(finding, team)).toBe(false);
    expect(finding.affectedEntityId).toBe('unknown-id');
  });
});

// ── autoResolveStaleFindings ─────────────────────────────────────────────────

describe('autoResolveStaleFindings', () => {
  function mockClient(updateResult = { data: {}, error: null }): ShipClient {
    return {
      updateDocument: vi.fn().mockResolvedValue(updateResult),
    } as unknown as ShipClient;
  }

  const HOT_STALENESS = 15 * 60 * 1000; // 15 min

  it('auto-resolves active finding past staleness window', async () => {
    const staleTime = new Date(Date.now() - HOT_STALENESS - 60_000).toISOString();
    const doc = makeFindingDoc({
      finding_type: 'scope_creep',
      status: 'active',
      last_validated_at: staleTime,
    });

    const existing = new Map([['scope_creep::entity-1', doc]]);
    const reproduced = new Set<string>();
    const client = mockClient();

    const count = await autoResolveStaleFindings(client, existing, reproduced, 'hot');
    expect(count).toBe(1);
    expect(client.updateDocument).toHaveBeenCalledWith(doc.id, expect.objectContaining({
      properties: expect.objectContaining({ status: 'resolved', resolved_reason: 'auto' }),
    }));
  });

  it('skips findings within staleness window', async () => {
    const recentTime = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    const doc = makeFindingDoc({
      finding_type: 'scope_creep',
      status: 'active',
      last_validated_at: recentTime,
    });

    const existing = new Map([['scope_creep::entity-1', doc]]);
    const reproduced = new Set<string>();
    const client = mockClient();

    const count = await autoResolveStaleFindings(client, existing, reproduced, 'hot');
    expect(count).toBe(0);
    expect(client.updateDocument).not.toHaveBeenCalled();
  });

  it('skips findings reproduced in current scan', async () => {
    const staleTime = new Date(Date.now() - HOT_STALENESS - 60_000).toISOString();
    const doc = makeFindingDoc({
      finding_type: 'scope_creep',
      status: 'active',
      last_validated_at: staleTime,
    });

    const existing = new Map([['scope_creep::entity-1', doc]]);
    const reproduced = new Set(['scope_creep::entity-1']);
    const client = mockClient();

    const count = await autoResolveStaleFindings(client, existing, reproduced, 'hot');
    expect(count).toBe(0);
  });

  it('skips acknowledged findings', async () => {
    const staleTime = new Date(Date.now() - HOT_STALENESS - 60_000).toISOString();
    const doc = makeFindingDoc({
      finding_type: 'scope_creep',
      status: 'acknowledged',
      human_decision: 'acknowledged',
      last_validated_at: staleTime,
    });

    const existing = new Map([['scope_creep::entity-1', doc]]);
    const client = mockClient();

    const count = await autoResolveStaleFindings(client, existing, new Set(), 'hot');
    expect(count).toBe(0);
  });

  it('skips finding types not covered by current cadence', async () => {
    const staleTime = new Date(Date.now() - HOT_STALENESS - 60_000).toISOString();
    // stale_triage is daily, not hot
    const doc = makeFindingDoc({
      finding_type: 'stale_triage',
      status: 'active',
      last_validated_at: staleTime,
    });

    const existing = new Map([['stale_triage::entity-1', doc]]);
    const client = mockClient();

    const count = await autoResolveStaleFindings(client, existing, new Set(), 'hot');
    expect(count).toBe(0);
  });

  it('falls back to created_at when last_validated_at is null', async () => {
    // doc.created_at is 2026-03-20, well past any staleness window
    const doc = makeFindingDoc({
      finding_type: 'scope_creep',
      status: 'active',
      last_validated_at: null,
    });

    const existing = new Map([['scope_creep::entity-1', doc]]);
    const client = mockClient();

    const count = await autoResolveStaleFindings(client, existing, new Set(), 'hot');
    expect(count).toBe(1);
  });
});
