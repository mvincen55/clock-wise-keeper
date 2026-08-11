import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday, mondayOf } from '@/lib/time-utils';
import { depositChecks, type DepositLog } from '@/hooks/useDepositLog';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { daysInMonthOf, weeklyPaceForMonth } from '@/lib/metric-pace';

/**
 * Practice vitals read straight off the deposit log: what the day produced,
 * what was collected, how the new-patient pipeline moved, and what fell off
 * the schedule. Eastern-local dates, org-scoped by RLS.
 *
 * This hook is the single source the pulse layer reads. Three business rules
 * live here and everywhere downstream:
 *  - production, collections, and new-patients-seen each pace ONLY against
 *    their own org-configured target;
 *  - "new patients scheduled" is a pipeline indicator, never goal progress;
 *  - missing closeout data stays null/unrecorded — it is never summed as 0
 *    without the recorded-day counts that make the gap visible.
 */

export type DayVitals = {
  date: string;
  productionCents: number | null;
  collectedCents: number;
  /** Aggregate counts; null = not recorded in that closeout. */
  newPatientsScheduled: number | null;
  newPatientsSeen: number | null;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
};

export function collectedCentsOf(log: DepositLog): number {
  return (
    log.cash_cents +
    depositChecks(log).reduce((a, b) => a + b, 0) +
    log.ins_cc_cents +
    log.pt_cc_cents +
    log.illumitrac_cents +
    log.outside_financing_cents
  );
}

function toDayVitals(log: DepositLog): DayVitals {
  return {
    date: log.deposit_date,
    productionCents: log.production_cents,
    collectedCents: collectedCentsOf(log),
    newPatientsScheduled: log.new_patients_scheduled_count,
    newPatientsSeen: log.new_patients_seen_count,
    hygieneCancellations: log.hygiene_cancellations,
    hygieneNoShows: log.hygiene_no_shows,
    doctorCancellations: log.doctor_cancellations,
    doctorNoShows: log.doctor_no_shows,
  };
}

/** First day of the month `offset` months back from `date` (Eastern-local). */
function monthStart(date: string, offset = 0): string {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1, 12));
  return d.toISOString().slice(0, 10);
}

export type VitalsSummary = {
  productionCents: number;
  collectedCents: number;
  /** Sums over the days that actually recorded each count. */
  newPatientsScheduled: number;
  newPatientsSeen: number;
  /**
   * Recorded-day counts so a summed 0 is distinguishable from "nobody
   * answered": 0 recorded days means the metric was never entered.
   */
  newPatientsScheduledRecordedDays: number;
  newPatientsSeenRecordedDays: number;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
  disruptions: number;
  days: number;
};

export const EMPTY_SUMMARY: VitalsSummary = {
  productionCents: 0,
  collectedCents: 0,
  newPatientsScheduled: 0,
  newPatientsSeen: 0,
  newPatientsScheduledRecordedDays: 0,
  newPatientsSeenRecordedDays: 0,
  hygieneCancellations: 0,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 0,
  disruptions: 0,
  days: 0,
};

export function summarizeVitals(days: DayVitals[]): VitalsSummary {
  return days.reduce<VitalsSummary>(
    (acc, d) => ({
      productionCents: acc.productionCents + (d.productionCents ?? 0),
      collectedCents: acc.collectedCents + d.collectedCents,
      newPatientsScheduled: acc.newPatientsScheduled + (d.newPatientsScheduled ?? 0),
      newPatientsSeen: acc.newPatientsSeen + (d.newPatientsSeen ?? 0),
      newPatientsScheduledRecordedDays:
        acc.newPatientsScheduledRecordedDays + (d.newPatientsScheduled !== null ? 1 : 0),
      newPatientsSeenRecordedDays:
        acc.newPatientsSeenRecordedDays + (d.newPatientsSeen !== null ? 1 : 0),
      hygieneCancellations: acc.hygieneCancellations + d.hygieneCancellations,
      hygieneNoShows: acc.hygieneNoShows + d.hygieneNoShows,
      doctorCancellations: acc.doctorCancellations + d.doctorCancellations,
      doctorNoShows: acc.doctorNoShows + d.doctorNoShows,
      disruptions:
        acc.disruptions +
        d.hygieneCancellations +
        d.hygieneNoShows +
        d.doctorCancellations +
        d.doctorNoShows,
      days: acc.days + 1,
    }),
    EMPTY_SUMMARY
  );
}

