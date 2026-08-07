import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * TEAM MOMENTS — the boundaries that have to hold in the database, not the UI:
 *   1. Only the recipient and the sender can read a moment. No management
 *      browse, no office-wide read of the message text.
 *   2. A moment can only be sent between two active employees of the SAME
 *      office, from your own employee record.
 *   3. Wording is immutable after sending; only the recipient may mark it
 *      revealed or dismissed, and reveal is write-once.
 *   4. Only the closed, positive reaction set can ever be stored.
 *
 * There is no second seeded identity to sign in as, so these probe the policy
 * predicates and constraints themselves. Skips cleanly without database access.
 */

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

function policy(table: string, cmd: 'r' | 'a' | 'w'): { qual: string; check: string } {
  const row = q(
    `select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|||' ||
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
       from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname = '${table}' and p.polcmd = '${cmd}'`,
  );
  const [qual = '', check = ''] = row.split('|||');
  return { qual, check };
}

describe.runIf(hasPsql)('team_moments row level security', () => {
  it('has row level security enabled', () => {
    expect(q(`select c.relrowsecurity from pg_class c where c.relname = 'team_moments'`)).toBe('t');
  });

  it('is readable only by the recipient or the sender', () => {
    const { qual } = policy('team_moments', 'r');
    expect(qual).toContain('recipient_user_id = auth.uid()');
    expect(qual).toContain('sender_user_id = auth.uid()');
    // No manager/owner browse hatch.
    expect(qual).not.toContain('is_org_admin');
    expect(qual).not.toContain('is_org_owner');
  });

  it('denies cross-office sending: both people are checked against the row org', () => {
    const { check } = policy('team_moments', 'a');
    expect(check).toContain('sender_user_id = auth.uid()');
    expect(check).toContain('is_org_member');
    // Sender and recipient employee records must both belong to the row's org
    // and be active.
    expect((check.match(/org_id = team_moments\.org_id/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((check.match(/employment_status = 'active'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('lets only the recipient mark a moment revealed or dismissed', () => {
    const { qual, check } = policy('team_moments', 'w');
    expect(qual).toContain('recipient_user_id = auth.uid()');
    expect(check).toContain('recipient_user_id = auth.uid()');
  });

  it('has no delete policy — moments cannot be erased through the app', () => {
    expect(
      q(
        `select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
          where c.relname = 'team_moments' and p.polcmd = 'd'`,
      ),
    ).toBe('0');
  });

  it('exposes nothing to a signed-out visitor: every policy is auth-scoped', () => {
    const roles = q(
      `select coalesce(string_agg(distinct r.rolname, ',' order by r.rolname), '')
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         left join lateral unnest(p.polroles) pr(oid) on true
         left join pg_roles r on r.oid = pr.oid
        where c.relname = 'team_moments'`,
    );
    // Policies target `authenticated` only — anon is never a policy role, so a
    // signed-out request matches nothing regardless of table-level grants.
    expect(roles.split(',')).toContain('authenticated');
    expect(roles.split(',')).not.toContain('anon');
    expect(roles.split(',')).not.toContain('public');
  });

});

describe.runIf(hasPsql)('team_moments constraints', () => {
  it('stores only the approved positive reactions', () => {
    const def = q(
      `select pg_get_constraintdef(oid) from pg_constraint
        where conrelid = 'public.team_moments'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%reaction%'`,
    );
    for (const key of ['nice_work', 'celebrate', 'thank_you', 'crushed_it', 'great_save', 'team_win']) {
      expect(def).toContain(key);
    }
    expect(def).not.toMatch(/angry|thumbs_down|warning/);
  });

  it('cannot be sent to yourself', () => {
    const defs = q(
      `select string_agg(pg_get_constraintdef(oid), ' ') from pg_constraint
        where conrelid = 'public.team_moments'::regclass and contype = 'c'`,
    );
    expect(defs).toContain('sender_employee_id <> recipient_employee_id');
    expect(defs).toContain('sender_user_id <> recipient_user_id');
  });

  it('caps the optional message and context length', () => {
    const defs = q(
      `select string_agg(pg_get_constraintdef(oid), ' ') from pg_constraint
        where conrelid = 'public.team_moments'::regclass and contype = 'c'`,
    );
    expect(defs).toContain('240');
    expect(defs).toContain('60');
  });

  it('guards wording immutability, write-once reveal, and anti-spam in triggers', () => {
    const triggers = q(
      `select string_agg(tgname, ',') from pg_trigger
        where tgrelid = 'public.team_moments'::regclass and not tgisinternal`,
    );
    expect(triggers).toContain('team_moments_before_insert');
    expect(triggers).toContain('team_moments_guard_update');

    const insertFn = q(`select prosrc from pg_proc where proname = 'team_moments_before_insert'`);
    expect(insertFn).toContain('Sending limit reached');
    expect(insertFn).toContain('turned off Team Moments');

    const updateFn = q(`select prosrc from pg_proc where proname = 'team_moments_guard_update'`);
    expect(updateFn).toContain('cannot be edited after it is sent');
    // Delivery state is write-once: the first opened_at stands, dismissal
    // cannot be undone, and revealed_at stays a mirror of the first opening.
    expect(updateFn).toContain('NEW.opened_at := OLD.opened_at');
    expect(updateFn).toContain('NEW.dismissed_at := OLD.dismissed_at');
    expect(updateFn).toContain('NEW.revealed_at := COALESCE(OLD.revealed_at, NEW.opened_at)');

  });
});

describe.runIf(hasPsql)('moment preferences and office settings', () => {
  it('keeps personal preferences private to the person', () => {
    const { qual } = policy('moment_prefs', '*' as any) ?? { qual: '' };
    const all = q(
      `select string_agg(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), ' ')
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname = 'moment_prefs'`,
    );
    expect(all).toContain('user_id = auth.uid()');
    void qual;
  });

  it('lets only an owner or manager change the office switch', () => {
    const all = q(
      `select string_agg(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), ' ')
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname = 'org_moment_settings'`,
    );
    expect(all).toContain('is_org_admin');
  });
});
