import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mapImportRows } from '@/components/fof/FeeImportDialog';
import { FeeImportError, useFeeSchedules, useImportFeeScheduleItems, useSeedFeeSchedules } from '@/hooks/useFeeSchedules';

/**
 * Fee maintenance must be trustworthy: the preview says exactly what will
 * be written, a failed batch leaves the schedule as it was, and "imported"
 * is only ever said about rows read back from the database.
 */
type Row = { schedule_id: string; org_id: string; code: string; description: string; fee_cents: number; category: string; is_office_fee: boolean; notes?: string };
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  failOnUpsertCall: 0,
  upsertCalls: 0,
  inserts: [] as unknown[],
  role: 'manager',
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-a' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'org-a', role: db.role } }) }));
vi.mock('@/integrations/supabase/pending-schema', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'fee_schedule_items' && table !== 'fee_schedules') throw new Error(`unexpected table ${table}`);
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (field: string, value: unknown) => { filters[field] = value; return builder; },
        in: (field: string, values: unknown[]) => { filters[`${field}:in`] = values; return builder; },
        order: () => builder,
        limit: async () => ({ data: [], error: null }),
        range: async (from: number, to: number) => {
          const data = db.rows.filter(r => r.schedule_id === filters.schedule_id).sort((a, b) => a.code.localeCompare(b.code)).slice(from, to + 1)
            .map(r => ({ id: `${r.schedule_id}-${r.code}`, created_at: '', updated_at: '', notes: r.notes ?? '', ...r }));
          return { data, error: null };
        },
        upsert: async (payload: Row[]) => {
          db.upsertCalls += 1;
          if (db.upsertCalls === db.failOnUpsertCall) return { error: { message: 'connection reset' } };
          for (const row of payload) {
            const index = db.rows.findIndex(r => r.schedule_id === row.schedule_id && r.code === row.code);
            if (index >= 0) db.rows[index] = { ...db.rows[index], ...row }; else db.rows.push({ ...row });
          }
          return { error: null };
        },
        insert: async (payload: unknown) => { db.inserts.push(payload); return { error: null }; },
        delete: () => ({
          eq: (field: string, value: unknown) => { filters[field] = value; return { in: async (f: string, values: string[]) => { db.rows = db.rows.filter(r => !(r.schedule_id === filters.schedule_id && values.includes(r.code))); return { error: null }; } }; },
        }),
      };
      return builder;
    },
  },
}));
vi.mock('@/hooks/useOfficeFeeLookup', () => ({ OFFICE_FEE_LOOKUP_KEY: 'office-fee-lookup' }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const seedRow = (code: string, fee: number): Row => ({ schedule_id: 'office', org_id: 'org-a', code, description: `Existing ${code}`, fee_cents: fee, category: 'other', is_office_fee: false, notes: '' });
const importRows = (n: number) => Array.from({ length: n }, (_, i) => ({ code: `D${String(1000 + i).padStart(4, '0')}`, description: `Row ${i}`, feeCents: 100 + i, category: 'other' as const }));

beforeEach(() => { db.rows = []; db.failOnUpsertCall = 0; db.upsertCalls = 0; db.inserts = []; db.role = 'manager'; });

describe('import preview counts', () => {
  const office = new Set(['D0120', 'D2740']);
  it('counts valid, skipped, duplicate and unmatched rows the way the write will treat them', () => {
    const grid = [
      ['D0120', 'Exam', 65], ['D2740', 'Crown', '1,569.00'], ['D2740', 'Crown again', 1600], ['D9999', 'Unknown', 10],
      ['', 'No code', 50], ['D0140', 'Bad fee', 'abc'], [null, null, null],
    ];
    const mapped = mapImportRows(grid, { code: '0', fee: '2', desc: '1', cat: '__none__' }, false, office, true);
    expect(mapped.rows.map(r => r.code)).toEqual(['D0120', 'D2740', 'D2740', 'D9999']);
    expect(mapped.skipped).toEqual([{ row: 5, reason: 'no code' }, { row: 6, reason: 'fee "abc" is not an amount' }]);
    expect(mapped.duplicates).toEqual(['D2740']);
    expect(mapped.unmatched).toEqual(['D9999']);
    // Office schedule imports have no "unmatched" concept.
    expect(mapImportRows(grid, { code: '0', fee: '2', desc: '1', cat: '__none__' }, false, office, false).unmatched).toEqual([]);
  });
  it('restores the D prefix on numeric code cells only when asked', () => {
    const grid = [[120, 'Exam', 65]];
    expect(mapImportRows(grid, { code: '0', fee: '2', desc: '__none__', cat: '__none__' }, true, undefined, false).rows[0].code).toBe('D0120');
    expect(mapImportRows(grid, { code: '0', fee: '2', desc: '__none__', cat: '__none__' }, false, undefined, false).rows[0].code).toBe('0120');
  });
});

describe('verified import with rollback', () => {
  it('writes every batch, reads the rows back and reports added and updated counts', async () => {
    db.rows = [seedRow('D1000', 5)];
    const { result } = renderHook(() => useImportFeeScheduleItems(), { wrapper: wrapper() });
    const outcome = await act(() => result.current.mutateAsync({ scheduleId: 'office', rows: importRows(1200) }));
    expect(outcome).toEqual({ imported: 1200, updated: 1, added: 1199 });
    expect(db.rows).toHaveLength(1200);
    expect(db.rows.find(r => r.code === 'D1000')?.fee_cents).toBe(100);
  });
  it('a later batch failing puts the earlier batch back and never claims an import', async () => {
    db.rows = [seedRow('D1000', 5), seedRow('D1001', 6), seedRow('D9990', 7)];
    db.failOnUpsertCall = 2; // first chunk of 500 lands, the second fails
    const { result } = renderHook(() => useImportFeeScheduleItems(), { wrapper: wrapper() });
    await expect(act(() => result.current.mutateAsync({ scheduleId: 'office', rows: importRows(700) }))).rejects.toMatchObject({ name: 'FeeImportError', rolledBack: true, appliedRows: 500 });
    // Pre-existing codes are back at their old values; new codes are gone; untouched codes untouched.
    expect(db.rows.find(r => r.code === 'D1000')).toMatchObject({ fee_cents: 5, description: 'Existing D1000' });
    expect(db.rows.find(r => r.code === 'D1001')).toMatchObject({ fee_cents: 6 });
    expect(db.rows.find(r => r.code === 'D1002')).toBeUndefined();
    expect(db.rows.find(r => r.code === 'D9990')).toMatchObject({ fee_cents: 7 });
    expect(db.rows).toHaveLength(3);
  });
  it('a failure before any write reports the schedule unchanged', async () => {
    db.rows = [seedRow('D1000', 5)];
    db.failOnUpsertCall = 1;
    const { result } = renderHook(() => useImportFeeScheduleItems(), { wrapper: wrapper() });
    await expect(act(() => result.current.mutateAsync({ scheduleId: 'office', rows: importRows(3) }))).rejects.toSatisfy((e: unknown) => e instanceof FeeImportError && e.appliedRows === 0 && /unchanged/.test(e.message));
    expect(db.rows).toEqual([seedRow('D1000', 5)]);
  });
  it('an employee cannot import at all', async () => {
    db.role = 'employee';
    const { result } = renderHook(() => useImportFeeScheduleItems(), { wrapper: wrapper() });
    await expect(act(() => result.current.mutateAsync({ scheduleId: 'office', rows: importRows(1) }))).rejects.toThrow('Owner or manager');
    expect(db.upsertCalls).toBe(0);
  });
});

describe('first use never writes from a read', () => {
  it('reading the schedules performs no insert, whoever is signed in', async () => {
    db.role = 'employee';
    const { result } = renderHook(() => useFeeSchedules(), { wrapper: wrapper() });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(result.current.data).toEqual([]);
    expect(db.inserts).toEqual([]);
  });
  it('seeding refuses an employee before touching the server', async () => {
    db.role = 'employee';
    const { result } = renderHook(() => useSeedFeeSchedules(), { wrapper: wrapper() });
    let failure: unknown;
    await act(async () => { try { await result.current.mutateAsync(); } catch (error) { failure = error; } });
    expect(String(failure)).toMatch(/Owner or manager/);
    expect(db.inserts).toEqual([]);
  });
  it('seeding is an explicit owner/manager action that creates only the office schedule', async () => {
    db.role = 'owner';
    const { result } = renderHook(() => useSeedFeeSchedules(), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync(); });
    expect(db.inserts).toEqual([{ org_id: 'org-a', name: 'Office Fee Schedule', kind: 'office', sort_order: 0 }]);
  });
});
