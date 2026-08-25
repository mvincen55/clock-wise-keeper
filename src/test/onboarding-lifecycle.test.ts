/**
 * Onboarding lifecycle (Phase 4) — connecting to machinery that already
 * exists, never inventing parallel machinery. Rules pinned:
 *
 *  - the stale rule is an escalation_policies kind ('onboarding_stale'),
 *    org-configurable and member-visible like every other policy;
 *  - the trigger creates ONE factual manager-checklist task per instance
 *    (idempotent), standard never-threatening tone;
 *  - instance creation schedules review tasks at the org-configurable day
 *    marks (defaults 7/30/60/90) on the manager checklist;
 *  - completion = every item dual-signed AND every scheduled review checked
 *    off → the entry lands on the EXISTING HR file (accountability_reports)
 *    and the instance flips to complete.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isItemStale,
  parseReviewDays,
  reviewDueDate,
  reviewLabel,
  shouldRaiseStaleTask,
} from '@/lib/onboarding-lifecycle';
import { POLICY_LABELS, REPORT_KIND_LABELS } from '@/hooks/useAccountability';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260825150000_onboarding_lifecycle.sql'),
  'utf8',
);

describe('trigger timing', () => {
  const now = new Date('2026-08-25T12:00:00Z');

  it('an item is stale only past the threshold, and never once complete', () => {
    expect(isItemStale('2026-08-01T12:00:00Z', null, 14, now)).toBe(true);
    expect(isItemStale('2026-08-15T12:00:00Z', null, 14, now)).toBe(false);
    expect(isItemStale('2026-08-01T12:00:00Z', '2026-08-20T12:00:00Z', 14, now)).toBe(false);
    // Exactly at the boundary is NOT yet stale (strict >).
    expect(isItemStale('2026-08-11T12:00:00Z', null, 14, now)).toBe(false);
  });

  it('the policy fires at threshold_count stale items', () => {
    const items = [
      { created_at: '2026-08-01T12:00:00Z', completed_at: null },
      { created_at: '2026-08-02T12:00:00Z', completed_at: null },
      { created_at: '2026-08-24T12:00:00Z', completed_at: null },
    ];
    expect(
      shouldRaiseStaleTask(items, { threshold_count: 1, threshold_window_days: 14 }, now),
    ).toBe(true);
    expect(
      shouldRaiseStaleTask(items, { threshold_count: 3, threshold_window_days: 14 }, now),
    ).toBe(false);
  });

  it('the SQL trigger is idempotent: one open manager task per instance', () => {
    expect(migration).toMatch(/CONTINUE WHEN EXISTS \([\s\S]*?source = 'onboarding_stale'[\s\S]*?is_active = true/);
  });

  it('the tone is factual: counts and days, no judgment words', () => {
    const title = migration.slice(
      migration.indexOf("'Onboarding check-in — '"),
      migration.indexOf("'onboarding_stale',", migration.indexOf("'Onboarding check-in — '")),
    );
    for (const banned of ['fail', 'must', 'immediately', 'unacceptable', 'warning']) {
      expect(title.toLowerCase()).not.toContain(banned);
    }
  });

  it('the stale rule rides the escalation engine tables, visible thresholds included', () => {
    expect(migration).toContain("'onboarding_stale'");
    expect(migration).toMatch(/escalation_policies_kind_check[\s\S]*?onboarding_stale/);
    // Default seeded: any single item open past 14 days.
    expect(migration).toMatch(/SELECT o\.id, 'onboarding_stale', 1, 14/);
    // Registered in the settings card + labels.
    expect(POLICY_LABELS.onboarding_stale).toBeTruthy();
  });
});

describe('review task creation', () => {
  it('labels mirror the SQL: week-1 by name, day counts otherwise', () => {
    expect(reviewLabel(7)).toBe('Week-1 review');
    expect(reviewLabel(30)).toBe('30-day review');
    expect(migration).toContain("'Week-1 review'");
    expect(migration).toContain("|| '-day review'");
  });

  it('due dates are start + offset', () => {
    expect(reviewDueDate('2026-08-25', 7)).toBe('2026-09-01');
    expect(reviewDueDate('2026-12-30', 30)).toBe('2027-01-29');
  });

  it('intervals are org-configurable with 7/30/60/90 defaults', () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS onboarding_review_days integer[] NOT NULL DEFAULT '{7,30,60,90}'",
    );
    expect(migration).toMatch(/COALESCE\(\s*\(SELECT s\.onboarding_review_days/);
  });

  it('review items are dated one-off manager-checklist items with a source ref', () => {
    expect(migration).toMatch(/'onboarding_review',[\s\S]*?jsonb_build_object\('instance_id', v_instance_id, 'offset_days', v_offset\)/);
    expect(migration).toContain('_onboarding_manager_checklist');
  });

  it('the settings parser accepts sane lists and refuses junk', () => {
    expect(parseReviewDays('7, 30, 60, 90')).toEqual({ ok: true, days: [7, 30, 60, 90] });
    expect(parseReviewDays('90 30 7')).toEqual({ ok: true, days: [7, 30, 90] });
    expect(parseReviewDays('').ok).toBe(false);
    expect(parseReviewDays('7, zero').ok).toBe(false);
    expect(parseReviewDays('0').ok).toBe(false);
    expect(parseReviewDays('400').ok).toBe(false);
  });
});

describe('HR entry on completion', () => {
  it('writes to the EXISTING permanent record (accountability_reports), closed on arrival', () => {
    expect(migration).toMatch(/INSERT INTO public\.accountability_reports[\s\S]*?'onboarding_complete'/);
    expect(migration).toMatch(/'closed', now\(\)/);
    expect(migration).toMatch(/accountability_reports_kind_check[\s\S]*?onboarding_complete/);
    expect(REPORT_KIND_LABELS.onboarding_complete).toBeTruthy();
  });

  it('completion requires every item dual-signed AND every scheduled review done', () => {
    expect(migration).toMatch(/CONTINUE WHEN v_total_items = 0 OR v_open_items > 0/);
    expect(migration).toMatch(/CONTINUE WHEN v_open_reviews > 0/);
    // Reviews complete against their own day's period key (dated one-off rule).
    expect(migration).toContain("cc.period_key = to_char(ci.due_date, 'YYYY-MM-DD')");
  });

  it('marks the instance complete and links the report', () => {
    expect(migration).toMatch(
      /UPDATE public\.onboarding_instances[\s\S]*?status = 'complete'[\s\S]*?hr_report_id = v_report_id/,
    );
  });

  it('the sweep is service_role only and scheduled like the other engines', () => {
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public._onboarding_lifecycle_sweep_internal()',
    );
    expect(migration).toContain("cron.schedule(\n  'onboarding-lifecycle-daily'");
    expect(migration).toContain('vault.decrypted_secrets');
  });
});

// ---------------------------------------------------------------------------
// Live-database probes (skip cleanly without PGHOST).
// ---------------------------------------------------------------------------

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

describe.runIf(hasPsql)('live database: lifecycle end to end', () => {
  const ORG = '8f000000-0000-4000-8000-00000000008f';
  const TRAINER = '8e100000-0000-4000-8000-000000000081';
  const HIRE = '8e200000-0000-4000-8000-000000000082';
  const TPL = '80000000-0000-4000-8000-00000000008e';
  const SECTION = '85000000-0000-4000-8000-000000000085';

  it('reviews scheduled at start; backdated stale item raises ONE manager task; completion writes the HR entry', () => {
    const script = `
BEGIN;
INSERT INTO auth.users (id, email) VALUES ('8a000000-0000-4000-8000-00000000008a', 'lc-probe@example.test');
INSERT INTO public.orgs (id, name, created_by) VALUES ('${ORG}', 'Lifecycle Probe Org', '8a000000-0000-4000-8000-00000000008a');
INSERT INTO public.employees (id, org_id, display_name, tag) VALUES
  ('${TRAINER}', '${ORG}', 'Trainer Probe', 'TRX'),
  ('${HIRE}', '${ORG}', 'Hire Probe', 'NWX');
INSERT INTO public.org_practice_settings (org_id, onboarding_review_days) VALUES ('${ORG}', '{7,30}');
INSERT INTO public.escalation_policies (org_id, kind, threshold_count, threshold_window_days, reviewer_role, review_due_days, escalate_to, escalate_after_days, is_active)
VALUES ('${ORG}', 'onboarding_stale', 1, 14, 'manager', 3, 'owner', 2, true);
INSERT INTO public.onboarding_templates (id, org_id, name, role_label) VALUES ('${TPL}', '${ORG}', 'Lifecycle Template', 'Front Desk');
INSERT INTO public.onboarding_template_sections (id, org_id, template_id, title, sort_order) VALUES ('${SECTION}', '${ORG}', '${TPL}', 'Basics', 0);
INSERT INTO public.onboarding_template_items (org_id, template_id, section_id, title, sort_order) VALUES ('${ORG}', '${TPL}', '${SECTION}', 'Learn the phones', 0);
DO $probe$
DECLARE
  v_instance uuid;
  v_item uuid;
  r jsonb;
  n int;
  v_report uuid;
BEGIN
  v_instance := public.start_onboarding_instance('${HIRE}', '${TPL}');

  -- Review tasks scheduled at the configured marks, on the manager list.
  SELECT count(*) INTO n FROM public.checklist_items ci
    JOIN public.checklists c ON c.id = ci.checklist_id
   WHERE ci.source = 'onboarding_review'
     AND ci.source_ref->>'instance_id' = v_instance::text
     AND c.audience = 'manager';
  IF n <> 2 THEN RAISE EXCEPTION 'LC FAILED: expected 2 review tasks, found %', n; END IF;

  -- Backdate the open item past the threshold; the sweep raises ONE task.
  UPDATE public.onboarding_instance_items SET created_at = now() - interval '20 days'
   WHERE instance_id = v_instance;
  r := public._onboarding_lifecycle_sweep_internal();
  IF (r->>'stale_tasks_created')::int <> 1 THEN
    RAISE EXCEPTION 'LC FAILED: first sweep created % stale tasks', r->>'stale_tasks_created';
  END IF;
  r := public._onboarding_lifecycle_sweep_internal();
  IF (r->>'stale_tasks_created')::int <> 0 THEN
    RAISE EXCEPTION 'LC FAILED: sweep is not idempotent';
  END IF;

  -- Dual-sign the item (fallback path is fine for lifecycle purposes:
  -- turn the PIN requirement off for this probe org).
  UPDATE public.org_practice_settings SET require_pin_on_signoff = false WHERE org_id = '${ORG}';
  SELECT id INTO v_item FROM public.onboarding_instance_items WHERE instance_id = v_instance;
  PERFORM public.record_onboarding_signoff_fallback(v_item, 'trainer', 'TRX', '${TRAINER}');
  PERFORM public.record_onboarding_signoff_fallback(v_item, 'trainee', 'NWX');

  -- Not complete yet: reviews still open.
  r := public._onboarding_lifecycle_sweep_internal();
  IF (r->>'instances_completed')::int <> 0 THEN
    RAISE EXCEPTION 'LC FAILED: completed before the reviews were done';
  END IF;

  -- Check off every review against its own day's period key.
  INSERT INTO public.checklist_completions (org_id, item_id, period_key, completed_by, completed_by_name)
  SELECT ci.org_id, ci.id, to_char(ci.due_date, 'YYYY-MM-DD'),
         '8a000000-0000-4000-8000-00000000008a', 'Probe Owner'
    FROM public.checklist_items ci
   WHERE ci.source = 'onboarding_review'
     AND ci.source_ref->>'instance_id' = v_instance::text;

  r := public._onboarding_lifecycle_sweep_internal();
  IF (r->>'instances_completed')::int <> 1 THEN
    RAISE EXCEPTION 'LC FAILED: completion sweep result %', r;
  END IF;

  SELECT hr_report_id INTO v_report FROM public.onboarding_instances
   WHERE id = v_instance AND status = 'complete' AND completed_at IS NOT NULL;
  IF v_report IS NULL THEN RAISE EXCEPTION 'LC FAILED: instance not completed/linked'; END IF;

  PERFORM 1 FROM public.accountability_reports
   WHERE id = v_report AND kind = 'onboarding_complete' AND status = 'closed'
     AND subject_employee_id = '${HIRE}';
  IF NOT FOUND THEN RAISE EXCEPTION 'LC FAILED: HR entry missing or wrong'; END IF;

  -- The stale manager task was retired with the completion.
  PERFORM 1 FROM public.checklist_items
   WHERE source = 'onboarding_stale'
     AND source_ref->>'instance_id' = v_instance::text
     AND is_active = true;
  IF FOUND THEN RAISE EXCEPTION 'LC FAILED: stale task still active after completion'; END IF;
END
$probe$;
SELECT 'lifecycle ok';
ROLLBACK;`;
    const out = execFileSync('psql', ['-qAt', '-v', 'ON_ERROR_STOP=1', '-c', script], {
      encoding: 'utf8',
    }).trim();
    expect(out.split('\n').filter(Boolean).pop()).toBe('lifecycle ok');
  });
});
