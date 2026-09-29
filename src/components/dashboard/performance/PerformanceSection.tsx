import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/owner-pulse';
import { daysInMonthOf, metricPace, paceBasisClause, paceFraction, type PaceBasis } from '@/lib/metric-pace';
import type { PerformanceData } from '@/lib/home-performance';
import {
  PRESET_LABELS, buildWindow, chooseSource, defaultPreset, formatDelta, partialLabel, periodFor,
  type Period, type PeriodPreset, type PerformanceWindow, type SeriesSource, type SourceChoice,
} from '@/lib/performance-series';
import { missedSeries, type MissedSeries } from '@/lib/missed-trend';
import { SectionLabel, focusRing, interactive, panelClass } from '../kit';
import type { Tone } from '../types';
import { PerformanceChart, type ChartView } from './PerformanceChart';
import { PerformanceStrip, type StripTile } from './PerformanceStrip';
import { missedHref } from './MissedTrend';
import { officeDaysForMonth } from './block';
import { shiftDate } from '@/lib/time-utils';

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
  /** Supporting operational visual under the chart, scoped to the same period. */
  supporting?: (period: Period, data: PerformanceData) => ReactNode;
  compact?: boolean;
  /** Fixed chart width for deterministic rendering in tests. */
  chartWidth?: number;
};

const controlClass = cn(
  'inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-[13.5px] font-medium', interactive, focusRing,
);

const fmtDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The unit the completeness row counts: office days, posting days, or the dates printed on the source. */
function dayUnit(source: SeriesSource, dateBasis: string): string {
  return source === 'closeouts' ? 'office days' : dateBasis === 'date printed on source' ? 'source dates' : 'posting days';
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
    const info: NonNullable<StripTile['info']> = [{ label: 'Period', value: periodLabel }];
    let partial: string | null = null;
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
      partial = partialLabel(w.totals, w.source);
      const cutoff = w.totals.lastRecorded ? fmtDay(w.totals.lastRecorded) : 'nothing recorded';
      info.push(
        { label: 'Through', value: cutoff },
        { label: 'Source', value: `${w.definitions.sourceLabel} · ${w.definitions.dateBasis}` },
        { label: 'Completeness', value: w.totals.authoritative ? 'Complete month from the package summary' : w.totals.expectedDays !== null ? `${recorded} of ${w.totals.expectedDays} ${dayUnit(w.source, w.definitions.dateBasis)} recorded through ${fmtDay(w.totals.cutoff)}` : `${recorded} of ${w.totals.days} calendar days recorded (office calendar unavailable)` },
        { label: 'Comparison', value: c.comparable ? `Per recorded day against the same span of the prior period (${c.rangeLabel})` : `Withheld: ${c.reason ?? 'not comparable'}` },
        { label: 'Definition', value: key === 'primary' ? w.definitions.primaryDefinition : w.definitions.secondaryDefinition },
      );
    } else {
      lines.push({ text: choice.reason });
      info.push({ label: 'Status', value: choice.reason });
    }
    return {
      id: key === 'primary' ? 'production' : 'collections',
      label,
      periodLabel,
      value: total === null ? 'Not recorded' : money(total),
      lines,
      partial,
      info,
      ariaLabel: `${label}, ${periodLabel}: ${total === null ? 'not recorded' : money(total)}. ${lines.map(l => l.text).join('. ')}${partial ? `. ${partial}` : ''}`,
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
    const info: NonNullable<StripTile['info']> = [
      { label: 'Period', value: periodLabel },
      { label: 'Source', value: 'Close the Day · completed first visits, entered at closeout' },
      { label: 'Completeness', value: seenDays.length > 0 ? `Recorded on ${seenDays.length} of ${closeoutDaysInPeriod} closed-out day${closeoutDaysInPeriod === 1 ? '' : 's'}` : 'Nothing entered for this period' },
    ];
    let partial: string | null = null;
    if (period.preset === 'this_month' && data.targets.newPatientsSeen > 0) {
      // The same basis and completeness rule as the goal meters: office days
      // from the office calendar when it is in hand (today counts once its
      // closeout exists), calendar days as a labeled estimate otherwise; and
      // a month with office days missing is never judged behind.
      const officeDays = officeDaysForMonth(data.today, data.calendar);
      const todayRecorded = data.sources.closeouts.some(d => d.date === data.today);
      const basis: PaceBasis = officeDays && officeDays.total > 0
        ? { kind: 'office_days', elapsed: todayRecorded ? officeDays.throughToday : officeDays.throughYesterday, total: officeDays.total }
        : { kind: 'calendar_days', elapsed: Math.round(data.monthElapsed * daysInMonthOf(data.today)), total: daysInMonthOf(data.today) };
      const monthStart = `${data.today.slice(0, 7)}-01`;
      const cutoff = todayRecorded ? data.today : shiftDate(data.today, -1);
      const recordedOfficeDays = data.sources.closeouts.filter(d => d.date >= monthStart && d.date <= cutoff).length;
      const missing = basis.kind === 'office_days' ? Math.max(0, basis.elapsed - recordedOfficeDays) : 0;
      const pace = metricPace({
        actual: data.thisMonth.newPatientsSeen,
        target: data.targets.newPatientsSeen,
        monthElapsed: basis.kind === 'office_days' ? paceFraction(basis) : data.monthElapsed,
        recordedDays: data.thisMonth.newPatientsSeenRecordedDays,
        onPaceBand: 1,
      });
      if (pace && missing > 0) {
        partial = `Partial data · ${missing} office day${missing === 1 ? '' : 's'} not recorded`;
        lines.push({ text: `of the ${pace.target} goal · pace is not judged until the records are complete` });
        info.push({ label: 'Goal', value: `${pace.target} seen this month · ${missing} office day${missing === 1 ? '' : 's'} not recorded, so no pace verdict` });
      } else if (pace && basis.kind === 'office_days') {
        const verdict = pace.status === 'on_pace' ? 'on pace' : `${Math.abs(pace.diff)} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} pace`;
        lines.push({ text: `of the ${pace.target} goal · ${verdict} by ${paceBasisClause(basis)}`, tone: pace.status === 'behind' ? 'attention' : 'steady' });
        info.push({ label: 'Goal', value: `${pace.target} seen this month · paced by office days from the office calendar (${paceBasisClause(basis)})` });
      } else if (pace) {
        const verdict = pace.status === 'on_pace' ? 'on calendar pace' : `${Math.abs(pace.diff)} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} calendar pace`;
        lines.push({ text: `of the ${pace.target} goal · ${verdict} (estimate)`, tone: pace.status === 'behind' ? 'attention' : 'steady' });
        info.push({ label: 'Goal', value: `${pace.target} seen this month · paced by calendar days — an estimate, since the office calendar could not be read` });
      }
    }
    if (scheduledDays.length > 0) {
      lines.push({ text: `${scheduled} scheduled — the pipeline, not goal progress` });
      info.push({ label: 'Scheduled', value: `${scheduled} on ${scheduledDays.length} day${scheduledDays.length === 1 ? '' : 's'} — a pipeline count, never goal progress` });
    }
    if (lines.length === 0) lines.push({ text: seenDays.length > 0 ? `Recorded on ${seenDays.length} of ${closeoutDaysInPeriod} closed-out day${closeoutDaysInPeriod === 1 ? '' : 's'}` : 'Nothing entered for this period' });
    const value = seenDays.length > 0 ? String(seen) : 'Not recorded';
    tiles.push({
      id: 'new_patients',
      label: 'New patients seen',
      periodLabel,
      value,
      lines,
      partial,
      info,
      href: '/deposit-log',
      ariaLabel: `New patients seen, ${periodLabel}: ${value}. ${lines.map(l => l.text).join('. ')}${partial ? `. ${partial}` : ''}`,
    });
  }

  if (data.access === 'admin') {
    const lines: StripTile['lines'] = [];
    const info: NonNullable<StripTile['info']> = [{ label: 'Period', value: periodLabel }];
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
        info.push({ label: 'Comparison', value: `Against ${c.rangeLabel}: ${c.totals.total}` });
      } else if (c.reason) {
        info.push({ label: 'Comparison', value: `Withheld: ${c.reason}` });
      }
      info.push({ label: 'Source', value: missed.sourceLabel }, { label: 'Definition', value: missed.definition });
      if (missed.source === 'closeouts') info.push({ label: 'Completeness', value: `${missed.recordedDays} of ${missed.days} days recorded` });
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
      info,
      href: missedHref(period),
      ariaLabel: `Missed appointments, ${periodLabel}: ${value}. ${lines.map(l => l.text).join('. ')}`,
    });
  }

  return tiles;
}

