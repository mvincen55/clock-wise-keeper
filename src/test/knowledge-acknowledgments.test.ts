import { describe, expect, it } from 'vitest';
import {
  isKnowledgeAcknowledgmentActive,
  knowledgeAcknowledgmentCounts,
  knowledgeAcknowledgmentState,
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
  first_viewed_at: string | null;
  due_at: string;
}> = {}) {
  return {
    waived_at: null,
    acknowledged_at: null,
    first_viewed_at: null,
    due_at: '2026-08-05T12:00:00.000Z',
    ...overrides,
  };
}

describe('knowledge acknowledgment status', () => {
  it('uses one deterministic state with historical states taking priority', () => {
    expect(knowledgeAcknowledgmentState(assignment(), now)).toBe('pending');
    expect(knowledgeAcknowledgmentState(assignment({ first_viewed_at: '2026-08-04T10:00:00.000Z' }), now)).toBe('viewed');
    expect(knowledgeAcknowledgmentState(assignment({ due_at: '2026-08-03T12:00:00.000Z' }), now)).toBe('overdue');
    expect(knowledgeAcknowledgmentState(assignment({
      due_at: '2026-08-03T12:00:00.000Z',
      acknowledged_at: '2026-08-04T11:00:00.000Z',
    }), now)).toBe('complete');
    expect(knowledgeAcknowledgmentState(assignment({
      acknowledged_at: '2026-08-04T11:00:00.000Z',
      waived_at: '2026-08-04T11:30:00.000Z',
    }), now)).toBe('waived');
  });

  it('counts each assignment exactly once', () => {
    const counts = knowledgeAcknowledgmentCounts([
      assignment(),
      assignment({ first_viewed_at: '2026-08-04T10:00:00.000Z' }),
      assignment({ due_at: '2026-08-03T12:00:00.000Z' }),
      assignment({ acknowledged_at: '2026-08-04T11:00:00.000Z' }),
      assignment({ waived_at: '2026-08-04T11:30:00.000Z' }),
    ], now);

    expect(counts).toEqual({
      pending: 1,
      viewed: 1,
      overdue: 1,
      complete: 1,
      waived: 1,
    });
  });

  it('treats only unsigned and unwaived assignments as active', () => {
    expect(isKnowledgeAcknowledgmentActive(assignment())).toBe(true);
    expect(isKnowledgeAcknowledgmentActive(assignment({ acknowledged_at: '2026-08-04T11:00:00.000Z' }))).toBe(false);
    expect(isKnowledgeAcknowledgmentActive(assignment({ waived_at: '2026-08-04T11:00:00.000Z' }))).toBe(false);
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
