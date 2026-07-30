import { describe, it, expect } from 'vitest';
import {
  ArchiveReasonError,
  buildArchiveEvent,
  normalizeArchiveReason,
  MIN_ARCHIVE_REASON_CHARS,
} from '@/lib/goal-archive';

const goal = { id: 'goal-1', title: 'Ask patients for a review after each hygiene visit' };

describe('goal archive with reason', () => {
  it('refuses an empty reason', () => {
    expect(() => normalizeArchiveReason('')).toThrow(ArchiveReasonError);
    expect(() => normalizeArchiveReason('   ')).toThrow(ArchiveReasonError);
  });

  it('refuses a token reason shorter than the minimum', () => {
    expect(MIN_ARCHIVE_REASON_CHARS).toBeGreaterThan(3);
    expect(() => normalizeArchiveReason('nvm')).toThrow(/at least/);
  });

  it('collapses whitespace and keeps the wording', () => {
    expect(normalizeArchiveReason('  role   changed mid-month  ')).toBe('role changed mid-month');
  });

  it('caps very long reasons', () => {
    expect(normalizeArchiveReason('x'.repeat(900))).toHaveLength(500);
  });

  it('builds an audit event that preserves the title on both sides', () => {
    const event = buildArchiveEvent({
      goal,
      reason: 'Moved to the front desk team',
      actorId: 'user-1',
      orgId: 'org-1',
    });
    expect(event).toEqual({
      org_id: 'org-1',
      goal_id: 'goal-1',
      actor_id: 'user-1',
      type: 'archive',
      old_title: goal.title,
      new_title: goal.title,
      reason: 'Moved to the front desk team',
    });
  });

  it('never builds an event without an actor and org', () => {
    expect(() =>
      buildArchiveEvent({ goal, reason: 'Moved to the front desk team', actorId: '', orgId: 'org-1' })
    ).toThrow(ArchiveReasonError);
    expect(() =>
      buildArchiveEvent({ goal, reason: 'Moved to the front desk team', actorId: 'u', orgId: '' })
    ).toThrow(ArchiveReasonError);
  });

  it('validates the reason before producing an event', () => {
    expect(() =>
      buildArchiveEvent({ goal, reason: 'no', actorId: 'user-1', orgId: 'org-1' })
    ).toThrow(ArchiveReasonError);
  });
});
