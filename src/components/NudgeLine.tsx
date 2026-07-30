import { Lightbulb, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useResolveNudge, type Nudge } from '@/hooks/useOfficeInsights';

/**
 * One nudge, rendered the same way everywhere: a calm line, the numbers it
 * cites underneath, and the two answers that teach the system — acted on,
 * or not for me.
 */
export default function NudgeLine({
  nudge,
  variant = 'card',
  className,
  onActed,
}: {
  nudge: Nudge;
  variant?: 'card' | 'inline';
  className?: string;
  onActed?: () => void;
}) {
  const resolve = useResolveNudge();

  const refs = Object.entries(nudge.data_refs ?? {})
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);

  return (
    <div
      className={cn(
        'flex gap-3',
        variant === 'card'
          ? 'rounded-lg border border-primary/30 bg-primary/5 p-3'
          : 'rounded-md border border-border/60 bg-muted/20 p-3',
        className
      )}
    >
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm leading-relaxed">{nudge.content}</p>
        {refs.length > 0 && (
          <p className="text-[11px] text-muted-foreground">{refs.join(' · ')}</p>
        )}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={resolve.isPending}
            onClick={() => {
              resolve.mutate({ id: nudge.id, status: 'acted_on' });
              onActed?.();
            }}
          >
            <Check className="mr-1 h-3 w-3" />
            On it
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate({ id: nudge.id, status: 'dismissed' })}
          >
            <X className="mr-1 h-3 w-3" />
            Not for me
          </Button>
        </div>
      </div>
    </div>
  );
}
