/**
 * Repository-level guard for the public early-access inquiry backend.
 *
 * The `submit-lead` function and the `marketing_leads` migration were once
 * dropped from the repository while remaining deployed, which silently broke
 * clean database replay. These assertions fail if that drift happens again,
 * and they pin the security properties the public security page claims.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const FN = join(ROOT, 'supabase', 'functions', 'submit-lead', 'index.ts');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const migrationFile = readdirSync(MIGRATIONS).find((f) => /marketing_leads/i.test(readFileSync(join(MIGRATIONS, f), 'utf8')));

describe('submit-lead source is present at HEAD', () => {
  it('keeps the edge function in the repository', () => {
    expect(existsSync(FN)).toBe(true);
  });

  const src = existsSync(FN) ? readFileSync(FN, 'utf8') : '';

  it('writes with the service role only', () => {
    expect(src).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('validates name and email before inserting', () => {
    expect(src).toContain('fieldErrors.email');
    expect(src).toContain('fieldErrors.name');
  });

  it('keeps the honeypot field and discards bot submissions quietly', () => {
    expect(src).toMatch(/body\.company_website/);
  });

  it('rate limits per IP and per email', () => {
    expect(src).toContain('MAX_PER_IP_PER_HOUR');
    expect(src).toContain('MAX_PER_EMAIL_PER_DAY');
  });

  it('stores a hash of the IP rather than the address', () => {
    expect(src).toContain('SHA-256');
    expect(src).toContain('ip_hash');
  });

  it('sends notifications only to a configured destination', () => {
    expect(src).toContain("Deno.env.get('LEAD_NOTIFICATION_EMAIL')");
    expect(src).not.toMatch(/@purpleenvelope\.app'\s*,?\s*$/m);
  });

  it('escapes user text in the notification body', () => {
    expect(src).toContain('escapeHtml(');
  });
});

describe('marketing_leads migration source is present at HEAD', () => {
  it('exists in the migration chain', () => {
    expect(migrationFile).toBeDefined();
  });

  const sql = migrationFile ? readFileSync(join(MIGRATIONS, migrationFile), 'utf8') : '';

  it('enables row-level security', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it('grants nothing to anon or authenticated', () => {
    const withoutComments = sql.replace(/--[^\n]*/g, '');
    const grants = withoutComments.match(/GRANT[^;]+;/gi) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g).not.toMatch(/\banon\b/i);
      expect(g).not.toMatch(/\bauthenticated\b/i);
    }
  });

  it('restricts its policy to the service role', () => {
    expect(sql).toMatch(/CREATE POLICY[\s\S]*TO service_role/i);
  });

  it('indexes the rate-limit lookups', () => {
    expect(sql).toMatch(/ip_hash, created_at/i);
    expect(sql).toMatch(/lower\(email\), created_at/i);
  });
});

describe('the public form payload matches the function contract', () => {
  const start = readFileSync(join(ROOT, 'src', 'pages', 'marketing', 'Start.tsx'), 'utf8');

  it('posts the honeypot under the field name the function reads', () => {
    expect(start).toContain('company_website:');
  });

  it('posts the validated fields the function expects', () => {
    for (const field of ['name', 'email', 'practice_name', 'role', 'office_size', 'note']) {
      expect(start).toMatch(new RegExp(`${field}[,:]`));
    }
  });
});
