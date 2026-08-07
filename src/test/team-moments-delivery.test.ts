import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * TEAM MOMENTS DELIVERY — the guarantees have to live in the database, not in
 * a React effect. These probe the deployed functions and constraints.
 *
 * Guarantee under test (stated exactly as the product claims it):
 *   At most one device shows a given moment at a time. A claim takes a short
 *   lease; if the device disappears before confirming, the lease expires and
 *   the moment returns. It is never silently lost.
 */

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

function fn(name: string): string {
  return q(`select pg_get_functiondef(oid) from pg_proc where proname = '${name}'`);
}

describe.runIf(hasPsql)('atomic claim', () => {
  const def = () => fn('claim_team_moments');

  it('exists as a security definer function with a pinned search path', () => {
    expect(def()).toContain('SECURITY DEFINER');
    expect(def()).toMatch(/SET search_path TO 'public'/);
  });

  it('locks rows so two devices cannot claim the same moment', () => {
    expect(def()).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('only ever hands back the caller\u2019s own moments', () => {
    expect(def()).toContain('m.recipient_user_id = v_uid');
    expect(def()).toContain("RAISE EXCEPTION 'Not authenticated'");
  });

  it('is scoped to one active office and checks membership', () => {
    expect(def()).toContain('public.is_org_member(p_org_id)');
    expect(def()).toContain('m.org_id = p_org_id');
  });

  it('skips expired, dismissed and already opened moments', () => {
    expect(def()).toContain('m.opened_at IS NULL');
    expect(def()).toContain('m.dismissed_at IS NULL');
    expect(def()).toContain('m.expires_at > now()');
  });

  it('reclaims after the lease expires rather than losing the moment', () => {
    expect(def()).toContain('m.claimed_at IS NULL OR m.claim_expires_at < now()');
    expect(def()).toContain("claim_expires_at = now() + interval '2 minutes'");
  });

  it('returns a bounded batch', () => {
    expect(def()).toContain('LEAST(GREATEST(COALESCE(p_limit, 5), 1), 12)');
  });

  it('is callable by signed-in people only', () => {
    const grants = q(
      `select coalesce(string_agg(grantee, ','), '') from information_schema.role_routine_grants
        where routine_name = 'claim_team_moments'`,
    );
    expect(grants).toContain('authenticated');
    expect(grants).not.toContain('anon');
  });
});

describe.runIf(hasPsql)('presentation confirmation', () => {
  const def = () => fn('open_team_moments');

  it('is write-once and recipient-only', () => {
    expect(def()).toContain('t.recipient_user_id = v_uid');
    expect(def()).toContain('t.opened_at IS NULL');
  });

  it('names the column after the state it actually records', () => {
    // opened_at is only stamped once the client confirmed it painted the
    // envelope \u2014 nothing is called "revealed" before delivery.
    expect(q(`select count(*) from information_schema.columns
                where table_name = 'team_moments' and column_name = 'opened_at'`)).toBe('1');
  });
});

describe.runIf(hasPsql)('retention', () => {
  const def = () => fn('cleanup_team_moments');

  it('honours each office\u2019s configured retention', () => {
    expect(def()).toContain('s.history_retention_days');
    expect(def()).toContain('m.org_id = o.id');
  });

  it('falls back to the documented default when an office has no settings row', () => {
    expect(def()).toContain('COALESCE(s.history_retention_days, 180)');
  });

  it('keeps a floor so a bad setting cannot wipe recent moments', () => {
    expect(def()).toContain('GREATEST(COALESCE(s.history_retention_days, 180), 30)');
  });

  it('never selects or returns the message text', () => {
    expect(def()).not.toContain('m.message');
    expect(def()).toContain('RETURNING 1');
  });

  it('runs on a schedule', () => {
    expect(q(`select count(*) from cron.job where jobname = 'team-moments-retention'`)).toBe('1');
  });

  it('is not callable by ordinary sign-ins', () => {
    const grants = q(
      `select coalesce(string_agg(grantee, ','), '') from information_schema.role_routine_grants
        where routine_name = 'cleanup_team_moments'`,
    );
    expect(grants).not.toContain('authenticated');
    expect(grants).not.toContain('anon');
  });
});

describe.runIf(hasPsql)('per-office personal preferences', () => {
  it('is keyed by office AND person, so one login can differ per office', () => {
    expect(
      q(`select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'public.moment_prefs'::regclass and contype = 'p'`),
    ).toBe('PRIMARY KEY (org_id, user_id)');
  });

  it('cannot hold a row without an office', () => {
    expect(
      q(`select is_nullable from information_schema.columns
          where table_name = 'moment_prefs' and column_name = 'org_id'`),
    ).toBe('NO');
  });

  it('scopes every policy to the signed-in person', () => {
    const quals = q(
      `select coalesce(string_agg(coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
                                  coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''), ' '), '')
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname = 'moment_prefs'`,
    );
    expect(quals).toContain('auth.uid()');
    expect(quals).toContain('org_id');
  });

  it('keeps office-wide settings in a separate table', () => {
    expect(q(`select count(*) from information_schema.tables
                where table_name = 'org_moment_settings'`)).toBe('1');
  });
});
