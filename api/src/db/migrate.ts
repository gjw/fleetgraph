#!/usr/bin/env npx ts-node
/**
 * Database migration script
 * 1. Runs schema.sql for initial table setup
 * 2. Runs numbered migration files from migrations/ folder
 * 3. Tracks completed migrations in schema_migrations table
 */
import { config } from 'dotenv';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { loadProductionSecrets } from '../config/ssm.js';

// Load .env.local for local development
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  await loadProductionSecrets();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Running database migrations...');

    // Step 1: Run schema.sql for initial setup
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    let freshDatabase = false;
    try {
      await pool.query(schema);
      console.log('✅ Schema applied (fresh database)');
      freshDatabase = true;
    } catch (schemaErr) {
      const msg = schemaErr instanceof Error ? schemaErr.message : String(schemaErr);
      if (msg.includes('already exists')) {
        console.log('Database schema already exists, continuing with migrations...');
      } else {
        throw schemaErr;
      }
    }

    // Step 2: Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Step 3: Find migration files
    const migrationsDir = join(__dirname, 'migrations');
    let migrationFiles: string[] = [];

    try {
      migrationFiles = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Ensures numeric order: 001_, 002_, etc.
    } catch {
      console.log('ℹ️  No migrations directory found');
    }

    // Step 4: On fresh database, schema.sql already incorporates all migrations.
    // Mark them all as applied so they don't re-run and conflict.
    if (freshDatabase && migrationFiles.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const file of migrationFiles) {
          const version = file.replace('.sql', '');
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
            [version],
          );
        }
        await client.query('COMMIT');
        console.log(`✅ Fresh database — marked ${migrationFiles.length} migrations as applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return;
    }

    // Step 5: Get list of already-applied migrations
    const appliedResult = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedMigrations = new Set(appliedResult.rows.map(r => r.version));

    // Step 6: Run pending migrations
    let migrationsRun = 0;
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');

      if (appliedMigrations.has(version)) {
        continue; // Already applied
      }

      console.log(`  Running migration: ${file}`);
      const migrationPath = join(migrationsDir, file);
      const migrationSql = readFileSync(migrationPath, 'utf-8');

      // Run migration in a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migrationSql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        console.log(`  ✅ ${file} applied`);
        migrationsRun++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (migrationsRun === 0) {
      console.log('✅ All migrations already applied');
    } else {
      console.log(`✅ ${migrationsRun} migration(s) applied successfully`);
    }

  } catch (error) {
    console.error('Database migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
