import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, Users } from 'lucide-react';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { daysUntil, shortDate, useNextTeamMeeting } from '@/hooks/useOfficeEvents';
import { useWhosOutToday } from '@/hooks/useWhosOut';
import { getToday, formatDate } from '@/lib/time-utils';
import { OrgSnapshotPanel } from '@/components/OrgSnapshotPanel';

/** Today at the office: who's out, what's closed, when we next meet. */
export default function TodayAtOffice({ isManager }: { isManager: boolean }) {
  const today = getToday();
  const year = Number(today.slice(0, 4));
  const { data: closures } = useOfficeClosures(year);
  const meeting = useNextTeamMeeting();
  const { data: out } = useWhosOutToday();

  const upcoming = (closures ?? [])
    .filter(c => c.closure_date >= today)
    .slice(0, 2);
  const until = meeting ? daysUntil(meeting.event_date) : null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Today at the office
      </h2>

      {isManager && <OrgSnapshotPanel />}

      <Card className="card-elevated">
        <CardContent className="p-4 space-y-2.5 text-sm">
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p>
              {out?.length
                ? <>Out today: <span className="font-medium">{out.join(', ')}</span></>
                : 'Nobody is out today.'}
            </p>
          </div>

          <div className="flex items-start gap-2">
            <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p>
              {upcoming.length
                ? upcoming
                    .map(c => `${c.name} — ${formatDate(c.closure_date)}`)
                    .join(' · ')
                : 'No closures coming up.'}
            </p>
          </div>

          {meeting && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
              Next team meeting: {shortDate(meeting.event_date)}
              {until === 0 ? ' · today' : until === 1 ? ' · tomorrow' : ` · in ${until} days`}
            </span>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
