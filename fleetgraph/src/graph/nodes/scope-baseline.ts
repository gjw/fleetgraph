import type { ShipScopeChanges } from '../../ship/types.js';

interface Baseline {
  totalEstimates: number;
  recordedAt: string;
}

type ScopeEntry = { sprintId: string; sprintName: string } & ShipScopeChanges;

// In-memory baselines — reset on process restart (first scan sets new baselines)
const baselines = new Map<string, Baseline>();

/**
 * Apply first-scan baselines to scope change data.
 *
 * First time a sprint is seen: record currentScope as the baseline,
 * zero out scopeChangePercent (initial planning is not scope creep).
 *
 * Subsequent scans: override originalScope with the baseline and
 * recompute scopeChangePercent. Only scopeChanges after the baseline
 * timestamp are included.
 */
export function applyBaselines(scopeChanges: ScopeEntry[]): void {
  const now = new Date().toISOString();

  for (const sc of scopeChanges) {
    const existing = baselines.get(sc.sprintId);

    if (!existing) {
      // First scan — record baseline, report zero creep
      baselines.set(sc.sprintId, {
        totalEstimates: sc.currentScope,
        recordedAt: now,
      });
      sc.originalScope = sc.currentScope;
      sc.scopeChangePercent = 0;
      sc.scopeChanges = [];
      continue;
    }

    // Subsequent scan — compare against baseline
    sc.originalScope = existing.totalEstimates;
    sc.scopeChangePercent = existing.totalEstimates > 0
      ? Math.round(((sc.currentScope - existing.totalEstimates) / existing.totalEstimates) * 100)
      : (sc.currentScope > 0 ? 100 : 0);

    // Only include scope changes after baseline was recorded
    sc.scopeChanges = sc.scopeChanges.filter(
      change => change.timestamp > existing.recordedAt,
    );
  }
}
