/**
 * Reading a conversation retires its bell notifications.
 *
 * The regression this guards: messages already read on the chat surfaces
 * stayed "unread" in the notification bell, because marking a conversation
 * read only advanced last_read_at and never touched the notification rows
 * that notify_new_message writes per message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactElement } from 'react';

type Row = Record<string, unknown> & { id: string; is_read: boolean };

interface SelectChain {
  eq: (col: string, val: unknown) => SelectChain;
  order: (col: string, opts?: unknown) => SelectChain;
  limit: (n: number) => Promise<{ data: Row[]; error: null }>;
}

interface UpdateChain {
  eq: (col: string, val: unknown) => UpdateChain;
  then: (
    onOk: (v: { error: null }) => unknown,
    onErr?: (e: unknown) => unknown,
  ) => Promise<unknown>;
}

let notificationRows: Row[] = [];
const rpcCalls: { fn: string; args: unknown }[] = [];
const updateCalls: { table: string; values: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
let rpcMode: 'auto' | 'manual' = 'auto';
let resolveRpc: (v: { error: Error | null }) => void = () => {};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      if (rpcMode === 'manual') {
        return new Promise<{ error: Error | null }>(res => {
          resolveRpc = res;
        });
      }
      return Promise.resolve({ error: null });
    },
    from: (table: string) => ({
      select: () => {
        const chain: SelectChain = {
          eq: () => chain,
          order: () => chain,
          limit: async () => ({ data: table === 'notifications' ? notificationRows : [], error: null }),
        };
        return chain;
      },
      update: (values: Record<string, unknown>) => {
        const call = { table, values, filters: {} as Record<string, unknown> };
        updateCalls.push(call);
        const chain: UpdateChain = {
          eq: (col, val) => {
            call.filters[col] = val;
            return chain;
          },
          // The fake persists: matching rows take the update, so a refetch
          // after invalidation sees what the server would now return.
          then: (onOk, onErr) => {
            if (table === 'notifications') {
              notificationRows = notificationRows.map(n =>
                Object.entries(call.filters).every(([k, v]) => n[k] === v) ? { ...n, ...values } : n,
              );
            }
            return Promise.resolve({ error: null }).then(onOk, onErr);
          },
        };
        return chain;
      },
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

import { useNotifications, type Notification } from '@/hooks/useNotifications';
import {
  useMarkConversationRead,
  useThreadReadMarker,
  isConversationNotification,
  type ConversationSummary,
} from '@/hooks/useMessaging';

const bellRow = (id: string, over: Partial<Notification> = {}): Row => ({
  id,
  org_id: 'org-1',
  recipient_user_id: 'user-1',
  actor_user_id: 'user-2',
  notification_type: 'message',
  title: 'New message from Soleil Baptiste',
  message: 'hi',
  related_table: 'conversations',
  related_id: 'conv-1',
  is_read: false,
  created_at: '2026-08-11T00:00:00Z',
  ...over,
});

const conversation = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: 'conv-1',
  org_id: 'org-1',
  type: 'dm',
  title: null,
  audience: null,
  created_by: 'user-2',
  created_at: '2026-08-10T00:00:00Z',
  updated_at: '2026-08-11T00:00:00Z',
  participantUserIds: ['user-1', 'user-2'],
  lastMessage: { content: 'hi', created_at: '2026-08-11T00:00:00Z', sender_id: 'user-2' },
  unreadCount: 0,
  lastReadAt: '2026-08-12T00:00:00Z',
  ...over,
});

let latest: Notification[] | undefined;
let mutateConv: (id: string) => void = () => {};

function MutationHarness() {
  const { data } = useNotifications();
  const markRead = useMarkConversationRead();
  latest = data;
  useEffect(() => {
    mutateConv = markRead.mutate;
  });
  return null;
}

function ThreadHarness({ conv, newestAt }: { conv: ConversationSummary; newestAt: string | null }) {
  const { data } = useNotifications();
  latest = data;
  useThreadReadMarker(conv, newestAt);
  return null;
}

function renderWithClient(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const isRead = (id: string) => latest?.find(n => n.id === id)?.is_read;

beforeEach(() => {
  notificationRows = [
    bellRow('m1'),
    bellRow('m2', { title: 'Office AI', actor_user_id: null }),
    bellRow('m3', { is_read: true }),
    bellRow('other', {
      notification_type: 'pto_request_approved',
      title: 'PTO Request Approved',
      related_table: 'pto_requests',
      related_id: 'pto-1',
    }),
  ];
  rpcCalls.length = 0;
  updateCalls.length = 0;
  rpcMode = 'auto';
  latest = undefined;
});

describe('isConversationNotification', () => {
  it('matches only rows that point at the given conversation', () => {
    expect(isConversationNotification(bellRow('x') as unknown as Notification, 'conv-1')).toBe(true);
    expect(isConversationNotification(bellRow('x') as unknown as Notification, 'conv-2')).toBe(false);
    expect(
      isConversationNotification(
        bellRow('x', { related_table: 'pto_requests' }) as unknown as Notification,
        'conv-1',
      ),
    ).toBe(false);
    expect(isConversationNotification(bellRow('x') as unknown as Notification, null)).toBe(false);
  });
});

describe('useMarkConversationRead bell sync', () => {
  it('flips the conversation’s bell rows optimistically, then writes the read to the database', async () => {
    rpcMode = 'manual';
    renderWithClient(<MutationHarness />);
    await waitFor(() => expect(latest?.length).toBe(4));

    act(() => mutateConv('conv-1'));

    // Cache flips while the server still hangs — only this conversation's rows.
    await waitFor(() => expect(isRead('m1')).toBe(true));
    expect(isRead('m2')).toBe(true);
    expect(isRead('other')).toBe(false);
    expect(updateCalls).toHaveLength(0);

    act(() => resolveRpc({ error: null }));

    await waitFor(() => expect(updateCalls).toHaveLength(1));
    expect(rpcCalls[0]).toEqual({ fn: 'mark_conversation_read', args: { _conv: 'conv-1' } });
    expect(updateCalls[0].table).toBe('notifications');
    expect(updateCalls[0].values).toEqual({ is_read: true });
    expect(updateCalls[0].filters).toEqual({
      recipient_user_id: 'user-1',
      related_table: 'conversations',
      related_id: 'conv-1',
      is_read: false,
    });
  });

  it('rolls back the optimistic flip when the conversation read fails', async () => {
    rpcMode = 'manual';
    renderWithClient(<MutationHarness />);
    await waitFor(() => expect(latest?.length).toBe(4));

    act(() => mutateConv('conv-1'));
    await waitFor(() => expect(isRead('m1')).toBe(true));

    act(() => resolveRpc({ error: new Error('offline') }));

    await waitFor(() => expect(isRead('m1')).toBe(false));
    // The bell write never ran — the notifications stay honestly unread.
    expect(updateCalls).toHaveLength(0);
  });
});

describe('useThreadReadMarker', () => {
  it('sweeps lingering bell rows when reopening a thread that is already fully read', async () => {
    renderWithClient(
      <ThreadHarness conv={conversation()} newestAt="2026-08-11T00:00:00Z" />,
    );

    // Nothing unread in the conversation itself — only the bell rows demand
    // the pass, and afterwards they are read for good (no re-fire loop).
    await waitFor(() => expect(rpcCalls.length).toBeGreaterThan(0));
    expect(rpcCalls[0]).toEqual({ fn: 'mark_conversation_read', args: { _conv: 'conv-1' } });
    await waitFor(() => expect(isRead('m1')).toBe(true));
    expect(isRead('m2')).toBe(true);
    expect(isRead('other')).toBe(false);
  });

  it('writes nothing when the thread and its bell rows are all read', async () => {
    notificationRows = [
      bellRow('m3', { is_read: true }),
      bellRow('other', {
        notification_type: 'pto_request_approved',
        related_table: 'pto_requests',
        related_id: 'pto-1',
      }),
    ];
    renderWithClient(
      <ThreadHarness conv={conversation()} newestAt="2026-08-11T00:00:00Z" />,
    );

    await waitFor(() => expect(latest?.length).toBe(2));
    expect(rpcCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });
});
