import { readdir } from 'node:fs/promises';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const files = (await readdir(migrationDir))
  .filter(file => file.endsWith('.sql'))
  .sort();

// These duplicate versions existed in the historical migration ledger before
// this gate was introduced. Renaming an already-applied migration would create
// a different kind of release risk, so the exact file pairs are pinned here.
// Any added file, removed file, or new duplicate timestamp still fails.
const acknowledgedLegacyDuplicates = new Map([
  [
    '20260724220000',
    ['20260724220000_fee_item_notes.sql', '20260724220000_important_numbers_tabs.sql'],
  ],
  [
    '20260803180000',
    ['20260803180000_doc_library_editing.sql', '20260803180000_owners_clock_in_grandfather.sql'],
  ],
]);

const versions = new Map();
const invalid = [];
for (const file of files) {
  const match = /^(\d{14})_.+\.sql$/.exec(file);
  if (!match) {
    invalid.push(file);
    continue;
  }
  const version = match[1];
  const existing = versions.get(version) ?? [];
  existing.push(file);
  versions.set(version, existing);
}

const unexpectedDuplicates = [...versions.entries()].filter(([version, names]) => {
  if (names.length <= 1) return false;
  const acknowledged = acknowledgedLegacyDuplicates.get(version);
  return !acknowledged || names.join('\n') !== acknowledged.join('\n');
});

if (invalid.length || unexpectedDuplicates.length) {
  if (invalid.length) {
    console.error('Migration filenames must begin with a 14-digit timestamp:');
    for (const file of invalid) console.error(`- ${file}`);
  }
  if (unexpectedDuplicates.length) {
    console.error('Unexpected duplicate migration versions found:');
    for (const [version, names] of unexpectedDuplicates) {
      console.error(`- ${version}: ${names.join(', ')}`);
    }
  }
  process.exit(1);
}

console.log(`Migration filename check passed for ${files.length} migration(s).`);
