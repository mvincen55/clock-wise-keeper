import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFeeScheduleItems } from '@/hooks/useFeeSchedules';

// A real office schedule: 1,174 codes in code order, so D9xxx sits past the
// 1,000-row response cap a single unbounded query returns.
const TOTAL = 1174;
const rows = Array.from({ length: TOTAL }, (_, i) => ({
  id: `item-${i}`, schedule_id: 'office', code: `D${String(i).padStart(4, '0')}`, description: `Procedure ${i}`,
  fee_cents: 100 + i, category: 'other', is_office_fee: true, notes: '', created_at: '', updated_at: '',
}));
const mock = vi.hoisted(() => ({ ranges: [] as [number, number][] }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-a' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'org-a', role: 'manager' } }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            // Serve like PostgREST: the requested slice, never more than 1,000 rows.
            range: async (from: number, to: number) => { mock.ranges.push([from, to]); return { data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }; },
          }),
        }),
      }),
    }),
  },
}));
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('fee schedule items load past the response row cap', () => {
  it('pages until the schedule is complete, so late codes such as D9120 reach the builder', async () => {
    const { result } = renderHook(() => useFeeScheduleItems('office'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toHaveLength(TOTAL));
    expect(result.current.data!.at(-1)!.code).toBe('D1173');
    expect(mock.ranges).toEqual([[0, 999], [1000, 1999]]);
  });
});
