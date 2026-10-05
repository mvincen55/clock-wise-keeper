/**
 * Late arrivals: the vocabulary every surface reads (src/lib/late-arrivals.ts).
 *
 *  - acknowledgment and excuse status are separate; acknowledgment never
 *    changes whether an arrival counts;
 *  - unexcused by default, pending while a request waits, excused only on
 *    approval; a declined request counts from the decision;
 *  - corrected (resolved) or suspect times never count;
 *  - the employee's prompt fires only for a live, undecided, unrequested,
 *    unacknowledged arrival — and ignoring it changes nothing;
 *  - the rule text says the numbers, the window rolls (day 1 and day 30
 *    share a window, day 1 and day 31 do not), and standing reads as
 *    "n of N in the last W days".
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LATE_ARRIVAL_RULE,
  EXCUSE_LABELS,
  awaitsEmployeeAnswer,
  countsTowardThreshold,
  excuseState,
  isDecided,
  isLiveLateArrival,
  ruleClause,
  ruleExplanation,
  ruleSentence,
  standingSentence,
  standingToday,
  windowStart,
  countingStart,
  countsFrom,
  type LateArrivalLike,
} from '@/lib/late-arrivals';

const late = (over: Partial<LateArrivalLike> = {}): LateArrivalLike => ({
  minutes_late: 12, approval_status: 'unreviewed', excuse_requested_at: null, acknowledged_at: null, resolved: false, timezone_suspect: false, ...over,
});

describe('excuse state', () => {
  it('is unexcused by default, pending while a request waits, excused only when approved', () => {
    expect(excuseState(late())).toBe('unexcused');
    expect(excuseState(late({ excuse_requested_at: '2026-09-18T08:00:00Z' }))).toBe('pending');
    expect(excuseState(late({ excuse_requested_at: '2026-09-18T08:00:00Z', approval_status: 'approved' }))).toBe('excused');
    expect(excuseState(late({ excuse_requested_at: '2026-09-18T08:00:00Z', approval_status: 'unapproved' }))).toBe('unexcused');
    expect(excuseState(late({ approval_status: 'approved' }))).toBe('excused');
  });
  it('labels every state as the office reads it', () => {
    expect(EXCUSE_LABELS.pending).toBe('Excuse requested: pending review');
    expect(EXCUSE_LABELS.excused).toBe('Excused');
    expect(EXCUSE_LABELS.unexcused).toBe('Unexcused');
  });
  it('knows a decision from a request', () => {
    expect(isDecided(late())).toBe(false);
    expect(isDecided(late({ excuse_requested_at: 'x' }))).toBe(false);
    expect(isDecided(late({ approval_status: 'unapproved' }))).toBe(true);
    expect(isDecided(late({ approval_status: 'approved' }))).toBe(true);
  });
});

describe('what counts toward the threshold', () => {
  it('an unexcused arrival counts whether or not it was acknowledged', () => {
    expect(countsTowardThreshold(late())).toBe(true);
    expect(countsTowardThreshold(late({ acknowledged_at: '2026-09-18T08:00:00Z' }))).toBe(true);
  });
  it('a pending request waits; a decision settles it either way', () => {
    const asked = { excuse_requested_at: '2026-09-18T08:00:00Z' };
    expect(countsTowardThreshold(late(asked))).toBe(false);
    expect(countsTowardThreshold(late({ ...asked, approval_status: 'approved' }))).toBe(false);
    expect(countsTowardThreshold(late({ ...asked, approval_status: 'unapproved' }))).toBe(true);
  });
  it('a corrected, suspect, or zero-minute arrival never counts', () => {
    expect(countsTowardThreshold(late({ resolved: true }))).toBe(false);
    expect(countsTowardThreshold(late({ timezone_suspect: true, minutes_late: 0 }))).toBe(false);
    expect(countsTowardThreshold(late({ minutes_late: 0 }))).toBe(false);
    expect(isLiveLateArrival(late({ resolved: true }))).toBe(false);
  });
});

describe('the employee prompt', () => {
  it('fires only for a live, undecided, unrequested, unacknowledged arrival', () => {
    expect(awaitsEmployeeAnswer(late())).toBe(true);
    expect(awaitsEmployeeAnswer(late({ acknowledged_at: 'x' }))).toBe(false);
    expect(awaitsEmployeeAnswer(late({ excuse_requested_at: 'x' }))).toBe(false);
    expect(awaitsEmployeeAnswer(late({ approval_status: 'unapproved' }))).toBe(false);
    expect(awaitsEmployeeAnswer(late({ approval_status: 'approved' }))).toBe(false);
    expect(awaitsEmployeeAnswer(late({ resolved: true }))).toBe(false);
    expect(awaitsEmployeeAnswer(late({ timezone_suspect: true, minutes_late: 0 }))).toBe(false);
  });
  it('ignoring the prompt leaves the arrival counting', () => {
    // Nothing about the row changes when the prompt is dismissed, so the same row still counts.
    const row = late();
    expect(awaitsEmployeeAnswer(row)).toBe(true);
    expect(countsTowardThreshold(row)).toBe(true);
  });
});

describe('the rule', () => {
  it('defaults to 3 in a rolling 30-day period, on', () => {
    expect(DEFAULT_LATE_ARRIVAL_RULE).toEqual({ threshold_count: 3, threshold_window_days: 30, is_active: true, counts_from: null });
    expect(ruleClause(DEFAULT_LATE_ARRIVAL_RULE)).toBe('3 unexcused late arrivals within a rolling 30-day period');
    expect(ruleSentence(DEFAULT_LATE_ARRIVAL_RULE)).toBe('3 unexcused late arrivals within a rolling 30-day period open an attendance incident report automatically.');
    expect(ruleClause({ threshold_count: 1, threshold_window_days: 7, is_active: true })).toBe('1 unexcused late arrival within a rolling 7-day period');
    expect(ruleSentence({ ...DEFAULT_LATE_ARRIVAL_RULE, is_active: false })).toContain('off');
  });
  it('explains itself the same way to everyone: receipts are not gates, excuses and corrections do not count, one report per crossing', () => {
    const lines = ruleExplanation(DEFAULT_LATE_ARRIVAL_RULE).join('\n');
    expect(lines).toContain('receipt, not an excuse');
    expect(lines).toContain('approved excuse never counts');
    expect(lines).toContain('corrected or suspect clock-in never counts');
    expect(lines).toContain('any 30 consecutive days holding 3');
    expect(lines).toContain('meeting with the team member and both signatures');
    expect(lines).toContain('grace period are unchanged');
  });
  it('a 30-day window ending on the 30th starts on the 1st', () => {
    expect(windowStart('2026-09-30', 30)).toBe('2026-09-01');
    expect(windowStart('2026-10-01', 30)).toBe('2026-09-02');
    expect(windowStart('2026-09-30', 1)).toBe('2026-09-30');
  });
});

describe('standing today', () => {
  const rule = DEFAULT_LATE_ARRIVAL_RULE;
  const on = (entry_date: string, over: Partial<LateArrivalLike> = {}) => ({ ...late(over), entry_date });
  it('counts qualifying arrivals in the window ending today, keeps pending separate, and says how many remain', () => {
    const s = standingToday([
      on('2026-09-01'), on('2026-09-16'), on('2026-09-20', { excuse_requested_at: 'x' }), on('2026-09-22', { approval_status: 'approved' }),
      on('2026-08-31'), // day 31 back: outside
    ], rule, '2026-09-30');
    expect(s).toEqual({ counting: 2, pending: 1, remaining: 1, windowStart: '2026-09-01', windowEnd: '2026-09-30', since: null });
    expect(standingSentence(s, rule)).toBe('2 of 3 unexcused late arrivals in the last 30 days · 1 excuse request pending');
  });
  it('reads zero remaining once the rule is met, never negative', () => {
    const s = standingToday([on('2026-09-10'), on('2026-09-11'), on('2026-09-12'), on('2026-09-13')], rule, '2026-09-30');
    expect(s.counting).toBe(4);
    expect(s.remaining).toBe(0);
  });
});

describe('the counting start (an office announcing its rule)', () => {
  const rule = { ...DEFAULT_LATE_ARRIVAL_RULE, counts_from: '2026-10-07' };
  const dated = (entry_date: string, over: Partial<LateArrivalLike> = {}) => ({ ...late(over), entry_date });

  it('reads a date, and nothing else, as the counting start', () => {
    expect(countsFrom(DEFAULT_LATE_ARRIVAL_RULE)).toBeNull();
    expect(countsFrom({ counts_from: '' })).toBeNull();
    expect(countsFrom({ counts_from: '10/07/2026' })).toBeNull();
    expect(countsFrom(rule)).toBe('2026-10-07');
  });
  it('cuts the rolling window at the counting start, and only then', () => {
    expect(countingStart(rule, '2026-10-20')).toBe('2026-10-07');
    expect(countingStart(rule, '2026-12-01')).toBe(windowStart('2026-12-01', 30));
    expect(countingStart(DEFAULT_LATE_ARRIVAL_RULE, '2026-10-20')).toBe(windowStart('2026-10-20', 30));
  });
  it('leaves late arrivals before the counting start out of the standing', () => {
    const arrivals = [dated('2026-09-29'), dated('2026-10-02'), dated('2026-10-06'), dated('2026-10-07'), dated('2026-10-13')];
    const s = standingToday(arrivals, rule, '2026-10-20');
    expect(s.counting).toBe(2);
    expect(s.remaining).toBe(1);
    expect(s.windowStart).toBe('2026-10-07');
    expect(s.since).toBe('2026-10-07');
    expect(standingSentence(s, rule)).toBe('2 of 3 unexcused late arrivals since Wed, Oct 7, 2026');
    const everything = standingToday(arrivals, DEFAULT_LATE_ARRIVAL_RULE, '2026-10-20');
    expect(everything.counting).toBe(5);
    expect(everything.since).toBeNull();
    expect(standingSentence(everything, DEFAULT_LATE_ARRIVAL_RULE)).toBe('5 of 3 unexcused late arrivals in the last 30 days');
  });
  it('says so in the rule text', () => {
    expect(ruleSentence(rule)).toBe('3 unexcused late arrivals within a rolling 30-day period open an attendance incident report automatically. Counting starts Wed, Oct 7, 2026.');
    expect(ruleSentence(DEFAULT_LATE_ARRIVAL_RULE)).not.toMatch(/Counting starts/);
    expect(ruleExplanation(rule).at(-1)).toBe('Late arrivals before Wed, Oct 7, 2026 stay on the record but do not count toward the rule: counting starts that day.');
    expect(ruleExplanation(DEFAULT_LATE_ARRIVAL_RULE).join(' ')).not.toMatch(/counting starts/i);
  });
});
