/**
 * The Messages page as an employee sees it.
 *
 * The regression this guards: an employee opened Messages and found nobody to
 * chat with — no teammates under New chat (the roster came from the employees
 * table, which RLS limits to their own row) and no Office AI anywhere in the
 * list (it only existed behind a header button until a channel was started).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ConversationSummary } from '@/hooks/useMessaging';

const state = vi.hoisted(() => ({
  conversations: [] as unknown[],
  directory: {
    nameByUserId: new Map<string, string>(),
    teammates: [] as { userId: string; name: string }[],
    isLoading: false,
  },
  ensureDm: vi.fn(),
  ensureAi: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'jill' } }) }));
vi.mock('@/hooks/useChatDirectory', () => ({ useChatDirectory: () => state.directory }));
vi.mock('@/hooks/useMessageAttachments', () => ({
  useConversationAttachments: () => ({ data: [] }),
  validateAttachment: () => null,
}));
vi.mock('@/hooks/useMessaging', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useMessaging')>()),
  useConversations: () => ({ data: state.conversations, isLoading: false }),
  useMessages: () => ({ data: [] }),
  useMessageSearch: () => ({ data: [], isFetching: false }),
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useThreadReadMarker: () => undefined,
  useConversationReceipts: () => ({ data: [] }),
  useEnsureDm: () => ({ mutate: state.ensureDm, isPending: false }),
  useEnsureAiConversation: () => ({ mutate: state.ensureAi, isPending: false }),
  useOfficeAiReply: () => ({ mutate: vi.fn(), isPending: false }),
}));

import Messages from '@/pages/Messages';

const AI_OFFER = 'Your private channel — ask anything about the office.';

const conversation = (over: Partial<ConversationSummary>): ConversationSummary => ({
  id: 'c',
  org_id: 'office',
  type: 'dm',
  title: null,
  audience: null,
  created_by: 'megan',
  created_at: '2026-09-23T22:55:43Z',
  updated_at: '2026-09-23T22:55:43Z',
  participantUserIds: [],
  lastMessage: null,
  unreadCount: 0,
  lastReadAt: null,
  ...over,
});

function mount() {
  return render(
    <MemoryRouter initialEntries={['/inbox/messages']}>
      <Messages />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  state.conversations = [];
  state.directory = {
    nameByUserId: new Map([
      ['jill', 'Jill Craveiro'],
      ['megan', 'Megan Vincent'],
      ['alize', 'Alize'],
    ]),
    teammates: [
      { userId: 'alize', name: 'Alize' },
      { userId: 'megan', name: 'Megan Vincent' },
    ],
    isLoading: false,
  };
  vi.clearAllMocks();
});

describe('Messages for an employee', () => {
  it('lists every teammate with a login under New chat and offers Office AI before the channel exists', () => {
    mount();
    expect(screen.getByText(AI_OFFER)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New chat/ }));
    expect(screen.getByRole('button', { name: 'Alize' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Megan Vincent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jill Craveiro' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Alize' }));
    expect(state.ensureDm).toHaveBeenCalledWith('alize', expect.anything());

    fireEvent.click(screen.getByText(AI_OFFER));
    expect(state.ensureAi).toHaveBeenCalledTimes(1);
  });

  it('lists the Office AI channel itself once it exists, and names a DM after the teammate', () => {
    state.conversations = [
      conversation({ id: 'ai', type: 'ai', title: 'Office AI', participantUserIds: ['jill'] }),
      conversation({
        id: 'dm',
        participantUserIds: ['jill', 'megan'],
        lastMessage: { content: 'Welcome aboard', created_at: '2026-09-23T22:55:43Z', sender_id: 'megan' },
      }),
    ];
    mount();
    expect(screen.queryByText(AI_OFFER)).not.toBeInTheDocument();
    // The header button plus the channel's own row.
    expect(screen.getAllByText('Office AI').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Megan Vincent')).toBeInTheDocument();
    expect(screen.queryByText('Direct message')).not.toBeInTheDocument();
  });

  it('says so when no teammate has signed in yet', () => {
    state.directory = { nameByUserId: new Map([['jill', 'Jill Craveiro']]), teammates: [], isLoading: false };
    mount();
    fireEvent.click(screen.getByRole('button', { name: /New chat/ }));
    expect(screen.getByText(/No teammates have signed in yet/)).toBeInTheDocument();
    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
  });
});
