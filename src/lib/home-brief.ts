/**
 * The manager Home briefing: a short, readable summary of genuine
 * priorities (never a crowded sentence) with everyone on the roster, the
 * Needs you queue, today's exceptions and a count line, the last closeout,
 * the challenge (its state, and why it is noteworthy when it is), and a
 * wrap-up state after close.
 *
 * Pure: every input is a recorded fact or a derived state some other module
 * owns. Nothing here decides anything; every row navigates.
 *
 * Routine operational status (someone arrived late, someone starts later)
 * is displayed calmly. Only genuine exceptions — a scheduled day with no
 * punches after its end, someone still clocked in after close, a source that
 * could not be read — carry an attention tone.
 */
import type { AttentionItem, AttentionResult } from '@/lib/attention';
import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import type { OfficePhase, OfficeStatus, StaffingSummary } from '@/components/dashboard/staffing';
import { isClockedInNow, personStatusAt } from '@/components/dashboard/staffing';
import type { PersonStatus, Tone } from '@/components/dashboard/types';
import type { CloseDayStatus } from '@/lib/manager-pulse';
import type { GoalBrief, MonthPaceLine } from '@/lib/owner-pulse';
import { closeoutDayLabel } from '@/lib/owner-pulse';
import { daysBetween, formatDate, shiftDate } from '@/lib/time-utils';
import { listOfficeDays, type OfficeDayCalendar } from '@/lib/office-days';

export type SummaryLine = { id: string; text: string; href?: string; tone: Tone };

/**
 * One person on the board: name, a short note where it matters, their own
 * tone, and the facts a hover shows — the full status, today's shift,
 * remote, minutes late — with the link to their record in People.
 */
export type RosterPerson = {
  id: string;
  name: string;
  note: string | null;
  tone: Tone;
  /** The full status line: "In · late 12m", "Starts 1:00 PM". */
  status: string;
  /** "8:00 AM – 5:00 PM", or null when the schedule has no times. */
  shift: string | null;
  remote: boolean;
  minutesLate: number | null;
  /** The person's record in People. */
  href: string;
};

/** One group of the roster board: "In: Dana R., Marcus T. (late 12m)". */
export type RosterGroup = {
  id: 'in' | 'still_in' | 'not_yet' | 'later' | 'absent' | 'off' | 'done';
  label: string;
  /** Names, with the note in parentheses: "Marcus T. (late 12m)", "Alice N. (remote)", "Sam K. (1:00 PM)". */
  names: string[];
  people: RosterPerson[];
  tone: Tone;
};

/** The short summary at the top of Home: the office state, who is where, and at most three priorities. */
export type HomeSummary = {
  /** "Open · 4 of 8 in", "Closed for the day", "Not open yet". */
  headline: string;
  /** One supporting clause: the workday's end, who starts later, the closure. */
  detail: string;
  tone: Tone;
  /** Who is in, not in yet, starting later, off, done — by name. */
  who: RosterGroup[];
  lines: SummaryLine[];
};

export type NeedsYou = {
  /** The first three of the same list Attention shows. */
  top: AttentionItem[];
  /** How many more need the manager now. */
  more: number;
  /** Every item that needs the manager now, in consequence order. */
  now: AttentionItem[];
  /** Open items waiting on someone else, still counted as unresolved. */
  waitingItems: AttentionItem[];
  /** Open items parked or snoozed, still open, still due. */
  deferredItems: AttentionItem[];
  waiting: number;
  deferred: number;
  /** A source could not be read; the list is not "nothing to report". */
  degraded: boolean;
  enabled: boolean;
};

export type TodayException = PersonStatus & { href?: string; action?: 'Review' | 'Open' };

export type TodayBand = {
  phase: OfficePhase;
  scheduled: number;
  /** People clocked in right now; null when the office is not working. */
  inNow: number | null;
  exceptions: TodayException[];
  /** "5 in · Sam K. at 1:00 PM" */
  countLine: string;
  /** Everyone on today's roster with their status, for the summary's roster line. */
  people: PersonStatus[];
  /** When the roster is stale or loading, when it was last read. */
  asOf: string | null;
};

export type StatusLine = { id: string; label: string; text: string; tone: Tone; href: string; action?: string };

export type PaceLine = {
  scope: string;
  text: string;
  tone: Tone;
  figures: { label: string; value: string; detail: string; tone: Tone }[];
};

export type Spotlight = { goal: GoalBrief; reason: string };

