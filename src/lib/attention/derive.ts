/**
 * deriveAttention — the one selector every management surface reads.
 *
 * Admission rule (an invariant): an item enters only when
 *   1. the manager must make a decision,
 *   2. a business record is incorrect or incomplete and the manager can fix it, or
 *   3. a recorded office rule has reached the point where manager follow-up is required.
 * Never: passive observations, patterns, FYIs, metrics, "approaching" states.
 *
 * Order (consequence): a verified active coverage or safety issue first, then
 * the soonest deadline, then decisions, fixes, follow-ups, oldest first.
 *
 * Dedup: one item per record condition (`kind:recordId`). A pending correction
 * request supersedes a missing-time condition for the same person and day —
 * approving it is the fix — so the day never appears twice.
 *
 * Layer 2 (work) and Layer 3 (presentation) come from persisted follow-ups and
 * only decide which list an open item sits in. They never decide membership.
 */
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import type { ChangeRequestRow } from '@/hooks/useChangeRequests';
import type { ChecklistBypass } from '@/hooks/useChecklistBypasses';
import type { CorrectionRequestRow } from '@/hooks/useCorrectionRequests';
import type { DayOffRow } from '@/hooks/useDaysOff';
import type { DepositLog } from '@/hooks/useDepositLog';
import type { IncidentReport } from '@/hooks/useIncidentReports';
import type { OfficeClosureRow } from '@/hooks/useOfficeClosures';
import type { PtoRequest } from '@/hooks/usePtoRequests';
import type { TardyRow } from '@/hooks/useTardies';
import type { TeamGoal } from '@/hooks/useTeamGoals';
import type { TimeEntryRow } from '@/hooks/useTimeEntries';
import type { TrainingAssignment } from '@/hooks/useTraining';
import type { AccountabilityReport } from '@/hooks/useAccountability';
import type { OfficePhase } from '@/components/dashboard/staffing';
import { parseClockMinutes } from '@/components/dashboard/staffing';
import { signatureState } from '@/lib/incidents';
import { daysBetween } from '@/lib/time-utils';
import { missingTimeConditions } from './missing-time';
import { correctionEntryDate } from './records';
import type {
  AttentionCounts, AttentionDeadline, AttentionItem, AttentionKind, AttentionResult, AttentionVerb,
  ManagerFollowup, SourceStatus, WorkState,
} from './types';

export type AttentionEmployee = { id: string; user_id: string | null; display_name: string };
export type AckAssignment = {
  id: string; employee_id: string | null; user_id: string | null; escalation_level: number | null;
  acknowledged_at: string | null; waived_at: string | null; overdue_at: string | null; title_snapshot: string | null;
};
export type VersionInReview = { id: string; title: string; version_number: number; submitted_by: string | null; submitted_at: string | null };

export type AttentionSources = {
  today: string;
  nowIso: string;
  /** Minutes since midnight in the office timezone. */
  nowMinutes: number;
  bufferMinutes: number;
  officePhase: OfficePhase;
  viewer: { userId: string; role: 'owner' | 'manager' };
  employees: AttentionEmployee[];
  ownerUserIds: Set<string>;
  /** Roster members off the clock (employees.clocks_in = false), by employee id. */
  nonClockingEmployeeIds?: Set<string>;
  /**
   * The pay period being prepared; null when payroll is not configured. The
   * deadline exists only when the office set one (dueDate null otherwise).
   */
  payrollPeriod: { start: string; end: string; dueDate: string | null; dueLabel: string | null } | null;
  /** Office rules that admit follow-ups. */
  rules: { reviewTardies: boolean; bypassReasonHours: number; ackManagerLevel: number };
  dayStatuses?: AttendanceDayStatusRow[];
  entries?: TimeEntryRow[];
  daysOff?: DayOffRow[];
  closures?: OfficeClosureRow[];
  exceptions?: AttendanceExceptionRow[];
  tardies?: TardyRow[];
  ptoRequests?: PtoRequest[];
  corrections?: CorrectionRequestRow[];
  changeRequests?: ChangeRequestRow[];
  closeouts?: {
    today: DepositLog | null;
    latestSealedDate: string | null;
    /** Office days (someone scheduled, no closure) after the last sealed day and before today. */
    officeDaysSinceSeal: number;
    unsealedPast: { id: string; deposit_date: string }[];
  };
  bypasses?: ChecklistBypass[];
  accountability?: AccountabilityReport[];
  acks?: AckAssignment[];
  training?: TrainingAssignment[];
  trainingTitles?: Map<string, string>;
  incidents?: IncidentReport[];
  versionsInReview?: VersionInReview[];
  challenges?: TeamGoal[];
  followups?: ManagerFollowup[];
  /** Per-source status the hook reports; a missing array is `loading`. */
  sources?: Partial<Record<string, SourceStatus>>;
};

