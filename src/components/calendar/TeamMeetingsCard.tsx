import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarDays, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  meetingCountdownLabel,
  shortDate,
  useCreateOfficeEvent,
  useDeleteOfficeEvent,
  useOfficeEvents,
} from '@/hooks/useOfficeEvents';

/**
 * Team meetings on the office calendar. Goals pace themselves to the next one,
 * so scheduling it here is what makes Pathfinder meeting-aware.
 */
export default function TeamMeetingsCard({
  start,
  end,
  isManager,
  defaultDate,
}: {
  start: string;
  end: string;
  isManager: boolean;
  defaultDate: string;
}) {
  const { data: meetings } = useOfficeEvents(start, end, 'team_meeting');
  const create = useCreateOfficeEvent();
  const remove = useDeleteOfficeEvent();

  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('Team meeting');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!date) return;
    try {
      await create.mutateAsync({
        title: title.trim() || 'Team meeting',
        event_date: date,
        start_time: time || null,
        notes: notes.trim() || null,
        category: 'team_meeting',
      });
      setAdding(false);
      setTime('');
      setNotes('');
      setTitle('Team meeting');
      toast.success('Team meeting added to the calendar.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the meeting');
    }
  };

  const upcoming = (meetings ?? []).find(m => m.event_date >= defaultDate);

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Team meetings
        </CardTitle>
        {isManager && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {meetingCountdownLabel(upcoming?.event_date ?? null)}
        </p>

        {(meetings ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <Users className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">No team meetings this month</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Add one and everyone's goal plans will pace themselves toward it.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {(meetings ?? []).map(m => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="text-sm font-medium">{shortDate(m.event_date)}</span>
                  <span className="ml-2 text-sm">{m.title}</span>
                  {m.start_time && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.start_time.slice(0, 5)}
                    </span>
                  )}
                  {m.notes && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{m.notes}</span>
                  )}
                </span>
                {isManager && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove meeting"
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isManager && adding && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="meeting-date">Date</Label>
                <Input
                  id="meeting-date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-time">Time (optional)</Label>
                <Input
                  id="meeting-time"
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meeting-title">Title</Label>
                <Input
                  id="meeting-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-notes">Notes (optional)</Label>
              <Textarea
                id="meeting-notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submit} disabled={!date || create.isPending}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save meeting
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
