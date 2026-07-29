import type { Cents } from './types';
import { formatCents } from './money';

/**
 * Which fee an imported treatment-plan row should carry — and whether the
 * choice needs a human to look at it.
 *
 * A practice-management screenshot shows up to two money columns. OFFICE
 * is the office's own fee and wins outright. The plain "Fee" column is
 * whatever that PMS view is configured to print: on a plan pulled up
 * under a patient's carrier it is the CONTRACTED rate, not the office
 * fee. So it ranks last, behind this office's own fee schedule.
 *
 * When it is the ONLY number available — no OFFICE column, and the code
 * is not on the office fee schedule — the row still takes it, because a
 * blank fee reads as $0 and disappears quietly. But it is always flagged:
 * a contracted rate sitting unnoticed in the office fee column understates
 * the write-off, and with it the insurance estimate and the patient's
 * portion, on every form built from that import.
 */

export interface ImportedFeeSource {
  /** Procedure code, already trimmed and upper-cased. */
  code: string;
  /** OFFICE column on the screenshot. Null when the view has no such column. */
  pmsOfficeFeeCents: Cents | null;
  /** This code's fee on the office's own schedule. Null = not on file. */
  onFileFeeCents: Cents | null;
  /** The plain "Fee" column. May be a carrier's contracted rate. */
  contractedFeeCents: Cents | null;
}

export interface ResolvedImportedFee {
  /** Null only when the row carried no usable number at all. */
  feeCents: Cents | null;
  /** Empty when nothing needs checking. */
  flag: string;
  /** True when the fee fell through to the screenshot's ambiguous column. */
  unpriced: boolean;
}

export function resolveImportedFee(src: ImportedFeeSource): ResolvedImportedFee {
  const { code, pmsOfficeFeeCents, onFileFeeCents, contractedFeeCents } = src;

  // 1. The PMS OFFICE column is the office's current fee.
  if (pmsOfficeFeeCents !== null) {
    return {
      feeCents: pmsOfficeFeeCents,
      flag:
        onFileFeeCents !== null && pmsOfficeFeeCents !== onFileFeeCents
          ? `PMS office fee ${formatCents(pmsOfficeFeeCents)} differs from our fee schedule ${formatCents(onFileFeeCents)} — using the PMS office fee`
          : '',
      unpriced: false,
    };
  }

  // 2. Our own fee schedule backs it up.
  if (onFileFeeCents !== null) {
    return {
      feeCents: onFileFeeCents,
      flag:
        contractedFeeCents !== null && contractedFeeCents !== onFileFeeCents
          ? `PMS shows ${formatCents(contractedFeeCents)} — using our office fee ${formatCents(onFileFeeCents)}`
          : '',
      unpriced: false,
    };
  }

  // 3. Nothing on file: the screenshot's Fee column is all there is, and
  //    it may not be an office fee at all. Take it, but say so.
  if (contractedFeeCents !== null) {
    const label = code || 'this code';
    return {
      feeCents: contractedFeeCents,
      flag: `No office fee on file for ${label} — using ${formatCents(contractedFeeCents)} from the screenshot, which may be a contracted insurance rate. Check it, and add ${label} to your Office Fee Schedule.`,
      unpriced: true,
    };
  }

  return { feeCents: null, flag: '', unpriced: false };
}
