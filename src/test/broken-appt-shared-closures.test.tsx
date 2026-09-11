import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useBrokenApptSettings } from '@/hooks/useBrokenApptSettings';
import { useAddClosure } from '@/hooks/useOfficeClosures';
import { businessHoursCutoff } from '@/lib/broken-appts/business-hours';
const state = vi.hoisted(() => ({ dates: ['2026-06-05'], fail: false, filters: [] as unknown[][] }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'o1', employee_id: 'e1' } }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const chain = {
    select: () => chain, eq: (...args: unknown[]) => { state.filters.push(args); return chain; }, order: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    range: async () => ({ data: state.dates.map(closure_date => ({ closure_date })), error: state.fail ? new Error('calendar offline') : null }),
    insert: async (row: { closure_date: string }) => { if (table === 'office_closures') state.dates.push(row.closure_date); return { error: null }; },
  }; return chain;
} } }));
beforeEach(() => { state.dates = ['2026-06-05']; state.fail = false; state.filters = []; });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => ({ settings: useBrokenApptSettings(), add: useAddClosure() }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
it('automatically excludes shared full-day closures with explicit office scoping', async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
  expect(state.filters).toContainEqual(['org_id', 'o1']); expect(state.filters).toContainEqual(['is_full_day', true]);
  const cutoff = businessHoursCutoff(new Date(2026, 5, 8, 9), 48, result.current.settings.data!.officeClosedDates);
  expect(cutoff.getDate()).toBe(3);
});
it('refreshes notice settings when a shared closure is added', async () => {
  const { result } = setup(); await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
  await act(async () => { await result.current.add.mutateAsync({ closure_date: '2026-06-04', name: 'Office closed' }); });
  await waitFor(() => expect(result.current.settings.data!.officeClosedDates).toEqual(['2026-06-04', '2026-06-05']));
});
it('surfaces calendar errors instead of returning an empty calendar', async () => {
  state.fail = true; const { result } = setup();
  await waitFor(() => expect(result.current.settings.isError).toBe(true));
  expect(result.current.settings.data).toBeUndefined();
});
