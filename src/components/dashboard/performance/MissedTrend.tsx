import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { missedSeries, type MissedBucket, type MissedSeries } from '@/lib/missed-trend';
import type { PerformanceData } from '@/lib/home-performance';
import type { Period } from '@/lib/performance-series';
import { AXIS_TEXT, GRID_STROKE, SERIES_COLOR, useMeasuredWidth } from './chart-theme';

/**
 * Cancellations and no-shows over the selected period, stacked by kind or
 * split by department (doctor, hygiene, unassigned). Unrecorded buckets are
 * gaps, not zeros; the source and its definition are printed under the
 * chart; a click opens Missed appointments with the same range.
 */
export type MissedSplit = 'kind' | 'department';

export function missedHref(range: { start: string; end: string }): string {
  return `/management/missed-appointments?start=${range.start}&end=${range.end}`;
}

const KIND_SERIES = [
  { key: 'cancellations', label: 'Late cancellations', color: SERIES_COLOR.primary },
  { key: 'noShows', label: 'No-shows', color: SERIES_COLOR.secondary },
] as const;
const DEPT_SERIES = [
  { key: 'doctor', label: 'Doctor', color: SERIES_COLOR.primary },
  { key: 'hygiene', label: 'Hygiene', color: SERIES_COLOR.secondary },
  { key: 'unassigned', label: 'Unassigned', color: SERIES_COLOR.neutral },
] as const;

type Row = MissedBucket & { cancellations: number | null; noShows: number | null; doctor: number | null; hygiene: number | null; unassigned: number | null };

function rowsOf(series: MissedSeries): Row[] {
  return series.buckets.map(b => ({
    ...b,
    cancellations: b.recorded ? b.cancellations : null,
    noShows: b.recorded ? b.noShows : null,
    doctor: b.recorded ? b.doctor : null,
    hygiene: b.recorded ? b.hygiene : null,
    unassigned: b.recorded ? b.unassigned : null,
  }));
}