const VERB_RANK: Record<AttentionVerb, number> = { decide: 0, fix: 1, follow_up: 2 };

export const KIND_VERB: Record<AttentionKind, AttentionVerb> = {
  staffing_answer: 'fix', clocked_in_after_close: 'fix',
  pto_request: 'decide', correction_request: 'decide', change_request: 'decide', content_review: 'decide',
  challenge_verify: 'decide', incident_countersign: 'decide',
  missing_clock_out: 'fix', missing_day: 'fix', unpaired_punches: 'fix', time_suspect: 'fix',
  close_day_unsealed: 'fix', close_day_behind: 'fix', close_day_review: 'fix',
  tardy_unreviewed: 'follow_up', bypass_followup: 'follow_up', record_signoff: 'follow_up', ack_escalated: 'follow_up',
  training_overdue: 'follow_up', incident_followup: 'follow_up',
};

export const itemKey = (kind: AttentionKind, recordId: string) => `${kind}:${recordId}`;

/**
 * Kinds whose office rule asks for a manager follow-up and nothing else: a
 * `followed_up` follow-up satisfies the rule, so the item leaves Attention
 * even though the record itself does not change (the bypass reason stays
 * owed on the person's record; the staffing answer stays on the closeout).
 * Every other kind leaves only when its record changes.
 */
export const FOLLOWUP_RESOLVES: ReadonlySet<AttentionKind> = new Set<AttentionKind>(['staffing_answer', 'bypass_followup']);

