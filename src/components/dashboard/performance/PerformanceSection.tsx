import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/owner-pulse';
import { metricPace } from '@/lib/metric-pace';
import type { PerformanceData } from '@/lib/home-performance';
import {
  PRESET_LABELS, buildWindow, chooseSource, defaultPreset, formatDelta, periodFor,
  type Period, type PeriodPreset, type PerformanceWindow, type SeriesSource, type SourceChoice,
} from '@/lib/performance-series';
import { missedSeries, type MissedSeries } from '@/lib/missed-trend';
import { MicroLabel } from '../kit';
import type { Tone } from '../types';
import { PerformanceChart, type ChartView } from './PerformanceChart';
import { PerformanceStrip, type StripTile } from './PerformanceStrip';
import { missedHref } from './MissedTrend';

/**
 * The performance block: one period row that scopes everything under it,
 * the strip, the chart, and (for admins) the supporting missed-appointment
 * trend. Goals and observations sit beside the chart and are month-based
 * by definition, which their own captions say.
 */
export type PerformanceState = 'loading' | 'ok' | 'error';

export type PerformanceSectionProps = {
  data: PerformanceData | null;
  state: PerformanceState;
  /** The narrower goal / observation column beside the chart. */
  aside?: ReactNode;
  /** Supporting operational visual under the chart, scoped to the same period. */
  supporting?: (period: Period, data: PerformanceData) => ReactNode;
  compact?: boolean;
  /** Fixed chart width for deterministic rendering in tests. */
  chartWidth?: number;
};

const controlClass =
  'inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function coverageText(recorded: number, days: number, source: SeriesSource | null): string {
  return `${recorded} of ${days} ${source === 'report_history' ? 'posting day' : 'day'}${days === 1 ? '' : 's'} recorded`;
}

/** The strip's tiles for a period, from the window and the closeout-only counts. Pure, so tests can pin it. */
export function stripTiles(args: {
  data: PerformanceData;
  period: Period;
  window: PerformanceWindow | null;
  choice: SourceChoice;
  missed: MissedSeries | null;
}): StripTile[] {
  const { data, period, window: w, choice, missed } = args;
  const tiles: StripTile[] = [];
  const periodLabel = `${period.rangeLabel}${period.partial ? ' · partial' : ''}`;
  const closeoutDaysInPeriod = data.sources.closeouts.filter(d => d.date >= period.start && d.date <= period.end).length;
  const defs = w?.definitions;

  const moneyTile = (key: 'primary' | 'secondary', fallbackLabel: string): StripTile => {
    const label = key === 'primary' ? defs?.primaryLabel ?? fallbackLabel : defs?.secondaryLabel ?? fallbackLabel;
    const total = key === 'primary' ? w?.totals.primaryCents ?? null : w?.totals.secondaryCents ?? null;
    const recorded = key === 'primary' ? w?.totals.primaryRecordedDays ?? 0 : w?.totals.secondaryRecordedDays ?? 0;
    const lines: StripTile['lines'] = [];
    if (w) {
      const c = w.comparison;
      const delta = key === 'primary' ? c.primaryDelta : c.secondaryDelta;
      if (c.comparable && delta !== null) {
        lines.push({ text: `${formatDelta(delta)} per recorded day vs ${c.rangeLabel}`, tone: delta < 0 ? 'attention' : 'steady' });
      } else if (c.comparable) {
        lines.push({ text: `No prior figure for ${c.rangeLabel}` });
      } else {
        lines.push({ text: `No comparison: ${c.reason ?? 'not comparable'}` });
      }
      lines.push({ text: coverageText(recorded, w.totals.days, w.source) });
    } else {
      lines.push({ text: choice.reason });
    }
    return {
      id: key === 'primary' ? 'production' : 'collections',
      label,
      periodLabel,
      value: total === null ? 'Not recorded' : money(total),
      lines,
      ariaLabel: `${label}, ${periodLabel}: ${total === null ? 'not recorded' : money(total)}. ${lines.map(l => l.text).join('. ')}`,
    };
  };

  if (data.visibility.production) tiles.push(moneyTile('primary', 'Production'));
  if (data.visibility.collections) tiles.push(moneyTile('secondary', 'Collections'));

  if (data.visibility.newPatients) {
    const inPeriod = data.newPatients.filter(d => d.date >= period.start && d.date <= period.end);
    const seenDays = inPeriod.filter(d => d.seen !== null);
    const scheduledDays = inPeriod.filter(d => d.scheduled !== null);
    const seen = seenDays.reduce((s, d) => s + (d.seen as number), 0);
    const scheduled = scheduledDays.reduce((s, d) => s + (d.scheduled as number), 0);
    const lines: StripTile['lines'] = [];
    if (period.preset === 'this_month' && data.targets.newPatientsSeen > 0) {
      const pace = metricPace({
        actual: data.thisMonth.newPatientsSeen,
        target: data.targets.newPatientsSeen,
        monthElapsed: data.monthElapsed,
        recordedDays: data.thisMonth.newPatientsSeenRecordedDays,
        onPaceBand: 1,
      });
      if (pace) {
        lines.push({
          text: `of the ${pace.target} goal · ${pace.status === 'on_pace' ? 'on calendar pace' : `${Math.abs(pace.diff)} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} calendar pace`}`,
          tone: pace.status === 'behind' ? 'attention' : 'steady',
        });
      }
    }
    if (scheduledDays.length > 0) lines.push({ text: `${scheduled} scheduled — the pipeline, not goal progress` });
    lines.push({
      text: seenDays.length > 0
        ? `Recorded on ${seenDays.length} of ${closeoutDaysInPeriod} closed-out day${closeoutDaysInPeriod === 1 ? '' : 's'} · Close the Day`
        : 'Recorded at Close the Day — nothing entered for this period',
    });
    const value = seenDays.length > 0 ? String(seen) : 'Not recorded';
    tiles.push({
      id: 'new_patients',
      label: 'New patients seen',
      periodLabel,
      value,
      lines,
      href: '/deposit-log',
      ariaLabel: `New patients seen, ${periodLabel}: ${value}. ${lines.map(l => l.text).join('. ')}`,
    });
  }

  if (data.access === 'admin') {
    const lines: StripTile['lines'] = [];
    let value = 'Not recorded';
    let valueTone: Tone | undefined;
    if (missed) {
      value = String(missed.totals.total);
      lines.push({ text: `${missed.totals.cancellations} late cancellation${missed.totals.cancellations === 1 ? '' : 's'} · ${missed.totals.noShows} no-show${missed.totals.noShows === 1 ? '' : 's'}` });
      const c = missed.comparison;
      if (c.comparable) {
        const diff = missed.totals.total - c.totals.total;
        lines.push({ text: `${diff >= 0 ? '+' : '−'}${Math.abs(diff)} vs ${c.rangeLabel} (${c.totals.total})`, tone: diff > 0 ? 'attention' : 'steady' });
        if (diff > 0) valueTone = 'attention';
      } else if (c.reason) {
        lines.push({ text: `No comparison: ${c.reason}` });
      }
      lines.push({ text: missed.sourceLabel });
    } else {
      lines.push({ text: data.missedState === 'loading' ? 'Reading…' : 'No postings or Close the Day counts for this period' });
    }
    tiles.push({
      id: 'missed',
      label: 'Missed appointments',
      periodLabel,
      value,
      valueTone,
      lines,
      href: missedHref(period),
      ariaLabel: `Missed appointments, ${periodLabel}: ${value}. ${lines.map(l => l.text).join('. ')}`,
    });
  }

  return tiles;
}

