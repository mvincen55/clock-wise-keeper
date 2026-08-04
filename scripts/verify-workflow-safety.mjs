import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workflowDir = path.resolve('.github/workflows');
const files = (await readdir(workflowDir))
  .filter(file => /\.ya?ml$/i.test(file))
  .sort();

const forbidden = [
  {
    label: 'repository contents write permission',
    pattern: /contents\s*:\s*write/i,
  },
  {
    label: 'git push from CI',
    pattern: /\bgit\s+push\b/i,
  },
  {
    label: 'direct GitHub ref mutation from CI',
    pattern: /\bgh\s+api\b[^\n]*(?:git\/refs|contents\/)/i,
  },
];

const violations = [];
for (const file of files) {
  const source = await readFile(path.join(workflowDir, file), 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      violations.push(`${file}: ${rule.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Self-modifying or repository-writing CI is prohibited:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Workflow safety passed for ${files.length} workflow file(s).`);
