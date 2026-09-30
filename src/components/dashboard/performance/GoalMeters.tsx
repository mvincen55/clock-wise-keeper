import { cn } from '@/lib/utils';
import { money } from '@/lib/owner-pulse';
import { paceBasisLabel, type GoalMeter } from '@/lib/goal-progress';
import { paceBasisClause } from '@/lib/metric-pace';
import { ActionLink, Chip, InfoList, InfoPopover, LoadingLines, StatusDot } from '../kit';
import type { Tone } from '../types';

/**
 * Production and collections against their OWN configured monthly targets:
 * achieved, remaining, percentage, and the expected-by-now marker on the
 * office-day basis. A partial month shows its totals with a partial-data
 * label and the way to complete the records — never a behind verdict. An
 * unset goal reads "No goal set" with the setup action for people who can
 * set one. Over-goal results stay over.
 */
export const GOAL_SETUP_HREF = '/management/office/settings#office-goals';

function verdictTone(m: GoalMeter): Tone {
  switch (m.verdict) {
    case 'behind': return 'attention';
    case 'incomplete': return 'attention';
    case 'estimate': return 'calm';
    case 'reached': return 'steady';
    case 'ahead': return 'steady';
    case 'on_pace': return 'steady';
    default: return 'calm';
  }
}

/**
 * One meter. `stack` (default) is a ruled row in a list; `tile` is the
 * same meter as a card cell in the month row at the top of Home — no rule,
 * a smaller figure, the same bar, caption, and caveats.
 */
export function GoalMeterRow({ meter, canSetGoals, variant = 'stack' }: { meter: GoalMeter; canSetGoals: boolean; variant?: 'stack' | 'tile' }) {
  const tone = verdictTone(meter);
  const tile = variant === 'tile';
  const pct = meter.pct ?? 0;
  const fill = Math.min(1, pct) * 100;
  const expected = meter.expectedToDateCents !== null && meter.targetCents > 0 ? Math.min(1, meter.expectedToDateCents / meter.targetCents) * 100 : null;
  const barColor = meter.verdict === 'reached' ? 'bg-success' : meter.verdict === 'behind' ? 'bg-warning' : 'bg-primary';
  const info = [
    { label: 'Month', value: meter.monthLabel },
    { label: 'Goal', value: meter.targetCents > 0 ? money(meter.targetCents) : 'Not set' },
    { label: 'Recorded', value: `${meter.recordedDays} closed-out day${meter.recordedDays === 1 ? '' : 's'}` },
    { label: 'Expected by now', value: meter.expectedToDateCents !== null ? `${money(meter.expectedToDateCents)} · ${paceBasisClause(meter.basis)}` : '—' },
    { label: 'Completeness', value: meter.completeness === 'complete' ? 'All office days through the cutoff are recorded' : meter.completeness === 'partial' ? `${meter.missingDays} office day${meter.missingDays === 1 ? '' : 's'} not recorded` : 'Unknown — office calendar unavailable' },
    { label: 'Basis', value: meter.basis.kind === 'office_days' ? 'Office days from the office calendar' : 'Calendar days (estimate)' },
  ];

  return (
    <div className={tile ? 'min-w-0' : 'border-b border-border py-4 first:pt-1 last:border-b-0'}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2">
          <p className={tile ? 'text-[13px] font-semibold text-muted-foreground' : 'text-[15px] font-semibold'}>{meter.label}</p>
          <InfoPopover label={`About the ${meter.label.toLowerCase()} goal`}>
            <p className="mb-2 text-[14px] font-semibold text-foreground">{meter.label} · {meter.monthLabel}</p>
            <InfoList rows={info} />
          </InfoPopover>
        </div>
        {meter.state === 'progress' && meter.verdict && (
          <Chip tone={tone}>
            <StatusDot tone={tone} />
            {meter.verdictLabel}
          </Chip>
        )}
      </div>

      {meter.state === 'progress' && meter.achievedCents !== null ? (
        <>
          <p className={cn('mt-2 font-display font-bold leading-none tabular-nums tracking-[-0.02em]', tile ? 'text-[1.4rem]' : 'text-[1.65rem]')}>
            {money(meter.achievedCents)}
            <span className={cn('ml-1.5 font-semibold text-muted-foreground', tile ? 'text-[0.9rem]' : 'text-[0.95rem]')}>of {money(meter.targetCents)}</span>
          </p>
          <div
            className="relative mt-3 h-2.5 w-full rounded-full bg-muted"
            role="meter"
            aria-label={`${meter.label} ${Math.round(pct * 100)}% of the ${money(meter.targetCents)} goal`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
          >
            <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', barColor)} style={{ width: `${fill}%` }} />
            {expected !== null && !meter.overCents && (
              <span
                aria-hidden
                title={`Expected by now, ${paceBasisClause(meter.basis)}`}
                className="absolute -top-1 h-[1.125rem] w-0.5 rounded-full bg-foreground/60"
                style={{ left: `calc(${expected}% - 1px)` }}
              />
            )}
          </div>
          <div className={cn('mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground', tile && 'hidden [@container(min-width:40rem)]:flex')}>
            <span>{Math.round(pct * 100)}% · {meter.overCents ? `${money(meter.overCents)} over` : `${money(meter.remainingCents ?? 0)} to go`}</span>
            {meter.expectedToDateCents !== null && !meter.overCents && <span>Expected by now {money(meter.expectedToDateCents)}</span>}
          </div>
          <p className={cn('mt-1.5 text-[13px] leading-snug text-muted-foreground', tile && 'hidden [@container(min-width:40rem)]:block')}>{meter.detail}</p>
          {meter.verdict === 'incomplete' && (
            <ActionLink to="/deposit-log" variant="text" size="sm" className="mt-1.5">Complete the records</ActionLink>
          )}
        </>
      ) : meter.state === 'no_data' ? (
        <>
          <p className={cn('mt-2 font-semibold leading-none text-muted-foreground', tile ? 'text-[1.05rem]' : 'text-[1.2rem]')}>Nothing recorded yet</p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{meter.detail}</p>
        </>
      ) : (
        <>
          <p className={cn('mt-2 font-semibold leading-none text-muted-foreground', tile ? 'text-[1.05rem]' : 'text-[1.2rem]')}>No goal set</p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{meter.detail}</p>
          {canSetGoals ? (
            <ActionLink to={GOAL_SETUP_HREF} variant="text" size="sm" className="mt-1.5">Set a {meter.label.toLowerCase()} goal</ActionLink>
          ) : (
            <p className="mt-1 text-[13px] text-muted-foreground">An owner or manager can set one in Office settings.</p>
          )}
        </>
      )}
    </div>
  );
}

export function GoalMeters({ meters, canSetGoals, loading }: { meters: GoalMeter[] | null; canSetGoals: boolean; loading?: boolean }) {
  if (loading || !meters) return <LoadingLines label="Reading this month…" />;
  const basis = meters[0]?.basis;
  return (
    <div>
      {meters.map(m => <GoalMeterRow key={m.id} meter={m} canSetGoals={canSetGoals} />)}
      {basis && (
        <details className="pt-3">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">How pace is calculated</summary>
          <p className="pt-1.5 text-[13px] leading-snug text-muted-foreground">{paceBasisLabel(basis)}</p>
        </details>
      )}
    </div>
  );
}