function Tip({ active, payload, split }: { active?: boolean; payload?: { payload: Row }[]; split: MissedSplit }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const list = split === 'kind' ? KIND_SERIES : DEPT_SERIES;
  return (
    <div className="max-w-[15rem] rounded-lg border border-border bg-card px-3 py-2.5 text-[12px] shadow-md">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">{r.label}{r.current ? ' · partial' : ''}</p>
      {r.recorded ? (
        <dl className="mt-1.5 space-y-1">
          {list.map(s => (
            <div key={s.key} className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><span aria-hidden className="inline-block h-0.5 w-3" style={{ background: s.color }} />{s.label}</dt>
              <dd className="font-semibold">{r[s.key as keyof Row] as number}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1"><dt className="text-muted-foreground">Total</dt><dd className="font-semibold">{r.total}</dd></div>
        </dl>
      ) : (
        <p className="mt-1.5 text-muted-foreground">Not recorded</p>
      )}
      <p className="mt-1 text-[11px] text-primary">Click to open</p>
    </div>
  );
}

export function MissedTrend({ data, period, width: fixedWidth }: { data: PerformanceData; period: Period; width?: number }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [split, setSplit] = useState<MissedSplit>('kind');
  const [tableOpen, setTableOpen] = useState(false);
  const [ref, measured] = useMeasuredWidth<HTMLDivElement>(560);
  const width = fixedWidth ?? measured;
  const state = data.missedState;
  const series: MissedSeries | null = useMemo(
    () => missedSeries({ period, today: data.today, events: data.missedEvents, closeouts: data.missedCloseouts }),
    [period, data],
  );
  const rows = useMemo(() => (series ? rowsOf(series) : []), [series]);
  const list = split === 'kind' ? KIND_SERIES : DEPT_SERIES;
  const hasUnassigned = !!series && series.totals.unassigned > 0;
  const shownList = split === 'department' && !hasUnassigned ? DEPT_SERIES.slice(0, 2) : list;
  const recordedBuckets = rows.filter(r => r.recorded).length;

  return (
    <figure ref={ref} className="min-w-0" aria-label={`Cancellations and no-shows, ${period.label.toLowerCase()}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3" aria-label="Legend">
          {shownList.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />{s.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border p-0.5" role="group" aria-label="Split">
          {(['kind', 'department'] as MissedSplit[]).map(v => (
            <button
              key={v}
              type="button"
              data-home-control="split"
              aria-pressed={split === v}
              onClick={() => setSplit(v)}
              className={cn('min-h-7 rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', split === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {v === 'kind' ? 'By kind' : 'By department'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3" style={{ minHeight: 180 }}>
        {state === 'loading' && !series && <p className="py-10 text-center text-[13px] text-muted-foreground">Reading postings…</p>}
        {state === 'error' && <p className="py-10 text-center text-[13px]">Missed-appointment records could not be read.</p>}
        {state !== 'loading' && state !== 'error' && !series && (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-border bg-muted/40 px-5 text-center">
            <p className="text-[14px] font-semibold">No cancellations or no-shows recorded for this period.</p>
            <p className="mt-1 max-w-[44ch] text-[12.5px] text-muted-foreground">Postings arrive from the Dentrix import; daily counts arrive with Close the Day.</p>
            <Link to="/management/missed-appointments" className="mt-3 inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary hover:underline">Import from Dentrix<ArrowUpRight className="h-3 w-3" /></Link>
          </div>
        )}
        {series && (
          <div className="-mx-1 overflow-hidden" data-testid="missed-chart-frame">
            <BarChart
              width={Math.max(280, width)}
              height={180}
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              barCategoryGap="30%"
              accessibilityLayer
              onClick={(s: { activePayload?: { payload: Row }[] } | null) => {
                const r = s?.activePayload?.[0]?.payload;
                if (r) navigate(missedHref(r));
              }}
              className="cursor-pointer [&_.recharts-surface]:outline-none [&_.recharts-surface:focus-visible]:outline [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-ring"
            >
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke={AXIS_TEXT} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke={AXIS_TEXT} width={28} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.6 }} content={<Tip split={split} />} isAnimationActive={false} />
              {shownList.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="m" fill={s.color} maxBarSize={22} radius={i === shownList.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} isAnimationActive={!reduced} animationDuration={300} />
              ))}
            </BarChart>
          </div>
        )}
      </div>

      {series && (
        <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[11.5px] text-muted-foreground">
            {series.sourceLabel} · {series.totals.total} in {series.period.rangeLabel}
            {series.source === 'closeouts' ? ` · ${series.recordedDays} of ${series.days} days recorded` : recordedBuckets < rows.length ? ` · ${recordedBuckets} of ${rows.length} ${series.granularity === 'day' ? 'days' : series.granularity + 's'} with postings` : ''}
            {hasUnassigned ? ` · ${series.totals.unassigned} unassigned` : ''}
          </p>
          <span className="flex items-center gap-3">
            <Link to={missedHref(period)} className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary hover:underline">Missed appointments<ArrowUpRight className="h-3 w-3" /></Link>
            <button type="button" data-home-control="table" aria-expanded={tableOpen} onClick={() => setTableOpen(o => !o)} className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {tableOpen ? 'Hide table' : 'Values as a table'}
            </button>
          </span>
        </figcaption>
      )}
      {series && tableOpen && (
        <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">Cancellations and no-shows by {series.granularity}, {series.period.rangeLabel}</caption>
            <thead className="sticky top-0 bg-muted text-left"><tr>
              <th scope="col" className="px-3 py-2 font-medium">Period</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Cancellations</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">No-shows</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Doctor</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Hygiene</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Unassigned</th>
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Open</span></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">{r.label}{r.current ? ' · partial' : ''}</th>
                  {r.recorded ? (
                    <>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.cancellations}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.noShows}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.doctor}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.hygiene}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{r.unassigned}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-1.5 text-muted-foreground">Not recorded</td>
                  )}
                  <td className="px-3 py-1.5 text-right"><Link to={missedHref(r)} className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">{series.definition}</p>
        </div>
      )}
    </figure>
  );
}
