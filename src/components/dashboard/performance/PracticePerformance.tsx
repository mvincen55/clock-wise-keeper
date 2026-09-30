import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChartNoAxesCombined, CircleCheck, UserRoundPlus, Wallet } from 'lucide-react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { buildDashboardPerformance, dashboardDate, type DashboardMetric, type DashboardPeriod, type MetricOverview } from '@/lib/dashboard-performance';
import type { Period, SeriesSource } from '@/lib/performance-series';
import { money } from '@/lib/owner-pulse';
import { cn } from '@/lib/utils';
import type { PerformanceData, PerformanceState } from '../types';
import { ActionLink, Chip, LoadingLines, Panel, focusRing, panelClass } from '../kit';
import { AXIS_TEXT, GRID_STROKE, compactDollars, useMeasuredWidth } from './chart-theme';
import { GOAL_SETUP_HREF } from './GoalMeters';

const colors = ['var(--home-year-current)', 'var(--home-year-prior)', 'var(--home-year-older)'];
const percent = (fraction: number) => `${fraction > 0 ? '+' : ''}${(fraction * 100).toFixed(1)}%`;
const signedMoney = (cents: number) => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${money(Math.abs(cents))}`;
const amount = (cents: number | null) => cents === null ? 'Not recorded' : money(cents);
const segmentButton = 'min-h-10 rounded-md px-3 text-[13px] font-medium sm:min-h-9';

function MetricCard({ metric }: { metric: MetricOverview }) {
  const [current, prior] = metric.years;
  const pct = current.cents !== null && metric.targetCents > 0 ? current.cents / metric.targetCents * 100 : null;
  const Icon = metric.metric === 'collections' ? Wallet : ChartNoAxesCombined;
  return (
    <section aria-label={metric.label} className={cn(panelClass, 'min-w-0 p-4')}>
      <div className="flex items-center justify-between gap-2 text-muted-foreground"><h3 className="text-[13px] font-medium">{metric.label}</h3><Icon className="h-4 w-4" strokeWidth={1.7} aria-hidden /></div>
      <p data-performance-total className="mt-1.5 text-[clamp(1.55rem,2.5vw,1.85rem)] font-semibold leading-tight tabular-nums tracking-tight">{amount(current.cents)}</p>
      <p className="mt-1.5 text-xs leading-relaxed">
        {metric.deltaCents !== null ? <><strong className={metric.deltaCents >= 0 ? 'text-success' : 'text-home-warning'}>{signedMoney(metric.deltaCents)}{metric.deltaFraction !== null && ` (${percent(metric.deltaFraction)})`}</strong><span className="text-muted-foreground"> vs. {prior.year}</span></>
          : <span className="text-muted-foreground">{current.cents === null ? 'Add records to see progress' : !current.complete ? current.coverage : 'Prior-year comparison unavailable'}</span>}
      </p>
      {metric.targetCents > 0 ? (
        <div className="mt-3">
          {pct !== null && <div className="relative h-1.5 rounded-full bg-muted" role="meter" aria-label={`${metric.label} goal progress`} aria-valuemin={0} aria-valuemax={Math.max(100, Math.round(pct))} aria-valuenow={Math.round(pct)} aria-valuetext={`${Math.round(pct)}% of goal`}>
            <div className="h-full rounded-full bg-[var(--home-year-current)]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>}
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span>{metric.targetLabel} · {money(metric.targetCents)}</span>{pct !== null && <span>{pct.toFixed(1)}%</span>}
          </div>
        </div>
      ) : <div className="mt-3"><p className="text-xs text-muted-foreground">No goal set</p><ActionLink to={GOAL_SETUP_HREF} variant="text" size="sm">Set a {metric.label.toLowerCase()} goal</ActionLink></div>}
      <div className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
        {current.averageCents !== null ? <><p><strong className="font-semibold text-foreground">{money(current.averageCents)}</strong> / office day</p><p>{prior.averageCents !== null ? `${money(prior.averageCents)} at the same point in ${prior.year}` : `Daily average unavailable for ${prior.year}`}</p></> : <p>{current.coverage}</p>}
        {metric.expectedCents !== null && current.cents !== null && <p className="sr-only">{current.cents >= metric.targetCents ? 'Goal reached' : current.cents < metric.expectedCents ? 'Below expected pace' : 'On pace'} · expected by now {money(metric.expectedCents)}</p>}
      </div>
    </section>
  );
}

function YearComparison({ metric }: { metric: MetricOverview }) {
  const maximum = Math.max(1, ...metric.years.map(y => y.cents ?? 0));
  return (
    <Panel title="Across the years" description="Same dates in each year" className="h-full">
      <div className="divide-y divide-border">
        {metric.years.map((year, i) => (
          <div key={year.year} className="py-4 first:pt-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{year.year}{i === 0 ? ' · Current' : ''}</span><strong className="font-semibold tabular-nums">{amount(year.cents)}</strong>
            </div>
            {year.cents !== null && <div className="mt-2 h-1.5 rounded-full bg-muted" aria-hidden><div className="h-full rounded-full" style={{ background: colors[i], width: `${Math.max(0, year.cents / maximum * 100)}%` }} /></div>}
            <p className="mt-2 text-xs text-muted-foreground">{year.averageCents !== null ? `${money(year.averageCents)} / office day · ${year.officeDays} days` : year.coverage}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{dashboardDate(year.start)} to {dashboardDate(year.end)}{year.sourceDates ? ' · Source dates' : ''}</p>
          </div>
        ))}
      </div>
      {metric.dailyDeltaFraction !== null && <p className="mt-2 border-t border-border pt-3 text-xs font-medium">{percent(metric.dailyDeltaFraction)} per office day vs. last year</p>}
    </Panel>
  );
}

function HistoryChart({ metric, kind, width }: { metric: MetricOverview; kind: DashboardPeriod; width?: number }) {
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>();
  const rows = metric.years[0].points.map((point, index) => {
    const row: Record<string, string | number | null> = { label: dashboardDate(point.date, kind === 'year'), goal: metric.goalPoints[index]?.cents ?? null };
    for (const year of metric.years) {
      // Match calendar dates so leap years do not move March's comparison.
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
          <LineChart width={width ?? measured} height={220} data={rows} margin={{ top: 18, right: 10, bottom: 0, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} minTickGap={25} />
            <YAxis tickFormatter={compactDollars} tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} width={54} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as typeof rows[number];
              return <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-md">
                {metric.years.map(year => <p key={year.year} className="py-0.5">
                  <span className="font-semibold">{year.year} · {row[`date${year.year}`] ? dashboardDate(String(row[`date${year.year}`])) : row.label}</span>: {amount(row[year.year] as number | null)}
                  {row[`coverage${year.year}`] === 'Partial records' && <span className="ml-1 text-muted-foreground">(partial)</span>}
                </p>)}
                {row.goal !== null && <p className="mt-1 border-t border-border pt-1">{kind === 'year' ? 'Monthly goal' : 'Goal pace'}: {amount(row.goal as number)}</p>}
              </div>;
            }} />
            {metric.goalPoints.length > 0 && <Line dataKey="goal" name={kind === 'year' ? 'Monthly goal' : 'Goal pace'} type="linear" stroke={AXIS_TEXT} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />}
            {metric.years.map((year, i) => <Line key={year.year} dataKey={String(year.year)} name={String(year.year)} type="linear" stroke={colors[i]} strokeWidth={i === 0 ? 2.8 : 2} strokeDasharray={i === 2 ? '3 3' : undefined} dot={{ r: kind === 'year' ? 3 : 1.5, strokeWidth: 0, fill: colors[i] }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />)}
          </LineChart>
        </div>
      ) : <p className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">No comparable history recorded for these dates yet.</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground" aria-label="Chart legend">
        {metric.years.map((y, i) => <span key={y.year} className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: colors[i] }} />{y.year}</span>)}
        {hasValues && metric.goalPoints.length > 0 && <span className="flex items-center gap-1.5"><span aria-hidden className="w-3 border-t border-dashed border-muted-foreground" />{kind === 'year' ? 'Monthly goal' : 'Goal pace'}</span>}
      </div>
      <details className="mt-2 text-[11px] text-muted-foreground">
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

function Outlook({ metric, kind }: { metric: MetricOverview; kind: DashboardPeriod }) {
  if (metric.projectedCents === null) return null;
  const gap = metric.projectedCents - metric.targetCents;
  const remaining = Math.max(0, metric.targetCents - (metric.years[0].cents ?? 0));
  return <div className="mt-3 border-t border-border pt-3">
    <div className="grid gap-4 sm:grid-cols-2">
      <div><p className="text-xs text-muted-foreground">Projected {kind === 'year' ? 'year' : 'month'} finish</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(metric.projectedCents)}</p><p className={cn('mt-1 text-xs', gap >= 0 ? 'text-success' : 'text-home-warning')}>{money(Math.abs(gap))} {gap >= 0 ? 'above' : 'below'} goal</p></div>
      <div><p className="text-xs text-muted-foreground">{remaining === 0 ? 'Goal reached' : 'Needed / remaining office day'}</p><p className="mt-1 text-xl font-semibold tabular-nums">{remaining === 0 ? money((metric.years[0].cents ?? 0) - metric.targetCents) : metric.neededPerDayCents === null ? 'No office days left' : money(metric.neededPerDayCents)}</p><p className="mt-1 text-xs text-muted-foreground">{remaining === 0 ? 'above goal' : `${metric.remainingDays} office ${metric.remainingDays === 1 ? 'day' : 'days'} left · ${money(remaining)} to go`}</p></div>
    </div>
    <p className="mt-3 text-[11px] text-muted-foreground">Projection uses the average per completed office day.</p>
  </div>;
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
  const patients = model?.newPatients;
  const currentYear = Number(data?.today.slice(0, 4));
  const monthLabel = data ? new Date(`${data.today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'This month';
  const complete = model && model.metrics.length > 0 && model.metrics.every(m => m.years[0].complete) && (!patients || patients.complete);
  const paceGap = metric?.expectedCents !== null && metric?.expectedCents !== undefined && metric.years[0].cents !== null ? metric.years[0].cents - metric.expectedCents : null;
  const chart = model && metric ? (
    <Panel title={`${metric.label} over time`} description={kind === 'year' ? 'Monthly totals · same dates across three years' : 'Running monthly total · same dates across three years'}>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="Chart metric">
          {model.metrics.map(m => <button key={m.metric} type="button" data-home-control="chart-metric" aria-pressed={metric.metric === m.metric} onClick={() => setSelected(m.metric)} className={cn(segmentButton, '!min-h-8 !px-2.5 !text-xs', focusRing, metric.metric === m.metric ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{m.label}</button>)}
        </div>
        {paceGap !== null && <Chip tone={paceGap >= 0 ? 'steady' : 'attention'}>{money(Math.abs(paceGap))} {paceGap >= 0 ? 'ahead of' : 'behind'} pace</Chip>}
      </div>
      <HistoryChart metric={metric} kind={kind} width={chartWidth} />
      <Outlook metric={metric} kind={kind} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        {model.availableSources.length > 1 ? <label>Source <select aria-label="Financial data source" value={model.source} onChange={e => setSource(e.target.value as SeriesSource)} className={cn('ml-1 min-h-8 rounded-md border border-border bg-card px-2 text-foreground', focusRing)}><option value="closeouts">Closeouts</option><option value="report_history">Imported reports</option></select></label>
          : <span>{model.source === 'closeouts' ? 'Closeouts' : 'Imported reports'}</span>}
        <span>{metric.years[0].officeDays !== null ? `${metric.years[0].officeDays} office days in this period` : 'Office calendar unavailable'}</span>
      <details className="text-[11px] text-muted-foreground"><summary className={cn('w-fit cursor-pointer rounded py-1', focusRing)}>About this comparison</summary><p className="mt-1 max-w-prose leading-relaxed">Totals stop at the same calendar date in each year. Daily averages use the configured office calendar. Missing records are left blank; growth and projections require complete records. Monthly imports appear only as known monthly totals. The dashed line shows the configured goal, not recorded activity. {kind === 'year' && 'The annualized target is the current monthly goal multiplied by 12, not a separately configured annual goal. '}Projections assume the recorded daily average continues.</p>{metric.years.some(y => y.sourceDates) && <p className="mt-1">Some imported dates are source dates rather than confirmed entry dates. Growth requires confirmed entry dates.</p>}</details>
      </div>
    </Panel>
  ) : <Panel title="Practice performance">{state === 'loading' ? <LoadingLines label="Reading performance…" /> : <p className="py-5 text-sm text-muted-foreground">{state === 'error' ? 'Performance could not be read. Refresh to try again.' : 'No financial metrics are available yet.'}</p>}</Panel>;
  return (
    <section aria-label="Practice performance" className="space-y-4">
      <h2 className="sr-only">How we’re doing</h2>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-performance-toolbar>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="Performance period">
            {(['month', 'year'] as const).map(value => <button key={value} type="button" data-home-control="performance-period" aria-pressed={kind === value} onClick={() => setKind(value)} className={cn(segmentButton, focusRing, kind === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{value === 'month' ? 'This month' : 'Year to date'}</button>)}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">{kind === 'month' ? monthLabel : model?.period.rangeLabel ?? 'Year to date'}</p>
        </div>
        {model && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{complete && <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden />}Through {dashboardDate(model.cutoff)} · {complete ? 'Records complete' : model.period.end < model.period.start ? 'No completed days yet' : 'Partial records'}</p>}
      </div>
      {state === 'loading' ? <LoadingLines label="Reading performance…" /> : state === 'error' ? <p role="status" className="text-sm text-muted-foreground">Some performance records could not be read. Comparisons may be unavailable.</p> : null}
      {model && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{model.metrics.map(m => <MetricCard key={m.metric} metric={m} />)}{patients && <section aria-label="New patients seen" className={cn(panelClass, 'min-w-0 p-4')}>
        <div className="flex items-center justify-between gap-2 text-muted-foreground"><h3 className="text-[13px] font-medium">New patients seen</h3><UserRoundPlus className="h-4 w-4" strokeWidth={1.7} aria-hidden /></div>
        <p data-performance-total className="mt-1.5 text-[clamp(1.55rem,2.5vw,1.85rem)] font-semibold leading-tight tabular-nums tracking-tight">{patients.value ?? 'Not recorded'}</p>
        <p className="mt-1.5 text-xs leading-relaxed">{patients.delta !== null ? <><strong className={patients.delta >= 0 ? 'text-success' : 'text-home-warning'}>{patients.delta > 0 ? '+' : ''}{patients.delta}{patients.prior ? ` (${percent(patients.delta / patients.prior)})` : ''}</strong><span className="text-muted-foreground"> vs. {currentYear - 1}</span></> : <span className="text-muted-foreground">{patients.value !== null && !patients.complete ? 'Partial records' : 'Prior-year comparison unavailable'}</span>}</p>
        <div className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
          <p>{patients.prior !== null ? <><strong className="text-foreground">{patients.prior}</strong> at the same point in {currentYear - 1}{!patients.priorComplete && ' · partial'}</> : `No records for ${currentYear - 1}`}</p><p>Completed first visits</p>
          {patients.older !== null && <p className="mt-2 text-[11px]">{currentYear - 2}: {patients.older} first visits at the same point{!patients.olderComplete && ' · partial'}.</p>}
        </div>
      </section>}</div>}
      <div className="grid grid-cols-1 gap-4 min-[1100px]:grid-cols-[minmax(0,1.85fr)_minmax(17rem,1fr)]">{chart}<div className="min-w-0 [&>section]:h-full">{aside ?? (metric && <YearComparison metric={metric} />)}</div></div>
    </section>
  );
}
