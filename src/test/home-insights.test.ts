/**
 * home-insights — at most three observations, each grounded in recorded
 * rows with the comparison, the period, receipts, and a next step. Missing
 * data is an observation about data, never a verdict about the office;
 * verified good news is shown; nothing repeats a goal meter's verdict or
 * the Needs you queue; nothing is called a prediction.
 */
import { describe, expect, it } from 'vitest';
import { buildHomeInsights, MAX_INSIGHTS, type HomeInsightsInput } from '@/lib/home-insights';
import { goalMeters } from '@/lib/goal-progress';
import { buildWindow, periodFor, type CloseoutDay, type PerformanceSources } from '@/lib/performance-series';
import { missedSeries, type MissedEventLite } from '@/lib/missed-trend';
import type { OwnerPulseInput } from '@/lib/owner-pulse';
import type { DayVitals, VitalsSummary } from '@/hooks/usePracticeVitals';

const today = '2026-09-24';
const month = periodFor('this_month', today);
const officeDays = { total: 22, throughYesterday: 17, throughToday: 18 };
const summary = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 9_000_000, collectedCents: 8_000_000, newPatientsScheduled: 10, newPatientsSeen: 8,
  newPatientsScheduledRecordedDays: 17, newPatientsSeenRecordedDays: 17, hygieneCancellations: 3, hygieneNoShows: 1,
  doctorCancellations: 2, doctorNoShows: 1, disruptions: 7, productionRecordedDays: 17, disruptionsRecordedDays: 17, days: 17, ...over,
});
const day = (date: string, over: Partial<DayVitals> = {}): DayVitals => ({
  date, productionCents: 560_000, collectedCents: 500_000, newPatientsScheduled: 1, newPatientsSeen: 1,
  hygieneCancellations: 0, hygieneNoShows: 0, doctorCancellations: 0, doctorNoShows: 0, sealedAt: `${date}T22:00:00Z`, ...over,
});
const pulse = (over: Partial<OwnerPulseInput> = {}): OwnerPulseInput => ({
  today, todayVitals: null, latest: day('2026-09-23'), thisMonth: summary(), prevMonth: { month: '2026-08', ...summary({ days: 21 }) },
  monthElapsed: 24 / 30, targets: { productionCents: 12_000_000, collectionsCents: 10_000_000, newPatientsSeen: 0 },
  weeklyNewPatientPace: null, scheduledThisWeek: 2, scheduledThisWeekRecordedDays: 2, officePhase: 'open', ...over,
});
/** Seventeen September weekdays and the same span of August, at the given daily receipts. */
const closeoutsFor = (sepCents: number, augCents: number): CloseoutDay[] => {
  const out: CloseoutDay[] = [];
  for (const [m, cents] of [['09', sepCents], ['08', augCents]] as const) {
    for (let d = 1; d <= 24; d += 1) {
      const date = `2026-${m}-${String(d).padStart(2, '0')}`;
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      out.push({ date, productionCents: 560_000, collectionsCents: cents, sealedAt: `${date}T22:00:00Z` });
    }
  }
  return out;
};
const sources = (closeouts: CloseoutDay[]): PerformanceSources => ({ closeouts, closeoutsState: 'ok', reportDays: [], reportState: 'ok' });
const base = (over: Partial<HomeInsightsInput> = {}): HomeInsightsInput => {
  const p = over.pulse === undefined ? pulse() : over.pulse;
  const goals = p ? goalMeters({ today, thisMonth: p.thisMonth, targets: p.targets, monthElapsed: p.monthElapsed, officeDays }) : [];
  return {
    today, role: 'owner', pulse: p, goals,
    month: buildWindow({ period: month, today, sources: sources(closeoutsFor(500_000, 500_000)), preferredSource: 'closeouts' }),
    missed: null, attention: null, sources: { closeouts: 'ok', reports: 'ok', reportDays: 0 }, ...over,
  };
};

