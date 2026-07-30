import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SmartCheck } from '@/lib/smart';

/** Back-compat shape returned by Pathfinder's polish_goal. */
export type SmartRead = {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  time_bound: string;
};

/**
 * Live SMART read-out. Passing elements go solid with a tick; the ones still
 * missing show a plain hint. Never red, never scolding — just the next nudge.
 */
export default function SmartChips({ checks }: { checks: SmartCheck[] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {checks.map(c => (
          <span
            key={c.key}
            title={`${c.label} — ${c.note}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
              c.ok
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-dashed border-border bg-muted/30 text-muted-foreground'
            )}
          >
            {c.ok && <Check className="h-3 w-3" />}
            <span className="font-semibold">{c.letter}</span>
            <span className="hidden sm:inline">{c.label}</span>
          </span>
        ))}
      </div>
      {checks
        .filter(c => !c.ok)
        .slice(0, 2)
        .map(c => (
          <p key={c.key} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{c.label}:</span> {c.note}
          </p>
        ))}
    </div>
  );
}
