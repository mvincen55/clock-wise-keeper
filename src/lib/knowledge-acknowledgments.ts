import type { KnowledgeAcknowledgmentRow } from '@/integrations/supabase/knowledge-acknowledgment-client';

export type KnowledgeAcknowledgmentState =
  | 'waived'
  | 'complete'
  | 'blocked'
  | 'question'
  | 'snoozed'
  | 'overdue'
  | 'viewed'
  | 'pending';

type StateFields = Pick<
  KnowledgeAcknowledgmentRow,
  | 'waived_at'
  | 'acknowledged_at'
  | 'blocked_at'
  | 'question_asked_at'
  | 'question_resolved_at'
  | 'snoozed_until'
  | 'first_viewed_at'
  | 'due_at'
>;

export function knowledgeAcknowledgmentState(
  assignment: StateFields,
  now = new Date(),
): KnowledgeAcknowledgmentState {
  if (assignment.waived_at) return 'waived';
  if (assignment.acknowledged_at) return 'complete';
  if (assignment.blocked_at) return 'blocked';
  if (assignment.question_asked_at && !assignment.question_resolved_at) return 'question';
  if (assignment.snoozed_until && new Date(assignment.snoozed_until).getTime() > now.getTime()) {
    return 'snoozed';
  }
  if (new Date(assignment.due_at).getTime() < now.getTime()) return 'overdue';
  if (assignment.first_viewed_at) return 'viewed';
  return 'pending';
}

export function knowledgeAcknowledgmentCounts(
  assignments: StateFields[],
  now = new Date(),
): Record<KnowledgeAcknowledgmentState, number> {
  const counts: Record<KnowledgeAcknowledgmentState, number> = {
    waived: 0,
    complete: 0,
    blocked: 0,
    question: 0,
    snoozed: 0,
    overdue: 0,
    viewed: 0,
    pending: 0,
  };
  for (const assignment of assignments) {
    counts[knowledgeAcknowledgmentState(assignment, now)] += 1;
  }
  return counts;
}

export function isKnowledgeAcknowledgmentActive(
  assignment: Pick<KnowledgeAcknowledgmentRow, 'waived_at' | 'acknowledged_at'>,
): boolean {
  return !assignment.waived_at && !assignment.acknowledged_at;
}

export function knowledgeEscalationLabel(level: number): string {
  if (level >= 4) return 'Owner review';
  if (level === 3) return 'Manager follow-up';
  if (level === 2) return 'Email reminder sent';
  if (level === 1) return 'In-app reminder sent';
  return 'Assigned';
}

export function canUseKnowledgeSnooze(
  assignment: Pick<KnowledgeAcknowledgmentRow, 'snooze_count' | 'blocked_at' | 'question_asked_at' | 'question_resolved_at'>,
  maxSnoozes: number,
): boolean {
  return (
    assignment.snooze_count < maxSnoozes &&
    !assignment.blocked_at &&
    !(assignment.question_asked_at && !assignment.question_resolved_at)
  );
}