function hoursBetween(fromIso: string | null, toIso: string): number | null {
  if (!fromIso) return null;
  const from = new Date(fromIso.length === 10 ? `${fromIso}T12:00:00Z` : fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.max(0, (to - from) / 3_600_000);
}

export function compareByConsequence(a: AttentionItem, b: AttentionItem): number {
  if (a.coverage !== b.coverage) return a.coverage ? -1 : 1;
  const da = a.deadline ? a.deadline.days : Number.POSITIVE_INFINITY;
  const db = b.deadline ? b.deadline.days : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  if (VERB_RANK[a.verb] !== VERB_RANK[b.verb]) return VERB_RANK[a.verb] - VERB_RANK[b.verb];
  return (b.ageHours ?? 0) - (a.ageHours ?? 0);
}

export function deriveAttention(src: AttentionSources): AttentionResult {
  const { today, nowIso, nowMinutes, bufferMinutes, viewer, employees, ownerUserIds, payrollPeriod, rules } = src;
  const nameOf = (employeeId?: string | null, userId?: string | null): string | null => {
    const e = (employeeId && employees.find(x => x.id === employeeId)) || (userId && employees.find(x => x.user_id === userId)) || null;
    return e ? e.display_name : null;
  };
  const subjectOf = (employeeId?: string | null, userId?: string | null) => {
    const e = (employeeId && employees.find(x => x.id === employeeId)) || (userId && employees.find(x => x.user_id === userId)) || null;
    return { employeeId: e?.id ?? employeeId ?? null, userId: e?.user_id ?? userId ?? null, name: e?.display_name ?? null };
  };
  // The roster is the active people. Records of someone who has been archived
  // are not the office's work any more, so they never become items.
  const onRoster = (employeeId?: string | null, userId?: string | null): boolean =>
    employees.some(x => (!!employeeId && x.id === employeeId) || (!!userId && x.user_id === userId));
  const deadlineOn = (date: string, label: string): AttentionDeadline => ({ label, date, days: Math.max(0, daysBetween(today, date)) });
  const inPeriod = (date: string | null | undefined) => !!(payrollPeriod && date && date >= payrollPeriod.start && date <= payrollPeriod.end);
  const payrollDeadline = () => (payrollPeriod?.dueDate ? deadlineOn(payrollPeriod.dueDate, payrollPeriod.dueLabel ?? 'payroll') : null);
  // A park is a date (back that morning); a snooze is a time. Either is over once reached.
  const stillAhead = (until: string) => (until.length === 10 ? until > today : until > nowIso);
  const followups = src.followups ?? [];
  const followupFor = (key: string) => followups.find(f => f.item_key === key) ?? null;

  const degradedSources: AttentionResult['degradedSources'] = [];
  const sourceOk = (name: keyof AttentionSources | 'roster', loaded: unknown): boolean => {
    const reported = src.sources?.[name as string];
    if (reported && reported.state !== 'ok') { degradedSources.push({ name: name as string, status: reported }); return false; }
    if (loaded === undefined) { degradedSources.push({ name: name as string, status: { state: 'loading', asOf: null } }); return false; }
    return true;
  };

  const items = new Map<string, AttentionItem>();
  const add = (partial: Omit<AttentionItem, 'key' | 'verb' | 'ageHours' | 'work' | 'waitingOn' | 'parkedUntil' | 'snoozedUntil'>) => {
    const key = itemKey(partial.kind, partial.recordId);
    if (items.has(key)) return;
    const f = followupFor(key);
    if (f?.work_state === 'followed_up' && FOLLOWUP_RESOLVES.has(partial.kind)) return; // the rule's follow-up is on record
    const parkedUntil = f?.parked_until && stillAhead(f.parked_until) ? f.parked_until : null;
    const snoozedUntil = f?.snoozed_until && stillAhead(f.snoozed_until) ? f.snoozed_until : null;
    const work: WorkState = f?.work_state ?? 'needs_action';
    items.set(key, {
      ...partial, key, verb: KIND_VERB[partial.kind], ageHours: hoursBetween(partial.occurredAt, nowIso), work,
      waitingOn: work === 'waiting_on_employee' || work === 'waiting_on_reviewer' ? { ownerUserId: f?.owner_user_id ?? null, requestedAt: f?.requested_at ?? null, dueAt: f?.due_at ?? null } : null,
      parkedUntil, snoozedUntil,
    });
  };

  /* ---- 1. a human said the day was unsafe or understaffed: coverage, first ---- */
  if (sourceOk('closeouts', src.closeouts)) {
    const log = src.closeouts!.today;
    if (log && (log.staffing_assessment === 'unsafe' || log.staffing_assessment === 'understaffed')) {
      add({ kind: 'staffing_answer', recordTable: 'deposit_logs', recordId: log.id, subject: { employeeId: null, userId: null, name: null },
        label: log.staffing_assessment === 'unsafe' ? 'Staffing answered “unsafe” today' : 'Staffing answered “understaffed” today',
        detail: 'A person answered the closeout staffing question. Read it before planning tomorrow.',
        why: 'Office rule: an unsafe or understaffed staffing answer outranks everything else.',
        occurredAt: log.updated_at ?? log.created_at, deadline: deadlineOn(today, 'today'), coverage: true, payroll: false, href: `/deposit-log?date=${log.deposit_date}&step=4` });
    }
  }

  /* ---- 2. decisions ---- */
  if (sourceOk('ptoRequests', src.ptoRequests)) for (const p of src.ptoRequests!) {
    if (p.status !== 'pending') continue;
    const overlaps = !!payrollPeriod && p.end_date >= payrollPeriod.start && p.start_date <= payrollPeriod.end;
    add({ kind: 'pto_request', recordTable: 'pto_requests', recordId: p.id, subject: subjectOf(p.employee_id, p.created_by),
      label: `PTO request · ${p.start_date === p.end_date ? p.start_date : `${p.start_date} – ${p.end_date}`}${p.hours_requested ? ` (${p.hours_requested}h)` : ''}`,
      detail: p.note || '', why: 'A PTO request is waiting on a manager decision.', occurredAt: p.created_at,
      deadline: overlaps ? payrollDeadline() : null, coverage: false, payroll: overlaps, href: `/management?item=${itemKey('pto_request', p.id)}` });
  }
  const correctedDays = new Set<string>();
  if (sourceOk('corrections', src.corrections)) for (const c of src.corrections!) {
    if (c.status !== 'pending') continue;
    const entryDate = correctionEntryDate(c);
    if (entryDate) correctedDays.add(`${c.employee_id}|${entryDate}`);
    const payroll = inPeriod(entryDate);
    add({ kind: 'correction_request', recordTable: 'correction_requests', recordId: c.id, subject: subjectOf(c.employee_id, c.created_by),
      label: `Time correction${entryDate ? ` · ${entryDate}` : ''}`, detail: c.reason || '', why: 'A correction request is pending. Approving opens the punch editor; the original punches stay on record.',
      occurredAt: c.created_at, deadline: payroll ? payrollDeadline() : null, coverage: false, payroll, href: `/management?item=${itemKey('correction_request', c.id)}` });
  }
  if (sourceOk('changeRequests', src.changeRequests)) for (const c of src.changeRequests!) {
    if (c.status !== 'pending') continue;
    add({ kind: 'change_request', recordTable: 'change_requests', recordId: c.id, subject: subjectOf(c.employee_id, c.requested_by),
      label: `Change request · ${c.request_type.replace('_', ' ')}`, detail: String(c.payload?.description ?? ''), why: 'A change request is waiting on a manager decision.',
      occurredAt: c.created_at, deadline: null, coverage: false, payroll: false, href: `/management?item=${itemKey('change_request', c.id)}` });
  }
  if (sourceOk('versionsInReview', src.versionsInReview)) for (const v of src.versionsInReview!) {
    if (v.submitted_by === viewer.userId) continue; // nobody reviews their own submission
    add({ kind: 'content_review', recordTable: 'knowledge_versions', recordId: v.id, subject: { employeeId: null, userId: v.submitted_by, name: nameOf(null, v.submitted_by) },
      label: `${v.title} · version ${v.version_number} in review`, detail: '', why: 'A version in review needs a reviewer who is not its author before it can be published.',
      occurredAt: v.submitted_at, deadline: null, coverage: false, payroll: false, href: `/management/knowledge?version=${v.id}` });
  }
  if (sourceOk('challenges', src.challenges)) for (const g of src.challenges!) {
    if (g.status !== 'pending_verification') continue;
    add({ kind: 'challenge_verify', recordTable: 'team_goals', recordId: g.id, subject: { employeeId: null, userId: null, name: null },
      label: `“${g.title}” needs verification`, detail: `${g.progress} of ${g.target_count} · ended ${g.ends_on}`, why: 'A finished challenge is verified by a manager before it counts.',
      occurredAt: g.ends_on, deadline: null, coverage: false, payroll: false, href: `/?sprint=${g.id}` });
  }
  if (sourceOk('incidents', src.incidents)) for (const r of src.incidents!) {
    const sig = signatureState({ employee_signed_at: r.employee_signed_at, manager_signed_at: r.manager_signed_at });
    const mayCountersign = r.countersign_role === 'owner' ? viewer.role === 'owner' : true;
    const isSubject = r.employee_id && employees.find(e => e.id === r.employee_id)?.user_id === viewer.userId;
    if (sig === 'awaiting_countersign' && r.status !== 'closed' && mayCountersign && !isSubject) {
      add({ kind: 'incident_countersign', recordTable: 'incident_reports', recordId: r.id, subject: subjectOf(r.employee_id),
        label: `Incident report awaiting your countersign · ${r.incident_date}`, detail: r.category, why: 'A signed incident report needs a countersignature to close the loop.',
        occurredAt: r.employee_signed_at, deadline: null, coverage: false, payroll: false, href: `/incident-reports?report=${r.id}` });
    }
    if (r.follow_up_required && r.status !== 'closed') {
      add({ kind: 'incident_followup', recordTable: 'incident_reports', recordId: r.id, subject: subjectOf(r.employee_id),
        label: `Incident follow-up open · ${r.incident_date}`, detail: r.follow_up_notes || '', why: 'The review marked this report as needing follow-up and it is not closed.',
        occurredAt: r.reviewed_at ?? r.created_at, deadline: null, coverage: false, payroll: false, href: `/incident-reports?report=${r.id}` });
    }
  }

  /* ---- 3. the record of truth: time and the closeout ---- */
  // Attendance needs the roster too: owners are excluded by user id and
  // non-clocking members by employee id, so an unloaded roster would read
  // their days as missing time.
  const offClock = src.nonClockingEmployeeIds ?? new Set<string>();
  const attendanceOk = sourceOk('roster', src.employees) && sourceOk('dayStatuses', src.dayStatuses) && sourceOk('entries', src.entries)
    && sourceOk('daysOff', src.daysOff) && sourceOk('closures', src.closures) && sourceOk('exceptions', src.exceptions);
  if (attendanceOk) {
    const closureDates = new Set(src.closures!.map(c => c.closure_date));
    const entryByKey = new Map(src.entries!.filter(e => e.employee_id).map(e => [`${e.employee_id}|${e.entry_date}`, e]));
    const excByKey = new Map(src.exceptions!.map(x => [`${x.employee_id}|${x.exception_date}`, x]));
    for (const row of src.dayStatuses!) {
      if (ownerUserIds.has(row.user_id) || (row.employee_id && offClock.has(row.employee_id))) continue;
      if (!onRoster(row.employee_id, row.user_id)) continue;
      const dayKey = `${row.employee_id}|${row.entry_date}`;
      const subject = subjectOf(row.employee_id, row.user_id);
      const end = parseClockMinutes(row.schedule_expected_end);
      // Coverage: still clocked in past the scheduled end while the office is closing.
      if (row.entry_date === today && row.has_punches && row.is_incomplete && end !== null && nowMinutes > end && src.officePhase === 'after_close') {
        add({ kind: 'clocked_in_after_close', recordTable: 'attendance_day_status', recordId: row.id, subject,
          label: 'Still clocked in past the scheduled end', detail: `Scheduled until ${row.schedule_expected_end?.slice(0, 5)} · the office is closing`,
          why: 'An open punch pair past the scheduled end while the office is closing. Verify first; left alone it becomes a missing clock-out.',
          occurredAt: nowIso, deadline: deadlineOn(today, 'tonight'), coverage: true, payroll: inPeriod(row.entry_date), href: `/management/attendance?employee=${row.employee_id ?? ''}&date=${row.entry_date}` });
        continue;
      }
      if (correctedDays.has(dayKey)) continue; // the pending correction is the fix
      const kinds = missingTimeConditions({ row, entry: entryByKey.get(dayKey) ?? null, daysOff: src.daysOff!.filter(d => d.employee_id === row.employee_id), closed: closureDates.has(row.entry_date), exception: excByKey.get(dayKey) ?? null, today, nowMinutes, bufferMinutes });
      for (const kind of kinds) {
        const payroll = inPeriod(row.entry_date);
        const texts: Record<typeof kind, [string, string, string]> = {
          missing_day: ['Absent', 'Scheduled, no time recorded, no day off, no closure', 'A scheduled day ended more than the buffer ago with no time recorded and no explanation.'],
          missing_clock_out: ['Missing clock-out', 'An open punch pair after the scheduled end', 'A scheduled day ended more than the buffer ago with an open punch pair.'],
          unpaired_punches: ['Punches do not pair', 'The day’s punches break in/out order', 'A past day’s punch sequence does not pair, so its hours cannot be trusted.'],
          time_suspect: ['Time looks off', 'The recompute flagged this day’s timezone', 'The attendance recompute marked this row as timezone-suspect.'],
        };
        const [label, detail, why] = texts[kind];
        add({ kind, recordTable: 'attendance_day_status', recordId: row.id, subject, label: `${label} · ${row.entry_date}`, detail, why,
          occurredAt: row.entry_date, deadline: payroll ? payrollDeadline() : null, coverage: false, payroll, href: `/management/attendance?employee=${row.employee_id ?? ''}&date=${row.entry_date}` });
      }
    }
  }
  if (sourceOk('closeouts', src.closeouts)) {
    const { today: log, latestSealedDate, officeDaysSinceSeal, unsealedPast } = src.closeouts!;
    if (latestSealedDate && officeDaysSinceSeal >= 2) {
      add({ kind: 'close_day_behind', recordTable: 'deposit_logs', recordId: `gap:${latestSealedDate}`, subject: { employeeId: null, userId: null, name: null },
        label: 'Close the Day is behind', detail: `${officeDaysSinceSeal} office days since ${latestSealedDate} was sealed`, why: 'Pace numbers read only sealed days; two or more unsealed office days stall every figure.',
        occurredAt: latestSealedDate, deadline: null, coverage: false, payroll: false, href: '/deposit-log' });
    }
    for (const u of unsealedPast) {
      add({ kind: 'close_day_unsealed', recordTable: 'deposit_logs', recordId: u.id, subject: { employeeId: null, userId: null, name: null },
        label: `Close the Day saved, not sealed · ${u.deposit_date}`, detail: 'The record is filled in but unsealed', why: 'An unsealed closeout is not on record; sealing locks what is on file.',
        occurredAt: u.deposit_date, deadline: null, coverage: false, payroll: false, href: `/deposit-log?date=${u.deposit_date}&step=5` });
    }
    if (log && !log.sealed_at && src.officePhase === 'after_close') {
      add({ kind: 'close_day_unsealed', recordTable: 'deposit_logs', recordId: log.id, subject: { employeeId: null, userId: null, name: null },
        label: 'Today’s Close the Day is not sealed', detail: 'The office is closing and today’s record is open', why: 'Tomorrow’s pace reads only sealed days.',
        occurredAt: log.updated_at ?? log.created_at, deadline: deadlineOn(today, 'tonight'), coverage: false, payroll: false, href: `/deposit-log?date=${log.deposit_date}` });
    }
    if (!log && src.officePhase === 'after_close') {
      // Not started at all after close is the same office rule as unsealed; while the office is still working it is calm, not an item.
      add({ kind: 'close_day_unsealed', recordTable: 'deposit_logs', recordId: `not_started:${today}`, subject: { employeeId: null, userId: null, name: null },
        label: 'Today’s Close the Day has not been started', detail: 'The office is closing and nothing is saved for today', why: 'Tomorrow’s pace reads only sealed days.',
        occurredAt: nowIso, deadline: deadlineOn(today, 'tonight'), coverage: false, payroll: false, href: `/deposit-log?date=${today}` });
    }
    if (log && log.sealed_at && log.needs_manager_review) {
      add({ kind: 'close_day_review', recordTable: 'deposit_logs', recordId: log.id, subject: { employeeId: null, userId: null, name: null },
        label: 'Sealed day has items to review', detail: 'Low-confidence captures are flagged', why: 'The closeout flagged low-confidence items for manager review.',
        occurredAt: log.sealed_at, deadline: null, coverage: false, payroll: false, href: `/deposit-log?date=${log.deposit_date}` });
    }
  }

  /* ---- 4. follow-through the office's rules ask for ---- */
  if (rules.reviewTardies && sourceOk('tardies', src.tardies)) for (const t of src.tardies!) {
    if (t.approval_status !== 'unreviewed') continue;
    if (!onRoster(t.employee_id, t.user_id)) continue;
    add({ kind: 'tardy_unreviewed', recordTable: 'tardies', recordId: t.id, subject: subjectOf(t.employee_id, t.user_id),
      label: `Late ${t.minutes_late} min · ${t.entry_date} · unreviewed`, detail: t.reason_text ? `Reason given: “${t.reason_text}”` : 'No reason given yet',
      why: 'Office rule: late arrivals past grace are reviewed by a manager.', occurredAt: t.created_at, deadline: null, coverage: false, payroll: false,
      href: `/management/attendance?employee=${t.employee_id}&date=${t.entry_date}` });
  }
  if (sourceOk('bypasses', src.bypasses)) for (const b of src.bypasses!) {
    if (b.resolved) continue;
    if (!onRoster(b.employee_id, b.user_id)) continue;
    const age = hoursBetween(b.bypassed_at, nowIso) ?? 0;
    if (age < rules.bypassReasonHours) continue;
    add({ kind: 'bypass_followup', recordTable: 'checklist_bypasses', recordId: b.id, subject: subjectOf(b.employee_id, b.user_id),
      label: `Checklist bypass reason owed · ${b.checklist_date}`, detail: `${b.incomplete_count} item${b.incomplete_count === 1 ? '' : 's'} were open · level ${b.escalation_level}`,
      why: `Office rule: a bypass reason owed past ${rules.bypassReasonHours} hours needs manager follow-up.`, occurredAt: b.bypassed_at, deadline: null, coverage: false, payroll: false,
      href: `/management/people/${b.employee_id ?? ''}` });
  }
  if (sourceOk('accountability', src.accountability)) for (const r of src.accountability!) {
    const mine = viewer.role === 'owner' ? (r.status === 'awaiting_owner' || r.status === 'awaiting_manager') : r.status === 'awaiting_manager';
    if (!mine || r.subject_user_id === viewer.userId) continue;
    const due = r.review_due_at ? r.review_due_at.slice(0, 10) : null;
    add({ kind: 'record_signoff', recordTable: 'accountability_reports', recordId: r.id, subject: subjectOf(r.subject_employee_id, r.subject_user_id),
      label: `Record awaiting your sign-off · ${r.kind.replace(/_/g, ' ')}`, detail: r.summary, why: 'An escalation policy opened this record; the reviewer signs within the review window or it moves up. Nobody reviews their own.',
      occurredAt: r.created_at, deadline: due ? deadlineOn(due, `due ${due}`) : null, coverage: false, payroll: false, href: `/management?record=${r.id}` });
  }
  if (sourceOk('acks', src.acks)) for (const a of src.acks!) {
    if (a.acknowledged_at || a.waived_at) continue;
    if ((a.escalation_level ?? 0) < rules.ackManagerLevel) continue;
    add({ kind: 'ack_escalated', recordTable: 'knowledge_acknowledgments', recordId: a.id, subject: subjectOf(a.employee_id, a.user_id),
      label: `Acknowledgment escalated to you · ${a.title_snapshot ?? 'published version'}`, detail: a.overdue_at ? `Overdue since ${a.overdue_at.slice(0, 10)}` : '',
      why: 'The acknowledgment ladder reached the manager step.', occurredAt: a.overdue_at, deadline: null, coverage: false, payroll: false, href: `/management/office/acknowledgments?assignment=${a.id}` });
  }
  if (sourceOk('training', src.training)) for (const t of src.training!) {
    if (t.status === 'completed' || !t.due_date || t.due_date >= today) continue;
    add({ kind: 'training_overdue', recordTable: 'training_assignments', recordId: t.id, subject: subjectOf(null, t.assigned_to),
      label: `Training overdue · ${src.trainingTitles?.get(t.module_id) ?? 'assigned module'}`, detail: `Due ${t.due_date}`, why: 'An assigned module is past its due date.',
      occurredAt: t.due_date, deadline: null, coverage: false, payroll: false, href: `/training?assignment=${t.id}` });
  }

  const unresolved = [...items.values()].sort(compareByConsequence);
  const isDeferred = (i: AttentionItem) => !!(i.parkedUntil || i.snoozedUntil);
  const needsNow = unresolved.filter(i => i.work === 'needs_action' && !isDeferred(i));
  const waiting = unresolved.filter(i => i.work !== 'needs_action');
  const deferred = unresolved.filter(i => i.work === 'needs_action' && isDeferred(i));
  const byVerb: Record<AttentionVerb, number> = { decide: 0, fix: 0, follow_up: 0 };
  needsNow.forEach(i => { byVerb[i.verb] += 1; });
  const counts: AttentionCounts = { unresolved: unresolved.length, needsNow: needsNow.length, waiting: waiting.length, deferred: deferred.length, byVerb };
  return { unresolved, needsNow, waiting, deferred, counts, degradedSources };
}
