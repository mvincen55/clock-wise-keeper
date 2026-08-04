import { describe, expect, it } from 'vitest';
import {
  canUseKnowledgeSnooze,
  isKnowledgeAcknowledgmentActive,
  knowledgeAcknowledgmentCounts,
  knowledgeAcknowledgmentState,
  knowledgeEscalationLabel,
} from '@/lib/knowledge-acknowledgments';
import {
  DEFAULT_ACKNOWLEDGMENT_STATEMENT,
  createBlankKnowledgeDraft,
  validateKnowledgeDraft,
} from '@/lib/knowledge';

const now = new Date('2026-08-04T12:00:00.000Z');

function assignment(overrides: Partial<{
  waived_at: string | null;
  acknowledged_at: string | null;
  blocked_at: string | null;
  question_asked_at: string | null;
  question_resolved_at: string | null;
  snoozed_until: string | null;
  snooze_count: number;
  first_viewed_at: string | null;
  due_at: string;
}> = {}) {
  return {
    waived_at: null,
    acknowledged_at: null,
    blocked_at: null,
    question_asked_at: null,
    question_resolved_at: null,
    snoozed_until: null,
    snooze_count: 0,
    first_viewed_at: null,
    due_at: '2026-08-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('knowledge acknowledgment status', () => {
  it('uses one deterministic state with historical and explicit pause states taking priority', () => {
    expect(knowledgeAcknowledgmentState(assignment(), now)).toBe('pending');
    expect(knowledgeAcknowledgmentState(assignment({ first_viewed_at: '2026-08-04T10:00:00.000Z' }), now)).toBe('viewed');
    expect(knowledgeAcknowledgmentState(assignment({ due_at: '2026-08-03T12:00:00.000Z' }), now)).toBe('overdue');
    expect(knowledgeAcknowledgmentState(assignment({
      due_at: '2026-08-03T12:00:00.000Z',
      snoozed_until: '2026-08-06T12:00:00.000Z',
    }), now)).toBe('snoozed');
    expect(knowledgeAcknowledgmentState(assignment({
      due_at: '2026-08-03T12:00:00.000Z',
      question_asked_at: '2026-08-04T09:00:00.000Z',
    }), now)).toBe('question');
    expect(knowledgeAcknowledgmentState(assignment({
      due_at: '2026-08-03T12:00:00.000Z',
      blocked_at: '2026-08-04T09:30:00.000Z',
    }), now)).toBe('blocked');
    expect(knowledgeAcknowledgmentState(assignment({
      due_at: '2026-08-03T12:00:00.000Z',
      acknowledged_at: '2026-08-04T11:00:00.000Z',
      blocked_at: '2026-08-04T09:30:00.000Z',
    }), now)).toBe('complete');
    expect(knowledgeAcknowledgmentState(assignment({
      acknowledged_at: '2026-08-04T11:00:00.000Z',
      waived_at: '2026-08-04T11:30:00.000Z',
    }), now)).toBe('waived');
  });

  it('expires a snooze back into the factual due state', () => {
    expect(knowledgeAcknowledgmentState(assignment({
      snoozed_until: '2026-08-04T11:59:00.000Z',
      due_at: '2026-08-03T12:00:00.000Z',
    }), now)).toBe('overdue');
  });

  it('counts every operational state exactly once', () => {
    const counts = knowledgeAcknowledgmentCounts([
      assignment(),
      assignment({ first_viewed_at: '2026-08-04T10:00:00.000Z' }),
      assignment({ due_at: '2026-08-03T12:00:00.000Z' }),
      assignment({ snoozed_until: '2026-08-06T12:00:00.000Z' }),
      assignment({ question_asked_at: '2026-08-04T09:00:00.000Z' }),
      assignment({ blocked_at: '2026-08-04T09:00:00.000Z' }),
      assignment({ acknowledged_at: '2026-08-04T11:00:00.000Z' }),
      assignment({ waived_at: '2026-08-04T11:30:00.000Z' }),
    ], now);

    expect(counts).toEqual({
      pending: 1,
      viewed: 1,
      overdue: 1,
      snoozed: 1,
      question: 1,
      blocked: 1,
      complete: 1,
      waived: 1,
    });
  });

  it('treats only unsigned and unwaived assignments as active', () => {
    expect(isKnowledgeAcknowledgmentActive(assignment())).toBe(true);
    expect(isKnowledgeAcknowledgmentActive(assignment({ blocked_at: '2026-08-04T11:00:00.000Z' }))).toBe(true);
    expect(isKnowledgeAcknowledgmentActive(assignment({ acknowledged_at: '2026-08-04T11:00:00.000Z' }))).toBe(false);
    expect(isKnowledgeAcknowledgmentActive(assignment({ waived_at: '2026-08-04T11:00:00.000Z' }))).toBe(false);
  });

  it('limits snoozes and does not stack them on top of another pause reason', () => {
    expect(canUseKnowledgeSnooze(assignment(), 2)).toBe(true);
    expect(canUseKnowledgeSnooze(assignment({ snooze_count: 2 }), 2)).toBe(false);
    expect(canUseKnowledgeSnooze(assignment({ blocked_at: '2026-08-04T11:00:00.000Z' }), 2)).toBe(false);
    expect(canUseKnowledgeSnooze(assignment({ question_asked_at: '2026-08-04T11:00:00.000Z' }), 2)).toBe(false);
    expect(canUseKnowledgeSnooze(assignment({
      question_asked_at: '2026-08-04T10:00:00.000Z',
      question_resolved_at: '2026-08-04T11:00:00.000Z',
    }), 2)).toBe(true);
  });

  it('renders an honest escalation label', () => {
    expect(knowledgeEscalationLabel(0)).toBe('Assigned');
    expect(knowledgeEscalationLabel(1)).toBe('In-app reminder sent');
    expect(knowledgeEscalationLabel(2)).toBe('Email reminder sent');
    expect(knowledgeEscalationLabel(3)).toBe('Manager follow-up');
    expect(knowledgeEscalationLabel(4)).toBe('Owner review');
  });
});

