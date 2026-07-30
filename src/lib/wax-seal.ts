// The purple wax seal — a quiet, private celebration.
//
// Two hard rules, both enforced here so the UI can't drift from them:
//   1. A given milestone is sealed once, ever.
//   2. At most ONE seal per calendar month, no matter how much lands at once.
// Everything else stays in the badge list, unsealed and undramatic.

export type SealLedger = {
  /** Milestone ids that have already been sealed. */
  sealed: string[];
  /** Month (YYYY-MM) the most recent seal was shown. */
  lastSealedMonth: string | null;
};

export const EMPTY_LEDGER: SealLedger = { sealed: [], lastSealedMonth: null };

/** YYYY-MM for a YYYY-MM-DD date (or any ISO timestamp). */
export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/**
 * Should this milestone get the seal right now?
 * False when it's already been sealed, or when this month has had its one.
 */
export function shouldSeal(
  milestoneId: string,
  todayISO: string,
  ledger: SealLedger = EMPTY_LEDGER,
): boolean {
  if (!milestoneId) return false;
  if (ledger.sealed.includes(milestoneId)) return false;
  return ledger.lastSealedMonth !== monthKey(todayISO);
}

/**
 * Given every milestone earned, pick the one to seal — the first unsealed one,
 * or none if this month's seal is already spent.
 */
export function nextSeal(
  earnedMilestoneIds: string[],
  todayISO: string,
  ledger: SealLedger = EMPTY_LEDGER,
): string | null {
  return earnedMilestoneIds.find(id => shouldSeal(id, todayISO, ledger)) ?? null;
}

/** Records a shown seal. Returns a new ledger — never mutates the old one. */
export function recordSeal(
  milestoneId: string,
  todayISO: string,
  ledger: SealLedger = EMPTY_LEDGER,
): SealLedger {
  if (ledger.sealed.includes(milestoneId)) return ledger;
  return {
    sealed: [...ledger.sealed, milestoneId],
    lastSealedMonth: monthKey(todayISO),
  };
}

const STORAGE_KEY = 'pe.wax-seal.ledger.v1';

/** The ledger is per-person and private — it never leaves the device. */
export function loadLedger(storage: Pick<Storage, 'getItem'> = localStorage): SealLedger {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LEDGER;
    const parsed = JSON.parse(raw) as Partial<SealLedger>;
    return {
      sealed: Array.isArray(parsed.sealed) ? parsed.sealed.map(String) : [],
      lastSealedMonth: typeof parsed.lastSealedMonth === 'string' ? parsed.lastSealedMonth : null,
    };
  } catch {
    return EMPTY_LEDGER;
  }
}

export function saveLedger(
  ledger: SealLedger,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch {
    // A full or blocked storage must never break a celebration.
  }
}
