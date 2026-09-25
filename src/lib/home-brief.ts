/**
 * The manager Home briefing (design §3.3): one sentence of state built from
 * recorded facts, the top three Attention items with one navigation action
 * each, today's exceptions and a count line, two status lines, the
 * challenge only when noteworthy, and a wrap-up state after close.
 *
 * Pure: every input is a recorded fact or a derived state some other module
 * owns. Nothing here decides anything; every row navigates.
 */
import type { AttentionItem, AttentionResult } from '@/lib/attention';
import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import type { OfficePhase, OfficeStatus, StaffingSummary } from '@/components/dashboard/staffing';
import { isClockedInNow, personStatusAt } from '@/components/dashboard/staffing';
import type { PersonStatus, Tone } from '@/components/dashboard/types';
import type { CloseDayStatus } from '@/lib/manager-pulse';
import type { GoalBrief, MonthPaceLine } from '@/lib/owner-pulse';
import { closeoutDayLabel } from '@/lib/owner-pulse';
import { daysBetween, formatDate } from '@/lib/time-utils';

export type SentencePart = { text: string; href?: string; tone?: Tone };

export type NeedsYou = {
  /** The first three of the same list Attention shows. */
  top: AttentionItem[];
  /** How many more need the manager now. */
  more: number;
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
  sentence: SentencePart[];
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

/** The kinds that are about a person's day; an exception row opens that item first. */
const ATTENDANCE_KINDS = new Set<AttentionItem['kind']>([
  'clocked_in_after_close', 'missing_clock_out', 'missing_day', 'unpaired_punches', 'time_suspect', 'tardy_unreviewed',
]);

/**
 * The exceptions Home names: anyone who needs a look, and anyone off. A row
 * opens the person's attendance item when one exists, else their record in
 * People — one navigation action either way.
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
    .filter(p => p.tone === 'attention' || p.tone === 'urgent' || p.status === 'Approved off')
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
  return { phase, scheduled: summary.scheduledToday, inNow, exceptions, countLine, asOf: input.asOf ?? null };
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
  if (goal.daysLeft <= 3) return { goal, reason: goal.daysLeft === 0 ? 'ends today' : `${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left` };
  return null;
}

/** "Open, 6 of 8 in. Ken W. isn't in yet. Saturday's closeout still needs its seal, and payroll hours are due Thursday." */
export function stateSentence(input: {
  office: OfficeStatus;
  today: TodayBand;
  needs: NeedsYou;
  lastDay: StatusLine | null;
  payroll: { dueDate: string | null; dueLabel: string | null } | null;
  todayDate: string;
}): SentencePart[] {
  const { office, today, needs, lastDay, payroll, todayDate } = input;
  const parts: SentencePart[] = [];
  const phase = office.phase;
  const attention = today.exceptions.filter(e => e.tone !== 'calm');
  const describe = (e: TodayException): string => {
    const s = e.status;
    if (s === 'Not in yet') return `${e.name} isn't in yet`;
    if (s.startsWith('Still clocked in')) return `${e.name} is still clocked in`;
    if (s.startsWith('In') && s.includes('late')) return `${e.name} came in late`;
    if (s === 'Absent') return `${e.name} is absent today`;
    return `${e.name}: ${s.toLowerCase()}`;
  };

  if (today.asOf) {
    parts.push({ text: today.asOf === 'loading' ? "Reading today's roster. " : "Today's roster could not be read, so nobody is marked in or out. ", href: today.asOf === 'loading' ? undefined : '/management/people', tone: today.asOf === 'loading' ? undefined : 'attention' });
  } else if (phase === 'after_close') {
    const stillIn = attention.filter(e => e.status.startsWith('Still clocked in'));
    parts.push({ text: 'Closing. ' });
    if (stillIn.length) parts.push({ text: stillIn.map(e => e.name).join(' and ') + (stillIn.length === 1 ? ' is' : ' are') + ' still clocked in', href: stillIn[0].href ?? '/management/people', tone: 'attention' });
    else parts.push({ text: 'Everyone is clocked out' });
    if (lastDay) parts.push({ text: `, and today's closeout is ${lastDay.text.toLowerCase()}.`, href: lastDay.action ? lastDay.href : undefined, tone: lastDay.tone === 'attention' ? 'attention' : undefined });
    else parts.push({ text: '.' });
    return parts;
  } else if (phase === 'closed_today') parts.push({ text: `${office.headline}. ` });
  else if (phase === 'no_schedule') parts.push({ text: 'No one is scheduled today. ' });
  else if (phase === 'before_open') parts.push({ text: `Not open yet. ${office.detail} ` });
  else {
    parts.push({ text: 'Open, ' }, { text: `${today.inNow ?? 0} of ${today.scheduled} in`, href: '/management/people' }, { text: '. ' });
    if (attention.length) parts.push({ text: `${describe(attention[0])}.`, href: attention[0].href ?? '/management/people', tone: 'attention' }, { text: ' ' });
  }
  if (lastDay && (today.asOf || (phase !== 'closed_today' && phase !== 'no_schedule'))) {
    if (lastDay.action) parts.push({ text: `${lastDay.label} is ${lastDay.text}`, href: lastDay.href, tone: 'attention' });
    else parts.push({ text: `${lastDay.label.replace(/'s closeout$/, '')} closed clean` });
    const due = payroll?.dueDate && daysBetween(todayDate, payroll.dueDate) <= 7 ? payroll.dueDate : null;
    if (due) parts.push({ text: `, and payroll hours are due ${formatDate(due).split(',')[0]}. `, href: '/management/payroll' });
    else parts.push({ text: '. ' });
  }
  if (needs.enabled) {
    const n = needs.top.length + needs.more;
    parts.push(n > 0
      ? { text: `${n} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you.`, href: '/management', tone: 'attention' }
      : { text: needs.degraded ? 'Some sources are still loading.' : 'Nothing needs you.' });
  }
  return parts;
}

/** The first three Attention items and the counts behind "n more" — shared by Owner and Manager Home. */
export function needsYou(attention: Pick<AttentionResult, 'needsNow' | 'waiting' | 'deferred' | 'degradedSources'> & { enabled: boolean }): NeedsYou {
  return {
    top: attention.needsNow.slice(0, 3),
    more: Math.max(0, attention.needsNow.length - 3),
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
  return {
    sentence: stateSentence({ office: input.summary.office, today, needs, lastDay, payroll: input.payroll, todayDate: input.today }),
    wrapUp,
    needs,
    today,
    lastDay,
    pace,
    inbox,
    spotlight: spotlight(input.goal),
  };
}
