import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCents } from '@/lib/money';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { cn } from '@/lib/utils';

/** Production gauge, schedule disruption at a glance, and where both are trending. */
export default function PracticeVitalsCard() {
  const { data, isLoading } = usePracticeVitals();
  if (isLoading || !data) return null;

  const { thisMonth, lastMonth, months, monthElapsed } = data;

  // Pace against last month's same slice of the month, not the whole month.
  const lastMonthPaced = Math.round(lastMonth.productionCents * monthElapsed);
  const delta =
    lastMonthPaced > 0
      ? Math.round(((thisMonth.productionCents - lastMonthPaced) / lastMonthPaced) * 100)
      : null;
  const ahead = (delta ?? 0) >= 0;

  const gaugeMax = Math.max(thisMonth.productionCents, lastMonth.productionCents, 1);
  const producedPct = (thisMonth.productionCents / gaugeMax) * 100;
  const collectedPct = (thisMonth.collectedCents / gaugeMax) * 100;

  const pairs = [
    { label: 'Hygiene', cancels: thisMonth.hygieneCancellations, noShows: thisMonth.hygieneNoShows },
    { label: 'Doctor', cancels: thisMonth.doctorCancellations, noShows: thisMonth.doctorNoShows },
  ];
  const pairMax = Math.max(...pairs.flatMap(p => [p.cancels, p.noShows]), 1);
  const trendMonths = months.slice(-6);
  const trendMax = Math.max(...trendMonths.map(m => m.productionCents), 1);
  const disruptMax = Math.max(...trendMonths.map(m => m.disruptions), 1);

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-4 w-4 text-primary" />
          Practice vitals
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
            <span>Collected</span>
            <span className="tabular-nums">{formatCents(thisMonth.collectedCents)}</span>
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
              Production tracking {Math.abs(delta)}% {ahead ? 'ahead of' : 'behind'} last month
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