export type HomeBrief = {
  summary: HomeSummary;
  /** After close: Needs you becomes Before you leave. */
  wrapUp: boolean;
  needs: NeedsYou;
  today: TodayBand;
  lastDay: StatusLine | null;
  pace: PaceLine | null;
  inbox: StatusLine | null;
  spotlight: Spotlight | null;
};

export type CloseoutFact = { id: string; deposit_date: string; sealed_at: string | null; needs_manager_review: boolean };

/** The kinds that are about a person's time; an exception row opens that item first. */
const ATTENDANCE_KINDS = new Set<AttentionItem['kind']>([
  'clocked_in_after_close', 'missing_clock_out', 'missing_day', 'unpaired_punches', 'time_suspect', 'excuse_request', 'correction_request',
]);

/** Routine status on a live roster: in (late or not), starts later, done. Never an exception. */
function isRoutine(p: PersonStatus): boolean {
  return p.status.startsWith('In') || p.status.startsWith('Starts ') || p.status.startsWith('Done') || p.status === 'Clocked out' || p.status === 'Scheduled today';
}

/**
 * The exceptions Home names: anyone who needs a look, and anyone off. A row
 * opens the person's attendance item when one exists, else their record in
 * People — one navigation action either way. A late arrival that is simply
 * "in" is routine and stays off this list.
 */
export function todayBand(input: {
  summary: StaffingSummary;
  snapshot?: EmployeeSnapshot[];
  now: Date;
  needsNow: AttentionItem[];
  asOf?: string | null;
}): TodayBand {
  const { summary, snapshot, now, needsNow } = input;
  const phase = summary.office.phase;
  const live = phase === 'open' || phase === 'unknown_hours' || phase === 'before_open';
  const rows: PersonStatus[] = live
    ? summary.rows
    : (snapshot ?? []).filter(r => r.is_scheduled_day && !r.office_closed && !r.has_day_off).map(r => personStatusAt(r, now));
  const itemFor = (employeeId: string) => needsNow.find(i => i.subject.employeeId === employeeId && ATTENDANCE_KINDS.has(i.kind));
  const exceptions: TodayException[] = rows
    .filter(p => !isRoutine(p) && (p.tone === 'attention' || p.tone === 'urgent' || p.status === 'Approved off'))
    .sort((a, b) => (a.tone === 'calm' ? 1 : 0) - (b.tone === 'calm' ? 1 : 0))
    .map(p => {
      const item = itemFor(p.id);
      return item
        ? { ...p, href: `/management?item=${item.key}`, action: item.verb === 'decide' ? 'Review' : 'Open' }
        : { ...p, href: `/management/people/${p.id}`, action: 'Open' };
    });

  let countLine: string;
  let inNow: number | null = null;
  if (phase === 'open' || phase === 'unknown_hours') {
    inNow = live && snapshot ? snapshot.filter(isClockedInNow).length : rows.filter(p => p.status.startsWith('In')).length;
    const later = rows.find(p => p.status.startsWith('Starts '));
    countLine = `${inNow} in${later ? ` · ${later.name} at ${later.status.slice('Starts '.length)}` : ''}`;
  } else if (phase === 'before_open') {
    countLine = `${summary.scheduledToday} scheduled · ${summary.office.detail.replace(/\.$/, '')}`;
  } else if (phase === 'after_close') {
    const stillIn = rows.filter(p => p.status === 'Still clocked in').length;
    countLine = stillIn ? `${stillIn} still clocked in` : 'Everyone is clocked out';
  } else {
    countLine = summary.office.detail.replace(/\.$/, '');
  }
  return { phase, scheduled: summary.scheduledToday, inNow, exceptions, countLine, people: rows, asOf: input.asOf ?? null };
}

