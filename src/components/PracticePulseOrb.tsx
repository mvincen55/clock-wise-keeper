import { Eye } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { pulseSignals, type PulseSignalsInput } from '@/lib/pulse-signals';
import type { PulseState } from '@/lib/practice-pulse';
import { cn } from '@/lib/utils';

const TONE: Record<PulseState, string> = {
  strong: 'bg-primary',
  steady: 'bg-primary/70',
  watch: 'bg-amber-500',
  quiet: 'bg-muted-foreground/50',
};

/**
 * The Practice Pulse orb: a quiet breathing dot, plus an eye that opens the
 * receipts. Hover (or focus/tap) the eye to see every recorded signal that
 * produced the current state — no black box.
 */
export default function PracticePulseOrb({ input }: { input: PulseSignalsInput }) {
  const reduced = useReducedMotion();
  const { pulse, signals, thin } = pulseSignals(input);

  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn('inline-block h-2.5 w-2.5 rounded-full', TONE[pulse.state])}
        style={
          reduced
            ? undefined
            : { animation: `pulse ${pulse.breathSeconds}s cubic-bezier(0.4, 0, 0.6, 1) infinite` }
        }
      />
      <span className="text-xs font-normal text-muted-foreground">{pulse.label}</span>

      <HoverCard openDelay={80} closeDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label="Why the pulse looks this way"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-80 p-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Pulse signals</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{pulse.detail}</p>
          </div>

          {thin ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">
              Nothing recorded yet this month or last — the orb stays quiet until the deposit log
              has days closed out.
            </p>
          ) : (
            <dl className="max-h-72 space-y-2.5 overflow-y-auto px-4 py-3">
              {signals.map(s => (
                <div key={s.label} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">{s.label}</dt>
                    <dd className="text-xs font-medium tabular-nums">{s.value}</dd>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground/80">{s.source}</p>
                </div>
              ))}
            </dl>
          )}

          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            Rules: below 90% of pace or disruptions above 125% of usual → worth a look; 105% or
            better → running strong.
          </p>
        </HoverCardContent>
      </HoverCard>
    </span>
  );
}
