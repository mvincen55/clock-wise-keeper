import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Flame, Pause, Trophy, Sparkles, GraduationCap, Banknote } from 'lucide-react';
import { WaxSealMark } from '@/components/WaxSeal';
import CountUp from '@/components/ui/count-up';
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

  // Forward framing only — never a comparison with anyone else.
  const toBest = data.bestModuleMonth - data.modulesThisMonth;
  const trainingLine =
    data.modulesThisMonth === 0
      ? 'No modules finished yet this month'
      : toBest > 0
        ? `${toBest} away from your best month`
        : 'Your best month yet';

  return (
    <Card className="paper-surface">
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

        {/* Training momentum — a personal count, moving forward. */}
        <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
          <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              <CountUp value={data.modulesThisMonth} /> module
              {data.modulesThisMonth === 1 ? '' : 's'} completed this month
            </p>
            <p className="text-xs text-muted-foreground">{trainingLine}</p>
          </div>
        </div>

        {/* Deposit close-out streak — only for whoever runs the log. */}
        {data.runsDepositLog && (
          <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-3">
            <Banknote className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                <CountUp value={data.depositStreak} /> business day
                {data.depositStreak === 1 ? '' : 's'} closing out the deposit log
              </p>
              <p className="text-xs text-muted-foreground">
                Best {data.depositBestStreak} · closures and time off pause it
              </p>
            </div>
          </div>
        )}

        {/* Milestone seals — private to this view, earned from system records. */}
        <div className="flex flex-wrap gap-3">
          {(earned.length ? earned : data.badges).map((b) => (
            <span
              key={b.id}
              title={b.detail}
              className={cn(
                'inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs',
                b.earned
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground opacity-60 grayscale'
              )}
            >
              <WaxSealMark size={22} label="" />
              {b.label}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Private to you. Earned from system records — never from anything typed in.
        </p>
      </CardContent>
    </Card>
  );
}
