import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { money } from '@/lib/owner-pulse';
import { formatCents } from '@/lib/money';
import type { Bucket, DayStatus, PerformanceWindow, SeriesSource } from '@/lib/performance-series';
import { MicroLabel } from '../kit';
import { AXIS_TEXT, GRID_STROKE, SERIES_COLOR, compactDollars, useMeasuredWidth } from './chart-theme';

/**
 * Production and collections over time.
 *
 *  - one dollar axis for both series (never a second y-axis);
 *  - daily view = thin grouped bars, so an unrecorded day is simply absent;
 *  - cumulative view = a step line over recorded days; a gap steps flat,
 *    and the tooltip and table say "not recorded" for it;
 *  - both series are individually selectable and keep their own color
 *    whether or not the other is shown;
 *  - every value is reachable without hovering: the chart has Recharts'
 *    keyboard layer (arrow keys move the readout) and a table twin whose
 *    rows link to the record that backs them;
 *  - a click on a bar or point opens the day's record with the period kept.
 */

export type ChartView = 'daily' | 'cumulative';
export type SeriesKey = 'primary' | 'secondary';

export type PerformanceChartProps = {
  window: PerformanceWindow | null;
  /** Why there is nothing to draw, when `window` is null. */
  emptyReason: string;
  state: 'ok' | 'loading' | 'error';
  access: 'admin' | 'member';
  /** Which series the viewer may see at all (visibility settings). */
  shown: Record<SeriesKey, boolean>;
  view: ChartView;
  onViewChange: (view: ChartView) => void;
  compact?: boolean;
  /** Fixed drawing width — tests pass one; the live chart measures itself. */
  width?: number;
};

type Row = {
  key: string;
  label: string;
  start: string;
  end: string;
  days: number;
  primary: number | null;
  secondary: number | null;
  cumPrimary: number | null;
  cumSecondary: number | null;
  status: DayStatus;
  current: boolean;
  primaryRecordedDays: number;
  secondaryRecordedDays: number;
};

export const STATUS_LABEL: Record<DayStatus, string> = {
  sealed: 'Sealed',
  saved: 'Saved, not sealed',
  report: 'Report package',
  not_in_package: 'No entries in the loaded package',
  not_recorded: 'Not recorded',
};

/** Where a bucket opens: the day's closeout, the report day, or nowhere (a week of closeouts opens the table). */
export function drilldownFor(bucket: Pick<Bucket, 'start' | 'end' | 'days'>, source: SeriesSource, access: 'admin' | 'member'): string | null {
  if (source === 'closeouts') return bucket.days === 1 ? `/deposit-log?date=${bucket.start}` : null;
  if (access !== 'admin') return null;
  return `/report-history?start=${bucket.start}&end=${bucket.end}&tab=daily`;
}

/** The series-level destination for the whole period. */
export function periodDrilldown(source: SeriesSource, period: { start: string; end: string }, access: 'admin' | 'member'): string | null {
  if (source !== 'report_history' || access !== 'admin') return null;
  return `/report-history?start=${period.start}&end=${period.end}&tab=daily`;
}

function toRows(w: PerformanceWindow): Row[] {
  return w.buckets.map(b => ({
    key: b.key,
    label: b.label,
    start: b.start,
    end: b.end,
    days: b.days,
    primary: b.primaryCents,
    secondary: b.secondaryCents,
    cumPrimary: b.cumulativePrimaryCents,
    cumSecondary: b.cumulativeSecondaryCents,
    status: b.status,
    current: b.current,
    primaryRecordedDays: b.primaryRecordedDays,
    secondaryRecordedDays: b.secondaryRecordedDays,
  }));
}

function valueLabel(v: number | null, status: DayStatus, recorded: boolean): string {
  if (v !== null) return formatCents(v);
  if (status === 'not_recorded' || status === 'not_in_package') return STATUS_LABEL[status];
  return recorded ? 'Not entered' : 'Not recorded';
}

const controlClass =
  'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** A legend entry that is also the series switch. Color + label + pressed state, never color alone. */
