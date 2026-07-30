import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, Loader2 } from 'lucide-react';
import { useHuddleContext } from '@/hooks/useOfficeInsights';
import { formatCents } from '@/lib/money';

/**
 * "Office context" — the computed block above the verbal huddle agenda.
 *
 * Business data only: who's out, yesterday's vitals, closures and team
 * meetings this week. Nothing patient-related is read or displayed here;
 * that conversation stays in the room, exactly as before.
 */
export default function HuddleContextBlock() {
  const { data, isLoading } = useHuddleContext();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading today's office context…
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const rows: { label: string; value: string }[] = [
    {
      label: 'Out today',
      value: data.out_today.length ? data.out_today.join(', ') : 'Nobody — full team in',
    },
    {
      label: 'Scheduled today',
      value: `${data.scheduled_today} of ${data.team_count}`,
    },
    {
      label: 'Yesterday',
      value: data.yesterday
        ? `${formatCents(data.yesterday.production_cents)} produced · ${formatCents(
            data.yesterday.collected_cents
          )} collected · ${data.yesterday.cancellations} cancels, ${data.yesterday.no_shows} no-shows`
        : 'No deposit log closed out',
    },
    {
      label: 'Closures this week',
      value: data.closures_this_week.length
        ? data.closures_this_week.map(c => `${c.date} ${c.name}`).join(' · ')
        : 'None',
    },
    {
      label: 'Next team meeting',
      value: data.next_meeting
        ? `${data.next_meeting.date} — ${
            data.next_meeting.days_away === 0
              ? 'today'
              : `${data.next_meeting.days_away} day${data.next_meeting.days_away === 1 ? '' : 's'} away`
          }`
        : 'Not on the calendar',
    },
    {
      label: 'Collections',
      value: data.collections_target_cents
        ? `${formatCents(data.collections_mtd_cents)} of ${formatCents(
            data.collections_target_cents
          )} · ${data.month_elapsed_pct}% of the month elapsed`
        : `${formatCents(data.collections_mtd_cents)} month to date`,
    },
  ];

  return (
    <Card className="paper-surface border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Office context
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.label} className="text-sm">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</dt>
              <dd className="font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
