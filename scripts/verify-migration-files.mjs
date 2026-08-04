import { readdir } from 'node:fs/promises';
import path from 'node:path';

const migrationDir = path.resolve('supabase/migrations');
const files = (await readdir(migrationDir))
  .filter(file => file.endsWith('.sql'))
  .sort();

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

const duplicates = [...versions.entries()].filter(([, names]) => names.length > 1);

if (invalid.length || duplicates.length) {
  if (invalid.length) {
    console.error('Migration filenames must begin with a 14-digit timestamp:');
    for (const file of invalid) console.error(`- ${file}`);
  }
  if (duplicates.length) {
    console.error('Duplicate migration versions found:');
    for (const [version, names] of duplicates) {
      console.error(`- ${version}: ${names.join(', ')}`);
    }
  }
  process.exit(1);
}

console.log(`Migration filename check passed for ${files.length} migration(s).`);
