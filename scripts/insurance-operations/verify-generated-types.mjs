import { readFileSync } from 'node:fs';
// Compare only this additive feature's database surface; do not rewrite unrelated
// generated types. Supabase emits ordinary nested TypeScript type literals.
const generated = readFileSync(process.argv[2], 'utf8');
const checked = readFileSync('src/integrations/supabase/types.ts', 'utf8');
function block(text, key) {
  const match = new RegExp(`\\b${key}:\\s*\\{`).exec(text);
  if (!match) throw new Error(`Missing type ${key}`);
  const start = text.indexOf('{', match.index);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(start + 1, i);
  }
  throw new Error(`Unclosed type ${key}`);
}
function fields(text) {
  return [...text.matchAll(/(\w+)(\?)?\s*:\s*([^;\n]+)/g)]
    .map((m) => `${m[1]}${m[2] ?? ''}:${m[3].replace(/[\s"']/g, '')}`)
    .sort()
    .join('|');
}
for (const table of [
  'insurance_operation_settings',
  'insurance_plan_versions',
]) {
  for (const shape of ['Row', 'Insert', 'Update']) {
    if (
      fields(block(block(generated, table), shape)) !==
      fields(block(block(checked, table), shape))
    )
      throw new Error(
        `${table}.${shape} differs from fresh Supabase generation`,
      );
  }
}
for (const rpc of ['insurance_save_settings', 'insurance_publish_plan']) {
  if (
    fields(block(block(generated, rpc), 'Args')) !==
    fields(block(block(checked, rpc), 'Args'))
  )
    throw new Error(`${rpc}.Args differs from fresh Supabase generation`);
  for (const source of [generated, checked])
    if (!/Returns:\s*Json\b/.test(block(source, rpc)))
      throw new Error(`${rpc} return type differs`);
}
console.log(
  'Insurance table and RPC types match fresh local Supabase generation.',
);
