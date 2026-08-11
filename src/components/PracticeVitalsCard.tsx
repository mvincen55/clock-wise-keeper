import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCents } from '@/lib/money';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { cn } from '@/lib/utils';
import PracticePulseOrb from '@/components/PracticePulseOrb';


/** Production gauge, schedule disruption at a glance, and where both are trending. */
export default function PracticeVitalsCard() {
  const { data, isLoading } = usePracticeVitals();
  if (isLoading || !data) return null;

  const { thisMonth, months, prevMonth, monthElapsed, targets, pacedTargets, visibility } = data;
  const targetCents = targets.collectionsCents;
  const pacedTargetCents = pacedTargets.collectionsCents;
  const visible = visibility.collections;

  // Collections are paced against the org-configured collections goal, and
  // ONLY that goal — production has its own optional target and is never
  // compared to the collections goal.
  const delta =
    targetCents > 0 && pacedTargetCents > 0 && visible
      ? Math.round(((thisMonth.collectedCents - pacedTargetCents) / pacedTargetCents) * 100)
      : null;
  const ahead = (delta ?? 0) >= 0;

  const gaugeMax = Math.max(thisMonth.productionCents, targetCents, 1);
  const producedPct = (thisMonth.productionCents / gaugeMax) * 100;
  const collectedPct = visible ? (thisMonth.collectedCents / gaugeMax) * 100 : 0;

  const pairs = [
    { label: 'Hygiene', cancels: thisMonth.hygieneCancellations, noShows: thisMonth.hygieneNoShows },
    { label: 'Doctor', cancels: thisMonth.doctorCancellations, noShows: thisMonth.doctorNoShows },
  ];
  const pairMax = Math.max(...pairs.flatMap(p => [p.cancels, p.noShows]), 1);
  const trendMonths = months.slice(-6);
  const trendMax = Math.max(...trendMonths.map(m => m.productionCents), 1);
  const disruptMax = Math.max(...trendMonths.map(m => m.disruptions), 1);

  // The orb's pace is prior-month production × month elapsed — exactly what
  // its receipts declare. It is never the collections goal in disguise.
  const pulseInput = {
    productionCents: thisMonth.productionCents,
    pacedTargetCents: prevMonth ? Math.round(prevMonth.productionCents * monthElapsed) : 0,
    disruptions: thisMonth.disruptions,
    disruptionBaseline: prevMonth ? prevMonth.disruptions * monthElapsed : 0,
    month: new Date().toISOString().slice(0, 7),
    comparisonMonth: prevMonth?.month ?? '—',
    rowsThisMonth: thisMonth.days,
    rowsComparisonMonth: prevMonth?.days ?? 0,
    monthElapsed,
    comparisonProductionCents: prevMonth?.productionCents ?? 0,
    hygieneCancellations: thisMonth.hygieneCancellations,
    hygieneNoShows: thisMonth.hygieneNoShows,
    doctorCancellations: thisMonth.doctorCancellations,
    doctorNoShows: thisMonth.doctorNoShows,
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Practice vitals
          </span>
          <PracticePulseOrb input={pulseInput} />
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Production vs collections, month to date */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Production month to date</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatCents(thisMonth.productionCents)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${producedPct}%` }} />
          </div>
          <div className="flex items-baseline justify-between text-sm text-muted-foreground">
            <span>Collected {visible ? '' : '(hidden for non-owners)'}</span>
            <span className="tabular-nums">{visible ? formatCents(thisMonth.collectedCents) : '—'}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/40"
              style={{ width: `${collectedPct}%` }}
            />
          </div>
          {delta !== null && (
            <p
              className={cn(
                'flex items-center gap-1.5 text-sm',
                ahead ? 'text-primary' : 'text-amber-600'
              )}
            >
              {ahead ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              Collections tracking {Math.abs(delta)}% {ahead ? 'ahead of' : 'behind'} the monthly goal pace
            </p>
          )}
        </div>

        {/* Schedule disruption — paired bars, read the pattern in a glance */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Schedule disruption this month</p>
          <div className="space-y-2">
            {pairs.map(p => (
              <div key={p.label} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
                <span className="text-xs text-muted-foreground">{p.label}</span>
                <div className="space-y-1">
                  {[
                    { tag: 'cancels', n: p.cancels, tone: 'bg-primary/70' },
                    { tag: 'no-shows', n: p.noShows, tone: 'bg-amber-500/80' },
                  ].map(bar => (
                    <div key={bar.tag} className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', bar.tone)}
                          style={{ width: `${(bar.n / pairMax) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 text-xs tabular-nums text-muted-foreground">
                        {bar.n} {bar.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Six-month trends */}
        {trendMonths.length > 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: 'Production', max: trendMax, pick: (m: (typeof trendMonths)[number]) => m.productionCents, tone: 'bg-primary' },
              { title: 'Disruptions', max: disruptMax, pick: (m: (typeof trendMonths)[number]) => m.disruptions, tone: 'bg-amber-500' },
            ].map(chart => (
              <div key={chart.title} className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{chart.title}, last 6 months</p>
                <div className="flex h-14 items-end gap-1.5">
                  {trendMonths.map(m => (
                    <div
                      key={m.month}
                      className="flex-1"
                      title={`${m.month}: ${
                        chart.title === 'Production' ? formatCents(chart.pick(m)) : chart.pick(m)
                      }`}
                    >
                      <div
                        className={cn('w-full rounded-t', chart.tone)}
                        style={{
                          height: `${Math.max((chart.pick(m) / chart.max) * 56, 2)}px`,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
