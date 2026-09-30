import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { buildDashboardPerformance, dashboardDate, type DashboardMetric, type DashboardPeriod, type MetricOverview } from '@/lib/dashboard-performance';
import type { Period, SeriesSource } from '@/lib/performance-series';
import { money } from '@/lib/owner-pulse';
import { cn } from '@/lib/utils';
import type { PerformanceData, PerformanceState } from '../types';
import { ActionLink, LoadingLines, Panel, focusRing, panelClass } from '../kit';
import { AXIS_TEXT, GRID_STROKE, compactDollars, useMeasuredWidth } from './chart-theme';
import { GOAL_SETUP_HREF } from './GoalMeters';

const colors = ['hsl(var(--primary))', 'var(--pe-chart-2)', 'var(--pe-chart-3)'];
const percent = (fraction: number) => `${fraction > 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`;
const amount = (cents: number | null) => cents === null ? 'Not recorded' : money(cents);

function MetricCard({ metric }: { metric: MetricOverview }) {
  const current = metric.years[0];
  const pct = current.cents !== null && metric.targetCents > 0 ? current.cents / metric.targetCents * 100 : null;
  return (
    <section aria-label={metric.label} className={cn(panelClass, 'min-w-0 px-5 py-4')}>
      <h3 className="text-sm font-semibold text-muted-foreground">{metric.label}</h3>
      <p className="mt-2 font-display text-[clamp(1.4rem,2.6vw,2rem)] font-bold leading-tight tabular-nums tracking-tight">{amount(current.cents)}</p>
      <p className={cn('mt-1 text-sm', metric.deltaCents !== null && metric.deltaCents >= 0 ? 'text-success' : 'text-muted-foreground')}>
        {metric.deltaFraction !== null ? `${percent(metric.deltaFraction)} vs. ${metric.years[1].year}`
          : metric.deltaCents !== null ? `${metric.deltaCents > 0 ? '+' : ''}${money(metric.deltaCents)} vs. ${metric.years[1].year}`
            : current.cents === null ? 'Add records to see progress' : !current.complete ? current.coverage : 'Prior-year comparison unavailable'}
      </p>
      {metric.targetCents > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{metric.targetLabel} · {money(metric.targetCents)}</span>
            {pct !== null && <span className="font-semibold text-foreground">{Math.round(pct)}%</span>}
          </div>
          {pct !== null && <div className="relative mt-2 h-2 rounded-full bg-muted" role="meter" aria-label={`${metric.label} goal progress`} aria-valuemin={0} aria-valuemax={Math.max(100, Math.round(pct))} aria-valuenow={Math.round(pct)} aria-valuetext={`${Math.round(pct)}% of goal`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            {metric.expectedCents !== null && <span className="absolute -top-1 h-4 w-0.5 bg-foreground/50" style={{ left: `${Math.min(100, metric.expectedCents / metric.targetCents * 100)}%` }} title="Expected by now, based on office days" />}
          </div>}
          <p className="mt-2 text-xs text-muted-foreground">{current.averageCents !== null ? `${money(current.averageCents)} average per office day` : current.coverage}</p>
          {metric.expectedCents !== null && current.cents !== null && <p className="mt-1 text-xs font-medium">{current.cents >= metric.targetCents ? 'Goal reached' : current.cents < metric.expectedCents ? 'Below expected pace' : 'On pace'} · expected by now {money(metric.expectedCents)}</p>}
        </div>
      ) : <div className="mt-3"><p className="text-xs text-muted-foreground">No goal set{current.averageCents !== null ? ` · ${money(current.averageCents)} per office day` : ''}</p><ActionLink to={GOAL_SETUP_HREF} variant="text" size="sm">Set a {metric.label.toLowerCase()} goal</ActionLink></div>}
    </section>
  );
}

function YearComparison({ metric }: { metric: MetricOverview }) {
  return (
    <Panel title="Compared with prior years" description="Same dates in each year">
      <div className="divide-y divide-border">
        {metric.years.map((year, i) => (
          <div key={year.year} className="py-3 first:pt-1">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colors[i] }} />{year.year}</span>
              <span className="font-semibold tabular-nums">{amount(year.cents)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{dashboardDate(year.start)} to {dashboardDate(year.end)} · {year.coverage}</p>
            {year.averageCents !== null && <p className="mt-1 text-sm text-muted-foreground">{money(year.averageCents)} per office day · {year.officeDays} days</p>}
          </div>
        ))}
      </div>
      {metric.dailyDeltaFraction !== null && <p className="mt-2 border-t border-border pt-3 text-sm font-medium">{percent(metric.dailyDeltaFraction)} per office day vs. last year</p>}
    </Panel>
  );
}