describe('data sufficiency comes first', () => {
  it('no closeouts at all names the gap and links the door — it is not a verdict', () => {
    const empty = pulse({ latest: null, prevMonth: null, thisMonth: summary({ days: 0, productionRecordedDays: 0, productionCents: 0, collectedCents: 0 }) });
    const out = buildHomeInsights(base({ pulse: empty, goals: [], month: null, sources: { closeouts: 'ok', reports: 'ok', reportDays: 40 } }));
    expect(out[0]).toMatchObject({ id: 'no_closeouts', tone: 'calm', basis: 'observed', title: 'Report history is loaded, but no day has been closed out yet.', next: { to: '/deposit-log' } });
    expect(out[0].comparison).toMatch(/40 posting days/);
    expect(out.every(i => i.tone !== 'attention')).toBe(true);
  });
  it('a failed source is said, not read as an empty office', () => {
    const out = buildHomeInsights(base({ sources: { closeouts: 'error', reports: 'ok', reportDays: 0 } }));
    expect(out[0].id).toBe('closeouts_unreadable');
  });
  it('a quiet deposit log outranks every performance signal', () => {
    const out = buildHomeInsights(base({ pulse: pulse({ latest: day('2026-09-15') }) }));
    expect(out[0].id).toBe('closeout_gap');
    expect(out[0].receipts.map(r => r.label)).toEqual(['Last closeout', 'Days since']);
  });
  it('office days with no closeout are one observation with the count and the fix, not a verdict', () => {
    const thin = pulse({ thisMonth: summary({ days: 15, productionRecordedDays: 15 }) });
    const out = buildHomeInsights(base({ pulse: thin }));
    const r = out.find(i => i.id === 'records_incomplete')!;
    expect(r).toMatchObject({ tone: 'attention', title: '2 office days this month have no closeout.', next: { label: 'Complete the records', to: '/deposit-log' } });
    expect(r.comparison).toBe('15 of 17 office days through the cutoff are recorded (September 2026).');
    expect(r.why).toMatch(/no behind-pace verdict/);
    // Not repeated when the closeout gap already says the log is quiet.
    const quiet = buildHomeInsights(base({ pulse: pulse({ latest: day('2026-09-15'), thisMonth: summary({ days: 15, productionRecordedDays: 15 }) }) }));
    expect(quiet.map(i => i.id)).not.toContain('records_incomplete');
  });
});

describe('what changed, with the comparison and the period', () => {
  it('collections against the same days last month, up or down, only when comparable', () => {
    const down = buildHomeInsights(base({ month: buildWindow({ period: month, today, sources: sources(closeoutsFor(400_000, 500_000)), preferredSource: 'closeouts' }) }));
    const d = down.find(i => i.id === 'collections_down')!;
    expect(d.tone).toBe('attention');
    expect(d.basis).toBe('observed');
    expect(d.title).toBe('Collections per recorded day are 20% below the same days last month.');
    // 18 September office days against 16 August ones: the totals alone would read −10%; per day it is −20%.
    expect(d.comparison).toBe('$4,000 a day over 18 closed-out days (Sep 1 – Sep 24, 2026) vs $5,000 a day over 16 closed-out days (Aug 1 – Aug 24, 2026) — −20%.');
    expect(d.why).toMatch(/insurance timing and posting/);
    expect(d.receipts.map(r => r.label)).toEqual(['This period', 'Same days last month', 'Calculation']);
    expect(d.receipts[2].source).toMatch(/per recorded day/);
    const up = buildHomeInsights(base({ month: buildWindow({ period: month, today, sources: sources(closeoutsFor(600_000, 500_000)), preferredSource: 'closeouts' }) }));
    expect(up.find(i => i.id === 'collections_up')?.tone).toBe('good');
    const flat = buildHomeInsights(base());
    expect(flat.some(i => i.id.startsWith('collections_'))).toBe(false);
  });
  it('withholds the collections comparison when the prior month has too few days', () => {
    const thin = closeoutsFor(400_000, 500_000).filter(c => !c.date.startsWith('2026-08') || c.date <= '2026-08-02');
    const out = buildHomeInsights(base({ month: buildWindow({ period: month, today, sources: sources(thin), preferredSource: 'closeouts' }) }));
    expect(out.some(i => i.id.startsWith('collections_'))).toBe(false);
  });
  it('rising cancellations need a quarter more and at least three more; falling is good news', () => {
    const ev = (date: string, code: '9100' | '9101', department = 'hygiene'): MissedEventLite => ({ business_date: date, code, department });
    const sep = Array.from({ length: 8 }, (_, i) => ev(`2026-09-${String(i + 2).padStart(2, '0')}`, '9101'));
    const aug = Array.from({ length: 4 }, (_, i) => ev(`2026-08-${String(i + 2).padStart(2, '0')}`, '9100', 'other'));
    const rising = buildHomeInsights(base({ missed: missedSeries({ period: month, today, events: [...sep, ...aug], closeouts: [] }) }));
    const r = rising.find(i => i.id === 'missed_rising')!;
    expect(r.comparison).toBe('8 for Sep 1 – Sep 24, 2026 vs 4 for Aug 1 – Aug 24, 2026 (0 doctor · 8 hygiene).');
    expect(r.next.to).toBe('/management/missed-appointments?start=2026-09-01&end=2026-09-24');
    const falling = buildHomeInsights(base({ missed: missedSeries({ period: month, today, events: [...sep.slice(0, 1), ...aug], closeouts: [] }) }));
    expect(falling.find(i => i.id === 'missed_falling')?.tone).toBe('good');
    const small = buildHomeInsights(base({ missed: missedSeries({ period: month, today, events: [...sep.slice(0, 5), ...aug], closeouts: [] }) }));
    expect(small.some(i => i.id.startsWith('missed_'))).toBe(false);
  });
});

