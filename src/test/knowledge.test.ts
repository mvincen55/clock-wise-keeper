import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_AUDIENCE_ROLES,
  KNOWLEDGE_BLOCK_LABELS,
  KNOWLEDGE_BLOCK_TYPES,
  KNOWLEDGE_STATUSES,
  KNOWLEDGE_STATUS_LABELS,
  areaForKnowledgeKind,
  createBlankKnowledgeDraft,
  createKnowledgeBlock,
  knowledgeStatusBadgeClass,
  knowledgeStatusPriority,
  validateKnowledgeDraft,
  workflowActionForStatus,
} from '@/lib/knowledge';

describe('knowledge placement rules', () => {
  it('sends policies to the handbook and procedures to the playbook', () => {
    expect(areaForKnowledgeKind('policy')).toBe('handbook');
    expect(areaForKnowledgeKind('procedure')).toBe('playbook');
  });

  it('starts new drafts with every office role in the audience', () => {
    const draft = createBlankKnowledgeDraft('procedure');
    expect(draft.kind).toBe('procedure');
    expect(draft.audienceRoles).toEqual(KNOWLEDGE_AUDIENCE_ROLES);
    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0].block_type).toBe('paragraph');
  });
});

describe('knowledge draft validation', () => {
  it('accepts a complete policy draft', () => {
    const draft = createBlankKnowledgeDraft('policy');
    draft.title = 'Attendance and punctuality';
    draft.blocks[0].plain_text = 'Team members arrive ready to work at their scheduled start time.';

    expect(validateKnowledgeDraft(draft)).toEqual([]);
  });

  it('requires a title, audience, and content', () => {
    const draft = createBlankKnowledgeDraft();
    draft.audienceRoles = [];
    draft.blocks[0].plain_text = '';

    const errors = validateKnowledgeDraft(draft);
    expect(errors.map(error => error.field)).toEqual(['title', 'audienceRoles', 'blocks']);
  });

  it('identifies which content block is empty', () => {
    const draft = createBlankKnowledgeDraft();
    draft.title = 'Office opening';
    draft.blocks = [
      createKnowledgeBlock('heading', 'Before the first patient'),
      createKnowledgeBlock('steps', ''),
    ];

    expect(validateKnowledgeDraft(draft)).toEqual([
      {
        field: 'blocks',
        message: 'Block 2 is empty. Add content or remove the block.',
      },
    ]);
  });

  it('allows an empty divider because it is structural, not content', () => {
    const draft = createBlankKnowledgeDraft();
    draft.title = 'Closing checklist';
    draft.blocks = [
      createKnowledgeBlock('paragraph', 'Complete these steps before leaving.'),
      createKnowledgeBlock('divider', ''),
    ];

    expect(validateKnowledgeDraft(draft)).toEqual([]);
  });

  it('rejects a draft with no blocks', () => {
    const draft = createBlankKnowledgeDraft();
    draft.title = 'Insurance estimate review';
    draft.blocks = [];

    expect(validateKnowledgeDraft(draft)).toContainEqual({
      field: 'blocks',
      message: 'Add at least one content block.',
    });
  });
});

describe('knowledge workflow actions', () => {
  it('maps each active state to one clear next action', () => {
    expect(workflowActionForStatus('draft')).toBe('edit');
    expect(workflowActionForStatus('in_review')).toBe('review');
    expect(workflowActionForStatus('approved')).toBe('publish');
    expect(workflowActionForStatus('published')).toBe('revise');
    expect(workflowActionForStatus('superseded')).toBe('revise');
    expect(workflowActionForStatus('retired')).toBe('none');
  });

  it('sorts actionable states ahead of published history', () => {
    const sorted = [...KNOWLEDGE_STATUSES].sort(
      (left, right) => knowledgeStatusPriority(left) - knowledgeStatusPriority(right),
    );

    expect(sorted.slice(0, 4)).toEqual(['in_review', 'approved', 'draft', 'published']);
  });

  it('labels every database status and block type', () => {
    for (const status of KNOWLEDGE_STATUSES) {
      expect(KNOWLEDGE_STATUS_LABELS[status]).toBeTruthy();
      expect(knowledgeStatusBadgeClass(status)).toBeTruthy();
    }
    for (const blockType of KNOWLEDGE_BLOCK_TYPES) {
      expect(KNOWLEDGE_BLOCK_LABELS[blockType]).toBeTruthy();
    }
  });
});
