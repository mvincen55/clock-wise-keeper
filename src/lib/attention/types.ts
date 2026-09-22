/**
 * The unified attention model — shared types.
 *
 * Three layers of state, one invariant:
 *
 *   Layer 1 · records   — punches, days, requests, closeouts, versions, records.
 *                          Changed only by a canonical editor. Read by everything.
 *   Layer 2 · work      — what the manager has done about an item: needs action,
 *                          waiting on the employee or another reviewer, followed up.
 *   Layer 3 · presentation — parked until a date, snoozed until a time.
 *
 * Asking, parking, snoozing, reading, or acknowledging never corrects a record.
 * Layers 2 and 3 persist in `manager_followups` (see useManagerFollowups) and
 * are keyed by the item key, so they survive refresh and devices.
 */

export type AttentionVerb = 'decide' | 'fix' | 'follow_up';

export type AttentionKind =
  /** a human answered the closeout staffing question "unsafe" or "understaffed" */
  | 'staffing_answer'
  /** an open punch pair past the scheduled end while the office is closing */
  | 'clocked_in_after_close'
  | 'pto_request'
  | 'correction_request'
  | 'change_request'
  | 'content_review'
  | 'challenge_verify'
  | 'incident_countersign'
  | 'missing_clock_out'
  | 'missing_day'
  | 'unpaired_punches'
  | 'time_suspect'
  | 'close_day_unsealed'
  | 'close_day_behind'
  | 'close_day_review'
  | 'tardy_unreviewed'
  | 'bypass_followup'
  | 'record_signoff'
  | 'ack_escalated'
  | 'training_overdue'
  | 'incident_followup';

export type WorkState = 'needs_action' | 'waiting_on_employee' | 'waiting_on_reviewer' | 'followed_up';

/** Layer 2 + 3, as persisted per item key. */
export type ManagerFollowup = {
  item_key: string;
  work_state: WorkState;
  owner_user_id: string | null;
  requested_at: string | null;
  due_at: string | null;
  parked_until: string | null;
  snoozed_until: string | null;
  note: string | null;
};

export type SourceState = 'ok' | 'loading' | 'stale' | 'error' | 'unauthorized' | 'partial';
export type SourceStatus = { state: SourceState; asOf: string | null; detail?: string };

export type AttentionSubject = {
  employeeId: string | null;
  userId: string | null;
  name: string | null;
};

export type AttentionDeadline = {
  /** "payroll Thu", "due Wed", "tonight" */
  label: string;
  /** ISO date the deadline falls on. */
  date: string;
  /** Whole days from today; 0 = today. */
  days: number;
};

export type AttentionItem = {
  /** `${kind}:${recordId}` — the dedup key. One item per record condition. */
  key: string;
  kind: AttentionKind;
  verb: AttentionVerb;
  recordTable: string;
  recordId: string;
  subject: AttentionSubject;
  /** What happened, short: "No clock-out · Fri Sep 18". */
  label: string;
  /** Context in one line. */
  detail: string;
  /** The office rule that admitted it — never "this might be interesting". */
  why: string;
  /** When the condition arose (ISO date or timestamp), for age and ordering. */
  occurredAt: string | null;
  ageHours: number | null;
  deadline: AttentionDeadline | null;
  /** A verified active coverage or safety issue. Outranks every deadline. */
  coverage: boolean;
  /** Makes the selected payroll period questionable until the record changes. */
  payroll: boolean;
  /** The feature's own deep link to the record. */
  href: string;
  /** Layer 2. */
  work: WorkState;
  waitingOn: { ownerUserId: string | null; requestedAt: string | null; dueAt: string | null } | null;
  /** Layer 3. */
  parkedUntil: string | null;
  snoozedUntil: string | null;
};

export type AttentionCounts = {
  unresolved: number;
  needsNow: number;
  waiting: number;
  deferred: number;
  byVerb: Record<AttentionVerb, number>;
};

export type AttentionResult = {
  /** Every open item, ordered by consequence. Layer 1 decides membership. */
  unresolved: AttentionItem[];
  /** unresolved ∧ needs_action ∧ not parked or snoozed. The badge counts this. */
  needsNow: AttentionItem[];
  /** unresolved ∧ waiting on someone else. Still open, still counted as unresolved. */
  waiting: AttentionItem[];
  /** unresolved ∧ parked or snoozed. Still open, still due. */
  deferred: AttentionItem[];
  counts: AttentionCounts;
  /** Sources that were not `ok`. Never rendered as "nothing to report". */
  degradedSources: { name: string; status: SourceStatus }[];
};
