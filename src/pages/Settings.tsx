import { useEffect, useState } from 'react';
import { useWorkSchedule, useInitSchedule, useUpdateScheduleDay, WEEKDAY_NAMES, WorkScheduleRow } from '@/hooks/useWorkSchedule';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Settings as SettingsIcon, Shield, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function ScheduleDayRow({ row, onUpdate }: { row: WorkScheduleRow; onUpdate: (id: string, updates: Partial<WorkScheduleRow>) => void }) {
  return (
    <div className={`flex flex-wrap items-center gap-4 px-4 py-3 ${!row.enabled ? 'opacity-50' : ''}`}>
      <div className="w-28 flex items-center gap-2">
        <Switch checked={row.enabled} onCheckedChange={v => onUpdate(row.id, { enabled: v })} />
        <span className="text-sm font-medium">{WEEKDAY_NAMES[row.weekday]}</span>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Start</Label>
        <Input
          type="time"
          value={row.start_time?.slice(0, 5)}
          onChange={e => onUpdate(row.id, { start_time: e.target.value })}
          disabled={!row.enabled}
          className="w-28 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">End</Label>
        <Input
          type="time"
          value={row.end_time?.slice(0, 5)}
          onChange={e => onUpdate(row.id, { end_time: e.target.value })}
          disabled={!row.enabled}
          className="w-28 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Grace (min)</Label>
        <Input
          type="number"
          min={0}
          value={row.grace_minutes}
          onChange={e => onUpdate(row.id, { grace_minutes: parseInt(e.target.value) || 0 })}
          disabled={!row.enabled}
          className="w-20 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Threshold (min)</Label>
        <Input
          type="number"
          min={1}
          value={row.threshold_minutes}
          onChange={e => onUpdate(row.id, { threshold_minutes: parseInt(e.target.value) || 1 })}
          disabled={!row.enabled}
          className="w-20 text-sm"
        />
      </div>
    </div>
  );
}

export default function Settings() {
  const { data: schedule, isLoading } = useWorkSchedule();
  const initSchedule = useInitSchedule();
  const updateDay = useUpdateScheduleDay();
  const { toast } = useToast();
  const { sessionTimeoutMinutes, setSessionTimeoutMinutes } = useAuth();
  const [applyToRemote, setApplyToRemote] = useState(false);

  useEffect(() => {
    if (schedule && schedule.length > 0) {
      setApplyToRemote(schedule[0]?.apply_to_remote || false);
    }
  }, [schedule]);

  const handleInit = async () => {
    try {
      await initSchedule.mutateAsync();
      toast({ title: 'Schedule initialized with defaults' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async (id: string, updates: Partial<WorkScheduleRow>) => {
    try {
      await updateDay.mutateAsync({ id, updates });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleRemote = async (checked: boolean) => {
    setApplyToRemote(checked);
    if (schedule) {
      for (const row of schedule) {
        await updateDay.mutateAsync({ id: row.id, updates: { apply_to_remote: checked } });
      }
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your work schedule and tardy thresholds</p>
      </div>

      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Work Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !schedule?.length ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-muted-foreground">No schedule configured yet.</p>
              <Button onClick={handleInit} disabled={initSchedule.isPending}>
                {initSchedule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Initialize Default Schedule
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {schedule.map(row => (
                <ScheduleDayRow key={row.id} row={row} onUpdate={handleUpdate} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {schedule && schedule.length > 0 && (
        <Card className="card-elevated">
          <CardContent className="p-4 flex items-center gap-4">
            <Switch checked={applyToRemote} onCheckedChange={handleToggleRemote} />
            <div>
              <Label className="text-sm font-medium">Apply schedule to remote days</Label>
              <p className="text-xs text-muted-foreground">When off, schedule only applies to on-site days</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security & Privacy */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security &amp; Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <Timer className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <Label className="text-sm font-medium">Auto-Logout Timeout</Label>
              <p className="text-xs text-muted-foreground">Minutes of inactivity before automatic sign out (0 = disabled)</p>
            </div>
            <Input
              type="number"
              min={0}
              max={480}
              value={sessionTimeoutMinutes}
              onChange={e => setSessionTimeoutMinutes(parseInt(e.target.value) || 0)}
              className="w-24 text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
