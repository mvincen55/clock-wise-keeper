import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Lock, Stamp, Target } from 'lucide-react';
import { toast } from 'sonner';
import { formatCents } from '@/lib/money';
import { getToday, shiftDate } from '@/lib/time-utils';
import { useSealDay, type DepositLog } from '@/hooks/useDepositLog';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useCreateSprint } from '@/hooks/useTeamGoals';
import { goalProgress } from '@/lib/schedule-reader/metrics-referee';
import type { Tables } from '@/integrations/supabase/types';
import type { StaffingForm } from '@/components/close-day/StaffingRealityCard';

const ASSESSMENT_LABELS: Record<string, string> = {
  extra_coverage: 'More coverage than needed',
  about_right: 'About right',
  stretched: 'Stretched',
  understaffed: 'Understaffed',
  unsafe: 'Unsafe or unsustainable',
};

const WORKLOAD_SEVERITY: Record<string, number> = {
  light: 0,
  steady: 1,
  full: 2,
  compressed: 3,
  overloaded: 4,
};

function fmtMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
}

type Props = {
  log: DepositLog | null;
  date: string;
  collectionsCents: number;
  staffing: StaffingForm;
  metrics: Tables<'provider_day_metrics'>[];
  dirty: boolean;
};

/**
 * Step 5 — Seal the Day. A concise closeout summary, then the seal.
 * Same-day edits stay open; later edits need owner/manager permissions and
 * are audit-logged by the database trigger.
 */
