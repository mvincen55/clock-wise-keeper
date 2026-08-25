/**
 * Onboarding instances + dual sign-off (Phase 3) — the rules pinned:
 *
 *  - SNAPSHOT IMMUTABILITY: instance rows are copies (INSERT … SELECT of
 *    values) and clients hold SELECT only — no update path exists for a
 *    browser to rewrite history;
 *  - BOTH-SIGNATURES: an item is complete only when trainer AND trainee
 *    slots are signed; completed_at is stamped only in that case;
 *  - the PIN applier decides the SIDE server-side from who attested — the
 *    instance's employee is the trainee, anyone else the trainer;
 *  - the initials fallback works ONLY while require_pin_on_signoff is off,
 *    and such rows carry no attestation reference (labeled unverified).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isItemComplete,
  isItemFullyVerified,
  progressOf,
  slotLabel,
  toSignoffState,
  validateFallbackInitials,
} from '@/lib/onboarding-signoff';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260825140000_onboarding_instances.sql'),
  'utf8',
);
const attestFn = readFileSync(
  resolve(__dirname, '../../supabase/functions/attest/index.ts'),
  'utf8',
);

const unsignedRow = {
  trainer_initials: '',
  trainer_signed_at: null,
  trainer_attestation_id: null,
  trainee_initials: '',
  trainee_signed_at: null,
  trainee_attestation_id: null,
};

describe('both-signatures rule', () => {
  it('one signature is progress, never completion', () => {
    const trainerOnly = toSignoffState({
      ...unsignedRow,
      trainer_initials: 'MGR',
      trainer_signed_at: '2026-08-25T12:00:00Z',
      trainer_attestation_id: 'a1',
    });
    expect(isItemComplete(trainerOnly)).toBe(false);

    const traineeOnly = toSignoffState({
      ...unsignedRow,
      trainee_initials: 'NEW',
      trainee_signed_at: '2026-08-25T12:00:00Z',
      trainee_attestation_id: 'a2',
    });
    expect(isItemComplete(traineeOnly)).toBe(false);
  });

  it('both signatures complete the item — in either order', () => {
    const both = toSignoffState({
      trainer_initials: 'MGR',
      trainer_signed_at: '2026-08-25T12:05:00Z',
      trainer_attestation_id: 'a1',
      trainee_initials: 'NEW',
      trainee_signed_at: '2026-08-25T12:01:00Z',
      trainee_attestation_id: 'a2',
    });
    expect(isItemComplete(both)).toBe(true);
    expect(isItemFullyVerified(both)).toBe(true);
    expect(progressOf([both, toSignoffState(unsignedRow)])).toEqual({
      total: 2,
      complete: 1,
    });
  });

  it('the SQL stamps completed_at only when the OTHER side is already signed', () => {
    const stamps = migration.match(
      /completed_at = CASE WHEN (trainer|trainee)_signed_at IS NOT NULL THEN [^E]+ELSE NULL END/g,
    );
    expect(stamps?.length).toBeGreaterThanOrEqual(4); // both RPC sides + both applier sides
  });
});

describe('unverified fallback labeling', () => {
  it('a signature without an attestation reference is always unverified', () => {
    const fallbackSigned = toSignoffState({
      ...unsignedRow,
      trainee_initials: 'NEW',
      trainee_signed_at: '2026-08-25T12:00:00Z',
      trainee_attestation_id: null,
    });
    expect(slotLabel(fallbackSigned.trainee)).toBe('unverified');
    expect(isItemFullyVerified(fallbackSigned)).toBe(false);
  });

  it('unsigned and verified are the other two states', () => {
    expect(slotLabel(toSignoffState(unsignedRow).trainer)).toBe('unsigned');
    const verified = toSignoffState({
      ...unsignedRow,
      trainer_initials: 'MGR',
      trainer_signed_at: '2026-08-25T12:00:00Z',
      trainer_attestation_id: 'a1',
    });
    expect(slotLabel(verified.trainer)).toBe('verified');
  });

  it('fallback initials mirror the SQL rule (2-8 letters or digits)', () => {
    expect(validateFallbackInitials('mv').ok).toBe(true);
    expect(validateFallbackInitials('MEGV').ok).toBe(true);
    expect(validateFallbackInitials('m').ok).toBe(false);
    expect(validateFallbackInitials('TOOLONGXX').ok).toBe(false);
    expect(validateFallbackInitials('a b').ok).toBe(false);
  });

  it('the fallback RPC refuses while the office requires PINs, and never writes attestation ids', () => {
    expect(migration).toMatch(/require_pin[\s\S]*?RAISE EXCEPTION 'This office requires PIN-verified sign-offs'/);
    const fallbackBody = migration.slice(
      migration.indexOf('record_onboarding_signoff_fallback'),
      migration.indexOf('_apply_onboarding_signoff_internal'),
    );
    expect(fallbackBody).not.toContain('attestation_id =');
  });
});

describe('snapshot immutability', () => {
  it('clients hold SELECT only on instances and items', () => {
    expect(migration).toContain(
      'REVOKE ALL ON public.onboarding_instances FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain(
      'REVOKE ALL ON public.onboarding_instance_items FROM PUBLIC, anon, authenticated',
    );
    expect(migration).toContain('GRANT SELECT ON public.onboarding_instances TO authenticated');
    expect(migration).toContain(
      'GRANT SELECT ON public.onboarding_instance_items TO authenticated',
    );
    // The only policies are read policies.
    const policies =
      migration.match(/CREATE POLICY[^;]+ON public\.onboarding_instance(s|_items)[^;]+;/g) ?? [];
    expect(policies.length).toBe(2);
    for (const p of policies) expect(p).toContain('FOR SELECT');
  });

  it('the start RPC copies template VALUES, never references', () => {
    expect(migration).toMatch(
      /INSERT INTO public\.onboarding_instance_items[\s\S]*?SELECT[\s\S]*?FROM public\.onboarding_template_items/,
    );
    // Snapshot columns are plain text copies on the instance too.
    expect(migration).toContain('template_name text NOT NULL');
    expect(migration).toMatch(/tpl\.name, tpl\.role_label/);
  });

  it('start is gated on can_manage_onboarding and an active template with items', () => {
    expect(migration).toMatch(/start_onboarding_instance[\s\S]*?can_manage_onboarding/);
    expect(migration).toContain("RAISE EXCEPTION 'This template is inactive'");
    expect(migration).toContain("RAISE EXCEPTION 'This template has no items yet'");
    expect(migration).toContain(
      "RAISE EXCEPTION 'An onboarding from this template is already underway for this employee'",
    );
  });
});

describe('the PIN sign-off applier', () => {
  it('is registered in the attest function for onboarding_item_signoff', () => {
    expect(attestFn).toContain('onboarding_item_signoff');
    expect(attestFn).toContain('_apply_onboarding_signoff_internal');
  });

  it('decides trainer vs trainee from WHO attested, server-side', () => {
    expect(migration).toMatch(/IF att\.employee_id = inst\.employee_id THEN[\s\S]*?'trainee'/);
    expect(migration).toMatch(/ELSE[\s\S]*?'trainer'/);
  });

  it('is service_role only, like the PIN verifier', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public._apply_onboarding_signoff_internal(uuid)',
    );
    expect(migration).toMatch(/_apply_onboarding_signoff_internal\(uuid\) TO service_role/);
  });

  it('refuses double-signing either side', () => {
    expect(migration).toContain("'The trainer side is already signed'");
    expect(migration).toContain("'The new hire side is already signed'");
  });
});

// ---------------------------------------------------------------------------
// Live-database probes (skip cleanly without PGHOST).
// ---------------------------------------------------------------------------

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

describe.runIf(hasPsql)('live database: instance rows are read-only to clients', () => {
  it('RLS is on and per-role write privileges do not exist', () => {
    for (const table of ['onboarding_instances', 'onboarding_instance_items']) {
      expect(q(`select relrowsecurity from pg_class where relname = '${table}'`)).toBe('t');
      for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
        expect(
          q(`select has_table_privilege('authenticated', 'public.${table}', '${priv}')`),
        ).toBe('f');
        expect(q(`select has_table_privilege('anon', 'public.${table}', '${priv}')`)).toBe('f');
      }
    }
  });

  it('the applier and start functions exist with the right privileges', () => {
    expect(
      q(`select has_function_privilege('authenticated', 'public._apply_onboarding_signoff_internal(uuid)', 'EXECUTE')`),
    ).toBe('f');
    expect(
      q(`select has_function_privilege('authenticated', 'public.start_onboarding_instance(uuid, uuid)', 'EXECUTE')`),
    ).toBe('t');
  });
});

describe.runIf(hasPsql)('live database: dual sign-off end to end', () => {
  const ORG = '7f000000-0000-4000-8000-00000000007f';
  const TRAINER = '7e100000-0000-4000-8000-000000000071';
  const HIRE = '7e200000-0000-4000-8000-000000000072';
  const TPL = '70000000-0000-4000-8000-00000000007e';
  const SECTION = '75000000-0000-4000-8000-000000000075';

  it('snapshot, order-agnostic PIN sign-offs, and completion only when both signed', () => {
    const script = `
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('7a000000-0000-4000-8000-00000000007a', 'onb-probe@example.test');
INSERT INTO public.orgs (id, name, created_by) VALUES ('${ORG}', 'Onb Probe Org', '7a000000-0000-4000-8000-00000000007a');
INSERT INTO public.employees (id, org_id, display_name, tag) VALUES
  ('${TRAINER}', '${ORG}', 'Trainer Probe', 'TRN'),
  ('${HIRE}', '${ORG}', 'Hire Probe', 'NEW');
INSERT INTO public.onboarding_templates (id, org_id, name, role_label) VALUES
  ('${TPL}', '${ORG}', 'Probe Template', 'Front Desk');
INSERT INTO public.onboarding_template_sections (id, org_id, template_id, title, sort_order) VALUES
  ('${SECTION}', '${ORG}', '${TPL}', 'Basics', 0);
INSERT INTO public.onboarding_template_items (org_id, template_id, section_id, title, detail, sort_order) VALUES
  ('${ORG}', '${TPL}', '${SECTION}', 'Answer the phone the office way', '', 0),
  ('${ORG}', '${TPL}', '${SECTION}', 'Greet and check in a patient', '', 1);
DO $probe$
DECLARE
  v_instance uuid;
  v_item uuid;
  v_att1 uuid;
  v_att2 uuid;
  r jsonb;
BEGIN
  v_instance := public.start_onboarding_instance('${HIRE}', '${TPL}');
  IF (SELECT count(*) FROM public.onboarding_instance_items WHERE instance_id = v_instance) <> 2 THEN
    RAISE EXCEPTION 'E2E FAILED: snapshot did not copy both items';
  END IF;
  SELECT id INTO v_item FROM public.onboarding_instance_items
   WHERE instance_id = v_instance ORDER BY section_sort, sort_order LIMIT 1;

  PERFORM public.set_employee_pin('${TRAINER}', '1111');
  PERFORM public.set_employee_pin('${HIRE}', '2222');

  r := public._verify_employee_pin_internal('${TRAINER}', '1111');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'E2E FAILED: trainer pin %', r; END IF;
  INSERT INTO public.attestations (org_id, employee_id, action_type, related_table, related_id)
  VALUES ('${ORG}', '${TRAINER}', 'onboarding_item_signoff', 'onboarding_instance_items', v_item)
  RETURNING id INTO v_att1;
  r := public._apply_onboarding_signoff_internal(v_att1);
  IF NOT (r->>'applied')::boolean OR r->>'side' <> 'trainer' THEN
    RAISE EXCEPTION 'E2E FAILED: trainer apply %', r;
  END IF;

  PERFORM 1 FROM public.onboarding_instance_items WHERE id = v_item AND completed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'E2E FAILED: complete with one signature'; END IF;

  r := public._verify_employee_pin_internal('${HIRE}', '2222');
  IF r->>'status' <> 'ok' THEN RAISE EXCEPTION 'E2E FAILED: hire pin %', r; END IF;
  INSERT INTO public.attestations (org_id, employee_id, action_type, related_table, related_id)
  VALUES ('${ORG}', '${HIRE}', 'onboarding_item_signoff', 'onboarding_instance_items', v_item)
  RETURNING id INTO v_att2;
  r := public._apply_onboarding_signoff_internal(v_att2);
  IF NOT (r->>'applied')::boolean OR r->>'side' <> 'trainee' THEN
    RAISE EXCEPTION 'E2E FAILED: trainee apply %', r;
  END IF;

  PERFORM 1 FROM public.onboarding_instance_items
   WHERE id = v_item AND completed_at IS NOT NULL
     AND trainer_attestation_id = v_att1 AND trainee_attestation_id = v_att2
     AND trainer_initials = 'TRN' AND trainee_initials = 'NEW';
  IF NOT FOUND THEN RAISE EXCEPTION 'E2E FAILED: completion stamp wrong'; END IF;
END
$probe$;
SELECT 'e2e ok';
ROLLBACK;`;
    const out = execFileSync('psql', ['-qAt', '-v', 'ON_ERROR_STOP=1', '-c', script], {
      encoding: 'utf8',
    }).trim();
    expect(out.split('\n').filter(Boolean).pop()).toBe('e2e ok');
  });
});
