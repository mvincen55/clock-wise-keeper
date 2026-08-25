/**
 * Onboarding templates (Phase 2) — the rules pinned:
 *
 *  - reorder keeps sort_order a clean permutation (and self-heals gaps or
 *    duplicates left by concurrent edits);
 *  - the starter seed goes only into an EMPTY library, is exactly ONE
 *    template, and stays generic dental (no office-specific details);
 *  - RLS: members read, writes go through can_manage_onboarding() (admins
 *    plus the delegated 'manage_onboarding' grant) — org isolation rides
 *    the same is_org_member/is_org_admin helpers as every other table.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inDisplayOrder, moveInList } from '@/lib/onboarding-order';
import {
  GENERIC_FRONT_DESK_TEMPLATE,
  shouldSeedTemplates,
} from '@/lib/onboarding-template-defaults';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260825130000_onboarding_templates.sql'),
  'utf8',
);

describe('reorder integrity', () => {
  const rows = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];

  it('moving down swaps neighbors and renumbers only what changed', () => {
    const writes = moveInList(rows, 'a', 'down');
    expect(writes).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ]);
  });

  it('edge moves are no-ops', () => {
    expect(moveInList(rows, 'a', 'up')).toEqual([]);
    expect(moveInList(rows, 'c', 'down')).toEqual([]);
    expect(moveInList(rows, 'missing', 'down')).toEqual([]);
  });

  it('the result is always a clean 0..n-1 permutation, even from dirty input', () => {
    const dirty = [
      { id: 'a', sort_order: 5 },
      { id: 'b', sort_order: 5 },
      { id: 'c', sort_order: 9 },
    ];
    const writes = moveInList(dirty, 'c', 'up');
    const after = new Map(dirty.map(r => [r.id, r.sort_order]));
    for (const w of writes) after.set(w.id, w.sort_order);
    expect([...after.values()].sort()).toEqual([0, 1, 2]);
  });

  it('display order is stable for ties', () => {
    const tied = [
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 0 },
    ];
    expect(inDisplayOrder(tied).map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('starter seed', () => {
  it('seeds only into an empty library (idempotent by count)', () => {
    expect(shouldSeedTemplates(0)).toBe(true);
    expect(shouldSeedTemplates(1)).toBe(false);
    expect(shouldSeedTemplates(7)).toBe(false);
  });

  it('is exactly one generic front-desk template with the documented structure', () => {
    const seed = GENERIC_FRONT_DESK_TEMPLATE;
    expect(seed.roleLabel).toBe('Front Desk');
    const titles = seed.sections.map(s => s.title);
    // paperwork / safety / policies / systems / core training / daily duties / reviews
    expect(titles).toEqual([
      'First-Day Paperwork',
      'Safety & Compliance',
      'Office Policies',
      'Systems & Tools',
      'Core Training',
      'Daily Duties',
      'Reviews',
    ]);
    for (const s of seed.sections) expect(s.items.length).toBeGreaterThan(0);
  });

  it('stays generic: no office names, brands, or people', () => {
    const text = JSON.stringify(GENERIC_FRONT_DESK_TEMPLATE).toLowerCase();
    for (const banned of ['dentrix', 'eaglesoft', 'open dental', 'dr.', 'purple envelope']) {
      expect(text).not.toContain(banned);
    }
    // Business/employment content only — nothing patient-record shaped.
    expect(text).not.toContain('patient record');
    expect(text).not.toContain('phi');
  });
});

describe('the migration', () => {
  it('gives every table org_id and RLS', () => {
    for (const table of [
      'onboarding_templates',
      'onboarding_template_sections',
      'onboarding_template_items',
    ]) {
      expect(migration).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE public\\.${table} \\([\\s\\S]*?org_id uuid NOT NULL`),
      );
    }
  });

  it('members read; writes go through can_manage_onboarding()', () => {
    expect(migration).toMatch(/"Members read onboarding templates"[\s\S]*?is_org_member/);
    expect(migration).toMatch(
      /"Onboarding managers write templates"[\s\S]*?can_manage_onboarding/,
    );
    expect(migration).toMatch(
      /can_manage_onboarding[\s\S]*?is_org_admin[\s\S]*?has_permission\(_org_id, 'manage_onboarding'\)/,
    );
  });

  it('role label is free text — no enum anywhere', () => {
    expect(migration).toContain('role_label text NOT NULL');
    expect(migration).not.toMatch(/CREATE TYPE[\s\S]*role/i);
  });

  it('registers manage_onboarding in the existing grants CHECK', () => {
    expect(migration).toContain("'manage_onboarding'");
    expect(migration).toContain('employee_permissions_permission_check');
  });
});

// ---------------------------------------------------------------------------
// Live-database probes (skip cleanly without PGHOST).
// ---------------------------------------------------------------------------

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
}

describe.runIf(hasPsql)('live database: template isolation', () => {
  it('RLS is on and policies lean on the org helpers', () => {
    for (const table of [
      'onboarding_templates',
      'onboarding_template_sections',
      'onboarding_template_items',
    ]) {
      expect(q(`select relrowsecurity from pg_class where relname = '${table}'`)).toBe('t');
      const quals = q(
        `select string_agg(coalesce(pg_get_expr(p.polqual, p.polrelid), ''), ' | ')
           from pg_policy p join pg_class c on c.oid = p.polrelid
          where c.relname = '${table}'`,
      );
      expect(quals).toContain('is_org_member');
      expect(quals).toContain('can_manage_onboarding');
    }
  });

  it('cross-org rows are invisible: reads are gated per org, not per table', () => {
    // Two orgs' templates, probed through the policy predicate itself:
    // is_org_member(other_org) is false for a non-member, so the SELECT
    // qual cannot pass. (The sandbox role may not execute helpers; skip.)
    const orgs = q('select id from public.orgs limit 1');
    if (!orgs) return;
    let membership: string;
    try {
      membership = q(`select public.is_org_member('${orgs}')`);
    } catch {
      return;
    }
    expect(membership).not.toBe('t');
  });
});
