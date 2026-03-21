/**
 * One-off backfill: add program context to existing sprint-type findings.
 *
 * Updates both `affected_entity_name` (property) and document `title`
 * so that sprint findings like "Week 14" become "Week 14 (ProgramName)".
 *
 * Usage: npx tsx fleetgraph/src/cli/backfill-sprint-names.ts
 */
import { loadConfig } from '../config.js';
import { ShipClient } from '../ship/client.js';
import type { ShipProgram } from '../ship/types.js';

async function main() {
  const config = loadConfig();
  const client = ShipClient.withToken(config.shipApiUrl, config.shipApiToken);

  // Fetch all finding documents
  const docsResult = await client.getDocuments({ type: 'fleetgraph_finding' });
  if (docsResult.error) {
    console.error('Failed to fetch findings:', docsResult.error.message);
    process.exit(1);
  }

  const findings = docsResult.data;
  const sprintFindings = findings.filter(
    (f) => (f.properties as Record<string, unknown>)?.affected_entity_type === 'sprint',
  );

  console.log(`Found ${findings.length} total findings, ${sprintFindings.length} sprint-type`);

  if (sprintFindings.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // Fetch all programs for name lookup
  const programsResult = await client.getPrograms();
  if (programsResult.error) {
    console.error('Failed to fetch programs:', programsResult.error.message);
    process.exit(1);
  }
  const programMap = new Map<string, ShipProgram>(
    programsResult.data.map((p) => [p.id, p]),
  );

  // Cache sprint → program name lookups
  const sprintProgramName = new Map<string, string | null>();

  let updated = 0;
  let skipped = 0;

  for (const finding of sprintFindings) {
    const props = finding.properties as Record<string, unknown>;
    const entityId = props.affected_entity_id as string;
    const currentEntityName = (props.affected_entity_name as string) ?? '';

    // Resolve program name for this sprint (cached)
    if (!sprintProgramName.has(entityId)) {
      const sprintResult = await client.getSprint(entityId);
      if (sprintResult.error) {
        console.warn(`  Could not fetch sprint ${entityId}: ${sprintResult.error.message}`);
        sprintProgramName.set(entityId, null);
      } else {
        const sprint = sprintResult.data;
        const programName = sprint.program_name
          ?? (sprint.program_id ? programMap.get(sprint.program_id)?.name : undefined)
          ?? null;
        sprintProgramName.set(entityId, programName);
      }
    }

    const programName = sprintProgramName.get(entityId);
    if (!programName) {
      console.log(`  ${finding.id}: no program context available — skip`);
      skipped++;
      continue;
    }

    // Check if already disambiguated
    if (currentEntityName.includes(programName)) {
      console.log(`  ${finding.id}: already disambiguated — skip`);
      skipped++;
      continue;
    }

    // Build updated values
    const newEntityName = currentEntityName
      ? `${currentEntityName} (${programName})`
      : programName;
    const newTitle = finding.title.includes(programName)
      ? finding.title
      : `${finding.title} (${programName})`;

    const updateResult = await client.updateDocument(finding.id, {
      title: newTitle,
      properties: {
        ...props,
        affected_entity_name: newEntityName,
      },
    });

    if (updateResult.error) {
      console.error(`  ${finding.id}: update failed — ${updateResult.error.message}`);
      continue;
    }

    console.log(`  ${finding.id}: "${finding.title}" → "${newTitle}"`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
