# FLEETGRAPH.md

Project intelligence agent for Ship — proactive monitoring and on-demand reasoning
via graph architecture.

<!-- Sections below are filled incrementally. See bd-1mb for full deliverable. -->

## Test Cases

Test cases run against seeded Ship data (`pnpm db:seed && pnpm db:seed:fg`).
Each case invokes the FleetGraph graph and captures a LangSmith trace showing
the execution path.

**Runner:** `npx tsx fleetgraph/src/graph/run-scenarios.ts all`

**Trace diversity requirement:** At least 2 traces showing visibly different
execution paths (different classify branches: Clean, Notify, Action Propose).

### TC-1: Sprint Scope Creep (S1)

- **Mode:** Proactive
- **Graph path:** Trigger → Fetch → Reasoning → Classify → Action Propose → Persist
- **Ship state:** 11 active sprints, 41 active issues, 11 scope change sets, 90 sprint issues
- **Expected:** `scope_creep` finding for sprint with 50% post-start additions
- **Actual:** 8 findings — 7x `stale_triage` (issues stuck in triage), 1x `overloaded_member` (David Kim). GPT-4o prioritized triage backlog over scope changes. Scope change data was present but the stale_triage signal dominated.
- **Trace:** https://smith.langchain.com/public/4e8ea445-ff89-4bcb-a651-f1aa6ea65a40/r
- **Confounders:** Not yet validated — clean sprint not separately tested
- **Status:** Graph path exercised (action_propose). Finding type differs from expected — reasoning prompt tuning needed for scope_creep detection priority.

### TC-2: Accountability Debt Roll-up (S3)

- **Mode:** Proactive (shared run with TC-1)
- **Graph path:** Same as TC-1
- **Ship state:** Same proactive scan
- **Expected:** 3 rollup findings for persons A/B/C, none for compliant Person D
- **Actual:** Same findings as TC-1 (stale_triage + overloaded_member). Accountability data present (1 item from API) but standup/retro compliance data not in reasoning prompt.
- **Trace:** https://smith.langchain.com/public/4e8ea445-ff89-4bcb-a651-f1aa6ea65a40/r (shared)
- **Status:** Accountability-specific fetching needed — standup status and plan/retro submission history not yet included in fetch pipeline.

### TC-3: Blocked Work Chain (S4)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Clean (END)
- **Ship state:** User viewing issue A (demoId s4:issueA), asking "What's blocking this?"
- **Expected:** Chain finding (A←B←C), bottleneck identification, proposed reassignment
- **Actual:** 0 findings, classification=clean. GPT-4o found nothing relevant to the user's question.
- **Trace:** https://smith.langchain.com/public/d01ec045-280f-425b-a2f6-fab4191fba5e/r
- **Confounders:** N/A (no findings produced)
- **Status:** Dependency data (`properties.depends_on`) not included in issue list payload. Need to fetch issue detail with properties for on-demand issue context.

### TC-4: Smart Next Action (S6)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Action Propose → Persist
- **Ship state:** User viewing issue X (Iris Nguyen's in_progress issue), asking "What should I work on next?"
- **Expected:** Informational prioritized work order, Clean path
- **Actual:** 1 finding — `overloaded_member` for Iris Nguyen. Classification: action_propose.
- **Trace:** https://smith.langchain.com/public/d9064fd6-0e81-4b88-af38-349be75b6ef2/r
- **Status:** Partially correct — identified the right person (Iris) and recognized workload issue. Expected Clean path but got Action Propose (Iris has too many high-priority issues).

### TC-5: Retro Pattern Mining (S7)

- **Mode:** On-demand
- **Graph path:** Trigger → Context → Fetch → Reasoning → Classify → Clean (END)
- **Ship state:** User viewing Week 10 retro, asking "Any patterns across our retros?"
- **Expected:** Recurring "deploy friction" theme across 3/4 retros, unfulfilled action item
- **Actual:** 0 findings, classification=clean.
- **Trace:** https://smith.langchain.com/public/0458de99-e5b4-4ac5-aea1-356829ee4031/r
- **Status:** Retro document content not fetched — fetch pipeline only retrieves issues and sprint metadata, not document bodies. Need document content fetching for retro analysis.

### Trace Diversity Matrix

| Classify Branch | Test Case | Status |
|----------------|-----------|--------|
| Clean | TC-3 (S4), TC-5 (S7) | Exercised |
| Notify | — | Not yet exercised |
| Action Propose | TC-1 (S1), TC-2 (S3), TC-4 (S6) | Exercised |

**2 of 3 classify branches covered.** Notify path requires findings without `recommendedAction`.

### Findings Persisted

7 `fleetgraph_finding` documents created in Ship database. 1 failed due to
`affectedEntityId` referencing a person UUID not present as a document.

### Known Gaps for Follow-up

1. **Scope creep detection** — Scope change data is fetched but stale_triage dominates reasoning. Prompt tuning or separate detection pass needed.
2. **Dependency chain analysis** — `properties.depends_on` not in issue list payload. Need `getIssue()` for on-demand context.
3. **Retro content** — Document bodies not fetched. Need document content fetching for S7.
4. **Accountability specifics** — Standup status and plan/retro submission history not in fetch pipeline for S3.
5. **Rollup enforcement** — GPT-4o produces per-item findings instead of per-entity rollups despite prompt instruction.