/** The last workday's closeout as one line; after close, today's. */
export function lastDayLine(input: { closeouts: CloseoutFact[]; today: string; phase: OfficePhase; closeDay: CloseDayStatus | null }): StatusLine | null {
  const { closeouts, today, phase, closeDay } = input;
  if (phase === 'after_close' && closeDay) {
    return {
      id: 'today-closeout', label: "Today's closeout", text: closeDay.label, tone: closeDay.tone,
      href: closeDay.href, action: closeDay.state === 'sealed' ? undefined : 'Open',
    };
  }
  const past = closeouts.filter(c => c.deposit_date < today).sort((a, b) => b.deposit_date.localeCompare(a.deposit_date));
  const last = past[0];
  if (!last) {
    return { id: 'last-closeout', label: 'Last closeout', text: 'none on record in the last two weeks', tone: 'attention', href: '/deposit-log', action: 'Open' };
  }
  const label = closeoutDayLabel(last.deposit_date, today);
  if (!last.sealed_at) {
    return { id: 'last-closeout', label, text: 'saved, not sealed', tone: 'attention', href: `/management?item=close_day_unsealed:${last.id}`, action: 'Open' };
  }
  if (last.needs_manager_review) {
    return { id: 'last-closeout', label, text: 'sealed · items to review', tone: 'attention', href: `/management?item=close_day_review:${last.id}`, action: 'Open' };
  }
  return { id: 'last-closeout', label, text: 'sealed', tone: 'calm', href: `/deposit-log?date=${last.deposit_date}` };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Pace in one clause with its day scope; the figures are the receipts. */
export function paceLine(lines: MonthPaceLine[] | null, today: string, scopeDate: string | null): PaceLine | null {
  if (!lines || lines.length === 0) return null;
  const month = MONTHS[Number(today.slice(5, 7)) - 1] ?? 'This month';
  const figures = lines.map(l => ({ label: l.label, value: l.value, detail: l.detail, tone: l.tone as Tone }));
  // No closeout has ever been sealed: there is no pace to read, only the door to it.
  if (!scopeDate) return { scope: 'no closeout yet', text: 'No days have been closed out yet; pace reads from Close the Day.', tone: 'calm', figures };
  const scope = `through ${closeoutDayLabel(scopeDate, today).replace(/^(Today|Yesterday|Closeout)/, m => m.toLowerCase())}`;
  const judged = lines.filter(l => l.pace);
  const behind = judged.filter(l => l.pace!.status === 'behind');
  const fine = judged.filter(l => l.pace!.status !== 'behind');
  const name = (l: MonthPaceLine) => l.label.replace(/ month to date$/i, '').toLowerCase();
  const join = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')}${xs.length > 2 ? ',' : ''} and ${xs[xs.length - 1]}`;
  let text: string;
  let tone: Tone = 'calm';
  if (judged.length === 0) text = `No targets are set for ${month}; figures only.`;
  else if (behind.length === 0) text = `${month} on pace for ${join(fine.map(name))}.`;
  else {
    tone = 'attention';
    text = `${month} ${join(behind.map(name))} ${behind.length === 1 ? 'is' : 'are'} behind pace${fine.length ? `; ${join(fine.map(name))} on pace` : ''}.`;
  }
  return { scope, text, tone, figures };
}

/** The challenge appears only when it is noteworthy today (design §3.3). */
export function spotlight(goal: GoalBrief | null): Spotlight | null {
  if (!goal) return null;
  if (goal.state === 'awaiting_verification') return { goal, reason: 'needs a decision' };
  if (goal.state === 'needs_push') return { goal, reason: 'off track' };
  if (goal.remaining === 0) return { goal, reason: 'finished' };
  if (goal.daysLeft !== null && goal.daysLeft <= 3) return { goal, reason: goal.daysLeft === 0 ? 'ends today' : `${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left` };
  return null;
}

export const MAX_SUMMARY_LINES = 3;

/**
 * The roster line: who is in (with a late or remote note), still in after
 * close, not in yet, starting later, absent, off, or done — by name, in
 * that order, only the groups that have anyone. Someone merely scheduled
 * or not scheduled today is not a status worth a name.
 */
export function rosterGroups(people: PersonStatus[]): RosterGroup[] {
  const groups: Record<RosterGroup['id'], RosterPerson[]> = { in: [], still_in: [], not_yet: [], later: [], absent: [], off: [], done: [] };
  const add = (id: RosterGroup['id'], p: PersonStatus, note: string | null = null) => groups[id].push({
    id: p.id, name: p.name, note, tone: p.tone, status: p.status,
    shift: p.shift ?? null, remote: p.remote ?? false, minutesLate: p.minutesLate ?? null, href: `/management/people/${p.id}`,
  });
  for (const p of people) {
    const s = p.status;
    if (s === 'Still clocked in') add('still_in', p);
    else if (s.startsWith('In')) add('in', p, s.startsWith('In · ') ? s.slice('In · '.length) : s === 'In — remote' ? 'remote' : null);
    else if (s === 'Not in yet') add('not_yet', p);
    else if (s.startsWith('Starts ')) add('later', p, s.slice('Starts '.length));
    else if (s === 'Absent') add('absent', p);
    else if (s === 'Approved off') add('off', p);
    else if (s.startsWith('Done') || s === 'Clocked out') add('done', p);
  }
  const order: [RosterGroup['id'], string, Tone][] = [
    ['in', 'In', 'steady'], ['still_in', 'Still in', 'attention'], ['not_yet', 'Not in yet', 'calm'], ['later', 'Later', 'calm'],
    ['absent', 'Absent', 'attention'], ['off', 'Off', 'calm'], ['done', 'Done', 'calm'],
  ];
  return order
    .filter(([id]) => groups[id].length > 0)
    .map(([id, label, tone]) => ({ id, label, tone, people: groups[id], names: groups[id].map(x => (x.note ? `${x.name} (${x.note})` : x.name)) }));
}

const shortDay = (date: string) => formatDate(date).split(', ').slice(0, 2).join(', ');

/**
 * The summary: the office state as a headline, then at most three
 * priorities, each one linked. What needs the manager is counted by the
 * Needs you queue itself, and the closeout's state sits in the queue and
 * the status list, so neither is repeated here; routine status (someone
 * arrived late, someone not in yet, someone starting at 1:00) belongs to
 * the Today panel and stays calm.
 */
export function stateSummary(input: {
  office: OfficeStatus;
  today: TodayBand;
  needs: NeedsYou;
  lastDay: StatusLine | null;
  payroll: { dueDate: string | null; dueLabel: string | null } | null;
  /** Open items that make the pay period questionable; shown with the payroll deadline. */
  payrollItems?: number;
  inbox?: StatusLine | null;
  todayDate: string;
  /** The closeouts on record and the office calendar: an office day with no closeout is named. */
  closeouts?: CloseoutFact[];
  calendar?: OfficeDayCalendar | null;
}): HomeSummary {
  const { office, today, needs, lastDay, payroll, inbox, todayDate } = input;
  const who = today.asOf ? [] : rosterGroups(today.people);
  const phase = office.phase;
  const lines: SummaryLine[] = [];
  const push = (l: SummaryLine) => { if (lines.length < MAX_SUMMARY_LINES) lines.push(l); };

  let headline: string;
  let detail = office.detail;
  let tone: Tone = 'calm';
  if (today.asOf === 'loading') {
    headline = 'Reading today’s roster';
    detail = 'Nobody is marked in or out yet.';
  } else if (today.asOf) {
    headline = 'Roster unavailable';
    detail = 'Today’s roster could not be read, so nobody is marked in or out.';
    tone = 'attention';
    push({ id: 'roster', text: 'Today’s roster could not be read. Nothing about attendance is confirmed.', href: '/management/people', tone: 'attention' });
  } else if (phase === 'open' || phase === 'unknown_hours') {
    headline = phase === 'open' ? `Open · ${today.inNow ?? 0} of ${today.scheduled} in` : `Scheduled today · ${today.inNow ?? 0} in`;
    tone = 'steady';
    const later = today.countLine.includes(' · ') ? today.countLine.split(' · ').slice(1).join(' · ') : '';
    detail = later ? `${office.detail.replace(/\.$/, '')} · ${later}.` : office.detail;
  } else if (phase === 'before_open') {
    headline = 'Not open yet';
  } else if (phase === 'after_close') {
    headline = 'Closed for the day';
  } else {
    headline = office.headline;
  }

  if (needs.degraded) {
    push({ id: 'degraded', text: 'Some records could not be read; the queue may be missing items.', href: '/management', tone: 'attention' });
  }

  // Genuine attendance exceptions, one line each, most consequential first.
  // After close the Before you leave list carries who is still clocked in
  // and the inbox, so the summary does not repeat them.
  const wrapUp = phase === 'after_close';
  const stillIn = today.exceptions.filter(e => e.status === 'Still clocked in');
  if (stillIn.length && !wrapUp) {
    push({ id: 'still-in', text: `${stillIn.map(e => e.name).join(' and ')} ${stillIn.length === 1 ? 'is' : 'are'} still clocked in after close.`, href: stillIn[0].href ?? '/management/people', tone: 'attention' });
  }
  const absent = today.exceptions.filter(e => e.status === 'Absent');
  if (absent.length) {
    push({ id: 'absent', text: `${absent.map(e => e.name).join(' and ')} ${absent.length === 1 ? 'has' : 'have'} no time recorded today.`, href: absent[0].href ?? '/management/people', tone: 'attention' });
  }

  // The closeout's state lives in the queue (an unsealed day is an item) and
  // in the status list; the summary names it only when nothing is on record
  // at all, which no queue item says.
  if (lastDay?.action && lastDay.text.startsWith('none on record')) {
    push({ id: 'closeout', text: 'No closeout is on record in the last two weeks.', href: lastDay.href, tone: 'attention' });
  } else if (input.calendar && input.closeouts?.length && !needs.now.some(i => i.kind === 'close_day_behind')) {
    // An office day since the last closeout with none of its own. The queue
    // carries the gap once it reaches two days ("Close the Day is behind"),
    // so this line speaks only when it would otherwise go unnamed.
    const last = input.closeouts.filter(c => c.deposit_date < todayDate).sort((a, b) => b.deposit_date.localeCompare(a.deposit_date))[0];
    const missing = last ? listOfficeDays(shiftDate(last.deposit_date, 1), shiftDate(todayDate, -1), input.calendar) : [];
    if (missing.length === 1) {
      push({ id: 'closeout-missing', text: `${shortDay(missing[0])} has no closeout.`, href: `/deposit-log?date=${missing[0]}`, tone: 'attention' });
    } else if (missing.length > 1) {
      push({ id: 'closeout-missing', text: `${missing.length} office days have no closeout (${shortDay(missing[0])} – ${shortDay(missing[missing.length - 1])}).`, href: `/deposit-log?date=${missing[0]}`, tone: 'attention' });
    }
  }

  const due = payroll?.dueDate && daysBetween(todayDate, payroll.dueDate) <= 7 ? payroll.dueDate : null;
  if (due) {
    const n = input.payrollItems ?? 0;
    push({
      id: 'payroll',
      text: `Payroll hours are due ${formatDate(due).split(',')[0]}${n > 0 ? ` · ${n} open time record${n === 1 ? '' : 's'}` : ''}.`,
      href: '/management/payroll',
      tone: n > 0 ? 'attention' : 'calm',
    });
  }

  if (inbox && !wrapUp) push({ id: 'inbox', text: `${inbox.text.charAt(0).toUpperCase()}${inbox.text.slice(1)}.`, href: inbox.href, tone: 'attention' });

  // Routine status (someone not in yet, someone starting later) belongs to
  // the Today panel, calmly; it is not a priority and is not repeated here.
  return { headline, detail, tone, who, lines };
}

/** The Attention lists behind Needs you — shared by Owner and Manager Home. */
export function needsYou(attention: Pick<AttentionResult, 'needsNow' | 'waiting' | 'deferred' | 'degradedSources'> & { enabled: boolean }): NeedsYou {
  return {
    top: attention.needsNow.slice(0, 3),
    more: Math.max(0, attention.needsNow.length - 3),
    now: attention.needsNow,
    waitingItems: attention.waiting,
    deferredItems: attention.deferred,
    waiting: attention.waiting.length,
    deferred: attention.deferred.length,
    degraded: attention.degradedSources.length > 0,
    enabled: attention.enabled,
  };
}

export function buildHomeBrief(input: {
  attention: Pick<AttentionResult, 'needsNow' | 'waiting' | 'deferred' | 'degradedSources'> & { enabled: boolean };
  summary: StaffingSummary;
  snapshot?: EmployeeSnapshot[];
  now: Date;
  today: string;
  closeouts: CloseoutFact[];
  closeDay: CloseDayStatus | null;
  pace: MonthPaceLine[] | null;
  paceScopeDate: string | null;
  goal: GoalBrief | null;
  payroll: { dueDate: string | null; dueLabel: string | null } | null;
  inbox: { outstanding: number; label: string } | null;
  asOf?: string | null;
  /** The office calendar, so an office day with no closeout can be named. */
  calendar?: OfficeDayCalendar | null;
}): HomeBrief {
  const needs = needsYou(input.attention);
  const today = todayBand({ summary: input.summary, snapshot: input.snapshot, now: input.now, needsNow: input.attention.needsNow, asOf: input.asOf });
  const phase = input.summary.office.phase;
  const wrapUp = phase === 'after_close';
  const lastDay = lastDayLine({ closeouts: input.closeouts, today: input.today, phase, closeDay: input.closeDay });
  const pace = paceLine(input.pace, input.today, input.paceScopeDate);
  const inbox = wrapUp && input.inbox && input.inbox.outstanding > 0
    ? { id: 'inbox', label: 'Inbox', text: `${input.inbox.outstanding} ${input.inbox.label} still need${input.inbox.outstanding === 1 ? 's' : ''} a reply before closeout`, tone: 'attention' as Tone, href: '/inbox/requests', action: 'Open' }
    : null;
  const payrollItems = input.attention.needsNow.filter(i => i.payroll).length;
  return {
    summary: stateSummary({ office: input.summary.office, today, needs, lastDay, payroll: input.payroll, payrollItems, inbox, todayDate: input.today, closeouts: input.closeouts, calendar: input.calendar }),
    wrapUp,
    needs,
    today,
    lastDay,
    pace,
    inbox,
    spotlight: spotlight(input.goal),
  };
}
