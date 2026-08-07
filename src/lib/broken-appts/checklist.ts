/**
 * Interactive ledger-checklist state — who completed which applicable
 * action, and exactly when. The item LIST still comes from
 * buildLedgerChecklist (the policy engine); this module only tracks
 * completion in workflow memory and formats the stamps.
 *
 * HIPAA/zero-persistence boundary (src/lib/broken-appts/types.ts):
 * completions live in React state and on the printed OFFICE COPY page
 * only. Nothing here may be persisted or transmitted — timestamps and
 * staff codes for a patient workflow are patient-visit data.
 */

/** One checklist action's completion record (memory-only). */
export interface ChecklistCompletion {
  /** Stamp date, zero-padded MM/DD/YYYY (e.g. "08/07/2026"). */
  date: string;
  /** Exact local stamp time, h:mm AM/PM (e.g. "10:47 AM"). */
  time: string;
  /** Canonical staff code of the logged-in team member. */
  staffCode: string;
}

/** Completion state keyed by the action's label. */
export type ChecklistState = Record<string, ChecklistCompletion>;

/** Zero-padded MM/DD/YYYY — the office-documentation date format. */
export function formatStampDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

/** Local h:mm AM/PM — the office-documentation time format. */
export function formatStampTime(d: Date): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

/** A fresh completion record stamped now (or at an injected time). */
export function completionStamp(staffCode: string, at: Date = new Date()): ChecklistCompletion {
  return { date: formatStampDate(at), time: formatStampTime(at), staffCode };
}

/**
 * Toggle one action. Checking records a NEW stamp (a recheck never revives
 * an old timestamp); unchecking removes the record entirely.
 */
export function toggleChecklistItem(
  state: ChecklistState,
  label: string,
  checked: boolean,
  staffCode: string,
  at: Date = new Date(),
): ChecklistState {
  if (!checked) {
    const { [label]: _removed, ...rest } = state;
    return rest;
  }
  return { ...state, [label]: completionStamp(staffCode, at) };
}

/** Inline stamp shown beside a checked item: "MEG • 08/07/2026 • 10:47 AM". */
export function completionLabel(c: ChecklistCompletion): string {
  return `${c.staffCode} • ${c.date} • ${c.time}`;
}

/**
 * Drop completions for actions no longer applicable (the rung changed
 * mid-workflow) so a stale check never reaches the OFFICE COPY table.
 */
export function pruneChecklistState(state: ChecklistState, labels: string[]): ChecklistState {
  const keep = new Set(labels);
  const pruned: ChecklistState = {};
  for (const [label, completion] of Object.entries(state)) {
    if (keep.has(label)) pruned[label] = completion;
  }
  return pruned;
}
