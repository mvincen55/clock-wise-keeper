import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Flame, Pause, Award, Trophy, Sparkles } from 'lucide-react';
import { useMomentum, type StreakDay } from '@/hooks/useMomentum';
import { cn } from '@/lib/utils';

const DOT: Record<StreakDay['state'], string> = {
  complete: 'bg-primary',
  paused: 'bg-muted-foreground/30',
  missed: 'bg-muted',
  pending: 'bg-primary/30 border border-primary/50',
};

const DOT_LABEL: Record<StreakDay['state'], string> = {
  complete: 'Checklist done',
  paused: 'Paused — day off, closure or not scheduled',
  missed: 'Checklist not finished',
  pending: 'Still open today',
};

export default function MyMomentumCard() {
  const { data, isLoading } = useMomentum();

  if (isLoading || !data) return null;
  if (data.dailyItemCount === 0 && data.streak === 0 && data.goalsCompleted === 0) return null;

  const earned = data.badges.filter((b) => b.earned);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          My Momentum
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full bg-primary/10">
            <Flame className="h-4 w-4 text-primary" />
            <span className="font-mono text-lg font-semibold leading-none text-primary">
              {data.streak}
            </span>
          </div>
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {data.streak > 0 ? `${data.streak}-day checklist streak` : 'Start your streak today'}
            </p>
            <p className="text-muted-foreground text-xs">
              Best {data.bestStreak} · time off and closures pause it, never break it
            </p>
            {data.pausedToday && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Pause className="h-3 w-3" /> Paused today — enjoy it
              </p>
            )}
          </div>
        </div>

        <TooltipProvider>
          <div className="flex items-center gap-1.5">
            {data.days.map((d) => (
              <Tooltip key={d.date}>
                <TooltipTrigger asChild>
                  <span className={cn('h-3 w-3 rounded-full', DOT[d.state])} />
                </TooltipTrigger>
                <TooltipContent>
                  {d.date} — {DOT_LABEL[d.state]}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {data.latestGoalTitle && (
          <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3 text-sm">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-medium">Goal completed</p>
              <p className="truncate text-xs text-muted-foreground">{data.latestGoalTitle}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(earned.length ? earned : data.badges).map((b) => (
            <span
              key={b.id}
              title={b.detail}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs',
                b.earned
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground opacity-70'
              )}
            >
              <Award className="h-3 w-3" />
              {b.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
