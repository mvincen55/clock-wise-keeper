/**
 * Owner daily pulse — the deterministic layer behind the redesigned Owner
 * Home. These tests pin the honesty rules that make the surface trustworthy:
 *
 *  - a day with no closeout is "not entered", never $0;
 *  - pace math only exists when a goal is configured;
 *  - trend claims require enough recorded data on both sides;
 *  - the recommendation always carries receipts that match its inputs, and
 *    stays silent (all_clear) when nothing warrants a suggestion;
 *  - the summary sentence is built only from recorded facts.
 */
import { describe, expect, it } from 'vitest';
import type { DayVitals, VitalsSummary } from '@/hooks/usePracticeVitals';
import {
  buildDailyBrief,
  buildGoalBrief,
  closeoutDayLabel,
  collectionsPace,
  dailySummary,
  missedBreakdown,
  missedMonth,
  monthCollectionsFact,
  ownerRecommendation,
  type GoalLike,
  type OwnerPulseInput,
} from '@/lib/owner-pulse';

const day = (date: string, over: Partial<DayVitals> = {}): DayVitals => ({
  date,
  productionCents: 742_000,
  collectedCents: 615_000,
  hygieneCancellations: 0,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 0,
  ...over,
});

const summary = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 4_218_000,
  collectedCents: 5_840_000,
  hygieneCancellations: 4,
  hygieneNoShows: 2,
  doctorCancellations: 3,
  doctorNoShows: 2,
  disruptions: 11,
  days: 6,
  ...over,
});

/** A healthy mid-August office: goal configured, prior month on record. */
const base = (over: Partial<OwnerPulseInput> = {}): OwnerPulseInput => ({
  today: '2026-08-10',
  todayVitals: day('2026-08-10'),
  latest: day('2026-08-10'),
  thisMonth: summary(),
  prevMonth: { month: '2026-07', ...summary({ disruptions: 30, days: 21, productionCents: 13_000_000 }) },
  monthElapsed: 10 / 31,
  targetCents: 13_500_000,
  pacedTargetCents: Math.round(13_500_000 * (10 / 31)),
  officePhase: 'after_close',
  ...over,
});

/* ---------------------------- daily financial --------------------------- */

describe('daily brief', () => {
  it("shows today's actual production and collections when the closeout exists", () => {
    const brief = buildDailyBrief(base());
    expect(brief.scope).toBe('today');
    expect(brief.dayLabel).toBe("Today's closeout");
    expect(brief.facts.find(f => f.id === 'production')?.value).toBe('$7,420');
    expect(brief.facts.find(f => f.id === 'collected')?.value).toBe('$6,150');
    expect(brief.note).toBeNull();
  });

  it('never renders $0 for a missing closeout — it shows the last closed day, labeled', () => {
    const brief = buildDailyBrief(
      base({ todayVitals: null, latest: day('2026-08-07'), officePhase: 'after_close' }),
    );
    expect(brief.scope).toBe('previous');
    expect(brief.dayLabel).toBe("Friday's closeout");
    expect(brief.note).toBe("Today's closeout has not been entered yet.");
    expect(brief.facts.every(f => f.value !== '$0')).toBe(true);
  });

  it('during working hours the note says figures arrive after closeout, without alarm', () => {
    const brief = buildDailyBrief(
      base({ todayVitals: null, latest: day('2026-08-07'), officePhase: 'open' }),
    );
    expect(brief.note).toBe("Today's figures appear after the day is closed out.");
  });

  it('a brand-new office gets an honest empty state, not zeros', () => {
    const brief = buildDailyBrief(
      base({
        todayVitals: null,
        latest: null,
        thisMonth: summary({ days: 0, collectedCents: 0, productionCents: 0, disruptions: 0 }),
        prevMonth: null,
      }),
    );
    expect(brief.scope).toBe('none');
    expect(brief.facts).toHaveLength(0);
  });

  it('production not recorded on a real closeout reads as a dash, not $0', () => {
    const brief = buildDailyBrief(base({ todayVitals: day('2026-08-10', { productionCents: null }) }));
    const prod = brief.facts.find(f => f.id === 'production');
    expect(prod?.value).toBe('—');
    expect(prod?.detail).toMatch(/not recorded/i);
  });

  it('labels older closeouts by weekday within a week and by date beyond it', () => {
    expect(closeoutDayLabel('2026-08-09', '2026-08-10')).toBe("Yesterday's closeout");
    expect(closeoutDayLabel('2026-08-04', '2026-08-10')).toBe("Tuesday's closeout");
    expect(closeoutDayLabel('2026-08-01', '2026-08-10')).toMatch(/^Closeout from /);
  });
});

