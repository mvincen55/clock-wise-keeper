import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getToday } from '@/lib/time-utils';
import {
  shortDate,
  useDeleteOfficeEvent,
  useOfficeEvents,
  useSaveOfficeEvent,
} from '@/hooks/useOfficeEvents';

/**
 * Team meetings on the office calendar. Goals plans are built around the next
 * one, so marking them here is what makes Pathfinder meeting-aware.
 */
export default function TeamMeetingsCard({ isManager }: { isManager: boolean }) {
  const { data: events } = useOfficeEvents();
  const save = useSaveOfficeEvent();
  const remove = useDeleteOfficeEvent();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('Team meeting');
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');

  const today = getToday();
  const meetings = (events ?? []).filter(
    e => e.category === 'team_meeting' && e.event_date >= today
  );

  const submit = async () => {
    if (!date) return;
    try {
      await save.mutateAsync({
        event_date: date,
        title: title.trim() || 'Team meeting',
        category: 'team_meeting',
        start_time: startTime || null,
        notes: notes.trim() || null,
      });
      setOpen(false);
      setDate('');
      setTitle('Team meeting');
      setStartTime('');
      setNotes('');
      toast.success('Team meeting added to the calendar.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the meeting');
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Team meetings
        </CardTitle>
        {isManager && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Add meeting
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {meetings.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center">
            <CalendarDays className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm font-medium">No meeting scheduled</p>
            <p className="text-xs text-muted-foreground">
              Goal plans aim at the next team meeting — add one so everyone can pace to it.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {meetings.map(m => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {shortDate(m.event_date)}
                    {m.start_time ? ` · ${m.start_time.slice(0, 5)}` : ''}
                    {m.notes ? ` · ${m.notes}` : ''}
                  </p>
                </div>
                {isManager && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.title}`}
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a team meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-time">Start time (optional)</Label>
              <Input
                id="meeting-time"
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
              />
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
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!date || save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add meeting
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
