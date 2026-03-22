import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayOffRow } from '@/hooks/useDaysOff';
import { OfficeClosureRow } from '@/hooks/useOfficeClosures';
import { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';

const eventColors: Record<string, string> = {
  day_off: 'bg-primary/20 text-primary border-primary/30',
  absent: 'bg-destructive/20 text-destructive border-destructive/30',
  late: 'bg-warning/20 text-warning border-warning/30',
  incomplete: 'bg-warning/20 text-warning border-warning/30',
  closure: 'bg-muted text-muted-foreground border-muted-foreground/30',
  ok: 'bg-success/20 text-success border-success/30',
  early: 'bg-accent/20 text-accent-foreground border-accent/30',
};

type CalendarEvent = {
  label: string;
  colorKey: string;
  tooltip?: string;
};

interface PersonalCalendarProps {
  daysOff: DayOffRow[];
  closures: OfficeClosureRow[];
  statusRows: AttendanceDayStatusRow[];
}

export default function PersonalCalendar({ daysOff, closures, statusRows }: PersonalCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const addEvent = (date: string, event: CalendarEvent) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(event);
    };

    // Days off
    (daysOff || []).forEach(d => {
      const typeLabel = d.type === 'scheduled_with_notice' ? 'Day Off' :
        d.type === 'unscheduled' ? 'Absent' :
        d.type === 'medical_leave' ? 'Medical' :
        d.type === 'office_closed' ? 'Closed' : 'Other';
      const colorKey = d.type === 'unscheduled' ? 'absent' : d.type === 'office_closed' ? 'closure' : 'day_off';
      
      const start = new Date(d.date_start + 'T00:00:00');
      const end = new Date(d.date_end + 'T00:00:00');
      for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        addEvent(cur.toISOString().split('T')[0], { label: typeLabel, colorKey, tooltip: d.notes || undefined });
      }
    });

    // Closures
    (closures || []).forEach(c => {
      addEvent(c.closure_date, { label: c.name, colorKey: 'closure' });
    });

    // Attendance status - tardies, early leaves, patterns
    (statusRows || []).forEach(r => {
      if (r.is_late && r.minutes_late) {
        addEvent(r.entry_date, { label: `${r.minutes_late}m late`, colorKey: 'late', tooltip: `Arrived ${r.minutes_late} minutes late` });
      }
      if (r.is_incomplete && r.has_punches) {
        addEvent(r.entry_date, { label: 'Left early', colorKey: 'early', tooltip: 'Incomplete punch pair - possible early leave' });
      }
    });

    return map;
  }, [daysOff, closures, statusRows]);

  // Calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Count patterns
  const patternSummary = useMemo(() => {
    const monthEvents = Array.from(eventsMap.entries())
      .filter(([date]) => date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
    
    let lateCount = 0;
    let earlyCount = 0;
    let absentCount = 0;
    let totalLateMinutes = 0;

    monthEvents.forEach(([, events]) => {
      events.forEach(e => {
        if (e.colorKey === 'late') { lateCount++; const m = parseInt(e.label); if (!isNaN(m)) totalLateMinutes += m; }
        if (e.colorKey === 'early') earlyCount++;
        if (e.colorKey === 'absent') absentCount++;
      });
    });

    return { lateCount, earlyCount, absentCount, totalLateMinutes };
  }, [eventsMap, year, month]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold min-w-[180px] text-center">
          {monthNames[month]} {year}
        </h3>
        <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={today} className="text-xs ml-2">Today</Button>
      </div>

      {/* Monthly Pattern Summary */}
      {(patternSummary.lateCount > 0 || patternSummary.earlyCount > 0 || patternSummary.absentCount > 0) && (
        <div className="flex flex-wrap gap-3">
          {patternSummary.lateCount > 0 && (
            <div className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium">
              Late {patternSummary.lateCount}× ({patternSummary.totalLateMinutes}m total)
            </div>
          )}
          {patternSummary.earlyCount > 0 && (
            <div className="text-xs px-3 py-1.5 rounded-full bg-accent/10 text-accent-foreground font-medium">
              Left early {patternSummary.earlyCount}×
            </div>
          )}
          {patternSummary.absentCount > 0 && (
            <div className="text-xs px-3 py-1.5 rounded-full bg-destructive/10 text-destructive font-medium">
              Absent {patternSummary.absentCount}×
            </div>
          )}
        </div>
      )}

      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {dayNames.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">{d}</div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="min-h-[90px] bg-muted/20 border-r last:border-r-0" />;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const events = eventsMap.get(dateStr) || [];
                const isToday = dateStr === todayStr;
                const isSunday = di === 0;

                return (
                  <div key={di} className={`min-h-[90px] border-r last:border-r-0 p-1 ${isSunday ? 'bg-muted/30' : ''}`}>
                    <div className={`text-xs font-medium mb-1 flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday ? 'bg-primary text-primary-foreground' : isSunday ? 'text-muted-foreground' : 'text-foreground'
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map((evt, ei) => (
                        <div
                          key={ei}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${eventColors[evt.colorKey] || eventColors.ok}`}
                          title={evt.tooltip || evt.label}
                        >
                          {evt.label}
                        </div>
                      ))}
                      {events.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">+{events.length - 3} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { key: 'day_off', label: 'Day Off' },
          { key: 'absent', label: 'Absent' },
          { key: 'late', label: 'Tardy' },
          { key: 'early', label: 'Left Early' },
          { key: 'closure', label: 'Closure' },
        ].map(({ key, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${eventColors[key]}`} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