describe('collections pace', () => {
  it('is correct against the paced target when a goal is configured', () => {
    const pace = collectionsPace(base());
    // $58,400 collected vs $13,500,000 × 10/31 ≈ $43,548 paced — ahead.
    expect(pace?.status).toBe('ahead');
    expect(pace?.diffCents).toBe(5_840_000 - Math.round(13_500_000 * (10 / 31)));
    const fact = monthCollectionsFact(base());
    expect(fact?.value).toBe('$58,400');
    expect(fact?.detail).toContain('43% of the $135,000 goal');
    expect(fact?.detail).toMatch(/ahead of pace/);
  });

  it('reports behind pace with the shortfall amount', () => {
    const input = base({ thisMonth: summary({ collectedCents: 3_000_000 }) });
    expect(collectionsPace(input)?.status).toBe('behind');
    expect(monthCollectionsFact(input)?.detail).toMatch(/behind pace/);
  });

  it('a small gap counts as on pace, not a scare', () => {
    const paced = Math.round(13_500_000 * (10 / 31));
    const input = base({ thisMonth: summary({ collectedCents: paced - 100_000 }) });
    expect(collectionsPace(input)?.status).toBe('on_pace'); // within 2% of the goal
  });

  it('no configured goal → no percentage, no pace verdict', () => {
    const input = base({ targetCents: 0, pacedTargetCents: 0 });
    expect(collectionsPace(input)).toBeNull();
    const fact = monthCollectionsFact(input);
    expect(fact?.detail).toBe('No monthly collections goal is set.');
    expect(fact?.detail).not.toMatch(/%/);
  });

  it('no closeouts this month → no month fact at all', () => {
    const input = base({ thisMonth: summary({ days: 0, collectedCents: 0 }) });
    expect(monthCollectionsFact(input)).toBeNull();
  });
});

/* --------------------------- missed appointments ------------------------ */

describe('missed appointments', () => {
  it('breaks a day down by hygiene/doctor and cancel/no-show', () => {
    expect(
      missedBreakdown({ hygieneCancellations: 2, hygieneNoShows: 0, doctorCancellations: 0, doctorNoShows: 1 }),
    ).toBe('2 hygiene cancellations · 1 doctor no-show');
  });

  it('a clean day reads calm, not empty-alarming', () => {
    const brief = buildDailyBrief(base());
    const missed = brief.facts.find(f => f.id === 'missed');
    expect(missed?.value).toBe('0');
    expect(missed?.tone).toBe('calm');
    expect(missed?.detail).toMatch(/clean schedule day/i);
  });

  it('keeps today and month-to-date as separate numbers', () => {
    const input = base({
      todayVitals: day('2026-08-10', { hygieneCancellations: 2, doctorNoShows: 1 }),
    });
    const todayFact = buildDailyBrief(input).facts.find(f => f.id === 'missed');
    expect(todayFact?.value).toBe('3');
    expect(missedMonth(input).total).toBe(11);
  });

  it('claims a trend only when both months have enough closed-out days', () => {
    const withTrend = missedMonth(base());
    expect(withTrend.trend).not.toBeNull();
    const thinPrev = missedMonth(base({ prevMonth: { month: '2026-07', ...summary({ days: 3 }) } }));
    expect(thinPrev.trend).toBeNull();
    expect(thinPrev.trendLabel).toBeNull();
    const noPrev = missedMonth(base({ prevMonth: null }));
    expect(noPrev.trend).toBeNull();
  });

  it('computes the trend against last month paced to today', () => {
    // Baseline: 30 × 10/31 ≈ 9.7; 11 < 9.7 × 1.25 = 12.1 → steady, not alarming.
    expect(missedMonth(base()).trend).toBe('steady');
    // 14 > 12.1 → above pace.
    expect(missedMonth(base({ thisMonth: summary({ disruptions: 14 }) })).trend).toBe('above_pace');
    // 6 < 9.7 × 0.75 → improving.
    expect(missedMonth(base({ thisMonth: summary({ disruptions: 6 }) })).trend).toBe('improving');
  });
});

/* --------------------------------- goals -------------------------------- */

const goal = (over: Partial<GoalLike> = {}): GoalLike => ({
  id: 'g1',
  title: 'Reduce same-day cancellations',
  metric: 'saved appointments',
  progress: 7,
  target_count: 10,
  starts_on: '2026-08-03',
  ends_on: '2026-08-14',
  status: 'active',
  ...over,
});

describe('office goal brief', () => {
  it('shows the active goal with honest calendar-day framing', () => {
    const g = buildGoalBrief([goal()], '2026-08-10');
    expect(g?.done).toBe(7);
    expect(g?.remaining).toBe(3);
    expect(g?.daysLeft).toBe(4);
    expect(g?.stateDetail).toMatch(/70% done/);
    // 8 of 12 window days elapsed ≈ 67% ≤ 70% done → on track.
    expect(g?.state).toBe('on_track');
  });

  it('flags a goal running behind its window', () => {
    const g = buildGoalBrief([goal({ progress: 3 })], '2026-08-10');
    expect(g?.state).toBe('needs_push');
  });

  it('surfaces pending verification first — it is blocked on a human', () => {
    const g = buildGoalBrief(
      [goal(), goal({ id: 'g2', title: 'Huddles', status: 'pending_verification' })],
      '2026-08-10',
    );
    expect(g?.id).toBe('g2');
    expect(g?.state).toBe('awaiting_verification');
    expect(g?.moreCount).toBe(1);
  });

  it('no live goal → null (the UI offers the Sprint Builder)', () => {
    expect(buildGoalBrief([], '2026-08-10')).toBeNull();
    expect(buildGoalBrief([goal({ status: 'won' })], '2026-08-10')).toBeNull();
  });

  it('multiple active goals collapse to one primary plus a count', () => {
    const g = buildGoalBrief(
      [goal(), goal({ id: 'g2', ends_on: '2026-08-28' }), goal({ id: 'g3', ends_on: '2026-09-30' })],
      '2026-08-10',
    );
    expect(g?.id).toBe('g1'); // soonest ending
    expect(g?.moreCount).toBe(2);
  });
});