/** The three org-configured monthly targets. 0 = no goal configured. */
export type VitalsTargets = {
  productionCents: number;
  collectionsCents: number;
  newPatientsSeen: number;
};

/** Per-metric dashboard visibility, already resolved against the viewer. */
export type VitalsVisibility = {
  production: boolean;
  collections: boolean;
  newPatients: boolean;
};

/** Twelve months of history, so this month can be read against the last one. */
export function usePracticeVitals() {
  const { data: ctx } = useOrgContext();
  const { data: practiceSettings } = usePracticeSettings();
  const today = getToday();

  const targets: VitalsTargets = {
    productionCents: practiceSettings?.monthly_production_target_cents ?? 0,
    collectionsCents: practiceSettings?.monthly_collections_target_cents ?? 0,
    newPatientsSeen: practiceSettings?.monthly_new_patients_seen_target_count ?? 0,
  };

  // Owners and managers always see all three metrics; 'admin_only' hides a
  // metric from regular members' dashboards. Display control, not secrecy.
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const visibility: VitalsVisibility = {
    production: isAdmin || practiceSettings?.production_visibility !== 'admin_only',
    collections: isAdmin || practiceSettings?.collections_visibility !== 'admin_only',
    newPatients: isAdmin || practiceSettings?.new_patients_visibility !== 'admin_only',
  };

  return useQuery({
    queryKey: [
      'practice-vitals',
      ctx?.org_id,
      today.slice(0, 7),
      targets.productionCents,
      targets.collectionsCents,
      targets.newPatientsSeen,
      visibility.production,
      visibility.collections,
      visibility.newPatients,
    ],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_logs')
        .select('*')
        .gte('deposit_date', monthStart(today, -11))
        .lte('deposit_date', today)
        .order('deposit_date');
      if (error) throw error;

      const all = (data ?? []).map(toDayVitals);
      const thisMonthStart = monthStart(today);

      const thisMonthDays = all.filter(d => d.date >= thisMonthStart);

      // Month elapsed drives the pace comparison — a target is only "behind"
      // relative to how much of the month has actually happened.
      const [, , dayOfMonth] = today.split('-').map(Number);
      const daysInMonth = daysInMonthOf(today);
      const monthElapsed = dayOfMonth / daysInMonth;

      // Monthly rollups for the trend charts.
      const byMonth = new Map<string, DayVitals[]>();
      for (const d of all) {
        const key = d.date.slice(0, 7);
        byMonth.set(key, [...(byMonth.get(key) ?? []), d]);
      }
      const months = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, days]) => ({ month, ...summarizeVitals(days) }));

      const thisMonth = summarizeVitals(thisMonthDays);

      const pacedTargets = {
        productionCents:
          targets.productionCents > 0 ? Math.round(targets.productionCents * monthElapsed) : 0,
        collectionsCents:
          targets.collectionsCents > 0 ? Math.round(targets.collectionsCents * monthElapsed) : 0,
      };

      // New patients scheduled this week (Mon–today): the pipeline indicator.
      // Only recorded values count; the recorded-day count keeps gaps honest.
      const weekStart = mondayOf(today);
      const weekDays = all.filter(d => d.date >= weekStart);
      const scheduledThisWeek = weekDays.reduce((a, d) => a + (d.newPatientsScheduled ?? 0), 0);
      const scheduledThisWeekRecordedDays = weekDays.filter(
        d => d.newPatientsScheduled !== null
      ).length;

      // The TRUE previous calendar month — not merely the second-to-last month
      // with data, which could be months ago in a patchy log.
      const prevMonthKey = monthStart(today, -1).slice(0, 7);
      const prevMonth = months.find(m => m.month === prevMonthKey) ?? null;

      return {
        today: all.find(d => d.date === today) ?? null,
        /** Most recent closed-out day on record (may be today), or null. */
        latest: all.length > 0 ? all[all.length - 1] : null,
        thisMonth,
        months,
        prevMonth,
        thisMonthDays,
        monthElapsed,
        daysInMonth,
        targets,
        pacedTargets,
        /** Approximate patients/week to stay on the monthly seen goal. */
        weeklyNewPatientPace: weeklyPaceForMonth(targets.newPatientsSeen, daysInMonth),
        scheduledThisWeek,
        scheduledThisWeekRecordedDays,
        visibility,
      };
    },
  });
}
