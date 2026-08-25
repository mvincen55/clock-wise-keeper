/**
 * PIN attestation primitive — the rules that make it trustworthy:
 *
 *  - the PIN is stored bcrypt-hashed (pgcrypto), never plaintext, and the
 *    hash column is not readable by app roles;
 *  - verification and lockout (org-configurable: 5 tries / 15 minutes by
 *    default) run server-side in a function only service_role may execute;
 *  - attestation rows have NO client write path — the attest edge function
 *    is the single writer;
 *  - the attest endpoint is JWT-gated in config.toml.
 *
 * Static checks read the migration/function sources so they run everywhere;
 * behavioral probes run against a live database when PGHOST is set (same
 * pattern as goal-events-rls.test.ts) and skip cleanly otherwise.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  attestFailureMessage,
  lockRemainingMinutes,
  validatePinInput,
} from '@/lib/attestation';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260825120000_pin_attestation.sql'),
  'utf8',
);
const configToml = readFileSync(resolve(__dirname, '../../supabase/config.toml'), 'utf8');
const attestFn = readFileSync(
  resolve(__dirname, '../../supabase/functions/attest/index.ts'),
  'utf8',
);

describe('PIN input validation', () => {
  it('accepts 4-8 digits only', () => {
    expect(validatePinInput('1234').ok).toBe(true);
    expect(validatePinInput('12345678').ok).toBe(true);
    expect(validatePinInput('123').ok).toBe(false);
    expect(validatePinInput('123456789').ok).toBe(false);
    expect(validatePinInput('12a4').ok).toBe(false);
    expect(validatePinInput('').ok).toBe(false);
  });
});

describe('failure copy', () => {
  const now = new Date('2026-08-25T12:00:00Z');

  it('tells the shared terminal what actually happened, factually', () => {
    expect(attestFailureMessage({ code: 'no_pin' }, now)).toContain('No sign-off PIN');
    expect(
      attestFailureMessage({ code: 'wrong_pin', attempts_remaining: 2 }, now),
    ).toContain('2 attempts left');
    expect(
      attestFailureMessage(
        { code: 'locked', locked_until: '2026-08-25T12:10:00Z' },
        now,
      ),
    ).toContain('10 minute');
  });

  it('lock countdown never goes negative and rounds up', () => {
    expect(lockRemainingMinutes('2026-08-25T11:00:00Z', now)).toBe(0);
    expect(lockRemainingMinutes('2026-08-25T12:00:30Z', now)).toBe(1);
    expect(lockRemainingMinutes(null, now)).toBe(0);
  });
});

describe('the migration locks the primitive down', () => {
  it('hashes with bcrypt via pgcrypto and never stores plaintext', () => {
    expect(migration).toContain("crypt(_pin, gen_salt('bf', 10))");
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    // No column ever holds the raw pin — only the hash.
    expect(migration).not.toMatch(/\bpin\s+text\b/);
    expect(migration).toContain('pin_hash text NOT NULL');
  });

  it('keeps the hash out of client reach: the SELECT grant omits pin_hash', () => {
    const grant = migration.match(/GRANT SELECT \(([^)]+)\)\s+ON public\.employee_pins/);
    expect(grant).toBeTruthy();
    expect(grant![1]).not.toContain('pin_hash');
    expect(migration).toContain('REVOKE ALL ON public.employee_pins FROM PUBLIC, anon, authenticated');
  });

  it('gives clients no write path on attestations — SELECT only', () => {
    expect(migration).toContain('REVOKE ALL ON public.attestations FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT SELECT ON public.attestations TO authenticated');
    // The only policy on attestations is the read policy.
    const policies = migration.match(/CREATE POLICY[^;]+ON public\.attestations[^;]+;/g) ?? [];
    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain('FOR SELECT');
  });

  it('enables RLS on both tables', () => {
    expect(migration).toContain('ALTER TABLE public.employee_pins ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY');
  });

  it('keeps the verifier private to service_role', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public._verify_employee_pin_internal(uuid, text)',
    );
    expect(migration).toMatch(
      /_verify_employee_pin_internal\(uuid, text\) TO service_role/,
    );
  });

  it('reads the org-configurable lockout with 5/15 defaults', () => {
    expect(migration).toContain('pin_lockout_attempts integer NOT NULL DEFAULT 5');
    expect(migration).toContain('pin_lockout_minutes integer NOT NULL DEFAULT 15');
    expect(migration).toMatch(/COALESCE\(\s*\(SELECT s\.pin_lockout_attempts/);
    expect(migration).toMatch(/COALESCE\(\s*\(SELECT s\.pin_lockout_minutes/);
  });

  it('lets an admin set anyone in-org and a member set only their own', () => {
    expect(migration).toContain('public.is_org_admin(emp.org_id)');
    expect(migration).toContain('emp.user_id <> auth.uid()');
  });

  it('tenant-scopes both tables with the composite employees FK', () => {
    const composites = migration.match(
      /REFERENCES public\.employees\(id, org_id\) ON DELETE CASCADE/g,
    );
    expect(composites?.length).toBe(2);
  });
});

describe('the attest edge function', () => {
  it('is JWT-gated in config.toml', () => {
    expect(configToml).toMatch(/\[functions\.attest\]\s*\n\s*verify_jwt = true/);
  });

  it('derives the org from the caller membership, never the client body', () => {
    expect(attestFn).toContain("from(\"org_members\")");
    expect(attestFn).not.toContain('body.org_id');
  });

  it('verifies through the private RPC and writes the attestation itself', () => {
    expect(attestFn).toContain('_verify_employee_pin_internal');
    expect(attestFn).toContain('from("attestations")');
    expect(attestFn).toContain('verified: true');
  });

  it('never logs the PIN', () => {
    // Every console call in the function must avoid the pin variable.
    const logs = attestFn.match(/console\.\w+\([^)]*\)/g) ?? [];
    for (const line of logs) expect(line).not.toMatch(/\bpin\b/);
  });
});

// ---------------------------------------------------------------------------
// Live-database probes (skip cleanly without PGHOST).
// ---------------------------------------------------------------------------

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

describe.runIf(hasPsql)('live database: privileges', () => {
  it('client roles cannot insert, update, or delete attestations', () => {
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(
        q(`select has_table_privilege('authenticated', 'public.attestations', '${priv}')`),
      ).toBe('f');
      expect(
        q(`select has_table_privilege('anon', 'public.attestations', '${priv}')`),
      ).toBe('f');
    }
  });

  it('client roles cannot read or write pin hashes', () => {
    expect(
      q(`select has_column_privilege('authenticated', 'public.employee_pins', 'pin_hash', 'SELECT')`),
    ).toBe('f');
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(
        q(`select has_table_privilege('authenticated', 'public.employee_pins', '${priv}')`),
      ).toBe('f');
    }
  });

  it('app roles cannot execute the private verifier', () => {
    expect(
      q(`select has_function_privilege('authenticated', 'public._verify_employee_pin_internal(uuid, text)', 'EXECUTE')`),
    ).toBe('f');
    expect(
      q(`select has_function_privilege('anon', 'public._verify_employee_pin_internal(uuid, text)', 'EXECUTE')`),
    ).toBe('f');
  });

  it('RLS is on for both tables', () => {
    expect(q(`select relrowsecurity from pg_class where relname = 'attestations'`)).toBe('t');
    expect(q(`select relrowsecurity from pg_class where relname = 'employee_pins'`)).toBe('t');
  });
});

describe.runIf(hasPsql)('live database: verification behavior', () => {
  // One transaction, rolled back: fixtures never persist. Each SELECT emits
  // a row we assert on, in order.
  it('wrong PIN counts down, locks at the limit, rejects while locked, accepts when right', () => {
    const script = `
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('9a000000-0000-4000-8000-0000000000aa', 'pin-probe@example.test');
INSERT INTO public.orgs (id, name, created_by) VALUES ('9f000000-0000-4000-8000-0000000000ff', 'Pin Probe Org', '9a000000-0000-4000-8000-0000000000aa');
INSERT INTO public.employees (id, org_id, display_name) VALUES ('9e000000-0000-4000-8000-0000000000ee', '9f000000-0000-4000-8000-0000000000ff', 'Pin Probe');
INSERT INTO public.org_practice_settings (org_id, pin_lockout_attempts, pin_lockout_minutes) VALUES ('9f000000-0000-4000-8000-0000000000ff', 3, 15);
SELECT public.set_employee_pin('9e000000-0000-4000-8000-0000000000ee', '4321');
SELECT public._verify_employee_pin_internal('9e000000-0000-4000-8000-0000000000ee', '0000')->>'status';
SELECT public._verify_employee_pin_internal('9e000000-0000-4000-8000-0000000000ee', '0000')->>'status';
SELECT public._verify_employee_pin_internal('9e000000-0000-4000-8000-0000000000ee', '0000')->>'status';
SELECT public._verify_employee_pin_internal('9e000000-0000-4000-8000-0000000000ee', '4321')->>'status';
UPDATE public.employee_pins SET locked_until = NULL, failed_attempts = 0 WHERE employee_id = '9e000000-0000-4000-8000-0000000000ee';
SELECT public._verify_employee_pin_internal('9e000000-0000-4000-8000-0000000000ee', '4321')->>'status';
SELECT public._verify_employee_pin_internal('00000000-0000-4000-8000-000000000000', '4321')->>'status';
ROLLBACK;`;
    const out = execFileSync('psql', ['-At', '-v', 'ON_ERROR_STOP=1', '-c', script], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    // set_employee_pin returns one empty row; skip non-status lines.
    const statuses = out.filter(line =>
      ['ok', 'wrong', 'locked', 'no_pin'].includes(line),
    );
    expect(statuses).toEqual([
      'wrong', // 1st wrong (limit 3)
      'wrong', // 2nd wrong
      'locked', // 3rd wrong trips the lock
      'locked', // even the CORRECT pin is refused while locked
      'ok', // after the lock clears, the correct pin verifies
      'no_pin', // unknown employee has no pin row
    ]);
  });
});
