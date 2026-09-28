/**
 * My work — the signed-in person's own open items, in one shape, for the
 * team-member Home and the manager's own "Mine" panel.
 *
 * Every entry is derived from a record the person is party to: a late
 * arrival waiting on their answer, an attendance report that needs their
 * signature, a record awaiting their note, a checklist bypass reason owed,
 * a policy version to sign, an assigned module, a scheduled day with no
 * time, today's open checklist items, office requests waiting on a reply.
 * Requests the person made and is waiting on (PTO, corrections, an excuse
 * request) are listed separately as "waiting on someone else" — they need
 * nothing from the person and are never counted as their work.
 *
 * Pure: the hook gathers the rows, this turns them into rows to render.
 * Nothing here decides; every row opens the exact record.
 */
import type { Tone } from '@/components/dashboard/types';
import { awaitsEmployeeAnswer, excuseState, isLiveLateArrival, type LateArrivalLike } from '@/lib/late-arrivals';
import { attendanceWaitingOn, isAttendanceReport } from '@/lib/incidents';
import { formatDate } from '@/lib/time-utils';

export type WorkKind =
  | 'late_arrival' | 'attendance_report' | 'incident_signature' | 'record' | 'bypass' | 'acknowledgment'
  | 'training' | 'missing_day' | 'checklist' | 'reply' | 'pto_request' | 'correction_request' | 'excuse_request';

export type WorkItem = {
  id: string;
  kind: WorkKind;
  /** What needs doing. */
  title: string;
  /** Why it is here, or its context, in one line. */
  detail: string;
  /** The date or the age it carries. */
  when: string | null;
  /** The exact record or the filtered list. */
  href: string;
  /** The next action, in plain words. */
  action: string;
  tone: Tone;
  /** `now` needs the person; `waiting` is theirs but waits on someone else. */
  bucket: 'now' | 'waiting';
};

export type MyWork = {
  now: WorkItem[];
  waiting: WorkItem[];
  /** The single highest-priority item, for "My next move". */
  next: WorkItem | null;
};

export type MyWorkInput = {
  today: string;
  userId: string | null;
  employeeId: string | null;
  tardies?: (LateArrivalLike & { id: string; user_id: string; entry_date: string })[];
  incidents?: {
    id: string; employee_id: string; category: string; status: string; incident_date: string;
    meeting_recorded_at: string | null; employee_signed_at: string | null; manager_signed_at: string | null;
  }[];
  records?: { id: string; status: string; kind: string; created_at: string }[];
  bypasses?: { id: string; checklist_date: string; resolved: boolean }[];
  acknowledgments?: { id: string; title_snapshot: string; due_at: string; acknowledged_at: string | null; waived_at: string | null }[];
  training?: { id: string; assigned_to: string; status: string; due_date: string | null; title?: string }[];
  missingDays?: { date: string }[];
  /** Per-person daily checklist items still open today, and the count of them. */
  openChecklistItems?: number;
  /** Office requests addressed to me that still need a reply today. */
  repliesOwed?: number;
  ptoRequests?: { id: string; start_date: string; end_date: string; status: string }[];
  corrections?: { id: string; status: string; created_at: string; entry_date?: string | null }[];
};

