import { describe, it, expect } from 'vitest';
import {
  closeoutExclusion,
  closeoutCutoffMinutes,
  outstandingCloseoutMessages,
  type ReceivedMessage,
} from '@/lib/messages-closeout';

const msg = (over: Partial<ReceivedMessage> & { id: string }): ReceivedMessage => ({
  note: 'note',
  needs_reply: false,
  created_at: '2026-07-30T14:00:00.000Z',
  first_seen_at: null,
  acknowledged_at: null,
  ...over,
});

describe('closeout applicability', () => {
  const base = { role: 'employee', messagingEnabled: true, closeoutEnabled: true };

  it('never applies to the owner', () => {
    expect(closeoutExclusion({ ...base, role: 'owner' })).toBe('owner');
  });

  it('applies to managers and employees', () => {
    expect(closeoutExclusion({ ...base, role: 'manager', scheduledToday: true })).toBeNull();
    expect(closeoutExclusion({ ...base, role: 'employee', scheduledToday: true })).toBeNull();
  });

  it('is off when messaging or the closeout item is turned off', () => {
    expect(closeoutExclusion({ ...base, messagingEnabled: false })).toBe('off');
    expect(closeoutExclusion({ ...base, closeoutEnabled: false })).toBe('off');
  });

  it('skips people on time off and people not scheduled', () => {
    expect(closeoutExclusion({ ...base, onTimeOff: true })).toBe('time-off');
    expect(closeoutExclusion({ ...base, scheduledToday: false })).toBe('not-scheduled');
  });

  it('checks owner before anything else', () => {
    expect(closeoutExclusion({ ...base, role: 'owner', messagingEnabled: false })).toBe('owner');
  });
});

describe('cutoff', () => {
  it('backs the grace window off the scheduled end time', () => {
    expect(closeoutCutoffMinutes(17 * 60, 30)).toBe(17 * 60 - 30);
  });

  it('defaults to 5pm when there is no end time, and never goes negative', () => {
    expect(closeoutCutoffMinutes(null, 30)).toBe(17 * 60 - 30);
    expect(closeoutCutoffMinutes(10, 60)).toBe(0);
  });
});

describe('outstanding messages', () => {
  it('clears a plain note once it has been opened', () => {
    const seen = msg({ id: 'a', first_seen_at: '2026-07-30T15:00:00.000Z' });
    expect(outstandingCloseoutMessages([seen])).toHaveLength(0);
    expect(outstandingCloseoutMessages([msg({ id: 'a' })])).toHaveLength(1);
  });

  it('does NOT clear a needs_reply note just because it was opened', () => {
    const opened = msg({ id: 'b', needs_reply: true, first_seen_at: '2026-07-30T15:00:00.000Z' });
    const out = outstandingCloseoutMessages([opened]);
    expect(out.map(m => m.id)).toEqual(['b']);
    expect(out[0].needs_reply).toBe(true);
  });

  it('clears a needs_reply note by replying', () => {
    const m = msg({ id: 'c', needs_reply: true });
    expect(outstandingCloseoutMessages([m], { repliedTo: ['c'] })).toHaveLength(0);
  });

  it('clears a needs_reply note by an explicit acknowledgement', () => {
    const m = msg({ id: 'd', needs_reply: true, acknowledged_at: '2026-07-30T16:00:00.000Z' });
    expect(outstandingCloseoutMessages([m])).toHaveLength(0);
  });

  it('ignores replies to other notes', () => {
    const m = msg({ id: 'e', needs_reply: true });
    expect(outstandingCloseoutMessages([m], { repliedTo: ['other'] })).toHaveLength(1);
  });

  it('drops notes that landed after the person clocked out', () => {
    const late = msg({ id: 'f', created_at: '2026-07-30T22:00:00.000Z' });
    const early = msg({ id: 'g', created_at: '2026-07-30T13:00:00.000Z' });
    const out = outstandingCloseoutMessages([late, early], {
      clockedOutAt: '2026-07-30T21:00:00.000Z',
    });
    expect(out.map(m => m.id)).toEqual(['g']);
  });

  it('keeps everything in play when the person never clocked out', () => {
    const out = outstandingCloseoutMessages([msg({ id: 'h' }), msg({ id: 'i' })], {
      clockedOutAt: null,
    });
    expect(out).toHaveLength(2);
  });

  it('is satisfied when nothing is outstanding', () => {
    const all = [
      msg({ id: 'j', first_seen_at: '2026-07-30T15:00:00.000Z' }),
      msg({ id: 'k', needs_reply: true, acknowledged_at: '2026-07-30T15:30:00.000Z' }),
    ];
    expect(outstandingCloseoutMessages(all)).toEqual([]);
  });
});
