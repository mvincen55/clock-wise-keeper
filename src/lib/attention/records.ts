/**
 * Small readers over record rows that more than one selector needs.
 */
import type { CorrectionRequestRow } from '@/hooks/useCorrectionRequests';

/**
 * The day a correction request is about. The request modal stores it inside
 * `proposed_change.entry_date`; older rows may carry nothing, and a PTO
 * correction carries none at all.
 */
/**
 * A correction about someone's punches. The Timesheet and the clock widget
 * file it against the day (`time_entries`); the late-arrival prompt files it
 * against `punches`. Either way the fix is made in the punch editor.
 */
export function isTimeCorrection(c: Pick<CorrectionRequestRow, 'target_table'>): boolean {
  return c.target_table === 'punches' || c.target_table === 'time_entries';
}

/**
 * An approved time correction whose punch fix has not landed yet: the
 * approval is on record, the day is not fixed. It stays someone's work.
 */
export function awaitingApply(c: Pick<CorrectionRequestRow, 'status' | 'target_table'>): boolean {
  return c.status === 'approved' && isTimeCorrection(c);
}

export function correctionEntryDate(c: Pick<CorrectionRequestRow, 'proposed_change'>): string | null {
  const v = c.proposed_change?.entry_date;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
