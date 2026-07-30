import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { getToday } from '@/lib/time-utils';
import { formatCents } from '@/lib/money';

/**
 * Practice Pulse — how the office is doing right now.
 *
 * Every signal is read from a system record. There is no score, no weighting
 * magic and no black box: the orb shows the worst live signal, and tapping it
 * lists exactly which signals produced that state.
 */

export type PulseLevel = 'healthy' | 'watch' | 'attention';

export type PulseSignal = {
  id: string;
  label: string;
  detail: string;
  level: PulseLevel;
};

export type PracticePulse = {
  level: PulseLevel;
  signals: PulseSignal[];
  /** Collections have met the monthly target — the seal moment. */
  targetMet: boolean;
  monthKey: string;
};

const RANK: Record<PulseLevel, number> = { healthy: 0, watch: 1, attention: 2 };

const LEVEL_COPY: Record<PulseLevel, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  attention: 'Needs attention',
};

export function pulseLabel(level: PulseLevel): string {
  return LEVEL_COPY[level];
}

export function usePracticePulse() {
  const { data: ctx } = useOrgContext();
  const { data: settings } = usePracticeSettings();
  const { data: vitals } = usePracticeVitals();
  const today = getToday();

  return useQuery({
    queryKey: ['practice-pulse', ctx?.org_id, today, settings?.monthlyCollectionsTargetCents, vitals?.thisMonth.collectedCents],
    enabled: !!ctx,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PracticePulse> => {
      const [attendanceRes, bypassRes, changeRes, ptoRes, corrRes, sharedItemsRes, completionsRes] =
        await Promise.all([
          supabase
            .from('attendance_day_status')
            .select('user_id, is_scheduled_day, office_closed, has_day_off, has_punches')
            .eq('entry_date', today),
          supabase
            .from('checklist_bypasses')
            .select('id', { count: 'exact', head: true })
            .eq('resolved', false),
          supabase
            .from('change_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('pto_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('correction_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('checklist_items')
            .select('id')
            .eq('org_id', ctx!.org_id)
            .eq('cadence', 'daily')
            .eq('per_person', false)
            .eq('is_active', true),
          supabase
            .from('checklist_completions')
            .select('item_id')
            .eq('org_id', ctx!.org_id)
            .eq('period_key', today),
        ]);

      const signals: PulseSignal[] = [];

      // 1. Missing shifts today
      const missing = (attendanceRes.data ?? []).filter(
        a => a.is_scheduled_day && !a.office_closed && !a.has_day_off && !a.has_punches
      ).length;
      signals.push({
        id: 'missing-shifts',
        label: 'Shifts covered today',
        detail: missing
          ? `${missing} scheduled ${missing === 1 ? 'person has' : 'people have'} not clocked in`
          : 'Everyone scheduled today is accounted for',
        level: missing > 0 ? 'attention' : 'healthy',
      });

      // 2. Unresolved checklist bypasses
      const bypasses = bypassRes.count ?? 0;
      signals.push({
        id: 'bypasses',
        label: 'Checklist bypasses',
        detail: bypasses
          ? `${bypasses} bypass${bypasses === 1 ? '' : 'es'} still waiting on a reason`
          : 'No bypasses waiting on a reason',
        level: bypasses === 0 ? 'healthy' : bypasses >= 3 ? 'attention' : 'watch',
      });

      // 3. Pending approvals
      const approvals = (changeRes.count ?? 0) + (ptoRes.count ?? 0) + (corrRes.count ?? 0);
      signals.push({
        id: 'approvals',
        label: 'Pending approvals',
        detail: approvals
          ? `${approvals} request${approvals === 1 ? '' : 's'} waiting on a decision`
          : 'Nothing waiting on a decision',
        level: approvals === 0 ? 'healthy' : approvals >= 5 ? 'attention' : 'watch',
      });

      // 4. Collections pace against the month elapsed
      const target = settings?.monthlyCollectionsTargetCents ?? null;
      const collected = vitals?.thisMonth.collectedCents ?? 0;
      const elapsed = vitals?.monthElapsed ?? 0;
      let targetMet = false;
      if (target && target > 0 && vitals) {
        const expected = target * elapsed;
        const ratio = expected > 0 ? collected / expected : 1;
        targetMet = collected >= target;
        signals.push({
          id: 'collections',
          label: 'Collections pace',
          detail: `${formatCents(collected)} collected against ${formatCents(
            Math.round(expected)
          )} expected by today (${Math.round(elapsed * 100)}% of the month)`,
          level: targetMet || ratio >= 0.95 ? 'healthy' : ratio >= 0.8 ? 'watch' : 'attention',
        });
      }

      // 5. Shared checklist completion today
      const sharedItems = sharedItemsRes.data ?? [];
      if (sharedItems.length > 0) {
        const sharedIds = new Set(sharedItems.map(i => i.id));
        const doneShared = new Set(
          (completionsRes.data ?? []).map(c => c.item_id).filter(id => sharedIds.has(id))
        ).size;
        const remaining = sharedItems.length - doneShared;
        signals.push({
          id: 'shared-checklist',
          label: 'Shared checklist',
          detail: remaining
            ? `${doneShared} of ${sharedItems.length} office items done — ${remaining} still open`
            : `All ${sharedItems.length} office items done today`,
          level: remaining === 0 ? 'healthy' : 'watch',
        });
      }

      // 6. Schedule disruption spike today (cancels + no-shows from the deposit log)
      if (vitals?.today) {
        const t = vitals.today;
        const todayDisruptions =
          t.hygieneCancellations + t.hygieneNoShows + t.doctorCancellations + t.doctorNoShows;
        const days = vitals.thisMonth.days || 1;
        const avg = vitals.thisMonth.disruptions / days;
        const spike = avg > 0 ? todayDisruptions / avg : todayDisruptions > 0 ? 2 : 0;
        signals.push({
          id: 'disruptions',
          label: 'Schedule disruption today',
          detail: todayDisruptions
            ? `${todayDisruptions} cancel${todayDisruptions === 1 ? '' : 's'}/no-show${
                todayDisruptions === 1 ? '' : 's'
              } logged — the month averages ${avg.toFixed(1)} a day`
            : 'No cancels or no-shows logged today',
          level:
            todayDisruptions >= 6 && spike >= 2
              ? 'attention'
              : todayDisruptions >= 3 && spike >= 1.5
                ? 'watch'
                : 'healthy',
        });
      }

      const level = signals.reduce<PulseLevel>(
        (worst, s) => (RANK[s.level] > RANK[worst] ? s.level : worst),
        'healthy'
      );

      return { level, signals, targetMet, monthKey: today.slice(0, 7) };
    },
  });
}