export function PerformanceSection(props: PerformanceSectionProps) {
  const { data, state, supporting, compact } = props;
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
    const window = buildWindow({ period, today: data.today, sources: data.sources, preferredSource: preferred, calendar: data.calendar });
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
        <div className="-mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 py-0.5" role="group" aria-label="Period">
          {presets.map(p => (
            <button
              key={p}
              type="button"
              data-home-control="period"
              aria-pressed={activePreset === p}
              onClick={() => setPreset(p)}
              className={cn(controlClass, activePreset === p ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground')}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {model && model.choice.available.length > 1 && data?.access === 'admin' && (
          <div className="flex items-center gap-1.5" role="group" aria-label="Source">
            <SectionLabel as="span" className="mr-1">Source</SectionLabel>
            {model.choice.available.map(s => {
              const on = model.window?.source === s;
              return (
                <button
                  key={s}
                  type="button"
                  data-home-control="source"
                  aria-pressed={on}
                  onClick={() => setPreferred(s)}
                  className={cn(controlClass, 'border', on ? 'border-primary bg-primary/[0.08] text-primary' : 'border-border bg-card text-foreground/80 hover:text-foreground')}
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

      <div className="mt-4 min-w-0">
        {chartVisible && (
          <div className={cn(panelClass, 'px-4 py-4 sm:px-5')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-[16px] font-semibold leading-snug">{model?.window ? `${model.window.definitions.primaryLabel} and ${model.window.definitions.secondaryLabel}` : 'Production and collections'}</h2>
              {model && <span className="text-[13px] text-muted-foreground">{model.period.rangeLabel}</span>}
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
      </div>

      {supporting && data && model && <div className="mt-4">{supporting(model.period, data)}</div>}
    </section>
  );
}
