/**
 * The pure helpers behind the chat surfaces: shared naming for conversations
 * and senders (Messages page + chat dock), and the on-screen registry that
 * keeps corner popups from repeating a thread someone is already reading.
 */
import { describe, it, expect } from 'vitest';
import { conversationTitle, senderLabel, type ConversationSummary } from '../hooks/useMessaging';
import {
  markConversationOpen,
  markConversationClosed,
  isConversationOnScreen,
} from '../lib/active-conversation';

const base = {
  org_id: 'org',
  title: null,
  audience: null,
  created_by: 'u1',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  lastMessage: null,
  unreadCount: 0,
  lastReadAt: null,
};

const conv = (over: Partial<ConversationSummary>): ConversationSummary =>
  ({ ...base, id: 'c1', type: 'dm', participantUserIds: [], ...over }) as ConversationSummary;

const names = new Map([
  ['u1', 'Megan'],
  ['u2', 'Soleil'],
]);

describe('conversationTitle', () => {
  it('always calls the AI channel Office AI', () => {
    expect(conversationTitle(conv({ type: 'ai', title: 'ignored' }), 'u1', names)).toBe('Office AI');
  });

  it('names a DM after the other participant', () => {
    expect(
      conversationTitle(conv({ type: 'dm', participantUserIds: ['u1', 'u2'] }), 'u1', names),
    ).toBe('Soleil');
  });

  it('falls back when the other participant has no name', () => {
    expect(
      conversationTitle(conv({ type: 'dm', participantUserIds: ['u1', 'u9'] }), 'u1', names),
    ).toBe('Direct message');
  });

  it('prefers an explicit title for groups', () => {
    expect(conversationTitle(conv({ type: 'group', title: 'Front desk' }), 'u1', names)).toBe(
      'Front desk',
    );
  });
});

describe('senderLabel', () => {
  it("labels the schema's pathfinder kind as Office AI", () => {
    expect(senderLabel('pathfinder', null, names)).toBe('Office AI');
  });

  it('accepts a legacy ai kind too', () => {
    expect(senderLabel('ai', null, names)).toBe('Office AI');
  });

  it('names members and falls back for strangers', () => {
    expect(senderLabel('member', 'u2', names)).toBe('Soleil');
    expect(senderLabel('member', 'u9', names)).toBe('Teammate');
    expect(senderLabel('member', null, names)).toBe('Teammate');
  });
});

describe('active-conversation registry', () => {
  it('tracks nested opens from multiple surfaces', () => {
    expect(isConversationOnScreen('x')).toBe(false);
    markConversationOpen('x'); // Messages page
    markConversationOpen('x'); // chat dock
    expect(isConversationOnScreen('x')).toBe(true);
    markConversationClosed('x');
    expect(isConversationOnScreen('x')).toBe(true);
    markConversationClosed('x');
    expect(isConversationOnScreen('x')).toBe(false);
  });

  it('never reports null or unknown ids as on screen', () => {
    expect(isConversationOnScreen(null)).toBe(false);
    expect(isConversationOnScreen(undefined)).toBe(false);
    markConversationClosed('never-opened'); // must not throw or go negative
    markConversationOpen('y');
    expect(isConversationOnScreen('never-opened')).toBe(false);
    markConversationClosed('y');
  });
});
