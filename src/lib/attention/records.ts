/**
 * Small readers over record rows that more than one selector needs.
 */
import type { CorrectionRequestRow } from '@/hooks/useCorrectionRequests';

/**
 * The day a correction request is about. The request modal stores it inside
 * `proposed_change.entry_date`; older rows may carry nothing, and a PTO
 * correction carries none at all.
 */
export function correctionEntryDate(c: Pick<CorrectionRequestRow, 'proposed_change'>): string | null {
  const v = c.proposed_change?.entry_date;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
