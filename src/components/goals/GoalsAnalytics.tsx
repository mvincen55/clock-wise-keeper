import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Flame, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useGoalAnalytics } from '@/hooks/useGoalAnalytics';
import { useMomentum } from '@/hooks/useMomentum';

/** One number with a caption — the whole dashboard is built from these. */
function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <p className="font-mono text-2xl font-semibold text-primary">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * My goal progress over time: how much of what I planned actually got done,
 * whether I kept checking in, and which way the last few months are pointing.
 * Private to me — it never compares me to anyone else.
 */
export default function GoalsAnalytics() {
  const { data, isLoading } = useGoalAnalytics();
  const { data: momentum } = useMomentum();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  if (data.totalGoals === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">My progress over time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once you've set and worked a goal or two, your completion rate, streak and trend show up
            here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const TrendIcon =
    data.trend === 'up' ? TrendingUp : data.trend === 'down' ? TrendingDown : Minus;

  const chartData = data.months.map(m => ({
    name: m.short,
    done: m.tasksDone,
    remaining: Math.max(0, m.tasks - m.tasksDone),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">My progress over time</CardTitle>
        <p className="text-sm text-muted-foreground">
          The last {data.months.length} months, counted from what you actually finished.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            value={data.completionRate === null ? '—' : `${data.completionRate}%`}
            label="Goals finished"
            hint={`${data.goalsCompleted} of ${data.totalGoals} goals set`}
          />
          <Stat
            value={data.taskRate === null ? '—' : `${data.taskRate}%`}
            label="Steps done"
            hint={`${data.tasksDone} of ${data.totalTasks} steps`}
          />
          <Stat
            value={`${data.checkInStreak} mo`}
            label="Check-in streak"
            hint={`Best run: ${data.bestCheckInStreak} months`}
          />
          <Stat
            value={`${momentum?.streak ?? 0} d`}
            label="Daily streak"
            hint={`Best: ${momentum?.bestStreak ?? 0} days${momentum?.pausedToday ? ' · paused today' : ''}`}
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
          <TrendIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm">{data.trendNote}</p>
        </div>

        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                fontSize={12}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="done"
                name="Steps done"
                stackId="s"
                fill="hsl(var(--primary))"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="remaining"
                name="Still open"
                stackId="s"
                fill="hsl(var(--muted))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-1">
          {data.months
            .filter(m => m.goals > 0)
            .map(m => (
              <div
                key={m.month}
                className="flex items-center justify-between gap-3 border-b border-border/40 py-1 text-sm last:border-0"
              >
                <span className="min-w-0 truncate">{m.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  {m.taskRate === null ? 'no steps planned' : `${m.taskRate}% of steps`}
                  {m.updates > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-primary">
                      <Flame className="h-3 w-3" />
                      {m.updates}
                    </span>
                  )}
                </span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
