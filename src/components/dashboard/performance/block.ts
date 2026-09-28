import type { OwnerPulseInput } from '@/lib/owner-pulse';
import { goalMeters, type GoalMeter, type OfficeDaysInput } from '@/lib/goal-progress';
import type { OfficeDayCalendar } from '@/lib/office-days';
import { daysInMonthOf } from '@/lib/metric-pace';
import { buildHomeInsights, type AttentionSummary, type HomeInsight } from '@/lib/home-insights';
import { performanceDataFrom, type PerformanceData, type PerformanceRaw } from '@/lib/home-performance';
import { buildWindow, periodFor } from '@/lib/performance-series';
import { missedSeries } from '@/lib/missed-trend';
import type { VitalsVisibility } from '@/hooks/usePracticeVitals';
import { countOfficeDays } from '@/lib/office-days';
import { shiftDate } from '@/lib/time-utils';
import type { PerformanceBlock, PerformanceState } from '../types';
import { ADMIN_HOME_TOOLS } from '../tools';

/**
 * The performance block every role view carries, from raw rows. The live
 * hook and the design-review fixtures both call this, so the chart, the
 * meters, and the observations can never be composed two ways.
 */
export function performanceBlockFrom(args: {
  raw: PerformanceRaw | null;
  state: PerformanceState;
  pulse: OwnerPulseInput | null;
  attention: AttentionSummary | null;
}): PerformanceBlock {
  const { raw, state, pulse, attention } = args;
  const performance: PerformanceData | null = raw ? performanceDataFrom(raw) : null;
  if (!performance) {
    return { performance: null, performanceState: state === 'ok' ? 'loading' : state, goalMeters: null, insights: null, tools: [] };
  }
  const admin = performance.access === 'admin';
  const allMeters = goalMeters({
    today: performance.today, thisMonth: performance.thisMonth, targets: performance.targets, monthElapsed: performance.monthElapsed,
    officeDays: officeDaysForMonth(performance.today, performance.calendar),
    todayRecorded: performance.sources.closeouts.some(d => d.date === performance.today),
  });
  const meters = admin ? allMeters : filterMetersByVisibility(allMeters, performance.visibility);

  let insights: HomeInsight[] | null = null;
  if (admin && raw && (raw.role === 'owner' || raw.role === 'manager')) {
    const month = periodFor('this_month', performance.today);
    insights = buildHomeInsights({
      today: performance.today,
      role: raw.role,
      pulse,
      goals: allMeters,
      month: buildWindow({ period: month, today: performance.today, sources: performance.sources, preferredSource: 'closeouts', calendar: performance.calendar }),
      missed: missedSeries({ period: month, today: performance.today, events: performance.missedEvents, closeouts: performance.missedCloseouts }),
      attention,
      sources: { closeouts: performance.sources.closeoutsState, reports: performance.sources.reportState, reportDays: performance.sources.reportDays.length },
    });
  }

  return {
    performance,
    performanceState: state,
    goalMeters: meters,
    insights,
    tools: admin ? ADMIN_HOME_TOOLS : [],
  };
}

/**
 * The month's office days from the office calendar, for office-day pacing:
 * the whole month, the days through yesterday, and the days through today.
 * Null when the calendar is not in hand, so the meters fall back honestly.
 */
export function officeDaysForMonth(today: string, calendar: OfficeDayCalendar | null): OfficeDaysInput | null {
  if (!calendar) return null;
  const start = `${today.slice(0, 7)}-01`;
  const end = `${today.slice(0, 7)}-${String(daysInMonthOf(today)).padStart(2, '0')}`;
  return {
    total: countOfficeDays(start, end, calendar),
    throughYesterday: countOfficeDays(start, shiftDate(today, -1), calendar),
    throughToday: countOfficeDays(start, today, calendar),
  };
}

/** A member sees a meter only when its metric's visibility is "everyone". */
export function filterMetersByVisibility(meters: GoalMeter[], visibility: VitalsVisibility): GoalMeter[] {
  return meters.filter(m => (m.id === 'production' ? visibility.production : visibility.collections));
}
