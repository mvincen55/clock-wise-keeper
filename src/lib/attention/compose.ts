/**
 * Pure helpers that turn query results into `AttentionSources` fields, kept
 * out of the hook so they can be tested without React.
 */
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { DepositLog } from '@/hooks/useDepositLog';
import type { KnowledgeWorkspaceItem } from '@/hooks/useKnowledge';
import type { AttentionSources, VersionInReview } from './derive';
import type { SourceStatus } from './types';

/** The shape a TanStack query exposes that a source status is read from. */
export type QueryLike = { data: unknown; isError: boolean; error?: unknown; dataUpdatedAt?: number };

/** ok when rows are in hand and the last fetch succeeded; error when it failed (stale rows or not); loading otherwise. */
export function queryStatus(q: QueryLike): SourceStatus {
  const asOf = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : null;
  if (q.isError) {
    const detail = q.error instanceof Error ? q.error.message : typeof q.error === 'string' ? q.error : undefined;
    return { state: 'error', asOf, detail };
  }
  if (q.data === undefined) return { state: 'loading', asOf: null };
  return { state: 'ok', asOf };
}

/**
 * Closeout facts for Attention: today's record, the last sealed day, how
 * many office days have passed since it with nothing sealed, and the saved
 * past days that were never sealed. An "office day" is a date some clocking
 * person (not an owner, not a roster member off the clock) was scheduled on
 * and no closure covered.
 */
export function closeoutsFrom(
  logs: DepositLog[],
  dayStatuses: AttendanceDayStatusRow[],
  today: string,
  ownerUserIds: Set<string>,
  nonClockingEmployeeIds: Set<string> = new Set(),
): NonNullable<AttentionSources['closeouts']> {
  const byDate = new Map(logs.map(l => [l.deposit_date, l]));
  const sealedDates = logs.filter(l => l.sealed_at).map(l => l.deposit_date).sort();
  const latestSealedDate = sealedDates.length ? sealedDates[sealedDates.length - 1] : null;
  const officeDays = new Set(
    dayStatuses
      .filter(r => r.is_scheduled_day && !r.office_closed && !ownerUserIds.has(r.user_id) && !(r.employee_id && nonClockingEmployeeIds.has(r.employee_id)))
      .map(r => r.entry_date),
  );
  const officeDaysSinceSeal = latestSealedDate === null
    ? 0
    : [...officeDays].filter(d => d > latestSealedDate && d < today).length;
  const unsealedPast = logs
    .filter(l => !l.sealed_at && l.deposit_date < today)
    .map(l => ({ id: l.id, deposit_date: l.deposit_date }));
  return { today: byDate.get(today) ?? null, latestSealedDate, officeDaysSinceSeal, unsealedPast };
}

/** Every knowledge version currently in review, flattened from the workspace. */
export function versionsInReviewFrom(items: KnowledgeWorkspaceItem[]): VersionInReview[] {
  return items
    .flatMap(item => item.versions)
    .filter(v => v.status === 'in_review')
    .map(v => ({ id: v.id, title: v.title, version_number: v.version_number, submitted_by: v.submitted_by, submitted_at: v.submitted_at }));
}
