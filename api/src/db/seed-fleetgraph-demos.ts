// ============================================================================
// FleetGraph Demo Scenario Seed Data
// ============================================================================
//
// Creates deterministic test data for all FleetGraph demo scenarios (S1–S7).
// Run AFTER the main seed: pnpm db:seed && pnpm db:seed:fg
//
// Design principles:
//   - Deterministic UUIDs — same IDs every run, every environment
//   - Rich confounders — data that should NOT trigger detections
//   - Idempotent — safe to re-run via ON CONFLICT DO NOTHING
//   - Relative dates — computed from "now" at seed time
//
// See notes/demo-scenarios.md for full scenario specifications.
// ============================================================================

import { createHash } from 'crypto';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadProductionSecrets } from '../config/ssm.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../../.env.local') });
config({ path: join(__dirname, '../../.env') });

// ── Deterministic UUID generator ────────────────────────────────────────────
// Same input always produces same UUID. Namespace isolates from other seeds.

function demoId(key: string): string {
  const hash = createHash('sha256').update(`fg-demo-v1:${key}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    'a' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ── Date helpers ────────────────────────────────────────────────────────────

const NOW = new Date();

function daysAgo(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(d: Date): string {
  return d.toISOString();
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

// ── TipTap content helpers ──────────────────────────────────────────────────

function textDoc(...paragraphs: string[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: paragraphs.map(text => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

function bulletDoc(heading: string, items: string[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: heading }],
      },
      {
        type: 'bulletList',
        content: items.map(item => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
        })),
      },
    ],
  };
}

function retroDoc(sections: Array<{ heading: string; items: string[] }>): Record<string, unknown> {
  return {
    type: 'doc',
    content: sections.flatMap(section => [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: section.heading }],
      },
      {
        type: 'bulletList',
        content: section.items.map(item => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
        })),
      },
    ]),
  };
}

// ── DB helpers ──────────────────────────────────────────────────────────────

async function upsertDoc(
  pool: pg.Pool,
  id: string,
  workspaceId: string,
  docType: string,
  title: string,
  properties: Record<string, unknown>,
  opts?: {
    content?: Record<string, unknown>;
    createdBy?: string;
    createdAt?: Date;
    updatedAt?: Date;
    ticketNumber?: number;
    parentId?: string;
    startedAt?: Date;
  },
): Promise<void> {
  const content = opts?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] };
  await pool.query(
    `INSERT INTO documents (id, workspace_id, document_type, title, properties, content, created_by, created_at, updated_at, ticket_number, parent_id, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [
      id,
      workspaceId,
      docType,
      title,
      JSON.stringify(properties),
      JSON.stringify(content),
      opts?.createdBy ?? null,
      opts?.createdAt ? toISO(opts.createdAt) : toISO(NOW),
      opts?.updatedAt ? toISO(opts.updatedAt) : toISO(NOW),
      opts?.ticketNumber ?? null,
      opts?.parentId ?? null,
      opts?.startedAt ? toISO(opts.startedAt) : null,
    ],
  );
}

async function upsertAssociation(
  pool: pg.Pool,
  documentId: string,
  relatedId: string,
  relationshipType: 'program' | 'project' | 'sprint',
): Promise<void> {
  await pool.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
    [documentId, relatedId, relationshipType, JSON.stringify({ created_via: 'seed-fleetgraph-demos' })],
  );
}

// ── Sprint dedup helper ────────────────────────────────────────────────────
// Looks up existing sprint by (program_id, sprint_number). Creates only if
// none exists. Prevents duplicate sprints when multiple scenarios share a week.

