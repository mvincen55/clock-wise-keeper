import type { KnowledgeAcknowledgmentRow } from '@/integrations/supabase/knowledge-acknowledgment-client';

export type KnowledgeAcknowledgmentState =
  | 'waived'
  | 'complete'
  | 'overdue'
  | 'viewed'
  | 'pending';

export function knowledgeAcknowledgmentState(
  assignment: Pick<
    KnowledgeAcknowledgmentRow,
    'waived_at' | 'acknowledged_at' | 'first_viewed_at' | 'due_at'
  >,
  now = new Date(),
): KnowledgeAcknowledgmentState {
  if (assignment.waived_at) return 'waived';
  if (assignment.acknowledged_at) return 'complete';
  if (new Date(assignment.due_at).getTime() < now.getTime()) return 'overdue';
  if (assignment.first_viewed_at) return 'viewed';
  return 'pending';
}

export function knowledgeAcknowledgmentCounts(
  assignments: Array<Pick<KnowledgeAcknowledgmentRow, 'waived_at' | 'acknowledged_at' | 'first_viewed_at' | 'due_at'>>,
  now = new Date(),
): Record<KnowledgeAcknowledgmentState, number> {
  const counts: Record<KnowledgeAcknowledgmentState, number> = {
    waived: 0,
    complete: 0,
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
