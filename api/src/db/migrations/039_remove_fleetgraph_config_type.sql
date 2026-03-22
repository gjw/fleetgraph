-- Remove unused fleetgraph_config enum value (fg-1e3).
-- Config is handled via env vars; the enum value was never used by any row.
-- Postgres doesn't support ALTER TYPE ... DROP VALUE, so we swap the enum.

BEGIN;

-- 1. Rename old enum
ALTER TYPE document_type RENAME TO document_type_old;

-- 2. Create new enum without fleetgraph_config
CREATE TYPE document_type AS ENUM (
  'wiki', 'issue', 'program', 'project', 'sprint', 'person',
  'weekly_plan', 'weekly_retro', 'standup', 'weekly_review',
  'fleetgraph_finding'
);

-- 3. Swap the column
ALTER TABLE documents
  ALTER COLUMN document_type TYPE document_type
  USING document_type::text::document_type;

-- 4. Re-apply the default
ALTER TABLE documents
  ALTER COLUMN document_type SET DEFAULT 'wiki';

-- 5. Drop old enum
DROP TYPE document_type_old;

COMMIT;
