/**
 * Creates a Ship API token for FleetGraph's proactive mode.
 * Idempotent — reuses existing token if name matches.
 *
 * Usage: npx tsx scripts/create-fg-token.ts
 * Reads DATABASE_URL from api/.env.local
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

// Load api/.env.local
const envPath = resolve(import.meta.dirname ?? '.', '../api/.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match && !process.env[match[1]!]) {
      process.env[match[1]!] = match[2]!;
    }
  }
} catch {
  // fall through — DATABASE_URL may already be set
}

const TOKEN_NAME = 'fleetgraph-agent';

async function main() {
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
  });

  try {
    // Find the dev user and workspace
    const userResult = await pool.query(
      `SELECT u.id AS user_id, wm.workspace_id
       FROM users u
       JOIN workspace_memberships wm ON wm.user_id = u.id
       WHERE u.email = 'dev@ship.local'
       LIMIT 1`,
    );

    if (userResult.rows.length === 0) {
      console.error('No dev@ship.local user found. Run pnpm db:seed first.');
      process.exit(1);
    }

    const { user_id, workspace_id } = userResult.rows[0];

    // Check for existing active token
    const existing = await pool.query(
      `SELECT token_prefix FROM api_tokens
       WHERE user_id = $1 AND workspace_id = $2 AND name = $3 AND revoked_at IS NULL`,
      [user_id, workspace_id, TOKEN_NAME],
    );

    if (existing.rows.length > 0) {
      console.log(`Token "${TOKEN_NAME}" already exists (prefix: ${existing.rows[0].token_prefix}).`);
      console.log('Cannot recover the full token — revoke and recreate if needed.');
      console.log('\nTo recreate, run:');
      console.log('  npx tsx scripts/create-fg-token.ts --force');

      if (process.argv.includes('--force')) {
        await pool.query(
          `UPDATE api_tokens SET revoked_at = NOW()
           WHERE user_id = $1 AND workspace_id = $2 AND name = $3 AND revoked_at IS NULL`,
          [user_id, workspace_id, TOKEN_NAME],
        );
        console.log('\nRevoked existing token. Creating new one...');
      } else {
        process.exit(0);
      }
    }

    // Generate token
    const randomBytes = crypto.randomBytes(32).toString('hex');
    const token = `ship_${randomBytes}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenPrefix = token.substring(0, 12);

    await pool.query(
      `INSERT INTO api_tokens (user_id, workspace_id, name, token_hash, token_prefix)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, workspace_id, TOKEN_NAME, tokenHash, tokenPrefix],
    );

    console.log(`\nCreated API token "${TOKEN_NAME}" for dev@ship.local`);
    console.log(`\nSHIP_API_TOKEN=${token}\n`);
    console.log('Add this to fleetgraph/.env (or export it) before running scenarios.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
