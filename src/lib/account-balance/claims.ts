/**
 * Insurance claim → visit allocation, proven from the ledger itself.
 *
 * Dentrix closes every insurance claim with a narrative row such as
 * "Pr Dental Claim - Rec'd 271.70": the claim's BILLED total, posted right
 * after the insurance payment rows that settled it. That total identifies the
 * visit — it equals the charges of the date of service the claim covered —
 * so the payments posted just before it belong to that visit. Nothing here
 * allocates by proximity alone:
 *
 *   · a payment is allocated only when a claim row on the same date names a
 *     billed total that matches exactly one unclaimed visit's charges
 *   · internal "In-Office Provider … Adj" rows posted inside the same claim
 *     (Dentrix raising the fee when insurance overpaid) ride along, so the
 *     visit shows the NET insurance amount and no phantom patient credit
 *   · an insurance payment immediately offset by an equal internal adjustment
 *     (a $0-billed claim) nets to $0.00 and never reaches the patient
 *   · anything ambiguous stays unallocated and falls back to account level
 */
import { rowDeltaCents } from './reconcile';
import type { Cents, LedgerRow } from './types';

/** "Pr Dental Claim - Rec'd 271.70" → 27170 cents, else null. */
export function claimBilledCents(row: LedgerRow): Cents | null {
  if (row.chargeCents !== null || row.paymentCents !== null) return null;
  const m = row.rawDescription.match(/\bclaim\b.*\brec['’`]?d\b\s*\$?([\d,]+\.\d{2})/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
}

/** Charges that make up a visit: treatment plus not-yet-named charges. */
function isVisitCharge(row: LedgerRow): boolean {
  return (
    (row.classification === 'TREATMENT_CHARGE' || row.classification === 'UNKNOWN') &&
    (row.chargeCents ?? 0) > 0
  );
}

function isClaimMoney(row: LedgerRow): boolean {
  return row.classification === 'INSURANCE_PAYMENT' || row.classification === 'INTERNAL_PROVIDER_ADJUSTMENT';
}

export interface ClaimAllocation {
  /** Visit date → net insurance applied (negative cents). */
  insuranceByDate: Map<string, Cents>;
  /** Visit date → dates the settling insurance payments were posted. */
  paymentDatesByDate: Map<string, string[]>;
  /** Rows whose amounts are carried in a visit's insurance line. */
  allocatedRowIds: Set<string>;
  /** Payment + offsetting adjustment pairs that net to $0.00. */
  hiddenRowIds: Set<string>;
  /** UNKNOWN charges an insurance claim billed — proven parts of a visit. */
  claimedChargeRowIds: Set<string>;
}

export function allocateInsuranceClaims(episodeRows: LedgerRow[]): ClaimAllocation {
  const result: ClaimAllocation = {
    insuranceByDate: new Map(),
    paymentDatesByDate: new Map(),
    allocatedRowIds: new Set(),
    hiddenRowIds: new Set(),
    claimedChargeRowIds: new Set(),
  };

  // Visits: positive charges grouped by date of service, in ledger order.
  const visits: Array<{ dateISO: string; chargeCents: Cents; rows: LedgerRow[]; claimed: boolean }> = [];
  for (const row of episodeRows) {
    if (!isVisitCharge(row) || row.dateISO === '') continue;
    let visit = visits.find(v => v.dateISO === row.dateISO);
    if (!visit) {
      visit = { dateISO: row.dateISO, chargeCents: 0, rows: [], claimed: false };
      visits.push(visit);
    }
    visit.chargeCents += row.chargeCents ?? 0;
    visit.rows.push(row);
  }

  let pending: LedgerRow[] = [];
  for (let i = 0; i < episodeRows.length; i++) {
    const row = episodeRows[i];
    if (isClaimMoney(row)) {
      pending.push(row);
      continue;
    }
    if (claimBilledCents(row) === null) {
      // Any other money row ends the run of claim postings.
      if (rowDeltaCents(row) !== 0) pending = [];
      continue;
    }

    // A run of claim rows (Dentrix posts several together).
    const markers: Array<{ row: LedgerRow; billed: Cents }> = [];
    let j = i;
    while (j < episodeRows.length) {
      const billed = claimBilledCents(episodeRows[j]);
      if (billed === null || episodeRows[j].dateISO !== row.dateISO) break;
      markers.push({ row: episodeRows[j], billed });
      j++;
    }
    i = j - 1;

    let money = pending.filter(r => r.dateISO === row.dateISO);
    pending = [];

    // Payment immediately offset by an equal fee adjustment: $0 net noise.
    for (let k = 0; k + 1 < money.length; k++) {
      const a = money[k];
      const b = money[k + 1];
      const offsetting =
        a.classification === 'INSURANCE_PAYMENT' &&
        b.classification === 'INTERNAL_PROVIDER_ADJUSTMENT' &&
        rowDeltaCents(a) !== 0 &&
        rowDeltaCents(a) + rowDeltaCents(b) === 0;
      if (offsetting) {
        result.hiddenRowIds.add(a.id);
        result.hiddenRowIds.add(b.id);
        k++;
      }
    }
    money = money.filter(r => !result.hiddenRowIds.has(r.id));

    // The remaining money settles the one billed (non-$0) claim in the run.
    const billedMarkers = markers.filter(m => m.billed > 0);
    if (billedMarkers.length !== 1 || money.length === 0) continue;
    const billed = billedMarkers[0].billed;
    const visit = visits.find(
      v => !v.claimed && v.dateISO <= row.dateISO && v.chargeCents === billed
    );
    if (!visit) continue;
    const net = money.reduce((s, r) => s + rowDeltaCents(r), 0);
    // Insurance can't settle more than was billed; a mismatch stays unproven.
    if (net > 0 || -net > billed) continue;

    visit.claimed = true;
    result.insuranceByDate.set(visit.dateISO, (result.insuranceByDate.get(visit.dateISO) ?? 0) + net);
    for (const r of money) result.allocatedRowIds.add(r.id);
    const dates = result.paymentDatesByDate.get(visit.dateISO) ?? [];
    if (!dates.includes(row.dateISO)) dates.push(row.dateISO);
    result.paymentDatesByDate.set(visit.dateISO, dates);
    for (const r of visit.rows) if (r.classification === 'UNKNOWN') result.claimedChargeRowIds.add(r.id);
  }

  return result;
}
