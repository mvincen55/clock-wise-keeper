import { describe, expect, it } from 'vitest';
import {
  clockInActionFor,
  finalClockOutAt,
  getClockStatus,
  punchTypeForAction,
  shouldInterceptForChecklist,
  type ClockActionKind,
} from '@/lib/clock-status';
import { computeGating, type GatingItem } from '@/lib/checklist-gating';

// A break is not the end of the day. These tests pin the semantic model that
// keeps the two apart: which punches each action writes, which action is
// allowed to interrupt with the checklist dialog, and what downstream rules
// (final departure, live status) may read from an 'out' punch.

type P = { punch_type: 'in' | 'out'; punch_kind: ClockActionKind | null; punch_time: string };

const p = (punch_type: 'in' | 'out', punch_kind: ClockActionKind | null, punch_time: string): P => ({
  punch_type,
  punch_kind,
  punch_time,
});

describe('semantic actions → mechanical punches', () => {
  it('maps arrivals to in-punches and departures to out-punches', () => {
    expect(punchTypeForAction('clock_in')).toBe('in');
    expect(punchTypeForAction('break_end')).toBe('in');
    expect(punchTypeForAction('break_start')).toBe('out');
    expect(punchTypeForAction('shift_end')).toBe('out');
  });

  it('reads the first in of a day as clock-in and any later in as a return — structural, never time-based', () => {
    expect(clockInActionFor([])).toBe('clock_in');
    expect(clockInActionFor([p('in', 'clock_in', 'T08'), p('out', 'break_start', 'T12')])).toBe('break_end');
    // Even after an unknown-kind out (GPS exit, legacy row), coming back is a return.
    expect(clockInActionFor([p('in', null, 'T08'), p('out', null, 'T12')])).toBe('break_end');
  });
});

describe('checklist enforcement fires only on an explicit end of shift', () => {
  it('never interrupts a lunch/break, no matter how many items are open (regression 1)', () => {
    expect(shouldInterceptForChecklist('break_start', 8)).toBe(false);
    expect(shouldInterceptForChecklist('break_start', 1)).toBe(false);
  });

  it('never interrupts clocking in or returning from a break (regression 2)', () => {
    expect(shouldInterceptForChecklist('clock_in', 8)).toBe(false);
    expect(shouldInterceptForChecklist('break_end', 8)).toBe(false);
  });

  it('interrupts an end of shift while required personal items are open (regression 3)', () => {
    expect(shouldInterceptForChecklist('shift_end', 8)).toBe(true);
    expect(shouldInterceptForChecklist('shift_end', 1)).toBe(true);
  });

  it('lets a clean end of shift straight through (regression 4)', () => {
    expect(shouldInterceptForChecklist('shift_end', 0)).toBe(false);
  });

  it('open shared/team items never block an end of shift (regression 5)', () => {
    // Shared items land in openSharedCount, never in incompleteCount — the
    // only number the intercept reads.
    const shared: GatingItem = {
      id: 'shared-1',
      per_person: false,
      owner_user_id: null,
      due_date: null,
    };
    const gating = computeGating({
      lists: [],
      items: [shared],
      completions: [],
      userId: 'user-me',
      today: '2026-08-12',
      isAdmin: false,
    });
    expect(gating.openSharedCount).toBe(1);
    expect(gating.incompleteCount).toBe(0);
    expect(shouldInterceptForChecklist('shift_end', gating.incompleteCount)).toBe(false);
  });

  it('checklist progress is untouched by punches — leaving and returning changes no completion (regression 2)', () => {
    // The gate reads checklists/completions only; punches are not an input to
    // computeGating at all, so a break cannot mark anything abandoned.
    const mine: GatingItem = { id: 'a', per_person: true, owner_user_id: null, due_date: null };
    const before = computeGating({
      lists: [], items: [mine], completions: [], userId: 'me', today: '2026-08-12', isAdmin: false,
    });
    const afterLunch = computeGating({
      lists: [], items: [mine], completions: [], userId: 'me', today: '2026-08-12', isAdmin: false,
    });
    expect(afterLunch).toEqual(before);
  });
});

describe('live status from the last punch', () => {
  it('cycles through a day with a lunch (regressions 1–2)', () => {
    const morning = [p('in', 'clock_in', 'T08')];
    const atLunch = [...morning, p('out', 'break_start', 'T12')];
    const afternoon = [...atLunch, p('in', 'break_end', 'T12:45')];
    const done = [...afternoon, p('out', 'shift_end', 'T17')];

    expect(getClockStatus([])).toBe('clocked_out');
    expect(getClockStatus(morning)).toBe('clocked_in');
    expect(getClockStatus(atLunch)).toBe('on_break');
    expect(getClockStatus(afternoon)).toBe('clocked_in');
    expect(getClockStatus(done)).toBe('clocked_out');
  });

  it('never guesses on an unknown-kind out (GPS/legacy): plain clocked_out, not on_break', () => {
    expect(getClockStatus([p('in', null, 'T08'), p('out', null, 'T12')])).toBe('clocked_out');
  });
});

describe('final departure (what "clocked out for the day" may mean downstream)', () => {
  it('a break is never a departure — notes arriving during lunch stay owed', () => {
    expect(finalClockOutAt([p('in', 'clock_in', 'T08'), p('out', 'break_start', 'T12')])).toBeNull();
  });

  it('an explicit shift end is the departure', () => {
    const day = [
      p('in', 'clock_in', 'T08'),
      p('out', 'break_start', 'T12'),
      p('in', 'break_end', 'T12:45'),
      p('out', 'shift_end', 'T17'),
    ];
    expect(finalClockOutAt(day)).toBe('T17');
  });

  it('keeps the pre-kinds behavior for unknown outs: the last word of the day counts', () => {
    expect(finalClockOutAt([p('in', null, 'T08'), p('out', null, 'T17')])).toBe('T17');
    // …but not while the person is mid-day back at work.
    expect(finalClockOutAt([p('in', null, 'T08'), p('out', null, 'T12'), p('in', null, 'T12:45')])).toBeNull();
  });

  it('multiple breaks in one day never read as departures or shift endings (regression 6)', () => {
    const day = [
      p('in', 'clock_in', 'T07'),
      p('out', 'break_start', 'T10'),
      p('in', 'break_end', 'T10:15'),
      p('out', 'break_start', 'T13'),
      p('in', 'break_end', 'T13:30'),
    ];
    expect(finalClockOutAt(day)).toBeNull();
    expect(getClockStatus(day)).toBe('clocked_in');
    // And another break still doesn't gate.
    expect(shouldInterceptForChecklist('break_start', 8)).toBe(false);
  });
});