function SeriesToggle({ label, color, on, onToggle, disabled }: { label: string; color: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      data-home-control="series"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(controlClass, on ? 'border-border bg-card text-foreground' : 'border-dashed border-border text-muted-foreground', disabled && 'cursor-default')}
    >
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color, opacity: on ? 1 : 0.35 }} />
      {label}
      <span className="sr-only">{on ? ' shown' : ' hidden'}</span>
    </button>
  );
}

function ChartTip({
  active, payload, view, defs, shown, source, access,
}: {
  active?: boolean;
  payload?: { payload: Row }[];
  view: ChartView;
  defs: PerformanceWindow['definitions'];
  shown: Record<SeriesKey, boolean>;
  source: SeriesSource;
  access: 'admin' | 'member';
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const primary = view === 'daily' ? row.primary : row.cumPrimary;
  const secondary = view === 'daily' ? row.secondary : row.cumSecondary;
  const range = row.days === 1 ? row.start : `${row.start} – ${row.end}`;
  const href = drilldownFor(row, source, access);
  return (
    <div className="max-w-[16rem] rounded-lg border border-border bg-card px-3 py-2.5 text-[12px] shadow-md">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
        {range}{row.current ? ' · partial, includes today' : ''}
      </p>
      <dl className="mt-1.5 space-y-1">
        {shown.primary && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground"><span aria-hidden className="inline-block h-0.5 w-3" style={{ background: SERIES_COLOR.primary }} />{defs.primaryLabel}{view === 'cumulative' ? ' to date' : ''}</dt>
            <dd className="font-semibold">{valueLabel(primary, row.status, row.primaryRecordedDays > 0 || row.secondaryRecordedDays > 0)}</dd>
          </div>
        )}
        {shown.secondary && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground"><span aria-hidden className="inline-block h-0.5 w-3" style={{ background: SERIES_COLOR.secondary }} />{defs.secondaryLabel}{view === 'cumulative' ? ' to date' : ''}</dt>
            <dd className="font-semibold">{valueLabel(secondary, row.status, row.secondaryRecordedDays > 0)}</dd>
          </div>
        )}
      </dl>
      <p className="mt-1.5 text-muted-foreground">
        {row.days > 1 ? `${Math.max(row.primaryRecordedDays, row.secondaryRecordedDays)} of ${row.days} days recorded · ` : ''}
        {STATUS_LABEL[row.status]} · {defs.sourceLabel}
      </p>
      {href && <p className="mt-1 text-[11px] text-primary">Click to open</p>}
    </div>
  );
}

