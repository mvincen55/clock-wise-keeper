import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';

vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office' } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  let rows = [
    { id: 'overlapping-leave', employee_id: 'one', date_start: '2026-08-29', date_end: '2026-09-03' },
    { id: 'earlier-leave', employee_id: 'one', date_start: '2026-08-25', date_end: '2026-08-28' },
    { id: 'someone-else', employee_id: 'two', date_start: '2026-09-01', date_end: '2026-09-02' },
  ];
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { rows = rows.filter(row => row[key as keyof typeof row] === value); return query; },
    gte: (key: string, value: string) => { rows = rows.filter(row => row[key as keyof typeof row] >= value); return query; },
    lte: (key: string, value: string) => { rows = rows.filter(row => row[key as keyof typeof row] <= value); return query; },
    order: () => query,
    then: (resolve: (value: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
  };
  return query;
} } }));
afterEach(cleanup);

describe('employee days off', () => {
  it('includes overlapping leave and excludes another employee’s records', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEmployeeDaysOff('one', '2026-09-01', '2026-09-30'), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(row => row.id)).toEqual(['overlapping-leave']);
    client.clear();
  });
});
