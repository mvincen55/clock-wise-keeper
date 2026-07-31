import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import { depositChecks, type DepositLog } from '@/hooks/useDepositLog';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';

/**
 * Practice vitals read straight off the deposit log: what the day produced,
 * what was collected, and what fell off the schedule. Eastern-local dates,
 * org-scoped by RLS.
 */

export type DayVitals = {
  date: string;
  productionCents: number | null;
  collectedCents: number;
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
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
  disruptions: number;
  days: number;
};

function summarize(days: DayVitals[]): VitalsSummary {
  return days.reduce<VitalsSummary>(
    (acc, d) => ({
      productionCents: acc.productionCents + (d.productionCents ?? 0),
      collectedCents: acc.collectedCents + d.collectedCents,
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
    {
      productionCents: 0,
      collectedCents: 0,
      hygieneCancellations: 0,
      hygieneNoShows: 0,
      doctorCancellations: 0,
      doctorNoShows: 0,
      disruptions: 0,
      days: 0,
    }
  );
}

/** Twelve months of history, so this month can be read against the last one. */
export function usePracticeVitals() {
  const { data: ctx } = useOrgContext();
  const { data: practiceSettings } = usePracticeSettings();
  const today = getToday();
  const targetCents = practiceSettings?.monthly_collections_target_cents ?? 0;
  const visible = practiceSettings?.collections_visibility !== 'admin_only' || ctx?.role === 'owner';

  return useQuery({
    queryKey: ['practice-vitals', ctx?.org_id, today.slice(0, 7), targetCents, visible],
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
      const [y, m] = today.split('-').map(Number);
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

      // Monthly rollups for the trend charts.
      const byMonth = new Map<string, DayVitals[]>();
      for (const d of all) {
        const key = d.date.slice(0, 7);
        byMonth.set(key, [...(byMonth.get(key) ?? []), d]);
      }
      const months = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, days]) => ({ month, ...summarize(days) }));

      const thisMonth = summarize(thisMonthDays);
      const pacedTarget = targetCents > 0 ? Math.round(targetCents * (dayOfMonth / daysInMonth)) : 0;

      return {
        today: all.find(d => d.date === today) ?? null,
        thisMonth,
        months,
        thisMonthDays,
        monthElapsed: dayOfMonth / daysInMonth,
        targetCents,
        pacedTargetCents: pacedTarget,
        visible,
      };
    },
  });
}