export function PerformanceSection(props: PerformanceSectionProps) {
  const { data, state, aside, supporting, compact } = props;
  const [preset, setPreset] = useState<PeriodPreset | null>(null);
  const [preferred, setPreferred] = useState<SeriesSource | null>(null);
  const [view, setView] = useState<ChartView>('daily');
  // The opening period follows the rows once they arrive; a reader's own
  // choice is never overridden, and a new office's rows pick afresh.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!data || openedFor === data.orgId) return;
    setOpenedFor(data.orgId);
    setPreset(defaultPreset(data.today, data.sources));
    setPreferred(null);
  }, [data, openedFor]);

  const presets = data?.presets ?? ['this_week', 'this_month', 'last_month', 'last_3_months'];
  const activePreset: PeriodPreset = preset && presets.includes(preset) ? preset : 'this_month';

  const model = useMemo(() => {
    if (!data) return null;
    const period = periodFor(activePreset, data.today);
    const choice = chooseSource(period, data.sources);
    const window = buildWindow({ period, today: data.today, sources: data.sources, preferredSource: preferred });
    const missed = data.access === 'admin'
      ? missedSeries({ period, today: data.today, events: data.missedEvents, closeouts: data.missedCloseouts })
      : null;
    return { period, choice, window, missed, tiles: stripTiles({ data, period, window, choice, missed }) };
  }, [data, activePreset, preferred]);

  const shown = { primary: !!data?.visibility.production, secondary: !!data?.visibility.collections };
  const chartVisible = shown.primary || shown.secondary;

  return (
    <section className="min-w-0" aria-label="Office performance">
      {/* One period row scopes the strip, the chart, and the supporting trend. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 py-0.5" role="group" aria-label="Period">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              data-home-control="period"
              aria-pressed={activePreset === p}
              onClick={() => setPreset(p)}
              className={cn(controlClass, activePreset === p ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground')}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {model && model.choice.available.length > 1 && data?.access === 'admin' && (
          <div className="flex items-center gap-1" role="group" aria-label="Source">
            <MicroLabel className="mr-1">Source</MicroLabel>
            {model.choice.available.map(s => {
              const on = model.window?.source === s;
              return (
                <button
                  key={s}
                  type="button"
                  data-home-control="source"
                  aria-pressed={on}
                  onClick={() => setPreferred(s)}
                  className={cn(controlClass, 'border', on ? 'border-primary bg-primary/[0.08] text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
                >
                  {s === 'closeouts' ? 'Close the Day' : 'Report history'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3">
        <PerformanceStrip tiles={model?.tiles ?? []} loading={state === 'loading' || !model} />
      </div>

      <div className={cn('mt-4 grid gap-6 [&>*]:min-w-0', aside && 'lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-8')}>
        {chartVisible && (
          <div className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <MicroLabel className="text-primary">{model?.window ? `${model.window.definitions.primaryLabel} and ${model.window.definitions.secondaryLabel}` : 'Production and collections'}</MicroLabel>
              {model && <MicroLabel>{model.period.rangeLabel}</MicroLabel>}
            </div>
            <div className="mt-3">
              <PerformanceChart
                window={model?.window ?? null}
                emptyReason={model?.choice.reason ?? 'Still reading.'}
                state={state === 'ok' && !model ? 'loading' : state}
                access={data?.access ?? 'member'}
                shown={shown}
                view={view}
                onViewChange={setView}
                compact={compact}
                width={props.chartWidth}
              />
            </div>
          </div>
        )}
        {aside}
      </div>

      {supporting && data && model && <div className="mt-6">{supporting(model.period, data)}</div>}
    </section>
  );
}