describe('one number, one home', () => {
  it('a goal behind or reached is the meter’s to say; the queue’s count is the queue’s — neither is an insight', () => {
    const behind = buildHomeInsights(base({ pulse: pulse({ thisMonth: summary({ productionCents: 5_000_000 }) }), role: 'manager', attention: { enabled: true, needsNow: 4, waiting: 1, oldestHours: 52, payroll: { label: 'payroll Thu', days: 2 }, degraded: false } }));
    expect(behind.some(i => i.id.endsWith('_behind') || i.id.endsWith('_goal_reached') || i.id === 'work_waiting' || i.id === 'steady')).toBe(false);
    const reached = buildHomeInsights(base({ pulse: pulse({ thisMonth: summary({ collectedCents: 10_500_000 }) }) }));
    expect(reached.some(i => i.id.includes('goal_reached'))).toBe(false);
  });
  it('a month with nothing to add beyond the meters yields no observation at all', () => {
    expect(buildHomeInsights(base({ pulse: pulse({ thisMonth: summary({ productionCents: 9_800_000 }) }) }))).toEqual([]);
  });
  it('pacing on calendar days is said once as an estimate, with where to fix it', () => {
    const p = pulse();
    const goals = goalMeters({ today, thisMonth: p.thisMonth, targets: p.targets, monthElapsed: p.monthElapsed, officeDays: null });
    const out = buildHomeInsights(base({ goals }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'calendar_estimate', tone: 'calm', basis: 'estimate', next: { to: '/office-calendar' } });
  });
});

describe('selection', () => {
  it('never more than three, most consequential first', () => {
    const ev = (date: string, code: '9100' | '9101', department = 'hygiene'): MissedEventLite => ({ business_date: date, code, department });
    const sep = Array.from({ length: 8 }, (_, i) => ev(`2026-09-${String(i + 2).padStart(2, '0')}`, '9101'));
    const aug = Array.from({ length: 4 }, (_, i) => ev(`2026-08-${String(i + 2).padStart(2, '0')}`, '9100', 'other'));
    const p = pulse({ thisMonth: summary({ days: 15, productionRecordedDays: 15 }) });
    const out = buildHomeInsights(base({
      pulse: p,
      goals: goalMeters({ today, thisMonth: p.thisMonth, targets: p.targets, monthElapsed: p.monthElapsed, officeDays: null }),
      month: buildWindow({ period: month, today, sources: sources(closeoutsFor(400_000, 500_000)), preferredSource: 'closeouts' }),
      missed: missedSeries({ period: month, today, events: [...sep, ...aug], closeouts: [] }),
    }));
    expect(out).toHaveLength(MAX_INSIGHTS);
    expect(out.map(i => i.id)).toEqual(['collections_down', 'missed_rising', 'calendar_estimate']);
  });
});
