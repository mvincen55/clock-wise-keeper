import { describe, expect, it } from 'vitest';
import {
  MESSAGE_MAX,
  REACTIONS,
  announce,
  describe as describeMoment,
  idsToMarkRevealed,
  isApprovedReaction,
  normalizeText,
  planReveal,
  validateDraft,
  type PendingMoment,
} from '@/components/moments/reactions';

const m = (over: Partial<PendingMoment> = {}): PendingMoment => ({
  id: 'a',
  reaction: 'celebrate',
  message: 'Thanks for covering.',
  context_label: 'Covering Assisting',
  created_at: '2026-08-01T10:00:00Z',
  sender_name: 'Megan',
  ...over,
});

describe('approved reactions', () => {
  it('is positive recognition only', () => {
    expect(REACTIONS.map((r) => r.key).sort()).toEqual(
      ['celebrate', 'crushed_it', 'great_save', 'nice_work', 'team_win', 'thank_you'],
    );
  });

  it('refuses anything corrective or sarcastic', () => {
    for (const bad of ['thumbs_down', 'angry', 'warning', 'needs_improvement', 'eye_roll']) {
      expect(isApprovedReaction(bad)).toBe(false);
    }
  });
});

describe('draft validation', () => {
  it('needs a recipient and a reaction', () => {
    const problems = validateDraft({ recipientEmployeeId: null, reaction: null });
    expect(problems.map((p) => p.field)).toEqual(['recipient', 'reaction']);
  });

  it('will not let you recognise yourself', () => {
    const problems = validateDraft(
      { recipientEmployeeId: 'e1', reaction: 'team_win' },
      { senderEmployeeId: 'e1' },
    );
    expect(problems[0]).toMatchObject({ field: 'recipient' });
  });

  it('caps the message length', () => {
    const problems = validateDraft({ recipientEmployeeId: 'e2', reaction: 'team_win', message: 'x'.repeat(MESSAGE_MAX + 1) });
    expect(problems.map((p) => p.field)).toContain('message');
  });

  it('honours an office that has messages switched off', () => {
    const problems = validateDraft(
      { recipientEmployeeId: 'e2', reaction: 'team_win', message: 'nice' },
      { allowMessage: false },
    );
    expect(problems.map((p) => p.field)).toContain('message');
  });

  it('accepts a clean draft', () => {
    expect(
      validateDraft(
        { recipientEmployeeId: 'e2', reaction: 'thank_you', message: 'Thanks!', contextLabel: 'Front Desk' },
        { senderEmployeeId: 'e1' },
      ),
    ).toEqual([]);
  });
});

describe('text normalisation', () => {
  it('collapses whitespace and drops empties', () => {
    expect(normalizeText('  nice   work  ', 240)).toBe('nice work');
    expect(normalizeText('   ', 240)).toBeNull();
    expect(normalizeText(undefined, 240)).toBeNull();
  });

  it('truncates to the stored maximum', () => {
    expect(normalizeText('x'.repeat(300), 240)).toHaveLength(240);
  });
});

describe('reveal planning', () => {
  it('animates a single moment by default', () => {
    const plan = planReveal([m()]);
    expect(plan).toMatchObject({ show: true, animate: true, combined: false });
  });

  it('shows one combined sequence when several are waiting, not one per moment', () => {
    const plan = planReveal([m({ id: 'b', created_at: '2026-08-02T10:00:00Z' }), m({ id: 'a' })]);
    expect(plan.combined).toBe(true);
    expect(plan.order.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('skips motion for reduced-motion and for a muted preference', () => {
    expect(planReveal([m()], { reducedMotion: true }).animate).toBe(false);
    expect(planReveal([m()], { muted: true }).animate).toBe(false);
    // Still delivered — just already open.
    expect(planReveal([m()], { muted: true }).show).toBe(true);
  });

  it('shows nothing when there is nothing waiting', () => {
    expect(planReveal([]).show).toBe(false);
  });
});

describe('screen reader announcement', () => {
  it('is plain text with no decorative emoji', () => {
    const text = describeMoment(m());
    expect(text).toContain('Celebrate from Megan');
    expect(text).toContain('Covering Assisting');
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('summarises a combined reveal', () => {
    const text = announce([m(), m({ id: 'b', sender_name: 'Priya', reaction: 'team_win' })]);
    expect(text.startsWith('2 team moments.')).toBe(true);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('reveal is write-once (duplicate / replay safety)', () => {
  it('only marks the ones not already revealed', () => {
    expect(
      idsToMarkRevealed([
        { id: 'a', revealed_at: null },
        { id: 'b', revealed_at: '2026-08-01T10:00:00Z' },
      ]),
    ).toEqual(['a']);
  });

  it('is a no-op on replay from a second device or refreshed session', () => {
    const rows = [{ id: 'a', revealed_at: null }];
    const first = idsToMarkRevealed(rows);
    expect(first).toEqual(['a']);
    // Second pass, same session state already marked locally.
    expect(idsToMarkRevealed(rows, first)).toEqual([]);
    // And once the server confirms, nothing is left to mark.
    expect(idsToMarkRevealed([{ id: 'a', revealed_at: '2026-08-01T10:01:00Z' }])).toEqual([]);
  });
});
