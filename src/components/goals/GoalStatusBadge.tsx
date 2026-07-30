import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { UPDATE_STATUS_LABELS, type UpdateStatus } from '@/hooks/useGoals';

/** One status color language everywhere: on track green, at risk amber, done purple. */
const STYLES: Record<UpdateStatus, string> = {
  on_track: 'border-[hsl(var(--goal-green))]/40 bg-[hsl(var(--goal-green))]/10 text-[hsl(var(--goal-green))]',
  at_risk: 'border-[hsl(var(--goal-amber))]/40 bg-[hsl(var(--goal-amber))]/10 text-[hsl(var(--goal-amber))]',
  done: 'border-[hsl(var(--goal-purple))]/40 bg-[hsl(var(--goal-purple))]/10 text-[hsl(var(--goal-purple))]',
};

export default function GoalStatusBadge({
  status,
  className,
}: {
  status: UpdateStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('font-medium', STYLES[status], className)}>
      {UPDATE_STATUS_LABELS[status]}
    </Badge>
  );
}
