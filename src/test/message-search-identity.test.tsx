import { it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMessageSearch } from '@/hooks/useMessaging';

const state = vi.hoisted(() => ({ userId: 'a', returns: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'same-office', user_id: state.userId } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: () => q, ilike: () => q, order: () => q, limit: () => q, returns: state.returns };
  return q;
} } }));

it('message search does not reuse another staff member’s same-office result even in a shared client', async () => {
  state.userId = 'a';
  let resolve!: (result: unknown) => void;
  state.returns.mockResolvedValueOnce({ data: [{ id: 'private-a', content: 'A private synthetic message', conversation_id: 'private' }] })
    .mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const { result, rerender, unmount } = renderHook(() => {
    const query = useMessageSearch({ query: 'synthetic' }, []);
    // Subscribe to error state as well as data before resolving the request.
    return { data: query.data, isError: query.isError };
  }, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.data?.[0].id).toBe('private-a'));
  state.userId = 'b'; rerender();
  expect(result.current.data).toBeUndefined();
  await act(async () => resolve({ data: null, error: new Error('offline') }));
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
  unmount(); client.clear();
});
