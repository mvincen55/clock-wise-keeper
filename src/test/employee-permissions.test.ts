/**
 * Per-employee permissions — the registry, the grant gating, and the RLS
 * wiring. Rules pinned:
 *
 *  - every key has a label, plain description, and a named enforcement point;
 *  - a grant unlocks ONLY shortcuts that name it — it never widens a
 *    member's tier (Team/Approvals stay manager-only);
 *  - the migration enforces grants in RLS (deposit_logs, audit_events,
 *    team_goals), managers edit grants only via the owner's delegation
 *    switch, and the switch itself is owner-write-only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_DEFS, PERMISSION_KEYS, hasGrant } from '@/lib/permissions';
import { shortcutsFor } from '@/components/dashboard/opRoles';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260811180000_employee_permissions.sql'),
  'utf8',
);
// The onboarding migration re-declares the permission CHECK with the full
// current key list (adding manage_onboarding), so the registry is asserted
// against the LATEST constraint definition.
const onboardingMigration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260825130000_onboarding_templates.sql'),
  'utf8',
);

describe('permission registry', () => {
  it('every key carries a label, description, and enforcement receipt', () => {
    expect(PERMISSION_KEYS).toEqual([
      'edit_closeout_history',
      'view_reports',
      'manage_office_goals',
      'manage_onboarding',
    ]);
    for (const def of PERMISSION_DEFS) {
      expect(def.label).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.enforcedAt).toBeTruthy();
    }
  });

  it('hasGrant is a plain set lookup with a safe default', () => {
    expect(hasGrant(new Set(['view_reports']), 'view_reports')).toBe(true);
    expect(hasGrant(new Set(), 'view_reports')).toBe(false);
    expect(hasGrant(undefined, 'view_reports')).toBe(false);
  });
});

describe('grants unlock shortcuts without widening the tier', () => {
  it('a member with view_reports sees the Reports shortcut', () => {
    const without = shortcutsFor('office_manager', 'member').map(s => s.to);
    expect(without).not.toContain('/reports');
    const withGrant = shortcutsFor('office_manager', 'member', new Set(['view_reports'])).map(s => s.to);
    expect(withGrant).toContain('/reports');
  });

  it('a member with edit_closeout_history sees the front-desk deposit shortcut', () => {
    const withGrant = shortcutsFor('front_desk', 'member', new Set(['edit_closeout_history'])).map(s => s.to);
    expect(withGrant).toContain('/deposit-log');
  });

  it('a grant never unlocks links that do not name it', () => {
    const links = shortcutsFor(
      'assistant_office_manager',
      'member',
      new Set(['view_reports', 'edit_closeout_history', 'manage_office_goals']),
    ).map(s => s.to);
    expect(links).toContain('/reports'); // named grant
    expect(links).not.toContain('/approvals'); // tier-only, stays hidden
    expect(links).not.toContain('/team'); // tier-only, stays hidden
  });

  it('managers keep everything without any grant', () => {
    const links = shortcutsFor('office_manager', 'manager').map(s => s.to);
    expect(links).toEqual(expect.arrayContaining(['/approvals', '/team', '/reports']));
  });
});

describe('the migration enforces grants in RLS', () => {
  it('creates the grants table with exactly the registry keys', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.employee_permissions');
    // Latest CHECK definition (onboarding migration) carries every key.
    for (const key of PERMISSION_KEYS) {
      expect(onboardingMigration).toContain(`'${key}'`);
    }
  });

  it('helpers are SECURITY DEFINER like the rest of the auth layer', () => {
    expect(migration).toMatch(/FUNCTION public\.has_permission[\s\S]*?SECURITY DEFINER/);
    expect(migration).toMatch(/FUNCTION public\.can_manage_permissions[\s\S]*?SECURITY DEFINER/);
  });

  it('managers edit grants only through the owner-controlled delegation', () => {
    expect(migration).toMatch(/can_manage_permissions[\s\S]*?is_org_owner\(_org_id\)/);
    expect(migration).toMatch(/is_org_admin\(_org_id\)[\s\S]*?managers_can_manage/);
    // The switch itself: owner-only writes, member reads.
    expect(migration).toMatch(/"Owner writes permission delegation"[\s\S]*?is_org_owner/);
    expect(migration).toMatch(/"Owner updates permission delegation"[\s\S]*?is_org_owner/);
    expect(migration).toMatch(/"Members read permission delegation"[\s\S]*?is_org_member/);
  });

  it('each key is wired into its real policy, alongside the tier checks', () => {
    expect(migration).toMatch(
      /deposit_logs FOR UPDATE[\s\S]*?has_permission\(org_id, 'edit_closeout_history'\)/,
    );
    expect(migration).toMatch(
      /audit_events FOR SELECT[\s\S]*?has_permission\(org_id, 'view_reports'\)/,
    );
    for (const cmd of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(migration).toMatch(
        new RegExp(`team_goals\\s*\\nFOR ${cmd}[\\s\\S]*?has_permission\\(org_id, 'manage_office_goals'\\)`),
      );
    }
    // The tier checks stay — grants add, never replace.
    expect(migration).toMatch(/is_org_admin\(org_id\)\s*\n?\s*OR public\.has_permission/);
  });

  it('stays additive: no tables dropped, no data rewritten', () => {
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE public\.(?!.*policy)/i);
  });
});
