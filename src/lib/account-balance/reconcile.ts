/**
 * Reconciliation engine — the hard invariant of the Account Balance Explainer.
 *
 * For ordinary Dentrix rows:  new balance = previous balance + charge + payment
 * (payments/credits are already negative in Dentrix — no sign flipping).
 * Every displayed running balance must reconcile exactly; Dentrix is
 * cent-based, so the default tolerance is zero. A ledger that does not
 * reconcile can never produce a patient statement.
 */
import type {
  BalanceEpisode,
  Cents,
  InternalAdjustmentBlock,
  LedgerRow,
  ReconciliationResult,
  RowReconciliation,
} from './types';

export function rowDeltaCents(row: LedgerRow): Cents {
  return (row.chargeCents ?? 0) + (row.paymentCents ?? 0);
}

/**
 * Walk the ledger row by row, checking every displayed balance against the
 * math. `toleranceCents` defaults to 0 — pass 1 only when a concrete
 * parsing/rounding reason exists.
 */
export function reconcileLedger(rows: LedgerRow[], toleranceCents = 0): ReconciliationResult {
  const rowResults: RowReconciliation[] = [];
  let firstMismatchRowId: string | null = null;
  let displayedEnding: Cents | null = null;

  if (rows.length === 0) {
    return {
      reconciled: false,
      rowResults,
      firstMismatchRowId: null,
      displayedEndingBalanceCents: null,
      reconstructedEndingBalanceCents: 0,
      differenceCents: 0,
      openingBalanceCents: 0,
    };
  }

  // Seed the opening balance from the first row: whatever balance it shows,
  // minus its own delta. A BALANCE_FORWARD row usually IS that opening.
  const first = rows[0];
  const openingBalanceCents =
    first.balanceCents !== null ? first.balanceCents - rowDeltaCents(first) : 0;

  let running = openingBalanceCents;
  for (const row of rows) {
    running += rowDeltaCents(row);
    const displayed = row.balanceCents;
    let matches = true;
    if (displayed !== null) {
      matches = Math.abs(displayed - running) <= toleranceCents;
      displayedEnding = displayed;
      if (!matches && firstMismatchRowId === null) firstMismatchRowId = row.id;
    }
    rowResults.push({ rowId: row.id, expectedBalanceCents: running, matches });
  }

  const differenceCents = displayedEnding === null ? 0 : displayedEnding - running;
  const reconciled =
    displayedEnding !== null &&
    firstMismatchRowId === null &&
    Math.abs(differenceCents) <= toleranceCents;

  return {
    reconciled,
    rowResults,
    firstMismatchRowId,
    displayedEndingBalanceCents: displayedEnding,
    reconstructedEndingBalanceCents: running,
    differenceCents,
    openingBalanceCents,
  };
}

/**
 * Find the current-balance episode: everything after the most recent point
 * where the running balance was exactly $0.00. History before that anchor
 * does not contribute to today's balance and stays out of the explanation.
 *
 * With no zero anchor, the whole import is the episode and the opening
 * balance becomes "Balance brought forward from activity before [date]".
 */
export function findBalanceEpisode(
  rows: LedgerRow[],
  reconciliation: ReconciliationResult
): BalanceEpisode {
  const firstImportedDateISO = rows.find(r => r.dateISO !== '')?.dateISO ?? '';

  // Use the reconstructed running balances (they equal the displayed ones
  // once the ledger reconciles).
  let anchorIndex = -1;
  for (let i = 0; i < rows.length - 1; i++) {
    if (reconciliation.rowResults[i]?.expectedBalanceCents === 0) anchorIndex = i;
  }
  if (reconciliation.openingBalanceCents === 0 && anchorIndex === -1) {
    // The import itself starts from zero — the whole thing is the episode
    // with nothing brought forward.
    return {
      startIndex: 0,
      rows: [...rows],
      hasZeroAnchor: true,
      broughtForwardCents: 0,
      firstImportedDateISO,
    };
  }

  if (anchorIndex >= 0) {
    return {
      startIndex: anchorIndex + 1,
      rows: rows.slice(anchorIndex + 1),
      hasZeroAnchor: true,
      broughtForwardCents: 0,
      firstImportedDateISO,
    };
  }

  return {
    startIndex: 0,
    rows: [...rows],
    hasZeroAnchor: false,
    broughtForwardCents: reconciliation.openingBalanceCents,
    firstImportedDateISO,
  };
}

/**
 * Group contiguous INTERNAL_PROVIDER_ADJUSTMENT rows. A block that nets to
 * exactly $0.00 is provably neutral bookkeeping and may be hidden from the
 * patient document; any other block requires staff explanation.
 */
export function findInternalAdjustmentBlocks(rows: LedgerRow[]): InternalAdjustmentBlock[] {
  const blocks: InternalAdjustmentBlock[] = [];
  let current: LedgerRow[] = [];
  const flush = () => {
    if (current.length > 0) {
      const netCents = current.reduce((s, r) => s + rowDeltaCents(r), 0);
      blocks.push({
        rowIds: current.map(r => r.id),
        netCents,
        netsToZero: netCents === 0,
      });
      current = [];
    }
  };
  for (const row of rows) {
    if (row.classification === 'INTERNAL_PROVIDER_ADJUSTMENT') current.push(row);
    else flush();
  }
  flush();
  return blocks;
}

export interface CancellationWaiverLink {
  feeRowId: string;
  creditRowId: string;
  amountCents: Cents;
  /**
   * True when the pair is certain on its own: same date, contiguous rows,
   * exact offset. Anything less certain becomes a Smart Review question.
   */
  certain: boolean;
}

/**
 * Pair cancellation/no-show fees with courtesy credits. Only a same-date,
 * contiguous, exact-offset pair is linked automatically; other plausible
 * pairs are returned as uncertain so staff confirm the relationship.
 */
export function findCancellationWaivers(rows: LedgerRow[]): CancellationWaiverLink[] {
  const links: CancellationWaiverLink[] = [];
  const usedCredits = new Set<string>();

  rows.forEach((row, i) => {
    if (row.classification !== 'CANCELLATION_OR_NO_SHOW_FEE') return;
    const fee = row.chargeCents ?? 0;
    if (fee <= 0) return;

    // Certain: the immediately following row is a courtesy credit for the
    // exact amount on the same date.
    const next = rows[i + 1];
    if (
      next &&
      !usedCredits.has(next.id) &&
      next.classification === 'COURTESY_ADJUSTMENT' &&
      rowDeltaCents(next) === -fee &&
      next.dateISO !== '' &&
      next.dateISO === row.dateISO
    ) {
      usedCredits.add(next.id);
      links.push({ feeRowId: row.id, creditRowId: next.id, amountCents: fee, certain: true });
      return;
    }

    // Plausible: a later courtesy credit for the exact amount — ask staff.
    const candidate = rows
      .slice(i + 1)
      .find(
        r =>
          !usedCredits.has(r.id) &&
          r.classification === 'COURTESY_ADJUSTMENT' &&
          rowDeltaCents(r) === -fee
      );
    if (candidate) {
      usedCredits.add(candidate.id);
      links.push({ feeRowId: row.id, creditRowId: candidate.id, amountCents: fee, certain: false });
    }
  });

  return links;
}
