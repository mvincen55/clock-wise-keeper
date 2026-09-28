import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { legacyOpenSaturdaysKey, useAddOfficeOpenDay, useMoveLegacyOpenSaturdays, useOfficeDays, useOfficeOpenDays } from '@/hooks/useOfficeDays';
const state = vi.hoisted(() => ({
  closures: [{ closure_date: '2026-09-07' }], openDays: [{ id: 'd1', open_date: '2026-06-06' }],
  filters: [] as [string, string, unknown][], upserts: [] as { org_id: string; open_date: string; created_by: string }[], fail: false,
}));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'o1', employee_id: 'e1' } }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const chain = {
    select: () => chain, order: () => chain, delete: () => chain,
    eq: (column: string, value: unknown) => { state.filters.push([table, column, value]); return chain; },
    range: async (from: number) => ({
      data: from > 0 ? [] : table === 'office_closures' ? state.closures : state.openDays,
      error: state.fail ? new Error('calendar offline') : null,
    }),
    upsert: async (row: { org_id: string; open_date: string; created_by: string }) => {
      state.upserts.push(row);
      state.openDays = [...state.openDays, { id: `d${state.openDays.length + 1}`, open_date: row.open_date }];
      return { error: null };
    },
  }; return chain;
} } }));
beforeEach(() => {
  state.closures = [{ closure_date: '2026-09-07' }]; state.openDays = [{ id: 'd1', open_date: '2026-06-06' }];
  state.filters = []; state.upserts = []; state.fail = false; localStorage.clear();
});
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
it('reads full-day closures and marked open days scoped to the office', async () => {
  const { result } = renderHook(() => useOfficeDays(), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(state.filters).toContainEqual(['office_closures', 'org_id', 'o1']);
  expect(state.filters).toContainEqual(['office_closures', 'is_full_day', true]);
  expect(state.filters).toContainEqual(['office_open_days', 'org_id', 'o1']);
  expect([...result.current.data!.closedDates]).toEqual(['2026-09-07']);
  expect([...result.current.data!.openDates]).toEqual(['2026-06-06']);
});
it('surfaces a failed read instead of an empty calendar', async () => {
  state.fail = true;
  const { result } = renderHook(() => useOfficeDays(), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});
it('marks a Saturday open for the office and refreshes the shared calendar', async () => {
  const { result } = renderHook(() => ({ days: useOfficeDays(), add: useAddOfficeOpenDay() }), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.days.isSuccess).toBe(true));
  await act(async () => { await result.current.add.mutateAsync({ open_date: '2026-06-13' }); });
  expect(state.upserts).toEqual([{ org_id: 'o1', open_date: '2026-06-13', created_by: 'u1' }]);
  await waitFor(() => expect([...result.current.days.data!.openDates]).toEqual(['2026-06-06', '2026-06-13']));
});
it("moves a manager's browser-kept open Saturdays to the office once, skipping what it already holds", async () => {
  localStorage.setItem(legacyOpenSaturdaysKey('o1'), JSON.stringify(['2026-06-06', '2026-06-13', '2026-06-13', 'not a date']));
  const moved = vi.fn();
  const { result } = renderHook(() => { const list = useOfficeOpenDays(); useMoveLegacyOpenSaturdays(true, list.data, moved); return list; }, { wrapper: wrapper() });
  await waitFor(() => expect(moved).toHaveBeenCalledWith(1));
  expect(state.upserts.map(u => u.open_date)).toEqual(['2026-06-13']);
  expect(localStorage.getItem(legacyOpenSaturdaysKey('o1'))).toBeNull();
  await waitFor(() => expect(result.current.data!.map(r => r.open_date)).toEqual(['2026-06-06', '2026-06-13']));
  expect(state.upserts).toHaveLength(1);
});
it('leaves the browser copy alone for a member', async () => {
  localStorage.setItem(legacyOpenSaturdaysKey('o1'), JSON.stringify(['2026-06-13']));
  const { result } = renderHook(() => { const list = useOfficeOpenDays(); useMoveLegacyOpenSaturdays(false, list.data); return list; }, { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(state.upserts).toEqual([]);
  expect(localStorage.getItem(legacyOpenSaturdaysKey('o1'))).toBe(JSON.stringify(['2026-06-13']));
});
