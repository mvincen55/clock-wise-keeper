import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from '@/lib/owner-pulse';
import { PACE_BASIS_LABEL, type GoalMeter } from '@/lib/goal-progress';
import { MicroLabel, StatusDot } from '../kit';
import type { Tone } from '../types';

/**
 * Production and collections against their OWN configured monthly targets:
 * achieved, remaining, percentage, and the calendar-day pace marker. An
 * unset goal reads "No goal set" with the setup action for people who can
 * set one. Over-goal results stay over.
 */
export const GOAL_SETUP_HREF = '/management/office/settings#office-goals';

function meterTone(m: GoalMeter): { tone: Tone; label: string } {
  if (m.state === 'no_goal') return { tone: 'calm', label: 'No goal set' };
  if (m.state === 'no_data') return { tone: 'calm', label: 'Nothing recorded yet' };
  if (m.overCents) return { tone: 'steady', label: 'Goal reached' };
  if (!m.pace) return { tone: 'calm', label: 'No pace yet' };
  return m.pace.status === 'behind'
    ? { tone: 'attention', label: 'Behind calendar pace' }
    : m.pace.status === 'ahead'
      ? { tone: 'steady', label: 'Ahead of calendar pace' }
      : { tone: 'steady', label: 'On calendar pace' };
}

export function GoalMeterRow({ meter, canSetGoals }: { meter: GoalMeter; canSetGoals: boolean }) {
  const { tone, label } = meterTone(meter);
  const pct = meter.pct ?? 0;
  const fill = Math.min(1, pct) * 100;
  const expected = meter.expectedToDateCents !== null && meter.targetCents > 0 ? Math.min(1, meter.expectedToDateCents / meter.targetCents) * 100 : null;
  return (
    <div className="border-b border-border py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <MicroLabel className="text-foreground/80">{meter.label} · {meter.monthLabel.split(' ')[0]}</MicroLabel>
        {/* The big line already says "No goal set" / "Nothing recorded yet"; the chip carries only a pace verdict. */}
        {meter.state === 'progress' && (
          <span className={cn('inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]', tone === 'attention' ? 'text-warning' : tone === 'steady' ? 'text-success' : 'text-muted-foreground')}>
            <StatusDot tone={tone} />{label}
          </span>
        )}
      </div>

      {meter.state === 'progress' && meter.achievedCents !== null ? (
        <>
          <p className="mt-2 font-display text-[1.55rem] font-extrabold leading-none tracking-[-0.02em]">
            {money(meter.achievedCents)}
            <span className="text-[0.95rem] font-semibold text-muted-foreground"> of {money(meter.targetCents)}</span>
          </p>
          <div
            className="relative mt-2.5 h-2 w-full overflow-visible rounded-full bg-primary/15"
            role="meter"
            aria-label={`${meter.label} ${Math.round(pct * 100)}% of the ${money(meter.targetCents)} goal`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct * 100)}
          >
            <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'attention' ? 'bg-warning' : 'bg-primary')} style={{ width: `${fill}%` }} />
            {expected !== null && !meter.overCents && (
              <span
                aria-hidden
                title="Expected by now, calendar-day pace"
                className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground/70"
                style={{ left: `calc(${expected}% - 1px)` }}
              />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
            <span>{Math.round(pct * 100)}% · {meter.overCents ? `${money(meter.overCents)} over` : `${money(meter.remainingCents ?? 0)} remaining`}</span>
            {meter.expectedToDateCents !== null && !meter.overCents && <span>Expected by now {money(meter.expectedToDateCents)}</span>}
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">{meter.detail}</p>
        </>
      ) : meter.state === 'no_data' ? (
        <>
          <p className="mt-2 font-display text-[1.2rem] font-bold leading-none text-muted-foreground">Nothing recorded yet</p>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">{meter.detail}</p>
        </>
      ) : (
        <>
          <p className="mt-2 font-display text-[1.2rem] font-bold leading-none text-muted-foreground">No goal set</p>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">{meter.detail}</p>
          {canSetGoals ? (
            <Link to={GOAL_SETUP_HREF} className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary hover:underline">
              Set a {meter.label.toLowerCase()} goal<ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : (
            <p className="mt-1 text-[11.5px] text-muted-foreground">An owner or manager can set one in Office settings.</p>
          )}
        </>
      )}
    </div>
  );
}

export function GoalMeters({ meters, canSetGoals, loading }: { meters: GoalMeter[] | null; canSetGoals: boolean; loading?: boolean }) {
  if (loading || !meters) {
    return <p className="border-b border-border py-4 text-[13px] text-muted-foreground">Reading this month…</p>;
  }
  return (
    <div>
      {meters.map(m => <GoalMeterRow key={m.id} meter={m} canSetGoals={canSetGoals} />)}
      <p className="pt-2 text-[11px] leading-snug text-muted-foreground">{PACE_BASIS_LABEL}</p>
    </div>
  );
}
