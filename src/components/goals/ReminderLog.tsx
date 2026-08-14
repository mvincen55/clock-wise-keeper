import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { History, Loader2 } from 'lucide-react';
import { hourLabel } from '@/hooks/useReminderPrefs';
import { useReminderLog, type ReminderLogRow } from '@/hooks/useReminderLog';

function prettyDay(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${iso}T12:00:00Z`));
}

function outcomeBadge(outcome: string) {
  if (outcome === 'sent') return <Badge variant="default">Sent</Badge>;
  if (outcome === 'failed') return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="secondary">Skipped</Badge>;
}

function groupByDay(rows: ReminderLogRow[]) {
  const map = new Map<string, ReminderLogRow[]>();
  for (const r of rows) {
    const list = map.get(r.run_date) ?? [];
    list.push(r);
    map.set(r.run_date, list);
  }
  return [...map.entries()];
}

/** Plain-English record of what the reminder job did, and what it passed over. */
export default function ReminderLog() {
  const { data, isLoading } = useReminderLog();
  const days = groupByDay(data ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Reminder history
        </CardTitle>
        <CardDescription>
          Every step the reminder job looked at, day by day — what went out, and why anything was
          passed over.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : days.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Nothing logged in the last two weeks. Entries appear after the next reminder run.
          </p>
        ) : (
          <div className="max-h-[26rem] overflow-y-auto overscroll-contain pr-3">
            <div className="space-y-5">
              {days.map(([day, rows]) => (
                <div key={day} className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-medium">{prettyDay(day)}</h3>
                    <span className="text-xs text-muted-foreground">
                      {rows.filter(r => r.outcome === 'sent').length} sent ·{' '}
                      {rows.filter(r => r.outcome !== 'sent').length} skipped
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {rows.map(r => (
                      <li key={r.id} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{r.item_title ?? 'Goal step'}</span>
                          {outcomeBadge(r.outcome)}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.reason ?? '—'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Checked at {hourLabel(r.run_hour)} Eastern
                          {r.due_date ? ` · due ${prettyDay(r.due_date)}` : ''}
                          {r.channel ? ` · ${r.channel.replace('_', '-')}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
