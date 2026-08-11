/**
 * The office-performance migration — static verification that the shipped SQL
 * carries the rules the product depends on:
 *
 *  - purely additive and replay-safe (IF NOT EXISTS everywhere, no DROPs of
 *    existing data structures);
 *  - both new-patient columns are nullable integers with nonnegative checks
 *    (blank stays "not recorded"; 0 is a legitimate explicit answer);
 *  - visibility columns default to 'everyone' and only allow the two tokens;
 *  - targets are optional (nullable) and nonnegative;
 *  - the late-edit audit function covers both new-patient fields in both the
 *    before and after receipts;
 *  - existing collections settings are untouched.
 *
 * (Full replay runs in CI via `supabase db reset`; RLS on the touched tables
 * is exercised by the live-database suites where PGHOST is available.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../supabase/migrations/20260811120000_office_performance_pulse.sql'),
  'utf8',
);

describe('office performance migration', () => {
  it('is additive and replay-safe', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS monthly_production_target_cents bigint/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS monthly_new_patients_seen_target_count integer/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS production_visibility text NOT NULL DEFAULT 'everyone'/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS new_patients_visibility text NOT NULL DEFAULT 'everyone'/);
    // Additive only: nothing dropped, no tables replaced.
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  });

  it('keeps every ADD COLUMN guarded for clean-database replays', () => {
    const adds = sql.match(/ADD COLUMN/g) ?? [];
    const guarded = sql.match(/ADD COLUMN IF NOT EXISTS/g) ?? [];
    expect(adds.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(adds.length);
  });

  it('constrains visibility to exactly the two allowed tokens', () => {
    expect(sql).toMatch(/production_visibility IN \('everyone', 'admin_only'\)/);
    expect(sql).toMatch(/new_patients_visibility IN \('everyone', 'admin_only'\)/);
  });

  it('new-patient counts are nullable integers with nonnegative checks', () => {
    expect(sql).toMatch(/new_patients_scheduled_count integer\s*\n?\s*CHECK \(new_patients_scheduled_count >= 0\)/);
    expect(sql).toMatch(/new_patients_seen_count integer\s*\n?\s*CHECK \(new_patients_seen_count >= 0\)/);
    // Nullable on purpose: no NOT NULL, no DEFAULT that would rewrite blanks
    // as zeros on old records.
    expect(sql).not.toMatch(/new_patients_\w+_count integer NOT NULL/);
    expect(sql).not.toMatch(/new_patients_\w+_count integer[^,]*DEFAULT/);
  });

  it('targets are optional and nonnegative', () => {
    expect(sql).toMatch(/monthly_production_target_cents >= 0/);
    expect(sql).toMatch(/monthly_new_patients_seen_target_count >= 0/);
    expect(sql).not.toMatch(/monthly_production_target_cents bigint NOT NULL/);
  });

  it('the vitals audit receipt covers both new-patient fields, before and after', () => {
    // The function is replaced with the two fields added to the change gate…
    expect(sql).toMatch(/NEW\.new_patients_scheduled_count IS DISTINCT FROM OLD\.new_patients_scheduled_count/);
    expect(sql).toMatch(/NEW\.new_patients_seen_count\s+IS DISTINCT FROM OLD\.new_patients_seen_count/);
    // …and to both jsonb receipts (OLD and NEW for each field).
    for (const field of ['new_patients_scheduled_count', 'new_patients_seen_count']) {
      expect(sql).toMatch(new RegExp(`'${field}', OLD\\.${field}`));
      expect(sql).toMatch(new RegExp(`'${field}', NEW\\.${field}`));
    }
    // Same-day corrections stay unaudited, as before.
    expect(sql).toMatch(/NEW\.deposit_date < \(now\(\) AT TIME ZONE 'America\/New_York'\)::date/);
  });

  it('does not touch the existing collections settings', () => {
    expect(sql).not.toMatch(/ALTER COLUMN (monthly_collections_target_cents|collections_visibility)/);
    expect(sql).not.toMatch(/UPDATE public\.org_practice_settings/);
  });

  it('stores no patient-identifying columns', () => {
    // Column-shaped identifiers only — prose comments legitimately explain
    // what the schema deliberately does NOT store.
    expect(sql).not.toMatch(/patient_name|first_name|last_name|chart_number|date_of_birth|phone|email/i);
    expect(sql).not.toMatch(/ADD COLUMN[^;]*\b(name|chart|dob)\b/i);
  });
});