/** Lower is sooner. Signing and answering come before reading and finishing. */
const PRIORITY: Record<WorkKind, number> = {
  attendance_report: 0, record: 1, incident_signature: 2, late_arrival: 3, reply: 4, bypass: 5,
  acknowledgment: 6, training: 7, checklist: 8, missing_day: 9,
  pto_request: 20, correction_request: 21, excuse_request: 22,
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function buildMyWork(input: MyWorkInput): MyWork {
  const { today, userId, employeeId } = input;
  const now: WorkItem[] = [];
  const waiting: WorkItem[] = [];

  /* late arrivals: mine, live, unanswered → now; my pending excuse requests → waiting */
  for (const t of input.tardies ?? []) {
    if (!userId || t.user_id !== userId || !isLiveLateArrival(t)) continue;
    if (awaitsEmployeeAnswer(t)) {
      now.push({
        id: `late_arrival:${t.id}`, kind: 'late_arrival', title: `Late arrival · ${formatDate(t.entry_date)}`,
        detail: `${plural(t.minutes_late, 'minute')} past the grace period. Acknowledge it as unexcused, or ask for it to be excused. No explanation is required to acknowledge.`,
        when: formatDate(t.entry_date), href: `/days-off?tardy=${t.id}`, action: 'Answer', tone: 'attention', bucket: 'now',
      });
    } else if (excuseState(t) === 'pending') {
      waiting.push({
        id: `excuse_request:${t.id}`, kind: 'excuse_request', title: `Excuse request · ${formatDate(t.entry_date)}`,
        detail: 'Pending a manager’s decision. It does not count toward the late-arrival rule while it waits.',
        when: formatDate(t.entry_date), href: `/days-off?tardy=${t.id}`, action: 'View', tone: 'calm', bucket: 'waiting',
      });
    }
  }

  /* incident reports about me: the attendance workflow and safety signatures */
  for (const r of input.incidents ?? []) {
    if (!employeeId || r.employee_id !== employeeId || r.status === 'closed') continue;
    if (isAttendanceReport(r)) {
      if (!r.meeting_recorded_at) {
        waiting.push({
          id: `attendance_report:${r.id}`, kind: 'attendance_report', title: 'Attendance report · meeting required',
          detail: 'The late-arrival rule opened this report. A manager records the meeting first; then you read and sign.',
          when: formatDate(r.incident_date), href: `/incident-reports?report=${r.id}`, action: 'View', tone: 'attention', bucket: 'waiting',
        });
      } else if (!r.employee_signed_at) {
        now.push({
          id: `attendance_report:${r.id}`, kind: 'attendance_report', title: 'Sign your attendance report',
          detail: 'The meeting is on record. Your signature confirms the discussion and receipt, not agreement with every statement. You can add your own comment first.',
          when: formatDate(r.incident_date), href: `/incident-reports?report=${r.id}`, action: 'Read and sign', tone: 'urgent', bucket: 'now',
        });
      } else if (!r.manager_signed_at) {
        waiting.push({
          id: `attendance_report:${r.id}`, kind: 'attendance_report', title: `Attendance report · ${attendanceWaitingOn(r).toLowerCase()}`,
          detail: 'You have signed. The report closes when the manager signature is on it.',
          when: formatDate(r.incident_date), href: `/incident-reports?report=${r.id}`, action: 'View', tone: 'calm', bucket: 'waiting',
        });
      }
      continue;
    }
    if (!r.employee_signed_at) {
      now.push({
        id: `incident_signature:${r.id}`, kind: 'incident_signature', title: `Sign incident report · ${formatDate(r.incident_date)}`,
        detail: 'Your signature attests to the account; an owner or manager countersigns after you.',
        when: formatDate(r.incident_date), href: `/incident-reports?report=${r.id}`, action: 'Read and sign', tone: 'attention', bucket: 'now',
      });
    }
  }

  /* accountability records awaiting my note and signature */
  for (const r of input.records ?? []) {
    if (r.status !== 'awaiting_member') continue;
    now.push({
      id: `record:${r.id}`, kind: 'record', title: `Add your side to a record · ${r.kind.replace(/_/g, ' ')}`,
      detail: 'A record is waiting on your note and signature before it moves on. You always get to add your side.',
      when: formatDate(r.created_at.slice(0, 10)), href: `/?record=${r.id}`, action: 'Sign the record', tone: 'urgent', bucket: 'now',
    });
  }

  /* checklist bypass reasons owed */
  for (const b of input.bypasses ?? []) {
    if (b.resolved) continue;
    now.push({
      id: `bypass:${b.id}`, kind: 'bypass', title: `Bypass reason owed · ${formatDate(b.checklist_date)}`,
      detail: 'You clocked out past an open checklist. A sentence closes it; it never blocks your clock-out.',
      when: formatDate(b.checklist_date), href: '/checklists', action: 'Add a reason', tone: 'attention', bucket: 'now',
    });
  }

  /* policy versions to acknowledge */
  for (const a of input.acknowledgments ?? []) {
    if (a.acknowledged_at || a.waived_at) continue;
    const due = a.due_at.slice(0, 10);
    const overdue = due < today;
    now.push({
      id: `acknowledgment:${a.id}`, kind: 'acknowledgment', title: `Read and sign · ${a.title_snapshot}`,
      detail: `Signing means you read that exact version.${overdue ? ' It is past its due date.' : ''}`,
      when: `due ${formatDate(due)}`, href: `/management/office/acknowledgments?assignment=${a.id}`, action: 'Read and sign', tone: overdue ? 'attention' : 'steady', bucket: 'now',
    });
  }

  /* training assigned to me */
  for (const t of input.training ?? []) {
    if (!userId || t.assigned_to !== userId || t.status === 'completed') continue;
    const overdue = !!t.due_date && t.due_date < today;
    now.push({
      id: `training:${t.id}`, kind: 'training', title: `Training · ${t.title ?? 'assigned module'}`,
      detail: overdue ? 'Past its due date.' : t.due_date ? `Due ${formatDate(t.due_date)}.` : 'No due date set.',
      when: t.due_date ? `due ${formatDate(t.due_date)}` : null, href: `/training?assignment=${t.id}&tab=mine`, action: 'Open training', tone: overdue ? 'attention' : 'steady', bucket: 'now',
    });
  }

  /* scheduled days with no time recorded */
  for (const d of input.missingDays ?? []) {
    now.push({
      id: `missing_day:${d.date}`, kind: 'missing_day', title: `No time recorded · ${formatDate(d.date)}`,
      detail: 'A scheduled day with no punches. Request a correction or record the time off.',
      when: formatDate(d.date), href: `/days-off?date=${d.date}`, action: 'Explain the day', tone: 'attention', bucket: 'now',
    });
  }

  /* today's checklist, one row */
  if ((input.openChecklistItems ?? 0) > 0) {
    const n = input.openChecklistItems as number;
    now.push({
      id: 'checklist:today', kind: 'checklist', title: `${plural(n, 'checklist item')} open today`,
      detail: 'Your daily items that are not checked off yet.',
      when: 'today', href: '/checklists', action: 'Open checklists', tone: 'steady', bucket: 'now',
    });
  }

  /* office requests waiting on my reply */
  if ((input.repliesOwed ?? 0) > 0) {
    const n = input.repliesOwed as number;
    now.push({
      id: 'reply:today', kind: 'reply', title: `${plural(n, 'office request')} waiting on your reply`,
      detail: 'Sent to you today and marked as needing a reply.',
      when: 'today', href: '/inbox/requests', action: 'Reply', tone: 'attention', bucket: 'now',
    });
  }

  /* my requests, waiting on a manager */
  for (const p of input.ptoRequests ?? []) {
    if (p.status !== 'pending') continue;
    waiting.push({
      id: `pto_request:${p.id}`, kind: 'pto_request', title: `PTO request · ${p.start_date === p.end_date ? formatDate(p.start_date) : `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`}`,
      detail: 'Pending a manager’s decision.', when: null, href: '/my-requests', action: 'View', tone: 'calm', bucket: 'waiting',
    });
  }
  for (const c of input.corrections ?? []) {
    if (c.status !== 'pending') continue;
    waiting.push({
      id: `correction_request:${c.id}`, kind: 'correction_request', title: `Time correction${c.entry_date ? ` · ${formatDate(c.entry_date)}` : ''}`,
      detail: 'Pending a manager’s review. The original punches stay on record.', when: null, href: '/my-requests', action: 'View', tone: 'calm', bucket: 'waiting',
    });
  }

  const byPriority = (a: WorkItem, b: WorkItem) => PRIORITY[a.kind] - PRIORITY[b.kind];
  now.sort(byPriority);
  waiting.sort(byPriority);
  return { now, waiting, next: now[0] ?? null };
}

/** The same rows, as the compact signal a lane or a summary reads. */
export function workCounts(work: MyWork): { now: number; waiting: number } {
  return { now: work.now.length, waiting: work.waiting.length };
}
