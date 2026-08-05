import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { WEEKDAY_FULL, type WeekdaySchedule } from '@/lib/invite-details';

type Props = {
  value: WeekdaySchedule[];
  onChange: (next: WeekdaySchedule[]) => void;
};

/**
 * Compact seven-row weekly schedule editor: toggle each weekday on/off and set
 * its start/end time. Used when inviting a team member so their schedule is set
 * from day one.
 */
export default function WeeklyScheduleEditor({ value, onChange }: Props) {
  const update = (weekday: number, patch: Partial<WeekdaySchedule>) => {
    onChange(value.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  };

  return (
    <div className="space-y-1.5">
      {value.map((day) => (
        <div
          key={day.weekday}
          className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5"
        >
          <div className="flex items-center gap-2 w-24 shrink-0">
            <Switch
              checked={day.enabled}
              onCheckedChange={(checked) => update(day.weekday, { enabled: checked })}
              aria-label={`${WEEKDAY_FULL[day.weekday]} enabled`}
            />
            <span className={`text-sm ${day.enabled ? 'font-medium' : 'text-muted-foreground'}`}>
              {WEEKDAY_FULL[day.weekday].slice(0, 3)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <Input
              type="time"
              value={day.start_time}
              disabled={!day.enabled}
              onChange={(e) => update(day.weekday, { start_time: e.target.value })}
              className="h-8 text-xs"
              aria-label={`${WEEKDAY_FULL[day.weekday]} start time`}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="time"
              value={day.end_time}
              disabled={!day.enabled}
              onChange={(e) => update(day.weekday, { end_time: e.target.value })}
              className="h-8 text-xs"
              aria-label={`${WEEKDAY_FULL[day.weekday]} end time`}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Sets their expected hours for attendance and PTO. You can fine-tune it later on the Team page.
      </p>
    </div>
  );
}
