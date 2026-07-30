import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, CircleDot, Lock, Sparkles, Target, XCircle } from 'lucide-react';
import type { RoleplayResult, RoleplayVerdict } from '@/hooks/useTraining';
import { cn } from '@/lib/utils';

const VERDICT: Record<RoleplayVerdict, { label: string; icon: typeof CheckCircle2; tone: string }> = {
  met: { label: 'Met', icon: CheckCircle2, tone: 'text-primary' },
  partial: { label: 'Partly there', icon: CircleDot, tone: 'text-warning' },
  missed: { label: 'Missed', icon: XCircle, tone: 'text-destructive' },
};

/**
 * The debrief a trainee sees after a roleplay: score against the pass mark and
 * every rubric line with what it was worth, what they earned, and the one thing
 * to do differently. The transcript is deliberately never shown or quoted.
 */
export default function RoleplayRubricCard({ result }: { result: RoleplayResult }) {
  const passMark = result.pass_mark || 80;
  const gap = Math.max(0, passMark - result.score);

  // Where the points actually went — biggest recoverable loss first.
  const ranked = [...result.rubric].sort((a, b) => b.weight - b.earned - (a.weight - a.earned));

  return (
    <div className="space-y-4">
      <Card className={cn(result.passed ? 'border-primary/50 bg-primary/5' : 'border-warning/50')}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">
              {result.passed ? `Passed — ${result.score}%` : `${result.score}% — not quite yet`}
            </p>
            <span className="text-xs text-muted-foreground">{passMark}% to pass</span>
          </div>
          <Progress value={result.score} />
          {result.headline && <p className="text-sm text-muted-foreground">{result.headline}</p>}
          {!result.passed && (
            <p className="text-sm">
              <span className="font-medium">{gap} point{gap === 1 ? '' : 's'} from passing.</span>{' '}
              <span className="text-muted-foreground">{result.gap_to_pass}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            Your conversation isn't saved or shown — only this breakdown.
          </p>
        </CardContent>
      </Card>

      {(result.strength || result.focus) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {result.strength && (
            <Card>
              <CardContent className="flex gap-2.5 p-4">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-medium">Strongest move</p>
                  <p className="text-muted-foreground">{result.strength}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {result.focus && (
            <Card>
              <CardContent className="flex gap-2.5 p-4">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="text-sm">
                  <p className="font-medium">Focus next time</p>
                  <p className="text-muted-foreground">{result.focus}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Rubric, line by line</h3>
        {ranked.map((item, i) => {
          const v = VERDICT[item.verdict];
          const Icon = v.icon;
          const pct = item.weight > 0 ? Math.round((item.earned / item.weight) * 100) : 0;
          return (
            <Card key={i}>
              <CardContent className="space-y-2.5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', v.tone)} />
                    <p className="text-sm font-medium">{item.criterion}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.verdict === 'met' ? 'default' : 'outline'}>{v.label}</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {item.earned}/{item.weight} pts
                    </span>
                  </div>
                </div>
                <Progress value={pct} className="h-1.5" />
                {item.what_good_looks_like && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">What good looks like: </span>
                    {item.what_good_looks_like}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">{item.feedback}</p>
                {item.next_time && (
                  <p className="rounded-md bg-muted/50 p-2.5 text-sm">
                    <span className="font-medium">Next time: </span>
                    <span className="text-muted-foreground">{item.next_time}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Retakes are unlimited — the point is getting comfortable with the conversation.
      </p>
    </div>
  );
}