export function PerformanceChart(props: PerformanceChartProps) {
  const { window: w, emptyReason, state, access, shown, view, onViewChange, compact } = props;
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({ primary: false, secondary: false });
  const [tableOpen, setTableOpen] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [frameRef, measured] = useMeasuredWidth<HTMLDivElement>(640);
  const width = props.width ?? measured;
  const height = compact ? 200 : width < 640 ? 220 : 300;

  const rows = useMemo(() => (w ? toRows(w) : []), [w]);
  const bothShown = shown.primary && shown.secondary;
  const showPrimary = shown.primary && !hidden.primary;
  const showSecondary = shown.secondary && !hidden.secondary;
  const anyRecorded = rows.some(r => r.primary !== null || r.secondary !== null);

  const toggle = (k: SeriesKey) =>
    setHidden(h => {
      const next = { ...h, [k]: !h[k] };
      // The last visible series cannot be switched off — an empty chart says nothing.
      if (next.primary && next.secondary) return h;
      return next;
    });

  const onChartClick = (chartState: { activePayload?: { payload: Row }[] } | null) => {
    const row = chartState?.activePayload?.[0]?.payload;
    if (!row || !w) return;
    const href = drilldownFor(row, w.source, access);
    if (href) navigate(href);
    else {
      setFocusKey(row.key);
      setTableOpen(true);
    }
  };

  const defs = w?.definitions;
  const periodHref = w ? periodDrilldown(w.source, w.period, access) : null;

  return (
    <figure ref={frameRef} className="min-w-0" aria-label={defs ? `${defs.primaryLabel} and ${defs.secondaryLabel}, ${w!.period.label.toLowerCase()}` : 'Performance chart'}>
      {/* Legend + view switch: one row, real buttons. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Series">
          {defs && shown.primary && (
            <SeriesToggle label={defs.primaryLabel} color={SERIES_COLOR.primary} on={showPrimary} onToggle={() => toggle('primary')} disabled={!bothShown} />
          )}
          {defs && shown.secondary && (
            <SeriesToggle label={defs.secondaryLabel} color={SERIES_COLOR.secondary} on={showSecondary} onToggle={() => toggle('secondary')} disabled={!bothShown} />
          )}
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border p-0.5" role="group" aria-label="Chart view">
          {(['daily', 'cumulative'] as ChartView[]).map(v => (
            <button
              key={v}
              type="button"
              data-home-control="view"
              aria-pressed={view === v}
              onClick={() => onViewChange(v)}
              className={cn(
                'min-h-7 rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'daily' ? (w?.granularity === 'week' ? 'Weekly' : 'Daily') : 'Cumulative'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-w-0" style={{ minHeight: height }}>
        {state === 'loading' && (
          <div className="flex h-full min-h-[inherit] items-end gap-1 px-1 pb-6" aria-live="polite">
            <p className="w-full text-center text-[13px] text-muted-foreground">Reading recorded days…</p>
          </div>
        )}
        {state === 'error' && (
          <div className="flex min-h-[inherit] items-center justify-center rounded-xl border border-warning/40 bg-warning/[0.06] px-4 text-center">
            <p className="text-[13px]">The recorded days could not be read. Nothing here is confirmed — refresh to try again.</p>
          </div>
        )}
        {state === 'ok' && (!w || !anyRecorded) && (
          <div className="flex min-h-[inherit] flex-col items-center justify-center rounded-xl border border-border bg-muted/40 px-5 text-center">
            <p className="text-[14px] font-semibold">Nothing recorded for this period.</p>
            <p className="mt-1 max-w-[46ch] text-[12.5px] text-muted-foreground">{emptyReason}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Link to="/deposit-log" className={cn(controlClass, 'border-primary/40 text-primary hover:bg-primary/[0.06]')}>Close out a day<ArrowUpRight className="h-3 w-3" /></Link>
              {access === 'admin' && (
                <Link to="/report-history" className={cn(controlClass, 'border-border text-muted-foreground hover:text-foreground')}>Load report history<ArrowUpRight className="h-3 w-3" /></Link>
              )}
            </div>
          </div>
        )}
        {state === 'ok' && w && anyRecorded && (
          <div className="-mx-1 overflow-hidden" data-testid="performance-chart-frame">
            <ComposedChart
              width={Math.max(280, width)}
              height={height}
              data={rows}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              barGap={2}
              barCategoryGap="22%"
              accessibilityLayer
              onClick={onChartClick}
              className="cursor-pointer [&_.recharts-surface]:outline-none [&_.recharts-surface:focus-visible]:outline [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-ring"
            >
              <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke={AXIS_TEXT} interval="preserveStartEnd" minTickGap={28} />
              <YAxis tickFormatter={compactDollars} tickLine={false} axisLine={false} fontSize={11} stroke={AXIS_TEXT} width={52} />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.6 }}
                content={<ChartTip view={view} defs={w.definitions} shown={{ primary: showPrimary, secondary: showSecondary }} source={w.source} access={access} />}
                isAnimationActive={false}
              />
              {view === 'daily' && showPrimary && (
                <Bar dataKey="primary" name={w.definitions.primaryLabel} fill={SERIES_COLOR.primary} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} animationDuration={300}>
                  {rows.map(r => <Cell key={r.key} fillOpacity={r.current ? 0.55 : 1} />)}
                </Bar>
              )}
              {view === 'daily' && showSecondary && (
                <Bar dataKey="secondary" name={w.definitions.secondaryLabel} fill={SERIES_COLOR.secondary} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} animationDuration={300}>
                  {rows.map(r => <Cell key={r.key} fillOpacity={r.current ? 0.55 : 1} />)}
                </Bar>
              )}
              {view === 'cumulative' && showPrimary && (
                <Line type="stepAfter" dataKey="cumPrimary" name={`${w.definitions.primaryLabel} to date`} stroke={SERIES_COLOR.primary} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }} connectNulls isAnimationActive={!reduced} animationDuration={300} />
              )}
              {view === 'cumulative' && showSecondary && (
                <Line type="stepAfter" dataKey="cumSecondary" name={`${w.definitions.secondaryLabel} to date`} stroke={SERIES_COLOR.secondary} strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }} connectNulls isAnimationActive={!reduced} animationDuration={300} />
              )}
            </ComposedChart>
          </div>
        )}
      </div>

      {w && (
        <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[11.5px] text-muted-foreground">
            {w.definitions.sourceLabel} · {w.definitions.dateBasis} · {w.coverageLabel}
            {w.period.partial ? ` · ${w.period.label.toLowerCase()} is partial` : ''}
            {view === 'cumulative' ? ' · a flat step is an unrecorded day' : ''}
          </p>
          <span className="flex items-center gap-3">
            {periodHref && (
              <Link to={periodHref} className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary hover:underline">
                Open report history<ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
            <button
              type="button"
              data-home-control="table"
              aria-expanded={tableOpen}
              onClick={() => setTableOpen(o => !o)}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tableOpen ? 'Hide table' : 'Values as a table'}
            </button>
          </span>
        </figcaption>
      )}

      {w && tableOpen && (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-border">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">{w.definitions.primaryLabel} and {w.definitions.secondaryLabel} by {w.granularity}, {w.period.rangeLabel}</caption>
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">{w.granularity === 'week' ? 'Week' : 'Date'}</th>
                {shown.primary && <th scope="col" className="px-3 py-2 text-right font-medium">{w.definitions.primaryLabel}</th>}
                {shown.secondary && <th scope="col" className="px-3 py-2 text-right font-medium">{w.definitions.secondaryLabel}</th>}
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const href = drilldownFor(r, w.source, access);
                const recorded = r.primaryRecordedDays > 0 || r.secondaryRecordedDays > 0;
                return (
                  <tr key={r.key} className={cn('border-t border-border', r.key === focusKey && 'bg-primary/[0.06]')}>
                    <th scope="row" className="px-3 py-1.5 text-left font-normal tabular-nums">{r.days === 1 ? r.start : `${r.start} – ${r.end}`}{r.current ? ' · partial' : ''}</th>
                    {shown.primary && <td className="px-3 py-1.5 text-right tabular-nums">{valueLabel(view === 'daily' ? r.primary : r.cumPrimary, r.status, recorded)}</td>}
                    {shown.secondary && <td className="px-3 py-1.5 text-right tabular-nums">{valueLabel(view === 'daily' ? r.secondary : r.cumSecondary, r.status, r.secondaryRecordedDays > 0)}</td>}
                    <td className="px-3 py-1.5 text-muted-foreground">{STATUS_LABEL[r.status]}{r.days > 1 ? ` · ${Math.max(r.primaryRecordedDays, r.secondaryRecordedDays)}/${r.days} days` : ''}</td>
                    <td className="px-3 py-1.5 text-right">
                      {href && <Link to={href} className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline">Open</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-border bg-muted/40">
              <tr>
                <th scope="row" className="px-3 py-1.5 text-left font-medium">Period total</th>
                {shown.primary && <td className="px-3 py-1.5 text-right font-medium tabular-nums">{w.totals.primaryCents === null ? 'Not recorded' : money(w.totals.primaryCents)}</td>}
                {shown.secondary && <td className="px-3 py-1.5 text-right font-medium tabular-nums">{w.totals.secondaryCents === null ? 'Not recorded' : money(w.totals.secondaryCents)}</td>}
                <td className="px-3 py-1.5 text-muted-foreground" colSpan={2}>{w.coverageLabel}</td>
              </tr>
            </tfoot>
          </table>
          <MicroLabel className="px-3 py-2">{w.definitions.secondaryDefinition}</MicroLabel>
        </div>
      )}
    </figure>
  );
}
