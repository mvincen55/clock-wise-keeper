export const KNOWLEDGE_AREAS = ['handbook', 'playbook'] as const;
export const KNOWLEDGE_KINDS = ['policy', 'procedure'] as const;
export const KNOWLEDGE_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'superseded',
  'retired',
] as const;
export const KNOWLEDGE_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'bullet_list',
  'numbered_list',
  'callout',
  'steps',
  'table',
  'script',
  'checklist',
  'image',
  'divider',
] as const;
export const KNOWLEDGE_AUDIENCE_ROLES = ['owner', 'manager', 'employee'] as const;
export const DEFAULT_ACKNOWLEDGMENT_STATEMENT =
  'I acknowledge that I received and read this office policy or procedure.';

export type KnowledgeArea = (typeof KNOWLEDGE_AREAS)[number];
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
export type KnowledgeBlockType = (typeof KNOWLEDGE_BLOCK_TYPES)[number];
export type KnowledgeAudienceRole = (typeof KNOWLEDGE_AUDIENCE_ROLES)[number];

export type KnowledgeBlockDraft = {
  block_key: string;
  block_type: KnowledgeBlockType;
  plain_text: string;
  data: Record<string, unknown>;
};

export type KnowledgeDraftInput = {
  title: string;
  summary: string;
  kind: KnowledgeKind;
  categoryId: string | null;
  audienceRoles: KnowledgeAudienceRole[];
  changeSummary: string;
  blocks: KnowledgeBlockDraft[];
  acknowledgmentRequired: boolean;
  acknowledgmentDueDays: number | null;
  acknowledgmentStatement: string;
};

export type KnowledgeValidationError = {
  field: 'title' | 'audienceRoles' | 'blocks' | 'acknowledgment';
  message: string;
};

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  published: 'Published',
  superseded: 'Superseded',
  retired: 'Retired',
};

export const KNOWLEDGE_BLOCK_LABELS: Record<KnowledgeBlockType, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  bullet_list: 'Bullets',
  numbered_list: 'Numbered list',
  callout: 'Callout',
  steps: 'Procedure steps',
  table: 'Table',
  script: 'Phone or chairside script',
  checklist: 'Checklist',
  image: 'Image note',
  divider: 'Divider',
};

export function areaForKnowledgeKind(kind: KnowledgeKind): KnowledgeArea {
  return kind === 'policy' ? 'handbook' : 'playbook';
}

export function knowledgeKindLabel(kind: KnowledgeKind): string {
  return kind === 'policy' ? 'Policy' : 'Procedure';
}

export function knowledgeAreaLabel(area: KnowledgeArea): string {
  return area === 'handbook' ? 'Policy Handbook' : 'Practice Playbook';
}

export function knowledgeAudienceLabel(role: KnowledgeAudienceRole): string {
  if (role === 'owner') return 'Owners';
  if (role === 'manager') return 'Managers';
  return 'Team members';
}

function makeBlockKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createKnowledgeBlock(
  blockType: KnowledgeBlockType = 'paragraph',
  plainText = '',
): KnowledgeBlockDraft {
  return {
    block_key: makeBlockKey(),
    block_type: blockType,
    plain_text: plainText,
    data: {},
  };
}

export function createBlankKnowledgeDraft(kind: KnowledgeKind = 'policy'): KnowledgeDraftInput {
  return {
    title: '',
    summary: '',
    kind,
    categoryId: null,
    audienceRoles: ['owner', 'manager', 'employee'],
    changeSummary: '',
    blocks: [createKnowledgeBlock('paragraph')],
    acknowledgmentRequired: false,
    acknowledgmentDueDays: null,
    acknowledgmentStatement: DEFAULT_ACKNOWLEDGMENT_STATEMENT,
  };
}

export function validateKnowledgeDraft(input: KnowledgeDraftInput): KnowledgeValidationError[] {
  const errors: KnowledgeValidationError[] = [];

  if (!input.title.trim()) {
    errors.push({ field: 'title', message: 'Give this policy or procedure a clear title.' });
  }

  if (input.audienceRoles.length === 0) {
    errors.push({ field: 'audienceRoles', message: 'Select at least one audience.' });
  }

  if (input.blocks.length === 0) {
    errors.push({ field: 'blocks', message: 'Add at least one content block.' });
  } else {
    const emptyIndex = input.blocks.findIndex(
      block => block.block_type !== 'divider' && !block.plain_text.trim(),
    );
    if (emptyIndex >= 0) {
      errors.push({
        field: 'blocks',
        message: `Block ${emptyIndex + 1} is empty. Add content or remove the block.`,
      });
    }
  }

  if (input.acknowledgmentRequired) {
    if (
      input.acknowledgmentDueDays === null
      || !Number.isInteger(input.acknowledgmentDueDays)
      || input.acknowledgmentDueDays < 1
      || input.acknowledgmentDueDays > 90
    ) {
      errors.push({
        field: 'acknowledgment',
        message: 'Choose an acknowledgment deadline from 1 to 90 days.',
      });
    }

    const statementLength = input.acknowledgmentStatement.trim().length;
    if (statementLength < 10 || statementLength > 1000) {
      errors.push({
        field: 'acknowledgment',
        message: 'The acknowledgment statement must be 10 to 1,000 characters.',
      });
    }
  }

  return errors;
}

export function knowledgeStatusPriority(status: KnowledgeStatus): number {
  const priorities: Record<KnowledgeStatus, number> = {
    in_review: 0,
    approved: 1,
    draft: 2,
    published: 3,
    superseded: 4,
    retired: 5,
  };
  return priorities[status];
}

export function knowledgeStatusBadgeClass(status: KnowledgeStatus): string {
  if (status === 'published') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'approved') return 'border-violet-200 bg-violet-50 text-violet-800';
  if (status === 'in_review') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'draft') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-border bg-muted text-muted-foreground';
}

export function workflowActionForStatus(status: KnowledgeStatus):
  | 'edit'
  | 'review'
  | 'publish'
  | 'revise'
  | 'none' {
  if (status === 'draft') return 'edit';
  if (status === 'in_review') return 'review';
  if (status === 'approved') return 'publish';
  if (status === 'published' || status === 'superseded') return 'revise';
  return 'none';
}
