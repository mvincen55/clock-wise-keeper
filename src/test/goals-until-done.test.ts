/**
 * A goal is a goal until it is completed or changed — never cut off by the
 * calendar month it was set in. These pin the rules the Goals page, Home and
 * the office goal all read:
 *
 *  - an active goal is current whatever month it was set in; a completed one
 *    stays for a month so the next meeting hears about it; archived never;
 *  - each person is on one goal: active first, else the most recent finish;
 *  - a goal with no target date has no calendar to trail (never "behind");
 *  - the office goal can run open-ended: no end date, no countdown, no pace
 *    verdict — "in progress" until the target is reached;
 *  - the migration is additive and lets both tables carry that.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPLETED_GOAL_GRACE_DAYS,
  currentGoalFor,
  goalElapsedFraction,
  goalStartDate,
  isCurrentGoal,
} from '@/lib/goal-window';
import { buildGoalBrief, type GoalLike } from '@/lib/owner-pulse';
import { spotlight } from '@/lib/home-brief';

const row = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });
const base = () => ({
  status: 'active',
  month: '2026-08',
  due_on: null as string | null,
  completed_at: null as string | null,
  created_at: '2026-08-12T14:00:00Z',
  updated_at: '2026-08-12T14:00:00Z',
  user_id: 'me',
  visibility: 'team',
});

describe('a goal is current until it is completed or changed', () => {
  it('an active goal set months ago is still the goal', () => {
    expect(isCurrentGoal(row(), '2026-10-06')).toBe(true);
    expect(isCurrentGoal(row({ month: '2025-11', created_at: '2025-11-03T14:00:00Z' }), '2026-10-06')).toBe(true);
  });

  it('a completed goal stays for a month, then makes room', () => {
    const done = row({ status: 'completed', completed_at: '2026-09-20T14:00:00Z' });
    expect(isCurrentGoal(done, '2026-10-06')).toBe(true);
    expect(isCurrentGoal(done, `2026-10-${20 + 0}`)).toBe(true); // exactly 30 days
    expect(isCurrentGoal(done, '2026-10-25')).toBe(false);
    expect(COMPLETED_GOAL_GRACE_DAYS).toBe(30);
  });

  it('rows completed before the stamp existed fall back to updated_at', () => {
    const legacy = row({ status: 'completed', completed_at: null, updated_at: '2026-06-01T14:00:00Z' });
    expect(isCurrentGoal(legacy, '2026-10-06')).toBe(false);
    expect(isCurrentGoal(legacy, '2026-06-20')).toBe(true);
  });

  it('an archived goal is never current — letting go means setting the next', () => {
    expect(isCurrentGoal(row({ status: 'archived' }), '2026-08-13')).toBe(false);
  });
});

describe('the goal a person is on', () => {
  const older = row({ created_at: '2026-07-01T14:00:00Z' });
  const newer = row({ created_at: '2026-09-01T14:00:00Z' });
  const finished = row({ status: 'completed', completed_at: '2026-09-28T14:00:00Z' });
  const finishedEarlier = row({ status: 'completed', completed_at: '2026-09-10T14:00:00Z' });
  const someoneElse = row({ user_id: 'them' });
  const privateOne = row({ visibility: 'private', created_at: '2026-09-15T14:00:00Z' });

  it('prefers the active goal, newest first, over anything finished', () => {
    expect(currentGoalFor([finished, older, newer, someoneElse], 'me', 'team', '2026-10-06')).toBe(newer);
  });

  it('falls back to the most recent finish while it is still current', () => {
    expect(currentGoalFor([finishedEarlier, finished], 'me', 'team', '2026-10-06')).toBe(finished);
    expect(currentGoalFor([finishedEarlier, finished], 'me', 'team', '2026-12-01')).toBeUndefined();
  });

  it('respects visibility so a private goal never lands on a team card', () => {
    expect(currentGoalFor([privateOne, older], 'me', 'team', '2026-10-06')).toBe(older);
    expect(currentGoalFor([privateOne], 'me', 'team', '2026-10-06')).toBeUndefined();
    expect(currentGoalFor([privateOne], 'me', undefined, '2026-10-06')).toBe(privateOne);
  });
});

describe('how much of the goal’s window has elapsed', () => {
  it('no target date → 0: there is no calendar to be behind', () => {
    expect(goalElapsedFraction(row(), '2026-12-31')).toBe(0);
  });

  it('with a target date, the share of the window from the day it was set', () => {
    const dated = row({ created_at: '2026-10-01T14:00:00Z', due_on: '2026-10-21' });
    expect(goalElapsedFraction(dated, '2026-10-11')).toBeCloseTo(0.5);
    expect(goalElapsedFraction(dated, '2026-09-30')).toBe(0);
    expect(goalElapsedFraction(dated, '2026-11-15')).toBe(1);
  });

  it('a target date on or before the start day reads as fully elapsed once reached', () => {
    const sameDay = row({ created_at: '2026-10-01T14:00:00Z', due_on: '2026-10-01' });
    expect(goalElapsedFraction(sameDay, '2026-10-01')).toBe(1);
    expect(goalElapsedFraction(sameDay, '2026-09-30')).toBe(0);
  });

  it('reads the start as the Eastern day it was set, or the first of its month for rows without a stamp', () => {
    expect(goalStartDate(row({ created_at: '2026-10-02T03:30:00Z' }))).toBe('2026-10-01');
    expect(goalStartDate(row({ created_at: '', month: '2026-03' }))).toBe('2026-03-01');
  });
});

describe('an open office goal', () => {
  const dated: GoalLike = { id: 'g1', title: 'Same-day reappointments', metric: 'reappointments', progress: 4, target_count: 10, starts_on: '2026-10-01', ends_on: '2026-10-31', status: 'active' };
  const open: GoalLike = { id: 'g2', title: 'Recall reactivation', metric: 'patients', progress: 4, target_count: 10, starts_on: '2026-09-01', ends_on: null, status: 'active' };

  it('has no end date, no countdown and no pace verdict — it is in progress until it is reached', () => {
    const brief = buildGoalBrief([open], '2026-10-06');
    expect(brief).toMatchObject({ id: 'g2', endsOn: null, daysLeft: null, state: 'in_progress', stateLabel: 'In progress', endsLabel: 'until it is reached', remaining: 6 });
    expect(brief?.stateDetail).toMatch(/40% done · no end date/);
  });

  it('a dated goal is shown ahead of an open one, and the open one is still counted', () => {
    const brief = buildGoalBrief([open, dated], '2026-10-06');
    expect(brief?.id).toBe('g1');
    expect(brief?.moreCount).toBe(1);
  });

  it('never earns a countdown spotlight; reaching the target still does', () => {
    expect(spotlight(buildGoalBrief([open], '2026-10-06'))).toBeNull();
    expect(spotlight(buildGoalBrief([{ ...open, progress: 10 }], '2026-10-06'))?.reason).toBe('finished');
    expect(spotlight(buildGoalBrief([{ ...open, status: 'pending_verification' }], '2026-10-06'))?.reason).toBe('needs a decision');
  });
});

describe('the goals-until-done migration', () => {
  const sql = readFileSync(
    join(__dirname, '../../supabase/migrations/20261006140000_goals_until_done.sql'),
    'utf8',
  );

  it('gives personal goals an optional target date and a completion stamp, replay-safe', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS due_on date/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS completed_at timestamptz/);
    expect(sql).not.toMatch(/due_on date NOT NULL/);
    const adds = sql.match(/ADD COLUMN/g) ?? [];
    expect(adds.length).toBe((sql.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length);
  });

  it('backfills the completion stamp only where a completed goal has none', () => {
    expect(sql).toMatch(/SET completed_at = updated_at\s+WHERE status = 'completed' AND completed_at IS NULL/);
  });

  it('lets the office goal run without an end date, and only then', () => {
    expect(sql).toMatch(/ALTER TABLE public\.team_goals ALTER COLUMN ends_on DROP NOT NULL/);
    expect(sql).toMatch(/CHECK \(period IN \('week', 'month', 'open'\)\)/);
    expect(sql).toMatch(/CHECK \(\(period = 'open'\) = \(ends_on IS NULL\)\)/);
  });

  it('keeps the month column as history and drops nothing', () => {
    expect(sql).toMatch(/COMMENT ON COLUMN public\.goals\.month/);
    expect(sql).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  });
});