describe('knowledge acknowledgment authoring rules', () => {
  it('starts optional and uses neutral receipt language', () => {
    const draft = createBlankKnowledgeDraft('policy');
    expect(draft.acknowledgmentRequired).toBe(false);
    expect(draft.acknowledgmentDueDays).toBeNull();
    expect(draft.acknowledgmentStatement).toBe(DEFAULT_ACKNOWLEDGMENT_STATEMENT);
  });

  it('requires a real deadline when acknowledgment is enabled', () => {
    const draft = createBlankKnowledgeDraft('policy');
    draft.title = 'Attendance';
    draft.blocks[0].plain_text = 'Arrive ready to work at the scheduled start time.';
    draft.acknowledgmentRequired = true;
    draft.acknowledgmentDueDays = null;

    expect(validateKnowledgeDraft(draft)).toContainEqual({
      field: 'acknowledgment',
      message: 'Choose an acknowledgment deadline from 1 to 90 days.',
    });
  });

  it('rejects acknowledgment statements that are too short or too long', () => {
    const draft = createBlankKnowledgeDraft('policy');
    draft.title = 'Attendance';
    draft.blocks[0].plain_text = 'Arrive ready to work at the scheduled start time.';
    draft.acknowledgmentRequired = true;
    draft.acknowledgmentDueDays = 7;
    draft.acknowledgmentStatement = 'Read';

    expect(validateKnowledgeDraft(draft)).toContainEqual({
      field: 'acknowledgment',
      message: 'The acknowledgment statement must be 10 to 1,000 characters.',
    });

    draft.acknowledgmentStatement = 'x'.repeat(1001);
    expect(validateKnowledgeDraft(draft)).toContainEqual({
      field: 'acknowledgment',
      message: 'The acknowledgment statement must be 10 to 1,000 characters.',
    });
  });

  it('accepts a complete acknowledgment configuration', () => {
    const draft = createBlankKnowledgeDraft('procedure');
    draft.title = 'Daily closeout';
    draft.blocks[0].plain_text = 'Verify the deposit and complete the closing checklist.';
    draft.acknowledgmentRequired = true;
    draft.acknowledgmentDueDays = 5;

    expect(validateKnowledgeDraft(draft)).toEqual([]);
  });
});