async function getOrCreateSprint(
  pool: pg.Pool,
  workspaceId: string,
  programId: string,
  sprintNumber: number,
  opts: {
    title?: string;
    owner_id?: string;
    project_id?: string;
    assignee_ids?: string[];
    plan?: string;
    confidence?: number;
    status?: string;
    createdBy?: string;
    createdAt?: Date;
  },
): Promise<string> {
  const existing = await pool.query(
    `SELECT d.id FROM documents d
     JOIN document_associations da ON da.document_id = d.id
       AND da.relationship_type = 'program' AND da.related_id = $1
     WHERE d.workspace_id = $2 AND d.document_type = 'sprint'
       AND (d.properties->>'sprint_number')::int = $3
     LIMIT 1`,
    [programId, workspaceId, sprintNumber],
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const id = demoId(`sprint:${programId}:${sprintNumber}`);
  await upsertDoc(pool, id, workspaceId, 'sprint', opts.title ?? `Week ${sprintNumber}`, {
    sprint_number: sprintNumber,
    owner_id: opts.owner_id ?? null,
    project_id: opts.project_id ?? null,
    assignee_ids: opts.assignee_ids ?? [],
    plan: opts.plan ?? `Week ${sprintNumber}`,
    confidence: opts.confidence ?? 75,
    status: opts.status ?? 'active',
  }, { createdBy: opts.createdBy, createdAt: opts.createdAt });
  await upsertAssociation(pool, id, programId, 'program');

  return id;
}

// ── User lookup ─────────────────────────────────────────────────────────────

interface UserRef {
  userId: string;
  personDocId: string;
  name: string;
  email: string;
}

async function lookupUsers(
  pool: pg.Pool,
  workspaceId: string,
): Promise<Record<string, UserRef>> {
  const result = await pool.query(
    `SELECT u.id as user_id, u.email, u.name, d.id as person_doc_id
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id AND wm.workspace_id = $1
     LEFT JOIN documents d ON d.workspace_id = $1
       AND d.document_type = 'person' AND d.properties->>'user_id' = u.id::text
     ORDER BY u.email`,
    [workspaceId],
  );
  const map: Record<string, UserRef> = {};
  for (const row of result.rows) {
    map[row.email] = {
      userId: row.user_id,
      personDocId: row.person_doc_id,
      name: row.name,
      email: row.email,
    };
  }
  return map;
}

// ── Ticket number helper ────────────────────────────────────────────────────

let ticketCounter = 0;

async function initTicketCounter(pool: pg.Pool, workspaceId: string, programId: string): Promise<void> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(d.ticket_number), 0) as max_ticket
     FROM documents d
     JOIN document_associations da ON da.document_id = d.id
       AND da.related_id = $2 AND da.relationship_type = 'program'
     WHERE d.workspace_id = $1 AND d.document_type = 'issue'`,
    [workspaceId, programId],
  );
  ticketCounter = result.rows[0].max_ticket;
}

function nextTicket(): number {
  return ++ticketCounter;
}

// ============================================================================
// MAIN SEED
// ============================================================================

async function seedFleetGraphDemos() {
  await loadProductionSecrets();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  console.log('🔬 Seeding FleetGraph demo scenario data...');

  try {
    // ── Look up workspace ─────────────────────────────────────────────────
    const wsResult = await pool.query(
      "SELECT id, sprint_start_date FROM workspaces WHERE name = 'Ship Workspace'",
    );
    if (wsResult.rows.length === 0) {
      throw new Error('Ship Workspace not found. Run pnpm db:seed first.');
    }
    const workspaceId = wsResult.rows[0].id;
    const sprintStartDate = new Date(wsResult.rows[0].sprint_start_date);
    const daysSinceStart = Math.floor((NOW.getTime() - sprintStartDate.getTime()) / (86400000));
    const currentSprintNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

    console.log(`   Workspace: ${workspaceId}`);
    console.log(`   Current sprint: ${currentSprintNumber}`);

    // ── Look up existing users ────────────────────────────────────────────
    const users = await lookupUsers(pool, workspaceId);
    const userCount = Object.keys(users).length;
    if (userCount < 10) {
      throw new Error(`Expected 10+ users, found ${userCount}. Run pnpm db:seed first.`);
    }

    // Assign scenario roles
    // Director: dev (root)
    // PM: alice (manager)
    // Engineers: david, emma, frank, grace, henry, iris, jack
    // Scope adder: bob (manager — adds issues to sprints he shouldn't)
    // Compliant person: grace (does everything right — control)
    const director = users['dev@ship.local']!;
    const pm = users['alice.chen@ship.local']!;
    const engineer1 = users['david.kim@ship.local']!;
    const engineer2 = users['emma.johnson@ship.local']!;
    const engineer3 = users['frank.garcia@ship.local']!;
    const compliant = users['grace.lee@ship.local']!;
    const newbie = users['henry.patel@ship.local']!;
    const scopeAdder = users['bob.martinez@ship.local']!;
    const retroAuthor = users['carol.williams@ship.local']!;
    const extraEngineer = users['iris.nguyen@ship.local']!;
    const extraEngineer2 = users['jack.brown@ship.local']!;

    // ── Create FleetGraph Demo program ────────────────────────────────────
    const programId = demoId('program');
    await upsertDoc(pool, programId, workspaceId, 'program', 'FleetGraph Demo', {
      prefix: 'FG',
      color: '#7C3AED',
    }, { createdBy: director.userId });
    console.log('✅ Program: FleetGraph Demo');

    // ── Create projects (one per scenario cluster) ────────────────────────
    const projectIds = {
      sprintOps: demoId('project:sprint-ops'),
      teamHealth: demoId('project:team-health'),
      platform: demoId('project:platform'),
      product: demoId('project:product'),
    };

    await upsertDoc(pool, projectIds.sprintOps, workspaceId, 'project', 'Sprint Operations', {
      color: '#3B82F6', emoji: '📊', owner_id: pm.userId,
      impact: 4, confidence: 4, ease: 3,
      plan: 'Sprint management and execution tracking',
    }, { createdBy: pm.userId });
    await upsertAssociation(pool, projectIds.sprintOps, programId, 'program');

    await upsertDoc(pool, projectIds.teamHealth, workspaceId, 'project', 'Team Health', {
      color: '#10B981', emoji: '💚', owner_id: director.userId,
      impact: 5, confidence: 3, ease: 2,
      plan: 'Accountability tracking and team wellness',
    }, { createdBy: director.userId });
    await upsertAssociation(pool, projectIds.teamHealth, programId, 'program');

    await upsertDoc(pool, projectIds.platform, workspaceId, 'project', 'Platform Engineering', {
      color: '#F59E0B', emoji: '⚙️', owner_id: engineer1.userId,
      impact: 4, confidence: 4, ease: 3,
      plan: 'Core platform infrastructure and tooling',
    }, { createdBy: engineer1.userId });
    await upsertAssociation(pool, projectIds.platform, programId, 'program');

    await upsertDoc(pool, projectIds.product, workspaceId, 'project', 'Product Development', {
      color: '#EF4444', emoji: '🚀', owner_id: retroAuthor.userId,
      impact: 5, confidence: 4, ease: 3,
      plan: 'Product features and user-facing improvements',
      // S5 (stretch): missing success_criteria, owner marked "on_track" but signals disagree
    }, { createdBy: retroAuthor.userId });
    await upsertAssociation(pool, projectIds.product, programId, 'program');

    console.log('✅ Projects: 4 created');

    await initTicketCounter(pool, workspaceId, programId);

    // ══════════════════════════════════════════════════════════════════════
    // S1: SPRINT SCOPE CREEP
    // ══════════════════════════════════════════════════════════════════════
    // Target sprint: started ~7 days ago, ends ~7 days from now
    // 8 issues pre-start, 4 added post-start (50% scope increase)
    // Confounders:
    //   - A clean sprint with NO scope creep
    //   - Issues in the target sprint created by the sprint owner (intentional)
    //   - An issue moved from another sprint (not "new" scope)
    //   - A completed sprint that HAD scope creep (historical, should not re-trigger)

    console.log('\n── S1: Sprint Scope Creep ──');

    const s1SprintNumber = currentSprintNumber;
    const sprintStartDay = daysAgo(7);

    const s1SprintId = await getOrCreateSprint(pool, workspaceId, programId, s1SprintNumber, {
      owner_id: pm.userId,
      project_id: projectIds.sprintOps,
      assignee_ids: [pm.personDocId, engineer1.personDocId, engineer2.personDocId, scopeAdder.personDocId],
      plan: 'Deliver core sprint tracking features and stabilize API layer.',
      confidence: 72,
      status: 'active',
      createdBy: pm.userId,
      createdAt: daysAgo(8),
    });
    await upsertAssociation(pool, s1SprintId, projectIds.sprintOps, 'project');

    // 8 pre-start issues (created before sprint began)
    const s1PreIssues = [
      { title: 'Implement sprint burndown chart', state: 'done', priority: 'high', assignee: engineer1 },
      { title: 'Add sprint velocity calculation', state: 'done', priority: 'high', assignee: engineer2 },
      { title: 'Build sprint overview dashboard', state: 'in_progress', priority: 'high', assignee: engineer1 },
      { title: 'Create sprint health indicators', state: 'in_progress', priority: 'medium', assignee: pm },
      { title: 'Add sprint comparison view', state: 'todo', priority: 'medium', assignee: engineer2 },
      { title: 'Implement sprint goal tracking', state: 'todo', priority: 'medium', assignee: engineer1 },
      { title: 'Sprint notification preferences', state: 'todo', priority: 'low', assignee: engineer2 },
      { title: 'Add sprint export to CSV', state: 'todo', priority: 'low', assignee: pm },
    ];

    for (let i = 0; i < s1PreIssues.length; i++) {
      const issue = s1PreIssues[i]!;
      const id = demoId(`s1:pre-issue:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', issue.title, {
        state: issue.state,
        priority: issue.priority,
        assignee_id: issue.assignee.userId,
        source: 'internal',
        estimate: [4, 6, 8, 3, 4, 6, 2, 3][i],
      }, {
        createdBy: pm.userId,
        createdAt: daysAgo(10 + i), // all created well before sprint start
        updatedAt: issue.state === 'done' ? daysAgo(3) : NOW,
        ticketNumber: nextTicket(),
        startedAt: issue.state !== 'todo' ? daysAgo(6) : undefined,
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.sprintOps, 'project');
      await upsertAssociation(pool, id, s1SprintId, 'sprint');
    }

    // 4 post-start issues (scope creep — created AFTER sprint began)
    const s1PostIssues = [
      { title: 'Urgent: fix sprint date picker regression', state: 'in_progress', priority: 'high', assignee: engineer1, addedBy: scopeAdder, daysAfterStart: 2 },
      { title: 'Add sprint label filtering', state: 'todo', priority: 'medium', assignee: engineer2, addedBy: scopeAdder, daysAfterStart: 3 },
      { title: 'Sprint accessibility audit findings', state: 'todo', priority: 'medium', assignee: engineer1, addedBy: scopeAdder, daysAfterStart: 4 },
      { title: 'Nice-to-have: sprint dark mode tweaks', state: 'todo', priority: 'low', assignee: engineer2, addedBy: pm, daysAfterStart: 5 },
    ];

    for (let i = 0; i < s1PostIssues.length; i++) {
      const issue = s1PostIssues[i]!;
      const id = demoId(`s1:post-issue:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', issue.title, {
        state: issue.state,
        priority: issue.priority,
        assignee_id: issue.assignee.userId,
        source: 'internal',
        estimate: [3, 4, 5, 2][i],
      }, {
        createdBy: issue.addedBy.userId,
        createdAt: daysAgo(7 - issue.daysAfterStart), // after sprint start
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.sprintOps, 'project');
      await upsertAssociation(pool, id, s1SprintId, 'sprint');
    }

    console.log('   Target: 12 issues in sprint (8 pre, 4 post-start)');

    // ── S1 Confounders ──

    // Confounder 1: Clean sprint with NO scope creep (all issues pre-start)
    const s1CleanSprintNumber = currentSprintNumber - 1;
    const s1CleanSprintId = await getOrCreateSprint(pool, workspaceId, programId, s1CleanSprintNumber, {
      owner_id: pm.userId,
      project_id: projectIds.sprintOps,
      assignee_ids: [pm.personDocId, engineer1.personDocId],
      plan: 'Stabilize existing features, no new work.',
      confidence: 90,
      status: 'completed',
      createdBy: pm.userId,
      createdAt: daysAgo(15),
    });
    await upsertAssociation(pool, s1CleanSprintId, projectIds.sprintOps, 'project');

    for (let i = 0; i < 6; i++) {
      const id = demoId(`s1:clean-issue:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', `Clean sprint task ${i + 1}`, {
        state: 'done',
        priority: ['high', 'high', 'medium', 'medium', 'low', 'low'][i],
        assignee_id: [engineer1.userId, engineer2.userId][i % 2],
        source: 'internal',
        estimate: 4,
      }, {
        createdBy: pm.userId,
        createdAt: daysAgo(17), // well before clean sprint start
        updatedAt: daysAgo(9),
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.sprintOps, 'project');
      await upsertAssociation(pool, id, s1CleanSprintId, 'sprint');
    }

    // Confounder 2: Historical sprint that HAD scope creep but is completed
    // (should not re-trigger — it's done)
    const s1HistSprintNumber = currentSprintNumber - 2;
    const s1HistSprintId = await getOrCreateSprint(pool, workspaceId, programId, s1HistSprintNumber, {
      owner_id: pm.userId,
      project_id: projectIds.sprintOps,
      assignee_ids: [pm.personDocId, engineer2.personDocId],
      plan: 'Historical sprint with scope issues.',
      confidence: 60,
      status: 'completed',
      createdBy: pm.userId,
      createdAt: daysAgo(22),
    });
    await upsertAssociation(pool, s1HistSprintId, projectIds.sprintOps, 'project');

    // 4 pre + 3 post (historical creep) — all done now
    for (let i = 0; i < 7; i++) {
      const id = demoId(`s1:hist-issue:${i}`);
      const isPostStart = i >= 4;
      await upsertDoc(pool, id, workspaceId, 'issue', `Historical task ${i + 1}${isPostStart ? ' (added late)' : ''}`, {
        state: 'done',
        priority: 'medium',
        assignee_id: engineer2.userId,
        source: 'internal',
        estimate: 4,
      }, {
        createdBy: isPostStart ? scopeAdder.userId : pm.userId,
        createdAt: daysAgo(isPostStart ? 18 : 25), // post/pre start of hist sprint
        updatedAt: daysAgo(15),
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.sprintOps, 'project');
      await upsertAssociation(pool, id, s1HistSprintId, 'sprint');
    }

    // Confounder 3: Issue in target sprint that was added by the sprint OWNER
    // (debatable whether this is scope creep — owner may have planned it)
    // This is already covered: s1PostIssues[3] is added by pm (owner)

    console.log('   Confounders: clean sprint (6 issues), historical sprint (7 issues)');

    // ══════════════════════════════════════════════════════════════════════
    // S3: ACCOUNTABILITY DEBT ROLL-UP
    // ══════════════════════════════════════════════════════════════════════
    // Person A (engineer1): missing standups for 3 consecutive days
    // Person B (engineer2): plans on time for 4 sprints, skipped retros for 3
    // Person C (scopeAdder): pending approval with no follow-up for 4 days
    // Person D (compliant): fully compliant — NO finding expected
    // Confounders:
    //   - Person E (newbie): only 1 sprint of data — too little to flag
    //   - Person F (extraEngineer): missed 1 standup (not a pattern yet)
    //   - Empty-content plan (submitted but blank — different signal)

    console.log('\n── S3: Accountability Debt Roll-up ──');

    // Create 4 sprints for accountability tracking (current + 3 past)
    const s3Sprints: Array<{ id: string; number: number; offset: number }> = [];
    for (let offset = -3; offset <= 0; offset++) {
      const sprintNum = currentSprintNumber + offset;
      const id = await getOrCreateSprint(pool, workspaceId, programId, sprintNum, {
        owner_id: director.userId,
        project_id: projectIds.teamHealth,
        assignee_ids: [
          engineer1.personDocId, engineer2.personDocId, scopeAdder.personDocId,
          compliant.personDocId, newbie.personDocId, extraEngineer.personDocId,
        ],
        plan: `Week ${sprintNum} team health tracking`,
        confidence: 80,
        status: offset < 0 ? 'completed' : 'active',
        createdBy: director.userId,
        createdAt: daysAgo((0 - offset) * 7 + 1),
      });
      await upsertAssociation(pool, id, projectIds.teamHealth, 'project');
      s3Sprints.push({ id, number: sprintNum, offset });
    }

    const currentS3Sprint = s3Sprints.find(s => s.offset === 0)!;

    // ── Person A (engineer1): missing standups for 3 consecutive days ──
    // Create standups for days -6, -5, -4 (early in sprint) but NOT -3, -2, -1
    for (let dayOffset = 6; dayOffset >= 4; dayOffset--) {
      const id = demoId(`s3:standup:personA:${dayOffset}`);
      await upsertDoc(pool, id, workspaceId, 'standup', `Standup - ${engineer1.name}`, {
        author_id: engineer1.userId,
      }, {
        content: textDoc(
          `Yesterday: Worked on platform tasks.`,
          `Today: Continuing development.`,
          `Blockers: None`,
        ),
        createdBy: engineer1.userId,
        createdAt: daysAgo(dayOffset),
      });
      await upsertAssociation(pool, id, currentS3Sprint.id, 'sprint');
    }
    // Gap: no standups for days -3, -2, -1 (the 3 consecutive missing days)

    // ── Person B (engineer2): plans on time, retros skipped ──
    // 4 sprints of plans (all submitted), but retros only for sprint -3
    for (const sprint of s3Sprints) {
      // Plans: all 4 sprints — Person B is diligent with plans
      const planId = demoId(`s3:plan:personB:${sprint.offset}`);
      await upsertDoc(pool, planId, workspaceId, 'weekly_plan', `Week ${sprint.number} Plan`, {
        person_id: engineer2.personDocId,
        project_id: projectIds.teamHealth,
        week_number: sprint.number,
        submitted_at: toISO(daysAgo((0 - sprint.offset) * 7)),
      }, {
        content: bulletDoc('Plan', [
          'Continue feature development',
          'Code reviews for team PRs',
          'Update test coverage',
        ]),
        createdBy: engineer2.userId,
        createdAt: daysAgo((0 - sprint.offset) * 7),
      });

      // Retros: only for sprint -3 (earliest). Skipped for -2, -1, 0 (3 consecutive skips)
      if (sprint.offset === -3) {
        const retroId = demoId(`s3:retro:personB:${sprint.offset}`);
        await upsertDoc(pool, retroId, workspaceId, 'weekly_retro', `Week ${sprint.number} Retro`, {
          person_id: engineer2.personDocId,
          project_id: projectIds.teamHealth,
          week_number: sprint.number,
          submitted_at: toISO(daysAgo(20)),
        }, {
          content: bulletDoc('What I delivered', [
            'Completed initial feature work',
            'Set up CI pipeline for new module',
          ]),
          createdBy: engineer2.userId,
          createdAt: daysAgo(20),
        });
      }
    }

    // ── Person C (scopeAdder): pending approval, no follow-up ──
    // Create an issue with changes_requested feedback, untouched for 4 days
    const s3ApprovalIssueId = demoId('s3:approval-issue');
    await upsertDoc(pool, s3ApprovalIssueId, workspaceId, 'issue', 'Refactor auth token refresh logic', {
      state: 'in_review',
      priority: 'high',
      assignee_id: scopeAdder.userId,
      source: 'internal',
      estimate: 6,
      feedback_status: 'changes_requested',
    }, {
      createdBy: scopeAdder.userId,
      createdAt: daysAgo(8),
      updatedAt: daysAgo(4), // last touched 4 days ago — no follow-up
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, s3ApprovalIssueId, programId, 'program');
    await upsertAssociation(pool, s3ApprovalIssueId, projectIds.teamHealth, 'project');
    await upsertAssociation(pool, s3ApprovalIssueId, currentS3Sprint.id, 'sprint');

    // ── Person D (compliant): fully compliant — does everything ──
    // Standups every day, plans + retros for all sprints
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      const id = demoId(`s3:standup:personD:${dayOffset}`);
      await upsertDoc(pool, id, workspaceId, 'standup', `Standup - ${compliant.name}`, {
        author_id: compliant.userId,
      }, {
        content: textDoc(
          `Yesterday: Finished assigned tasks on schedule.`,
          `Today: Starting next priority item.`,
          `Blockers: None`,
        ),
        createdBy: compliant.userId,
        createdAt: daysAgo(dayOffset),
      });
      await upsertAssociation(pool, id, currentS3Sprint.id, 'sprint');
    }

    for (const sprint of s3Sprints) {
      const planId = demoId(`s3:plan:personD:${sprint.offset}`);
      await upsertDoc(pool, planId, workspaceId, 'weekly_plan', `Week ${sprint.number} Plan`, {
        person_id: compliant.personDocId,
        project_id: projectIds.teamHealth,
        week_number: sprint.number,
        submitted_at: toISO(daysAgo((0 - sprint.offset) * 7)),
      }, {
        content: bulletDoc('Plan', [
          'Deliver sprint commitments',
          'Support team with reviews',
          'Update documentation',
        ]),
        createdBy: compliant.userId,
        createdAt: daysAgo((0 - sprint.offset) * 7),
      });

      if (sprint.offset < 0) {
        const retroId = demoId(`s3:retro:personD:${sprint.offset}`);
        await upsertDoc(pool, retroId, workspaceId, 'weekly_retro', `Week ${sprint.number} Retro`, {
          person_id: compliant.personDocId,
          project_id: projectIds.teamHealth,
          week_number: sprint.number,
          submitted_at: toISO(daysAgo((0 - sprint.offset) * 7 - 1)),
        }, {
          content: bulletDoc('What I delivered', [
            'All sprint commitments met',
            'Reviewed 3 team PRs',
            'Updated runbook documentation',
          ]),
          createdBy: compliant.userId,
          createdAt: daysAgo((0 - sprint.offset) * 7 - 1),
        });
      }
    }

    console.log('   Person A: 3 standups then 3-day gap');
    console.log('   Person B: 4 plans, only 1 retro (3 skipped)');
    console.log('   Person C: approval stale 4 days');
    console.log('   Person D: fully compliant (control)');

    // ── S3 Confounders ──

    // Confounder: Newbie (Person E) — only 1 sprint of data, insufficient to flag
    const newestSprint = s3Sprints.find(s => s.offset === 0)!;
    const newbiePlanId = demoId('s3:plan:newbie:0');
    await upsertDoc(pool, newbiePlanId, workspaceId, 'weekly_plan', `Week ${newestSprint.number} Plan`, {
      person_id: newbie.personDocId,
      project_id: projectIds.teamHealth,
      week_number: newestSprint.number,
      submitted_at: toISO(daysAgo(1)),
    }, {
      content: bulletDoc('Plan', ['Onboarding tasks', 'Read codebase documentation']),
      createdBy: newbie.userId,
      createdAt: daysAgo(1),
    });
    // No older plans/retros — newbie just joined

    // Confounder: extraEngineer (Person F) — missed 1 standup (not a pattern)
    for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
      if (dayOffset === 3) continue; // missed just 1 day — not enough to flag
      const id = demoId(`s3:standup:personF:${dayOffset}`);
      await upsertDoc(pool, id, workspaceId, 'standup', `Standup - ${extraEngineer.name}`, {
        author_id: extraEngineer.userId,
      }, {
        content: textDoc('Yesterday: Regular work.', 'Today: Continuing.', 'Blockers: None'),
        createdBy: extraEngineer.userId,
        createdAt: daysAgo(dayOffset),
      });
      await upsertAssociation(pool, id, currentS3Sprint.id, 'sprint');
    }

    // Plans + retros for extraEngineer (all submitted)
    for (const sprint of s3Sprints) {
      const planId = demoId(`s3:plan:personF:${sprint.offset}`);
      await upsertDoc(pool, planId, workspaceId, 'weekly_plan', `Week ${sprint.number} Plan`, {
        person_id: extraEngineer.personDocId,
        project_id: projectIds.teamHealth,
        week_number: sprint.number,
        submitted_at: toISO(daysAgo((0 - sprint.offset) * 7)),
      }, {
        content: bulletDoc('Plan', ['Feature work', 'Code reviews']),
        createdBy: extraEngineer.userId,
        createdAt: daysAgo((0 - sprint.offset) * 7),
      });
      if (sprint.offset < 0) {
        const retroId = demoId(`s3:retro:personF:${sprint.offset}`);
        await upsertDoc(pool, retroId, workspaceId, 'weekly_retro', `Week ${sprint.number} Retro`, {
          person_id: extraEngineer.personDocId,
          project_id: projectIds.teamHealth,
          week_number: sprint.number,
          submitted_at: toISO(daysAgo((0 - sprint.offset) * 7 - 1)),
        }, {
          content: bulletDoc('What I delivered', ['Completed assigned work', 'Reviews done']),
          createdBy: extraEngineer.userId,
          createdAt: daysAgo((0 - sprint.offset) * 7 - 1),
        });
      }
    }

    console.log('   Confounders: newbie (1 sprint), Person F (1 missed standup, all plans/retros)');

    // ══════════════════════════════════════════════════════════════════════
    // S4: BLOCKED WORK CHAIN
    // ══════════════════════════════════════════════════════════════════════
    // Issue A: in_progress, assigned to engineer1, depends on B
    // Issue B: in_review, assigned to engineer2, depends on C
    // Issue C: in_review 5+ days, reviewer (engineer3) has 6+ items in_review
    // Issue D, E: also in_review, assigned to engineer3 (queue depth)
    // 2 downstream issues depend on A (blast radius)
    //
    // Dependencies stored in properties.depends_on (array of issue IDs)
    //
    // Confounders:
    //   - Issues in_review NOT part of any chain
    //   - A resolved dependency chain (depends_on issue is done)
    //   - An engineer with small review queue (2 items — not a bottleneck)
    //   - An issue that's in_review for only 1 day (not stale)

    console.log('\n── S4: Blocked Work Chain ──');

    const s4SprintId = await getOrCreateSprint(pool, workspaceId, programId, currentSprintNumber, {
      owner_id: engineer1.userId,
      project_id: projectIds.platform,
      assignee_ids: [engineer1.personDocId, engineer2.personDocId, engineer3.personDocId],
      plan: 'Platform infrastructure improvements.',
      confidence: 65,
      status: 'active',
      createdBy: engineer1.userId,
      createdAt: daysAgo(7),
    });
    await upsertAssociation(pool, s4SprintId, projectIds.platform, 'project');

    // The chain: A ← B ← C (each depends on the next)
    const issueAId = demoId('s4:issueA');
    const issueBId = demoId('s4:issueB');
    const issueCId = demoId('s4:issueC');

    // Issue C: bottleneck — in_review for 5+ days, reviewer has huge queue
    await upsertDoc(pool, issueCId, workspaceId, 'issue', 'Migrate database connection pooling', {
      state: 'in_review',
      priority: 'high',
      assignee_id: engineer3.userId,
      source: 'internal',
      estimate: 8,
    }, {
      createdBy: engineer2.userId,
      createdAt: daysAgo(12),
      updatedAt: daysAgo(6), // stale — last touched 6 days ago
      ticketNumber: nextTicket(),
      startedAt: daysAgo(10),
    });
    await upsertAssociation(pool, issueCId, programId, 'program');
    await upsertAssociation(pool, issueCId, projectIds.platform, 'project');
    await upsertAssociation(pool, issueCId, s4SprintId, 'sprint');

    // Issue B: blocked by C
    await upsertDoc(pool, issueBId, workspaceId, 'issue', 'Implement connection retry logic', {
      state: 'in_review',
      priority: 'high',
      assignee_id: engineer2.userId,
      source: 'internal',
      estimate: 6,
      depends_on: [issueCId],
    }, {
      createdBy: engineer1.userId,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(5),
      ticketNumber: nextTicket(),
      startedAt: daysAgo(8),
    });
    await upsertAssociation(pool, issueBId, programId, 'program');
    await upsertAssociation(pool, issueBId, projectIds.platform, 'project');
    await upsertAssociation(pool, issueBId, s4SprintId, 'sprint');

    // Issue A: blocked by B (engineer1's issue — the one they'd ask about)
    await upsertDoc(pool, issueAId, workspaceId, 'issue', 'Add health check endpoint for connection pool', {
      state: 'in_progress',
      priority: 'high',
      assignee_id: engineer1.userId,
      source: 'internal',
      estimate: 4,
      depends_on: [issueBId],
    }, {
      createdBy: engineer1.userId,
      createdAt: daysAgo(9),
      updatedAt: daysAgo(3),
      ticketNumber: nextTicket(),
      startedAt: daysAgo(5),
    });
    await upsertAssociation(pool, issueAId, programId, 'program');
    await upsertAssociation(pool, issueAId, projectIds.platform, 'project');
    await upsertAssociation(pool, issueAId, s4SprintId, 'sprint');

    // 2 downstream issues that depend on A (blast radius)
    for (let i = 0; i < 2; i++) {
      const id = demoId(`s4:downstream:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', ['Load test connection pool under stress', 'Document pool configuration for ops'][i]!, {
        state: 'todo',
        priority: ['medium', 'low'][i],
        assignee_id: [engineer2.userId, engineer1.userId][i],
        source: 'internal',
        estimate: [6, 3][i],
        depends_on: [issueAId],
      }, {
        createdBy: engineer1.userId,
        createdAt: daysAgo(9),
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.platform, 'project');
      await upsertAssociation(pool, id, s4SprintId, 'sprint');
    }

    // Engineer3's review queue (issues D, E + 4 more = 6 total in_review for bottleneck)
    const queueTitles = [
      'Update error codes for pool exhaustion',
      'Add metrics exporter for connection stats',
      'Refactor SSL certificate handling',
      'Fix race condition in pool cleanup',
    ];
    for (let i = 0; i < queueTitles.length; i++) {
      const id = demoId(`s4:queue:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', queueTitles[i]!, {
        state: 'in_review',
        priority: ['medium', 'medium', 'low', 'high'][i],
        assignee_id: engineer3.userId,
        source: 'internal',
        estimate: [4, 3, 5, 6][i],
      }, {
        createdBy: [engineer1.userId, engineer2.userId, pm.userId, engineer1.userId][i],
        createdAt: daysAgo(10 + i),
        updatedAt: daysAgo(3 + i), // all stale
        ticketNumber: nextTicket(),
        startedAt: daysAgo(8 + i),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.platform, 'project');
      await upsertAssociation(pool, id, s4SprintId, 'sprint');
    }

    console.log('   Chain: A ← B ← C (3 issues), 2 downstream, 4 queue filler');
    console.log('   Engineer3 total in_review: 5 (C + 4 queue) — bottleneck');

    // ── S4 Confounders ──

    // Confounder 1: Issue in_review but NOT part of any chain, and not stale
    const s4FreshReviewId = demoId('s4:fresh-review');
    await upsertDoc(pool, s4FreshReviewId, workspaceId, 'issue', 'Add connection timeout configuration', {
      state: 'in_review',
      priority: 'medium',
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 3,
    }, {
      createdBy: extraEngineer.userId,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(0), // fresh — just moved to review today
      ticketNumber: nextTicket(),
      startedAt: daysAgo(2),
    });
    await upsertAssociation(pool, s4FreshReviewId, programId, 'program');
    await upsertAssociation(pool, s4FreshReviewId, projectIds.platform, 'project');
    await upsertAssociation(pool, s4FreshReviewId, s4SprintId, 'sprint');

    // Confounder 2: Resolved dependency (depends_on issue is done — chain is clear)
    const s4ResolvedDepId = demoId('s4:resolved-dep');
    const s4ResolvedBlockerId = demoId('s4:resolved-blocker');
    await upsertDoc(pool, s4ResolvedBlockerId, workspaceId, 'issue', 'Set up connection pool monitoring', {
      state: 'done',
      priority: 'high',
      assignee_id: compliant.userId,
      source: 'internal',
      estimate: 4,
    }, {
      createdBy: compliant.userId,
      createdAt: daysAgo(14),
      updatedAt: daysAgo(2),
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, s4ResolvedBlockerId, programId, 'program');
    await upsertAssociation(pool, s4ResolvedBlockerId, projectIds.platform, 'project');
    await upsertAssociation(pool, s4ResolvedBlockerId, s4SprintId, 'sprint');

    await upsertDoc(pool, s4ResolvedDepId, workspaceId, 'issue', 'Build pool dashboard widget', {
      state: 'in_progress',
      priority: 'medium',
      assignee_id: compliant.userId,
      source: 'internal',
      estimate: 5,
      depends_on: [s4ResolvedBlockerId], // dependency is DONE — no chain problem
    }, {
      createdBy: compliant.userId,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(1),
      ticketNumber: nextTicket(),
      startedAt: daysAgo(2),
    });
    await upsertAssociation(pool, s4ResolvedDepId, programId, 'program');
    await upsertAssociation(pool, s4ResolvedDepId, projectIds.platform, 'project');
    await upsertAssociation(pool, s4ResolvedDepId, s4SprintId, 'sprint');

    // Confounder 3: Engineer with small review queue (2 items — not a bottleneck)
    for (let i = 0; i < 2; i++) {
      const id = demoId(`s4:small-queue:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', [`Validate pool config schema`, `Add pool error categorization`][i]!, {
        state: 'in_review',
        priority: 'medium',
        assignee_id: extraEngineer2.userId,
        source: 'internal',
        estimate: 3,
      }, {
        createdBy: engineer1.userId,
        createdAt: daysAgo(6),
        updatedAt: daysAgo(2),
        ticketNumber: nextTicket(),
        startedAt: daysAgo(4),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.platform, 'project');
      await upsertAssociation(pool, id, s4SprintId, 'sprint');
    }

    console.log('   Confounders: fresh review (1d), resolved chain, small queue (2 items)');

    // ══════════════════════════════════════════════════════════════════════
    // S6: SMART NEXT ACTION
    // ══════════════════════════════════════════════════════════════════════
    // Engineer (extraEngineer) has 5 assigned issues in current sprint:
    //   X: in_progress, nearly done (recent activity)
    //   Y: open, P0, unblocks 2 downstream
    //   Z: open, medium priority, BLOCKED (depends on unresolved)
    //   W: open, low priority, no dependencies
    //   V: open, medium priority, due in 2 days
    //
    // Confounders:
    //   - Issues assigned to OTHER engineers (not in this engineer's queue)
    //   - Completed issues for this engineer (shouldn't recommend)
    //   - Issues in a different sprint
    //   - A cancelled issue assigned to this engineer

    console.log('\n── S6: Smart Next Action ──');

    const s6SprintId = await getOrCreateSprint(pool, workspaceId, programId, currentSprintNumber, {
      owner_id: pm.userId,
      project_id: projectIds.product,
      assignee_ids: [extraEngineer.personDocId, engineer1.personDocId, engineer2.personDocId],
      plan: 'Product feature sprint.',
      confidence: 70,
      status: 'active',
      createdBy: pm.userId,
      createdAt: daysAgo(7),
    });
    await upsertAssociation(pool, s6SprintId, projectIds.product, 'project');

    // Issue X: in_progress, nearly done, recent activity
    const issueXId = demoId('s6:issueX');
    await upsertDoc(pool, issueXId, workspaceId, 'issue', 'Finalize user onboarding flow', {
      state: 'in_progress',
      priority: 'high',
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 6,
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(0), // just updated today
      ticketNumber: nextTicket(),
      startedAt: daysAgo(4),
    });
    await upsertAssociation(pool, issueXId, programId, 'program');
    await upsertAssociation(pool, issueXId, projectIds.product, 'project');
    await upsertAssociation(pool, issueXId, s6SprintId, 'sprint');

    // Issue Y: open, P0, unblocks 2 downstream
    const issueYId = demoId('s6:issueY');
    await upsertDoc(pool, issueYId, workspaceId, 'issue', 'Build notification preference API', {
      state: 'todo',
      priority: 'high', // P0 equivalent
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 8,
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(8),
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, issueYId, programId, 'program');
    await upsertAssociation(pool, issueYId, projectIds.product, 'project');
    await upsertAssociation(pool, issueYId, s6SprintId, 'sprint');

    // 2 downstream issues that depend on Y (showing Y's impact)
    for (let i = 0; i < 2; i++) {
      const id = demoId(`s6:downstream-y:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', ['Wire up notification UI to API', 'Add email digest settings'][i]!, {
        state: 'todo',
        priority: 'medium',
        assignee_id: [engineer1.userId, engineer2.userId][i],
        source: 'internal',
        estimate: [4, 5][i],
        depends_on: [issueYId],
      }, {
        createdBy: pm.userId,
        createdAt: daysAgo(8),
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.product, 'project');
      await upsertAssociation(pool, id, s6SprintId, 'sprint');
    }

    // Issue Z: open, medium priority, BLOCKED
    const s6BlockerId = demoId('s6:blocker-for-z');
    await upsertDoc(pool, s6BlockerId, workspaceId, 'issue', 'Define notification template schema', {
      state: 'in_progress',
      priority: 'high',
      assignee_id: engineer2.userId, // someone else is working on the blocker
      source: 'internal',
      estimate: 4,
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(9),
      ticketNumber: nextTicket(),
      startedAt: daysAgo(5),
    });
    await upsertAssociation(pool, s6BlockerId, programId, 'program');
    await upsertAssociation(pool, s6BlockerId, projectIds.product, 'project');
    await upsertAssociation(pool, s6BlockerId, s6SprintId, 'sprint');

    const issueZId = demoId('s6:issueZ');
    await upsertDoc(pool, issueZId, workspaceId, 'issue', 'Implement notification rendering engine', {
      state: 'todo',
      priority: 'medium',
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 6,
      depends_on: [s6BlockerId], // BLOCKED
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(8),
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, issueZId, programId, 'program');
    await upsertAssociation(pool, issueZId, projectIds.product, 'project');
    await upsertAssociation(pool, issueZId, s6SprintId, 'sprint');

    // Issue W: open, low priority, no dependencies
    const issueWId = demoId('s6:issueW');
    await upsertDoc(pool, issueWId, workspaceId, 'issue', 'Add notification sound preferences', {
      state: 'todo',
      priority: 'low',
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 2,
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(8),
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, issueWId, programId, 'program');
    await upsertAssociation(pool, issueWId, projectIds.product, 'project');
    await upsertAssociation(pool, issueWId, s6SprintId, 'sprint');

    // Issue V: open, medium priority, due in 2 days
    const issueVId = demoId('s6:issueV');
    await upsertDoc(pool, issueVId, workspaceId, 'issue', 'Fix notification delivery reliability', {
      state: 'todo',
      priority: 'medium',
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 5,
      due_date: toDateStr(daysFromNow(2)),
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(6),
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, issueVId, programId, 'program');
    await upsertAssociation(pool, issueVId, projectIds.product, 'project');
    await upsertAssociation(pool, issueVId, s6SprintId, 'sprint');

    console.log('   5 issues for extraEngineer: X(active), Y(P0,unblocks 2), Z(blocked), W(low), V(due soon)');

    // ── S6 Confounders ──

    // Confounder 1: Issues assigned to OTHER engineers in same sprint
    for (let i = 0; i < 3; i++) {
      const id = demoId(`s6:other-eng:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', ['Build push notification service', 'Add notification analytics', 'Create notification admin panel'][i]!, {
        state: ['in_progress', 'todo', 'todo'][i],
        priority: ['high', 'medium', 'low'][i],
        assignee_id: [engineer1.userId, engineer2.userId, engineer1.userId][i],
        source: 'internal',
        estimate: [6, 4, 8][i],
      }, {
        createdBy: pm.userId,
        createdAt: daysAgo(8),
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.product, 'project');
      await upsertAssociation(pool, id, s6SprintId, 'sprint');
    }

    // Confounder 2: Completed issues for extraEngineer (shouldn't recommend)
    for (let i = 0; i < 2; i++) {
      const id = demoId(`s6:done:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', ['Set up notification infrastructure', 'Design notification data model'][i]!, {
        state: 'done',
        priority: 'high',
        assignee_id: extraEngineer.userId,
        source: 'internal',
        estimate: [6, 4][i],
      }, {
        createdBy: pm.userId,
        createdAt: daysAgo(12),
        updatedAt: daysAgo(3),
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.product, 'project');
      await upsertAssociation(pool, id, s6SprintId, 'sprint');
    }

    // Confounder 3: Cancelled issue assigned to extraEngineer
    const s6CancelledId = demoId('s6:cancelled');
    await upsertDoc(pool, s6CancelledId, workspaceId, 'issue', 'Build SMS notification channel (descoped)', {
      state: 'cancelled',
      priority: 'medium',
      assignee_id: extraEngineer.userId,
      source: 'internal',
      estimate: 8,
    }, {
      createdBy: pm.userId,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(5),
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, s6CancelledId, programId, 'program');
    await upsertAssociation(pool, s6CancelledId, projectIds.product, 'project');
    await upsertAssociation(pool, s6CancelledId, s6SprintId, 'sprint');

    console.log('   Confounders: 3 other-engineer issues, 2 done, 1 cancelled');

    // ══════════════════════════════════════════════════════════════════════
    // S7: RETRO PATTERN MINING
    // ══════════════════════════════════════════════════════════════════════
    // 4 sprint retro documents with TipTap content:
    //   Sprint 10: "deploy process is painful, takes 2 hours"
    //   Sprint 11: "onboarding docs outdated" (different topic)
    //   Sprint 12: "deploy friction again, manual steps caused rollback"
    //   Sprint 13: "deploy broke Friday, 3-hour incident"
    // Issue R1: "Automate staging deploys" (action item from sprint 10), still in backlog
    // Program doc that groups all sprints
    //
    // Confounders:
    //   - A retro mentioning "deploy" POSITIVELY ("deploy went smoothly")
    //   - A pattern appearing only once (not recurring)
    //   - An action item that WAS completed (loop is closed)
    //   - A retro with no negative patterns at all

    console.log('\n── S7: Retro Pattern Mining ──');

    // Create 4 sprints for retro mining
    const s7Sprints: Array<{ id: string; number: number; label: string }> = [];
    for (let i = 0; i < 4; i++) {
      const sprintNum = currentSprintNumber - 4 + i; // sprints 10-13 equivalent
      const id = await getOrCreateSprint(pool, workspaceId, programId, sprintNum, {
        owner_id: retroAuthor.userId,
        project_id: projectIds.product,
        assignee_ids: [retroAuthor.personDocId, engineer1.personDocId, pm.personDocId],
        plan: `Week ${sprintNum} product development`,
        confidence: 75,
        status: 'completed',
        createdBy: retroAuthor.userId,
        createdAt: daysAgo(28 - i * 7),
      });
      await upsertAssociation(pool, id, projectIds.product, 'project');
      s7Sprints.push({ id, number: sprintNum, label: `Week ${sprintNum}` });
    }

    // Sprint retro documents (weekly_review type — used for team retros)
    // Sprint 10 retro: deploy pain begins
    const retro10Id = demoId('s7:retro:10');
    await upsertDoc(pool, retro10Id, workspaceId, 'weekly_review', `${s7Sprints[0]!.label} Review`, {}, {
      content: retroDoc([
        {
          heading: 'What went well',
          items: [
            'Feature development pace was strong',
            'Good collaboration between frontend and backend teams',
          ],
        },
        {
          heading: 'What could be improved',
          items: [
            'Deploy process is painful — takes 2 hours with manual steps',
            'Need better monitoring for staging environment',
            'Code review turnaround could be faster',
          ],
        },
        {
          heading: 'Action items',
          items: [
            'Create issue to automate staging deploys',
            'Set up deploy time tracking',
          ],
        },
      ]),
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(28),
    });
    await upsertAssociation(pool, retro10Id, s7Sprints[0]!.id, 'sprint');

    // Sprint 11 retro: different topic (onboarding docs)
    const retro11Id = demoId('s7:retro:11');
    await upsertDoc(pool, retro11Id, workspaceId, 'weekly_review', `${s7Sprints[1]!.label} Review`, {}, {
      content: retroDoc([
        {
          heading: 'What went well',
          items: [
            'Onboarded a new team member successfully',
            'Sprint goals mostly met',
          ],
        },
        {
          heading: 'What could be improved',
          items: [
            'Onboarding docs are outdated — new hire spent 2 days on wrong setup',
            'Need to update the getting started guide',
            'Test suite is getting slow',
          ],
        },
        {
          heading: 'Action items',
          items: ['Update onboarding documentation', 'Investigate test parallelization'],
        },
      ]),
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(21),
    });
    await upsertAssociation(pool, retro11Id, s7Sprints[1]!.id, 'sprint');

    // Sprint 12 retro: deploy friction AGAIN
    const retro12Id = demoId('s7:retro:12');
    await upsertDoc(pool, retro12Id, workspaceId, 'weekly_review', `${s7Sprints[2]!.label} Review`, {}, {
      content: retroDoc([
        {
          heading: 'What went well',
          items: [
            'Shipped major feature on time',
            'Customer feedback was positive',
          ],
        },
        {
          heading: 'What could be improved',
          items: [
            'Deploy friction again — manual steps caused a rollback on Tuesday',
            'We lost 4 hours to the rollback and re-deploy',
            'Still no automated staging deploy pipeline',
          ],
        },
        {
          heading: 'Action items',
          items: ['Prioritize deploy automation (carried over from 2 sprints ago)'],
        },
      ]),
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(14),
    });
    await upsertAssociation(pool, retro12Id, s7Sprints[2]!.id, 'sprint');

    // Sprint 13 retro: deploy INCIDENT — escalation
    const retro13Id = demoId('s7:retro:13');
    await upsertDoc(pool, retro13Id, workspaceId, 'weekly_review', `${s7Sprints[3]!.label} Review`, {}, {
      content: retroDoc([
        {
          heading: 'What went well',
          items: [
            'Quick incident response when things broke',
            'Team rallied to fix the issue over the weekend',
          ],
        },
        {
          heading: 'What could be improved',
          items: [
            'Deploy broke Friday afternoon — 3-hour production incident',
            'Manual deploy steps were the root cause again',
            'We need to stop pushing to Friday and we NEED automated deploys',
            'This is the third time deploy issues have appeared in retros',
          ],
        },
        {
          heading: 'Action items',
          items: [
            'Escalate deploy automation to P0 — this is now causing incidents',
            'Add deploy freeze for Fridays until automation is in place',
          ],
        },
      ]),
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(7),
    });
    await upsertAssociation(pool, retro13Id, s7Sprints[3]!.id, 'sprint');

    // Issue R1: action item from sprint 10, still in backlog (never started)
    const issueR1Id = demoId('s7:issueR1');
    await upsertDoc(pool, issueR1Id, workspaceId, 'issue', 'Automate staging deploys', {
      state: 'backlog',
      priority: 'medium', // was medium when created — should have been escalated
      assignee_id: null,
      source: 'internal',
      estimate: 16,
    }, {
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(27), // created right after sprint 10 retro
      updatedAt: daysAgo(27), // never touched since
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, issueR1Id, programId, 'program');
    await upsertAssociation(pool, issueR1Id, projectIds.product, 'project');

    console.log('   4 retro docs: deploy pain in 3/4, escalating severity');
    console.log('   Issue R1: "Automate staging deploys" — backlog, never started');

    // ── S7 Confounders ──

    // Confounder 1: A retro mentioning deploy POSITIVELY
    const positiveSprintNum = currentSprintNumber - 5;
    const s7PositiveRetroSprintId = await getOrCreateSprint(pool, workspaceId, programId, positiveSprintNum, {
      owner_id: retroAuthor.userId,
      project_id: projectIds.product,
      assignee_ids: [retroAuthor.personDocId],
      plan: 'Earlier sprint.',
      confidence: 85,
      status: 'completed',
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(35),
    });
    await upsertAssociation(pool, s7PositiveRetroSprintId, projectIds.product, 'project');

    const s7PositiveRetroId = demoId('s7:positive-retro');
    await upsertDoc(pool, s7PositiveRetroId, workspaceId, 'weekly_review', `Week ${positiveSprintNum} Review`, {}, {
      content: retroDoc([
        {
          heading: 'What went well',
          items: [
            'Deploy went smoothly this sprint — zero issues',
            'New monitoring caught a bug before users noticed',
            'Team morale is high',
          ],
        },
        {
          heading: 'What could be improved',
          items: [
            'Could use better test data for staging',
          ],
        },
      ]),
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(35),
    });
    await upsertAssociation(pool, s7PositiveRetroId, s7PositiveRetroSprintId, 'sprint');

    // Confounder 2: A pattern appearing only once (not recurring — shouldn't flag)
    // Sprint 11 already mentions "onboarding docs" once — that's the confounder.
    // No other retro mentions it, so it shouldn't be flagged as a pattern.

    // Confounder 3: Action item that WAS completed (closed loop)
    const s7CompletedActionId = demoId('s7:completed-action');
    await upsertDoc(pool, s7CompletedActionId, workspaceId, 'issue', 'Update onboarding documentation', {
      state: 'done',
      priority: 'medium',
      assignee_id: pm.userId,
      source: 'internal',
      estimate: 4,
    }, {
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(20), // created after sprint 11 retro
      updatedAt: daysAgo(16), // completed within a sprint
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, s7CompletedActionId, programId, 'program');
    await upsertAssociation(pool, s7CompletedActionId, projectIds.product, 'project');

    // Confounder 4: A retro with zero negative patterns (pure green)
    const greenSprintNum = currentSprintNumber - 6;
    const s7GreenRetroSprintId = await getOrCreateSprint(pool, workspaceId, programId, greenSprintNum, {
      owner_id: retroAuthor.userId,
      project_id: projectIds.product,
      assignee_ids: [retroAuthor.personDocId],
      plan: 'Smooth sprint.',
      confidence: 90,
      status: 'completed',
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(42),
    });
    await upsertAssociation(pool, s7GreenRetroSprintId, projectIds.product, 'project');

    const s7GreenRetroId = demoId('s7:green-retro');
    await upsertDoc(pool, s7GreenRetroId, workspaceId, 'weekly_review', `Week ${greenSprintNum} Review`, {}, {
      content: retroDoc([
        {
          heading: 'What went well',
          items: [
            'Everything shipped on time',
            'Great team collaboration',
            'Clean deploys all week',
            'Test coverage improved significantly',
          ],
        },
        {
          heading: 'What could be improved',
          items: [
            'Nothing significant — keep doing what we are doing',
          ],
        },
      ]),
      createdBy: retroAuthor.userId,
      createdAt: daysAgo(42),
    });
    await upsertAssociation(pool, s7GreenRetroId, s7GreenRetroSprintId, 'sprint');

    console.log('   Confounders: positive deploy retro, completed action item, all-green retro');

    // ══════════════════════════════════════════════════════════════════════
    // S2 (Tier 2): STALE TRIAGE BACKLOG
    // ══════════════════════════════════════════════════════════════════════
    // 6 issues in triage status, created 3-5 days ago
    // 4 are bug reports from external source
    // 2 are internal feature requests
    //
    // Confounders:
    //   - Issues in triage but only 1 day old (too fresh to flag)
    //   - Issues that were in triage but got triaged (now in todo)
    //   - A triage issue that's only hours old

    console.log('\n── S2: Stale Triage Backlog ──');

    const s2StaleTriage = [
      { title: 'Bug: login fails with special characters in password', source: 'external', daysOld: 5 },
      { title: 'Bug: export CSV drops unicode columns', source: 'external', daysOld: 4 },
      { title: 'Bug: notification badge count wrong after dismiss', source: 'external', daysOld: 4 },
      { title: 'Bug: search results don\'t update after filter change', source: 'external', daysOld: 3 },
      { title: 'Feature: add dark mode toggle to settings', source: 'internal', daysOld: 4 },
      { title: 'Feature: keyboard shortcut for quick issue create', source: 'internal', daysOld: 3 },
    ];

    for (let i = 0; i < s2StaleTriage.length; i++) {
      const issue = s2StaleTriage[i]!;
      const id = demoId(`s2:triage:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', issue.title, {
        state: 'triage',
        priority: 'medium',
        assignee_id: null, // untriaged — no assignee
        source: issue.source,
        estimate: null, // no estimate yet
      }, {
        createdBy: issue.source === 'external' ? extraEngineer2.userId : engineer1.userId,
        createdAt: daysAgo(issue.daysOld),
        updatedAt: daysAgo(issue.daysOld), // untouched since creation
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.sprintOps, 'project');
    }

    console.log('   6 stale triage issues (4 external bugs, 2 internal features)');

    // Confounders
    // Fresh triage (too new to flag)
    const s2FreshId = demoId('s2:fresh-triage');
    await upsertDoc(pool, s2FreshId, workspaceId, 'issue', 'Bug: tooltip overlaps on mobile', {
      state: 'triage',
      priority: 'low',
      assignee_id: null,
      source: 'external',
    }, {
      createdBy: extraEngineer2.userId,
      createdAt: daysAgo(0), // just created today
      ticketNumber: nextTicket(),
    });
    await upsertAssociation(pool, s2FreshId, programId, 'program');
    await upsertAssociation(pool, s2FreshId, projectIds.sprintOps, 'project');

    // Already triaged (was in triage, now in todo)
    for (let i = 0; i < 3; i++) {
      const id = demoId(`s2:triaged:${i}`);
      await upsertDoc(pool, id, workspaceId, 'issue', ['Triaged: fix sidebar collapse', 'Triaged: add loading spinner', 'Triaged: update error messages'][i]!, {
        state: 'todo',
        priority: ['high', 'medium', 'low'][i],
        assignee_id: engineer1.userId,
        source: 'external',
        estimate: [4, 2, 1][i],
      }, {
        createdBy: extraEngineer2.userId,
        createdAt: daysAgo(5),
        updatedAt: daysAgo(1), // triaged recently
        ticketNumber: nextTicket(),
      });
      await upsertAssociation(pool, id, programId, 'program');
      await upsertAssociation(pool, id, projectIds.sprintOps, 'project');
    }

    console.log('   Confounders: 1 fresh triage (today), 3 already-triaged issues');

    // ══════════════════════════════════════════════════════════════════════
    // S5 (Tier 2): PROJECT RISK ASSESSMENT
    // ══════════════════════════════════════════════════════════════════════
    // Project with declining velocity, stale in-progress issues
    // Missing ownership and success criteria
    // Status says "on_track" but signals disagree
    //
    // Confounders:
    //   - A healthy project with increasing velocity
    //   - A project with stale issues but proper owner and criteria

    console.log('\n── S5: Project Risk Assessment ──');

    const s5ProjectId = demoId('s5:project');
    await upsertDoc(pool, s5ProjectId, workspaceId, 'project', 'Legacy Migration', {
      color: '#9CA3AF',
      emoji: '🏚️',
      // owner_id intentionally missing
      impact: 3,
      confidence: 2,
      ease: 1,
      plan: 'Migrate legacy systems to new architecture.',
      // success_criteria intentionally missing
      status: 'on_track', // status theater
    }, { createdBy: director.userId, createdAt: daysAgo(60) });
    await upsertAssociation(pool, s5ProjectId, programId, 'program');

    // 4 sprints with declining velocity (8 → 6 → 3 → ? current)
    const s5SprintVelocity = [
      { closed: 8, total: 10, offset: -3 },
      { closed: 6, total: 10, offset: -2 },
      { closed: 3, total: 10, offset: -1 },
      { closed: 0, total: 8, offset: 0 }, // current — nothing closed yet
    ];

    for (const sv of s5SprintVelocity) {
      const sprintNum = currentSprintNumber + sv.offset;
      const sprintId = await getOrCreateSprint(pool, workspaceId, programId, sprintNum, {
        // owner_id intentionally missing (matches project missing owner)
        project_id: s5ProjectId,
        plan: 'Continue migration work.',
        confidence: 40,
        status: sv.offset < 0 ? 'completed' : 'active',
        createdBy: director.userId,
        createdAt: daysAgo((0 - sv.offset) * 7 + 1),
      });
      await upsertAssociation(pool, sprintId, s5ProjectId, 'project');

      // Create issues for this sprint
      for (let i = 0; i < sv.total; i++) {
        const isDone = i < sv.closed;
        const isStaleInProgress = sv.offset === 0 && i >= sv.closed && i < sv.closed + 4;
        const id = demoId(`s5:issue:${sv.offset}:${i}`);
        await upsertDoc(pool, id, workspaceId, 'issue', `Migration task ${sprintNum}-${i + 1}`, {
          state: isDone ? 'done' : isStaleInProgress ? 'in_progress' : 'todo',
          priority: i < 3 ? 'high' : 'medium',
          assignee_id: [engineer1.userId, engineer2.userId, engineer3.userId][i % 3],
          source: 'internal',
          estimate: 4,
        }, {
          createdBy: director.userId,
          createdAt: daysAgo((0 - sv.offset) * 7 + 3),
          updatedAt: isStaleInProgress ? daysAgo(5) : (isDone ? daysAgo((0 - sv.offset) * 7 - 2) : NOW),
          ticketNumber: nextTicket(),
          startedAt: isStaleInProgress ? daysAgo(6) : (isDone ? daysAgo((0 - sv.offset) * 7) : undefined),
        });
        await upsertAssociation(pool, id, programId, 'program');
        await upsertAssociation(pool, id, s5ProjectId, 'project');
        await upsertAssociation(pool, id, sprintId, 'sprint');
      }
    }

    console.log('   Declining velocity: 8 → 6 → 3 → 0 closed/sprint');
    console.log('   4 stale in-progress, missing owner + success criteria, "on_track"');

    // Confounder: Healthy project with INCREASING velocity
    const s5HealthyProjectId = demoId('s5:healthy-project');
    await upsertDoc(pool, s5HealthyProjectId, workspaceId, 'project', 'New Dashboard', {
      color: '#22C55E',
      emoji: '📈',
      owner_id: pm.userId,
      impact: 5,
      confidence: 4,
      ease: 4,
      plan: 'Build new analytics dashboard.',
      success_criteria: 'Dashboard live for all users by end of month.',
      status: 'on_track', // this one is genuinely on track
    }, { createdBy: pm.userId, createdAt: daysAgo(30) });
    await upsertAssociation(pool, s5HealthyProjectId, programId, 'program');

    const s5HealthyVelocity = [
      { closed: 4, total: 5, offset: -2 },
      { closed: 6, total: 7, offset: -1 },
      { closed: 3, total: 8, offset: 0 }, // current — on pace
    ];

    for (const sv of s5HealthyVelocity) {
      const sprintNum = currentSprintNumber + sv.offset;
      const sprintId = await getOrCreateSprint(pool, workspaceId, programId, sprintNum, {
        owner_id: pm.userId,
        project_id: s5HealthyProjectId,
        plan: 'Dashboard feature development.',
        confidence: 85,
        status: sv.offset < 0 ? 'completed' : 'active',
        createdBy: pm.userId,
        createdAt: daysAgo((0 - sv.offset) * 7 + 1),
      });
      await upsertAssociation(pool, sprintId, s5HealthyProjectId, 'project');

      for (let i = 0; i < sv.total; i++) {
        const isDone = i < sv.closed;
        const id = demoId(`s5:healthy-issue:${sv.offset}:${i}`);
        await upsertDoc(pool, id, workspaceId, 'issue', `Dashboard feature ${sprintNum}-${i + 1}`, {
          state: isDone ? 'done' : (sv.offset === 0 && i === sv.closed ? 'in_progress' : 'todo'),
          priority: 'medium',
          assignee_id: [pm.userId, engineer1.userId][i % 2],
          source: 'internal',
          estimate: 4,
        }, {
          createdBy: pm.userId,
          createdAt: daysAgo((0 - sv.offset) * 7 + 2),
          updatedAt: isDone ? daysAgo((0 - sv.offset) * 7 - 1) : NOW,
          ticketNumber: nextTicket(),
        });
        await upsertAssociation(pool, id, programId, 'program');
        await upsertAssociation(pool, id, s5HealthyProjectId, 'project');
        await upsertAssociation(pool, id, sprintId, 'sprint');
      }
    }

    console.log('   Confounder: healthy project (velocity 4 → 6 → 3/8 on pace)');

    // ══════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════════════

    // Count what we created
    const counts = await pool.query(
      `SELECT document_type, COUNT(*) as cnt
       FROM documents d
       JOIN document_associations da ON da.document_id = d.id
         AND da.related_id = $1 AND da.relationship_type = 'program'
       WHERE d.workspace_id = $2
       GROUP BY document_type
       ORDER BY document_type`,
      [programId, workspaceId],
    );

    // Also count docs that aren't directly associated to program (standups, plans, retros)
    const standupCount = await pool.query(
      `SELECT COUNT(*) as cnt FROM documents
       WHERE workspace_id = $1 AND document_type = 'standup'
       AND id IN (SELECT document_id FROM document_associations WHERE related_id = ANY($2::uuid[]))`,
      [workspaceId, s3Sprints.map(s => s.id).concat([currentS3Sprint.id])],
    );

    // ── FleetGraph service API token ────────────────────────────────────────
    // FleetGraph's proactive mode authenticates to Ship via a service account
    // API token. On a fresh database this token doesn't exist, so all fetch
    // nodes fail silently. Create it idempotently with a deterministic hash.
    const FG_TOKEN = 'ship_e0bbaa6e7777a80520f7addb0926226c047e98c9777b4e1e24367b777e521e2f';
    const tokenHash = createHash('sha256').update(FG_TOKEN).digest('hex');
    const tokenPrefix = FG_TOKEN.slice(0, 12);
    const devUserId = users['dev@ship.local']?.userId;
    if (devUserId) {
      await pool.query(
        `INSERT INTO api_tokens (user_id, workspace_id, name, token_hash, token_prefix)
         VALUES ($1, $2, 'FleetGraph Service', $3, $4)
         ON CONFLICT (user_id, workspace_id, name) DO NOTHING`,
        [devUserId, workspaceId, tokenHash, tokenPrefix],
      );
      console.log('✅ FleetGraph service API token');
    } else {
      console.warn('⚠️  dev@ship.local not found — skipping FleetGraph API token');
    }

    console.log('\n🎉 FleetGraph demo seed complete!');
    console.log('\n   Documents by type:');
    for (const row of counts.rows) {
      console.log(`     ${row.document_type}: ${row.cnt}`);
    }
    console.log(`     standups: ${standupCount.rows[0]?.cnt ?? 0} (via sprint associations)`);

    console.log('\n   Scenario summary:');
    console.log('     S1: Sprint scope creep — 12 target + 13 confounders');
    console.log('     S2: Stale triage — 6 target + 4 confounders');
    console.log('     S3: Accountability debt — 4 people + 2 confounder people');
    console.log('     S4: Blocked chain — 3-link chain + 6 queue + 4 confounders');
    console.log('     S5: Project risk — declining project + healthy confounder');
    console.log('     S6: Smart next action — 5 target + 6 confounders');
    console.log('     S7: Retro patterns — 4 retros + 3 confounders');
  } catch (error) {
    console.error('❌ FleetGraph demo seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedFleetGraphDemos();
