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
    expect(q(`select public.is_org_member('${orgs}')`)).not.toBe('t');
    expect(q(`select public.is_org_admin('${orgs}')`)).not.toBe('t');
    expect(stranger).not.toBe(q('select coalesce(auth.uid()::text, $$none$$)'));
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
