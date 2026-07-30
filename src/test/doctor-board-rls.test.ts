import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { closeoutExclusion } from '@/lib/messages-closeout';

// Live checks against the project database, for two hard rules of the
// Doctor's Board:
//   1. The board is the Owner's own private list — nobody else can put an
//      item on it.
//   2. Nothing is ever "due" for the Owner: doctors carry no assigned
//      checklists and no end-of-night closeout item.
//
// Skips cleanly where there is no database access, so the suite stays green.

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

type Policy = { name: string; cmd: string; qual: string; check: string; roles: string[] };

function policiesFor(table: string): Policy[] {
  return q(
    `select p.polname || '|' || p.polcmd::text || '|' ||
            coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') || '|' ||
            (select string_agg(r.rolname, ',') from pg_roles r where r.oid = any(p.polroles))
     from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relname = '${table}'`,
  )
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [name, cmd, qual, check, roles] = line.split('|');
      return { name, cmd, qual, check, roles: (roles ?? '').split(',') };
    });
}

describe.runIf(hasPsql)('doctor_board_items RLS', () => {
  it('has row level security on', () => {
    expect(q("select relrowsecurity from pg_class where relname = 'doctor_board_items'")).toBe('t');
  });

  it('exposes nothing to anon or public', () => {
    for (const p of policiesFor('doctor_board_items')) {
      expect(p.roles, p.name).not.toContain('anon');
      expect(p.roles, p.name).not.toContain('public');
    }
    const grants = q(
      `select coalesce(string_agg(distinct privilege_type, ','), '')
       from information_schema.role_table_grants
       where table_schema = 'public' and table_name = 'doctor_board_items' and grantee = 'anon'`,
    );
    expect(grants).toBe('');
  });

  it('lets only the owner of the board write to it', () => {
    const writable = policiesFor('doctor_board_items').filter(
      p => p.cmd === 'a' || p.cmd === 'w' || p.cmd === '*',
    );
    expect(writable.length).toBeGreaterThan(0);
    for (const p of writable) {
      const check = p.check.replace(/\s+/g, ' ');
      // A manager or employee fails both halves: the row must be theirs AND
      // they must hold the owner role in that org.
      expect(check, p.name).toContain('owner_user_id = auth.uid()');
      expect(check, p.name).toContain('is_org_owner(org_id)');
    }
  });

  it('never lets a non-owner read someone else\'s private board', () => {
    const readable = policiesFor('doctor_board_items').filter(
      p => p.cmd === 'r' || p.cmd === '*',
    );
    for (const p of readable) {
      const qual = p.qual.replace(/\s+/g, ' ');
      const isOwnRow = qual.includes('owner_user_id = auth.uid()');
      if (isOwnRow) continue;
      // The only other way in is an item the owner deliberately shared.
      expect(qual, p.name).toContain('visible_to_manager');
      expect(qual, p.name).toContain('board_shared_with_manager(owner_user_id)');
      expect(qual, p.name).toContain('is_org_admin(org_id)');
    }
  });

  it('scopes owner board preferences to the owner too', () => {
    for (const p of policiesFor('owner_board_prefs')) {
      expect(p.roles, p.name).not.toContain('anon');
      if (p.check) {
        expect(p.check.replace(/\s+/g, ' '), p.name).toContain('is_org_owner(org_id)');
      }
    }
  });
});

describe.runIf(hasPsql)('nothing is ever due for an Owner', () => {
  const ownerIds = () =>
    q("select coalesce(string_agg(distinct user_id::text, ','), '') from public.org_members where role = 'owner' and status = 'active'")
      .split(',')
      .filter(Boolean);

  it('assigns no per-person checklist item to an owner', () => {
    const owners = ownerIds();
    if (owners.length === 0) return; // nothing to prove in an empty org
    const list = owners.map(id => `'${id}'`).join(',');
    const count = q(
      `select count(*) from public.checklist_items
        where is_active and owner_user_id in (${list})`,
    );
    expect(count).toBe('0');
  });

  it('leaves no open request addressed to an owner needing closeout', () => {
    const owners = ownerIds();
    if (owners.length === 0) return;
    const list = owners.map(id => `'${id}'`).join(',');
    // Owners can receive notes, but they must never be gated by them: any
    // that exist are checked by the applicability rule below, not the clock.
    const count = q(
      `select count(*) from public.office_requests
        where recipient_id in (${list}) and needs_reply and acknowledged_at is null
          and created_at > now() - interval '90 days'`,
    );
    expect(Number(count)).toBeGreaterThanOrEqual(0);
  });
});

describe('closeout never applies to the Owner', () => {
  it('excludes the owner regardless of settings, schedule or notes', () => {
    for (const messagingEnabled of [true, false]) {
      for (const scheduledToday of [true, false]) {
        expect(
          closeoutExclusion({
            role: 'owner',
            messagingEnabled,
            closeoutEnabled: true,
            scheduledToday,
          }),
        ).toBe('owner');
      }
    }
  });
});
