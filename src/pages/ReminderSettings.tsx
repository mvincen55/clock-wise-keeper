import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  CHANNEL_LABELS,
  DEFAULT_REMINDER_PREFS,
  hourLabel,
  useReminderPrefs,
  useSaveReminderPrefs,
  type ReminderChannel,
  type ReminderPrefs,
} from '@/hooks/useReminderPrefs';
import ReminderLog from '@/components/goals/ReminderLog';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function ReminderSettings() {
  const { data, isLoading } = useReminderPrefs();
  const save = useSaveReminderPrefs();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_REMINDER_PREFS);

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  const dirty =
    !!data &&
    (data.enabled !== prefs.enabled ||
      data.reminder_hour !== prefs.reminder_hour ||
      data.channel !== prefs.channel);

  const onSave = async () => {
    try {
      await save.mutateAsync(prefs);
      toast.success('Reminder settings saved');
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/goals">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Goals
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Reminder settings</h1>
          <p className="text-sm text-muted-foreground">
            Choose when goal step due notices arrive and where they land. Only you see this.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Goal step due notices
          </CardTitle>
          <CardDescription>
            Sent one day before a step is due, on the due date, and every third day while it stays
            open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="reminders-on">Send me due notices</Label>
              <p className="text-sm text-muted-foreground">
                Turn this off and your steps stay quiet.
              </p>
            </div>
            <Switch
              id="reminders-on"
              checked={prefs.enabled}
              onCheckedChange={v => setPrefs(p => ({ ...p, enabled: v }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-hour">Time of day (Eastern)</Label>
            <Select
              value={String(prefs.reminder_hour)}
              onValueChange={v => setPrefs(p => ({ ...p, reminder_hour: Number(v) }))}
              disabled={!prefs.enabled}
            >
              <SelectTrigger id="reminder-hour">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map(h => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Notices go out at the top of the hour you pick.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-channel">Where they arrive</Label>
            <Select
              value={prefs.channel}
              onValueChange={v => setPrefs(p => ({ ...p, channel: v as ReminderChannel }))}
              disabled={!prefs.enabled}
            >
              <SelectTrigger id="reminder-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CHANNEL_LABELS) as ReminderChannel[]).map(c => (
                  <SelectItem key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Email goes to the address on your account.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={!dirty || isLoading || save.isPending || !save.isReady}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <ReminderLog />
    </div>
  );
}