/* ----------------------------- recommendation ---------------------------- */

describe('what I’d look at', () => {
  it('a healthy day yields all_clear with the passed checks as receipts', () => {
    const rec = ownerRecommendation(base(), [goal()]);
    expect(rec.id).toBe('all_clear');
    expect(rec.text).toMatch(/No intervention suggested/);
    expect(rec.receipts.length).toBeGreaterThan(0);
  });

  it('no recorded data → says so instead of judging an empty office', () => {
    const rec = ownerRecommendation(
      base({
        todayVitals: null,
        latest: null,
        thisMonth: summary({ days: 0, collectedCents: 0, productionCents: 0, disruptions: 0 }),
        prevMonth: null,
      }),
      [],
    );
    expect(rec.id).toBe('no_data');
  });

  it('a stale deposit log outranks every performance signal', () => {
    const rec = ownerRecommendation(
      base({
        todayVitals: null,
        latest: day('2026-08-04'),
        thisMonth: summary({ disruptions: 20, collectedCents: 1_000_000 }),
      }),
      [],
    );
    expect(rec.id).toBe('closeout_gap');
    expect(rec.receipts.map(r => r.label)).toContain('Last closeout');
    expect(rec.action?.to).toBe('/deposit-log');
  });

  it('elevated disruptions point at the running cancellation sprint by name', () => {
    const rec = ownerRecommendation(base({ thisMonth: summary({ disruptions: 14 }) }), [goal()]);
    expect(rec.id).toBe('disruptions_elevated');
    expect(rec.text).toContain('Reduce same-day cancellations');
    // Receipts carry the actual numbers the claim was computed from.
    expect(rec.receipts.find(r => r.label === 'Missed this month')?.value).toBe('14');
    expect(rec.receipts.find(r => r.label === 'Usual by this point')?.value).toBe('~10');
  });

  it('collections behind while production holds suggests a posting check, not blame', () => {
    const rec = ownerRecommendation(base({ thisMonth: summary({ collectedCents: 3_000_000 }) }), []);
    expect(rec.id).toBe('collections_posting');
    expect(rec.text).toMatch(/fully posted/);
    expect(rec.text).not.toMatch(/staff|fault|blame/i);
  });

  it('a sprint out of runway suggests rescoping', () => {
    const rec = ownerRecommendation(base(), [
      goal({ progress: 2, ends_on: '2026-08-12', starts_on: '2026-08-03' }),
    ]);
    expect(rec.id).toBe('goal_rescope');
    expect(rec.action?.to).toBe('/goals');
  });

  it('never fires the disruption claim on thin comparison data', () => {
    const rec = ownerRecommendation(
      base({
        thisMonth: summary({ disruptions: 20 }),
        prevMonth: { month: '2026-07', ...summary({ days: 2 }) },
      }),
      [],
    );
    expect(rec.id).not.toBe('disruptions_elevated');
  });
});

/* ----------------------------- summary sentence -------------------------- */

describe('daily summary sentence', () => {
  it('reads the day from real numbers', () => {
    const s = dailySummary(base(), buildDailyBrief(base()), 0);
    expect(s).toContain('$7,420');
    expect(s).toMatch(/ahead of monthly pace/);
    expect(s).toMatch(/no missed appointments/);
  });

  it('a missing closeout is narrated, never zeroed', () => {
    const input = base({ todayVitals: null, latest: day('2026-08-07'), officePhase: 'after_close' });
    const s = dailySummary(input, buildDailyBrief(input), 1);
    expect(s).toMatch(/closeout isn't in yet/);
    expect(s).toContain('1 owner decision waiting');
    expect(s).not.toContain('$0');
  });

  it('an empty office states there is no pulse to read', () => {
    const input = base({
      todayVitals: null,
      latest: null,
      thisMonth: summary({ days: 0, collectedCents: 0, productionCents: 0, disruptions: 0 }),
      prevMonth: null,
    });
    const s = dailySummary(input, buildDailyBrief(input), 0);
    expect(s).toMatch(/no pulse to read/i);
  });

  it('a rough schedule day is called out without inventing a financial verdict', () => {
    const input = base({
      targetCents: 0,
      pacedTargetCents: 0,
      todayVitals: day('2026-08-10', { hygieneCancellations: 2, hygieneNoShows: 1, doctorNoShows: 1 }),
    });
    const s = dailySummary(input, buildDailyBrief(input), 0);
    expect(s).toMatch(/rough schedule day/);
    expect(s).not.toMatch(/solid financial/);
  });
});