function HistoryChart({ metric, kind, width }: { metric: MetricOverview; kind: DashboardPeriod; width?: number }) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>();
  const rows = metric.years[0].points.map((point, index) => {
    const row: Record<string, string | number | null> = { label: dashboardDate(point.date, kind === 'year') };
    for (const year of metric.years) {
      // Matching by month/day keeps March aligned even across leap years.
      const p = kind === 'year' ? year.points[index] : year.points.find(p => p.date.slice(5) === point.date.slice(5));
      row[String(year.year)] = p?.cents ?? null;
      row[`date${year.year}`] = p?.date ?? null;
      row[`coverage${year.year}`] = p ? p.complete ? 'Complete' : 'Partial records' : 'Not recorded';
    }
    return row;
  });
  const hasValues = rows.some(row => metric.years.some(y => row[y.year] !== null));
  return (
    <div ref={ref} className="min-w-0">
      {hasValues ? (
        <div role="img" aria-label={`${metric.label}, ${kind === 'year' ? 'monthly totals' : 'running monthly total'}, comparing ${metric.years.map(y => y.year).join(', ')}. Exact values are in the chart data table.`}>
          <LineChart width={width ?? measured} height={245} data={rows} margin={{ top: 15, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} minTickGap={25} />
            <YAxis tickFormatter={compactDollars} tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} width={60} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as typeof rows[number];
              return <div className="rounded-lg border border-border bg-popover p-3 text-sm shadow-md">
                {metric.years.map(year => <p key={year.year} className="py-0.5">
                  <span className="font-semibold">{year.year} · {row[`date${year.year}`] ? dashboardDate(String(row[`date${year.year}`])) : row.label}</span>: {amount(row[year.year] as number | null)}
                  {row[`coverage${year.year}`] === 'Partial records' && <span className="ml-1 text-muted-foreground">(partial)</span>}
                </p>)}
              </div>;
            }} />
            {metric.years.map((year, i) => <Line key={year.year} dataKey={String(year.year)} name={String(year.year)} type="linear" stroke={colors[i]} strokeWidth={i === 0 ? 3 : 2} strokeDasharray={i === 2 ? '5 4' : undefined} dot={{ r: kind === 'year' ? 3 : 2, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        </div>
      ) : <p className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">No comparable history recorded for these dates yet.</p>}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className={cn('w-fit cursor-pointer rounded py-1 font-medium', focusRing)}>View chart data</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left tabular-nums"><caption className="sr-only">{metric.label}: exact dates, amounts, and record coverage</caption><thead><tr><th className="p-2">Period</th>{metric.years.map(y => <th className="p-2" key={y.year}>{y.year}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.label} className="border-t border-border"><th className="p-2 font-medium">{row.label}</th>{metric.years.map(y => <td key={y.year} className="p-2">{amount(row[y.year] as number | null)}{row[`date${y.year}`] && <span className="block">{dashboardDate(String(row[`date${y.year}`]))}, {y.year} · {row[`coverage${y.year}`]}</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function PracticePerformance({ data, state, defaultPeriod = 'month', chartWidth, aside, onPeriodChange }: {
  data: PerformanceData | null; state: PerformanceState; defaultPeriod?: DashboardPeriod;
  chartWidth?: number; aside?: ReactNode; onPeriodChange?: (period: Period) => void;
}) {
  const [kind, setKind] = useState(defaultPeriod);
  const [source, setSource] = useState<SeriesSource | null>(null);
  const [selected, setSelected] = useState<DashboardMetric>('collections');
  const model = useMemo(() => data ? buildDashboardPerformance(data, kind, source) : null, [data, kind, source]);
  useEffect(() => { if (model) onPeriodChange?.(model.period); }, [model, onPeriodChange]);
  const metric = model?.metrics.find(m => m.metric === selected) ?? model?.metrics[0];
  const chart = model && metric ? (
    <Panel title={`${metric.label} over time`} description={kind === 'year' ? 'Monthly totals · same dates across three years' : 'Running monthly total · same dates across three years'} aside={
      <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="Chart metric">
        {model.metrics.map(m => <button key={m.metric} type="button" data-home-control="chart-metric" aria-pressed={metric.metric === m.metric} onClick={() => setSelected(m.metric)} className={cn('min-h-9 rounded-md px-3 text-xs font-semibold', focusRing, metric.metric === m.metric ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>{m.label}</button>)}
      </div>
    }>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex gap-4 text-xs">{metric.years.map((y, i) => <span key={y.year} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: colors[i] }} />{y.year}</span>)}</div>
        {model.availableSources.length > 1 ? <label className="text-xs text-muted-foreground">Source <select aria-label="Financial data source" value={model.source} onChange={e => setSource(e.target.value as SeriesSource)} className="ml-1 min-h-9 rounded-md border border-border bg-card px-2 text-foreground"><option value="closeouts">Closeouts</option><option value="report_history">Imported reports</option></select></label>
          : <span className="text-xs text-muted-foreground">{model.source === 'closeouts' ? 'Closeouts' : 'Imported reports'}</span>}
      </div>
      <HistoryChart metric={metric} kind={kind} width={chartWidth} />
      {metric.projectedCents !== null && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-sm"><p><span className="text-muted-foreground">Projected {kind === 'year' ? 'year' : 'month'} finish </span><strong>{money(metric.projectedCents)}</strong></p>{metric.neededPerDayCents !== null && <p><strong>{money(metric.neededPerDayCents)}</strong><span className="text-muted-foreground"> per remaining office day to reach target</span></p>}</div>}
      <details className="mt-3 text-xs text-muted-foreground"><summary className={cn('w-fit cursor-pointer rounded py-1', focusRing)}>About this comparison</summary><p className="mt-1 max-w-prose leading-relaxed">Totals stop at the same calendar date in each year. Daily averages use the configured office calendar. Missing records are left blank; growth and projections require complete records. Monthly imports appear only as known monthly totals. {kind === 'year' && 'The annualized target is the current monthly goal multiplied by 12, not a separately configured annual goal. '}Projections assume the recorded daily average continues.</p>{metric.years.some(y => y.sourceDates) && <p className="mt-1">Some imported dates are source dates rather than confirmed entry dates. Growth requires confirmed entry dates.</p>}</details>
    </Panel>
  ) : <Panel title="Practice performance">{state === 'loading' ? <LoadingLines label="Reading performance…" /> : <p className="py-5 text-sm text-muted-foreground">{state === 'error' ? 'Performance could not be read. Refresh to try again.' : 'No financial metrics are available yet.'}</p>}</Panel>;
  return (
    <section aria-label="Practice performance" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold">How we’re doing</h2><p className="mt-0.5 text-xs text-muted-foreground">{model?.period.rangeLabel ?? 'Office performance'}</p></div>
        <div className="flex rounded-xl border border-border bg-muted/60 p-1" role="group" aria-label="Performance period">
          {(['month', 'year'] as const).map(value => <button key={value} type="button" data-home-control="performance-period" aria-pressed={kind === value} onClick={() => setKind(value)} className={cn('min-h-10 rounded-lg px-4 text-sm font-semibold', focusRing, kind === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{value === 'month' ? 'This month' : 'Year to date'}</button>)}
        </div>
      </div>
      {state === 'loading' ? <LoadingLines label="Reading performance…" /> : state === 'error' ? <p role="status" className="text-sm text-muted-foreground">Some performance records could not be read. Comparisons may be unavailable.</p> : null}
      {model && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{model.metrics.map(m => <MetricCard key={m.metric} metric={m} />)}{model.newPatients && <section aria-label="New patients seen" className={cn(panelClass, 'px-5 py-4')}><h3 className="text-sm font-semibold text-muted-foreground">New patients seen</h3><p className="mt-2 font-display text-[clamp(1.4rem,2.6vw,2rem)] font-bold tabular-nums">{model.newPatients.value ?? 'Not recorded'}</p><p className="mt-1 text-sm text-muted-foreground">{model.newPatients.delta !== null ? `${model.newPatients.delta > 0 ? '+' : ''}${model.newPatients.delta} vs. ${Number(data?.today.slice(0, 4)) - 1}` : model.newPatients.value !== null && !model.newPatients.complete ? 'Partial records' : 'Prior-year comparison unavailable'}</p><ActionLink to="/deposit-log" size="sm" variant="text" className="mt-4">View closeouts</ActionLink></section>}</div>}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.48fr)]">{chart}<div className="min-w-0">{aside ?? (metric && <YearComparison metric={metric} />)}</div></div>
    </section>
  );
}
