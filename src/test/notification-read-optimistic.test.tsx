/**
 * The real mark-read mutation: the cache flips the moment it is called, and
 * rolls back if the write fails — navigation never waits on the database.
 * Lives apart from the bell interaction tests, which stub the hooks module.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

const ROWS = [
  {
    id: 'n1',
    org_id: 'org-1',
    recipient_user_id: 'user-1',
    actor_user_id: null,
    notification_type: 'pto_request_approved',
    title: 'PTO Request Approved',
    message: 'Approved',
    related_table: 'pto_requests',
    related_id: 'pto-1',
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'n2',
    org_id: 'org-1',
    recipient_user_id: 'user-1',
    actor_user_id: null,
    notification_type: 'message',
    title: 'New message',
    message: 'Hello',
    related_table: 'conversations',
    related_id: 'conv-1',
    is_read: true,
    created_at: new Date().toISOString(),
  },
];

let resolveUpdate: (v: { error: null }) => void = () => {};
let rejectUpdate: (e: Error) => void = () => {};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const makeThenable = (): any => {
    const p = new Promise<{ error: null }>((resolve, reject) => {
      resolveUpdate = resolve;
      rejectUpdate = reject;
    });
    const chain: any = { then: (onOk: any, onErr: any) => p.then(onOk, onErr) };
    chain.eq = () => chain;
    return chain;
  };
  return {
    supabase: {
      from: () => ({
        select: () => {
          const chain: any = {
            eq: () => chain,
            order: () => chain,
            limit: async () => ({ data: ROWS, error: null }),
          };
          return chain;
        },
        update: () => ({ eq: () => makeThenable() }),
      }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

import { useNotifications, useMarkNotificationRead } from '@/hooks/useNotifications';

describe('useMarkNotificationRead optimistic behavior', () => {
  it('flips is_read in the cache before the server answers, and rolls back on error', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let latest: any[] | undefined;
    let mutate: (id: string) => void = () => {};

    function Harness() {
      const { data } = useNotifications();
      const markRead = useMarkNotificationRead();
      latest = data;
      useEffect(() => {
        mutate = markRead.mutate;
      });
      return null;
    }

    render(
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    );

    await waitFor(() => expect(latest?.length).toBe(ROWS.length));
    expect(latest!.find(n => n.id === 'n1')?.is_read).toBe(false);

    // Fire the mutation but leave the server hanging: the cache flips anyway.
    act(() => mutate('n1'));
    await waitFor(() => expect(latest!.find(n => n.id === 'n1')?.is_read).toBe(true));

    // The server fails → the optimistic flip rolls back.
    act(() => rejectUpdate(new Error('offline')));
    await waitFor(() => expect(latest!.find(n => n.id === 'n1')?.is_read).toBe(false));
    void resolveUpdate;
  });
});