export default function SealDayCard({ log, date, collectionsCents, staffing, metrics, dirty }: Props) {
  const { data: ctx } = useOrgContext();
  const seal = useSealDay();
  const createSprint = useCreateSprint();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const summary = useMemo(() => {
    const total = (field: (m: Tables<'provider_day_metrics'>) => number) =>
      metrics.reduce((sum, m) => sum + field(m), 0);
    const highestStrain = [...metrics].sort(
      (a, b) =>
        (WORKLOAD_SEVERITY[b.automated_workload_class ?? ''] ?? -1) -
          (WORKLOAD_SEVERITY[a.automated_workload_class ?? ''] ?? -1) ||
        b.true_open_minutes - a.true_open_minutes
    )[0];
    return {
      trueOpen: total(m => m.true_open_minutes),
      cancellationOpen: total(m => m.cancellation_open_minutes),
      noShowOpen: total(m => m.no_show_open_minutes),
      intentional: total(m => m.intentional_unavailable_minutes),
      lowConfidence: metrics.filter(m => m.review_status === 'needs_review'),
      highestStrain,
    };
  }, [metrics]);

  // A grounded, measurable goal offer: only when today actually lost minutes
  // to no-shows/cancellations, and always validated by the referee before it
  // can be created. Serving patients better — not squeezing the team harder.
  const goalOffer = useMemo(() => {
    const baseline = summary.cancellationOpen + summary.noShowOpen;
    if (baseline < 60) return null;
    const target = Math.floor(baseline / 2);
    const spec = { direction: 'decrease' as const, baseline, target };
    const check = goalProgress(spec, baseline);
    if (!check.ok) return null;
    return { baseline, target };
  }, [summary]);

  const startGoal = async () => {
    if (!goalOffer) return;
    try {
      await createSprint.mutateAsync({
        title: 'Refill cancelled and no-show time',
        metric: `Minutes of cancellation/no-show open time per day (baseline ${goalOffer.baseline}m)`,
        target_count: goalOffer.target,
        period: 'month',
        starts_on: getToday(),
        ends_on: shiftDate(getToday(), 30),
        reward: '',
        scope: 'team',
        verification: 'manager_approval',
      });
      toast.success('Measurable goal created — it lives on the Goals page now.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the goal');
    }
  };

  const sealed = !!log?.sealed_at;
  // A current-day closeout answers both new-patient questions before sealing —
  // an explicit 0 counts, blank does not. Older migrated records may stay
  // "not recorded" without being rewritten as zeros.
  const missingNewPatients =
    date >= getToday() &&
    (log?.new_patients_scheduled_count == null || log?.new_patients_seen_count == null);
  const canSeal = !!log && !dirty && !missingNewPatients;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Stamp className="h-4 w-4 text-primary" />
          Seal the day
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Collections</span>
            <span>{formatCents(collectionsCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Production</span>
            <span>{log?.production_cents != null ? formatCents(log.production_cents) : '—'}</span>
          </div>
          {/* Two separate numbers on purpose: seen advances the goal;
              scheduled is only the pipeline. Never combined into one total. */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">New patients seen</span>
            <span>
              {log?.new_patients_seen_count != null ? log.new_patients_seen_count : 'Not recorded'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">New patients scheduled (pipeline)</span>
            <span>
              {log?.new_patients_scheduled_count != null
                ? log.new_patients_scheduled_count
                : 'Not recorded'}
            </span>
          </div>
          {metrics.length > 0 ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total true open time</span>
                <span>{fmtMin(summary.trueOpen)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">— from cancellations</span>
                <span>{fmtMin(summary.cancellationOpen)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">— from no-shows</span>
                <span>{fmtMin(summary.noShowOpen)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Intentional blocked time</span>
                <span>{fmtMin(summary.intentional)}</span>
              </div>
              {summary.highestStrain && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Highest strain</span>
                  <span>
                    {summary.highestStrain.provider_label}
                    {summary.highestStrain.automated_workload_class
                      ? ` (${summary.highestStrain.automated_workload_class})`
                      : ''}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No schedule capture today — money and vitals still seal fine.
            </p>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Staffing (your read)</span>
            <span>{staffing.assessment ? ASSESSMENT_LABELS[staffing.assessment] : 'Not answered'}</span>
          </div>
        </div>

        {summary.lowConfidence.length > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
            Low-confidence metrics for{' '}
            {summary.lowConfidence.map(m => m.provider_label).join(', ')} — flagged for manager
            review.
          </p>
        )}
        {log?.needs_manager_review && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            Items need manager review
          </Badge>
        )}

        {isManager && goalOffer && !sealed && (
          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4 text-primary" />
              Make it a measurable goal?
            </p>
            <p className="text-xs text-muted-foreground">
              Today lost {fmtMin(goalOffer.baseline)} to cancellations and no-shows. A concrete
              team goal: keep that under {fmtMin(goalOffer.target)} a day this month — by
              refilling openings and tightening confirmations, never by overbooking or cutting
              breaks.
            </p>
            <Button size="sm" variant="outline" onClick={startGoal} disabled={createSprint.isPending}>
              {createSprint.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Create the goal
            </Button>
          </div>
        )}

        {sealed ? (
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-success" />
              Day sealed{log?.sealed_at ? ` · ${new Date(log.sealed_at).toLocaleTimeString()}` : ''}
            </p>
            {(date >= getToday() || isManager) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  log &&
                  seal.mutate(
                    { closeoutId: log.id, depositDate: date, seal: false },
                    { onError: e => toast.error(e.message) }
                  )
                }
              >
                Unseal
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Button
              className="w-full"
              disabled={!canSeal || seal.isPending}
              onClick={() =>
                log &&
                seal.mutate(
                  { closeoutId: log.id, depositDate: date, seal: true },
                  {
                    onSuccess: () => toast.success('Day sealed'),
                    onError: e => toast.error(e.message),
                  }
                )
              }
            >
              {seal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Stamp className="mr-2 h-4 w-4" />
              Seal the day
            </Button>
            <p className="text-xs text-muted-foreground">
              {dirty
                ? 'Save your changes first — the seal covers what is on file.'
                : missingNewPatients
                  ? 'Answer both new-patient questions in Practice Vitals (0 is a real answer), then save, before sealing today.'
                  : 'Same-day edits stay open after sealing. Later edits need an owner or manager and are always audit-logged.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
