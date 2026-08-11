/**
 * Operational-role vocabulary — one list, many enforcement points. Adding a
 * role means touching the type, the labels, the dashboard modules, the DB
 * constraints, and the invite function's allowlist; this test fails loudly
 * if any copy drifts. Assistant office manager and treatment coordinator are
 * the newest tokens.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPERATIONAL_ROLES } from '@/lib/schedule-reader/types';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import { SPRINT_ROLE_LABELS } from '@/hooks/useSprintIdeas';
import { ROLE_MODULES, shortcutsFor } from '@/components/dashboard/opRoles';

const NEW_ROLES = ['treatment_coordinator', 'assistant_office_manager'] as const;

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('the canonical role list', () => {
  it('includes the two new roles with human labels', () => {
    for (const role of NEW_ROLES) {
      expect(OPERATIONAL_ROLES).toContain(role);
    }
    expect(ROLE_LABELS.treatment_coordinator).toBe('Treatment coordinator');
    expect(ROLE_LABELS.assistant_office_manager).toBe('Assistant office manager');
  });

  it('every role has a label, a dashboard module, and sprint-audience wording', () => {
    for (const role of OPERATIONAL_ROLES) {
      expect(ROLE_LABELS[role], role).toBeTruthy();
      expect(ROLE_MODULES[role]?.mission, role).toBeTruthy();
      expect(ROLE_MODULES[role]?.shortcuts.length, role).toBeGreaterThan(0);
      expect(SPRINT_ROLE_LABELS[role], role).toBeTruthy();
    }
  });

  it('an assistant office manager role never widens a member’s permissions', () => {
    const memberLinks = shortcutsFor('assistant_office_manager', 'member').map(s => s.to);
    expect(memberLinks).not.toContain('/approvals');
    expect(memberLinks).not.toContain('/team');
    const managerLinks = shortcutsFor('assistant_office_manager', 'manager').map(s => s.to);
    expect(managerLinks).toContain('/approvals');
  });
});

describe('database and edge-function copies', () => {
  const migration = read('supabase/migrations/20260811160000_add_operational_roles.sql');

  it('the migration expands all six role constraints', () => {
    const constraints = [
      'employee_operational_roles_role_check',
      'org_invites_operational_role_check',
      'org_invites_secondary_roles_check',
      'schedule_staffing_rules_roles_check',
      'provider_day_metrics_role_check',
      'team_goals_scope_role_check',
    ];
    for (const c of constraints) {
      expect(migration).toContain(`DROP CONSTRAINT IF EXISTS ${c}`);
      expect(migration).toContain(`ADD CONSTRAINT ${c}`);
    }
    // Every re-added list carries both new tokens (6 constraints; the
    // staffing-rules one lists the vocabulary twice, for both columns).
    expect(migration.match(/'treatment_coordinator'/g)?.length).toBe(7);
    expect(migration.match(/'assistant_office_manager'/g)?.length).toBe(7);
    // Additive only — no data rewrites.
    expect(migration).not.toMatch(/UPDATE|DELETE FROM|DROP TABLE|DROP COLUMN/);
  });

  it('the invite function accepts the new roles', () => {
    const invite = read('supabase/functions/send-org-invite/index.ts');
    for (const role of NEW_ROLES) {
      expect(invite).toContain(`"${role}"`);
    }
  });

  it('sprint and pulse announcements can name the new audiences', () => {
    expect(read('supabase/functions/sprint-architect/index.ts')).toContain('treatment_coordinator');
    expect(read('supabase/functions/office-pulse/index.ts')).toContain('assistant_office_manager');
  });
});
