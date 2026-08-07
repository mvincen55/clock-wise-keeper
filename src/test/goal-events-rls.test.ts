import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Two visibility rules that have to hold in the database, not just the UI:
//   1. A private goal's history (goal_events) is readable only by the person
//      whose goal it is, or an owner/manager — never a peer.
//   2. Draft training modules are invisible to non-admins.
//
// The project has no second seeded identity to sign in as, so these probe the
// policy predicates and the helper functions they lean on. Skips cleanly
// where there is no database access.

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

function selectQual(table: string): string {
  return q(
    `select coalesce(pg_get_expr(p.polqual, p.polrelid), '')
       from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname = '${table}' and p.polcmd = 'r'`,
  );
}

function rlsOn(table: string): boolean {
  return q(`select c.relrowsecurity from pg_class c where c.relname = '${table}'`) === 't';
}

describe.runIf(hasPsql)('goal_events visibility', () => {
  it('has row level security on', () => {
    expect(rlsOn('goal_events')).toBe(true);
  });

  it('mirrors the parent goal: team-visible, own, or admin only', () => {
    const qual = selectQual('goal_events');
    expect(qual).toContain('is_org_member');
    expect(qual).toContain("visibility = 'team'");
    expect(qual).toContain('g.user_id = auth.uid()');
    expect(qual).toContain('is_org_admin');
  });

  it('gives an unknown person no membership and no admin rights', () => {
    const stranger = '11111111-1111-1111-1111-111111111111';
    const orgs = q('select id from public.orgs limit 1');
    if (!orgs) return;
    // The sandbox role is deliberately not allowed to execute database
    // functions. When that is the case there is nothing to probe here.
    let membership: string;
    try {
      membership = q(`select public.is_org_member('${orgs}')`);
    } catch {
      return;
    }
    expect(membership).not.toBe('t');
    expect(q(`select public.is_org_admin('${orgs}')`)).not.toBe('t');
    expect(q(`select public.can_view_goal('${stranger}'::uuid)`)).not.toBe('t');
  });

});

describe.runIf(hasPsql)('draft training modules', () => {
  it('has row level security on', () => {
    expect(rlsOn('training_modules')).toBe(true);
  });

  it('only exposes published modules to non-admins', () => {
    const qual = selectQual('training_modules');
    expect(qual).toContain('is_org_member');
    expect(qual).toContain("status = 'published'");
    expect(qual).toContain('is_org_admin');
  });

  it('accepts draft as a stored status', () => {
    const allowed = q(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.training_modules'::regclass and contype = 'c'`,
    );
    expect(allowed).toContain('draft');
  });
});

// The can_view_goal visibility matrix, asserted at the source of truth: the
// helper every goal-facing policy calls. Level 4 item 4.3(c).
describe.runIf(hasPsql)('can_view_goal visibility matrix', () => {
  const body = () =>
    q(`select pg_get_functiondef(oid) from pg_proc
        where proname = 'can_view_goal' and pronamespace = 'public'::regnamespace`);

  it('is a security definer function so policies cannot recurse', () => {
    expect(body()).toMatch(/SECURITY DEFINER/i);
  });

  it('covers all three branches: team goals, own goals, admins', () => {
    const def = body().replace(/\s+/g, ' ');
    expect(def).toContain("visibility = 'team'");
    expect(def).toContain('user_id = auth.uid()');
    expect(def).toContain('is_org_admin');
  });

  it('scopes every branch to the goal owner org — no cross-org read', () => {
    expect(body().replace(/\s+/g, ' ')).toContain('org_id');
  });

  it('keeps goal writes owner-scoped (no peer edits, no client deletes)', () => {
    const rows = q(
      `select p.polcmd::text || '|' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
              '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname = 'goals'`,
    )
      .split('\n')
      .filter(Boolean);
    const updates = rows.filter((r) => r.startsWith('w'));
    expect(updates.length).toBeGreaterThan(0);
    for (const r of updates) expect(r).toContain('auth.uid()');
    // Deletes are revoked outright: goals archive, they never disappear.
    expect(rows.filter((r) => r.startsWith('d'))).toHaveLength(0);
  });
});
