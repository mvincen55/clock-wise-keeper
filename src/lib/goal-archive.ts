/**
 * Archiving a goal is never silent: the reason is part of the action, and the
 * goal_events row is built from the same validated input the update uses.
 */

export const MIN_ARCHIVE_REASON_CHARS = 8;

export type GoalArchiveInput = {
  goal: { id: string; title: string };
  reason: string;
  actorId: string;
  orgId: string;
};

export type GoalArchiveEvent = {
  org_id: string;
  goal_id: string;
  actor_id: string;
  type: 'archive';
  old_title: string;
  new_title: string;
  reason: string;
};

export class ArchiveReasonError extends Error {}

/** Trims and validates the reason. Throws rather than archiving silently. */
export function normalizeArchiveReason(reason: string): string {
  const trimmed = (reason ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_ARCHIVE_REASON_CHARS) {
    throw new ArchiveReasonError(
      `Tell the team why in a few words (at least ${MIN_ARCHIVE_REASON_CHARS} characters).`
    );
  }
  return trimmed.slice(0, 500);
}

export function buildArchiveEvent(input: GoalArchiveInput): GoalArchiveEvent {
  if (!input.actorId || !input.orgId) {
    throw new ArchiveReasonError('Not ready');
  }
  return {
    org_id: input.orgId,
    goal_id: input.goal.id,
    actor_id: input.actorId,
    type: 'archive',
    old_title: input.goal.title,
    new_title: input.goal.title,
    reason: normalizeArchiveReason(input.reason),
  };
}
