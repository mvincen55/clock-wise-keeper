import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { DayOffRow } from '@/hooks/useDaysOff';
import { OfficeClosureRow } from '@/hooks/useOfficeClosures';

type CalendarEvent = {
  id: string;
  date: string;
  label: string;
  type: 'day_off' | 'closure';
  subType?: string;
  notes?: string | null;
};

const eventColors: Record<string, string> = {
  scheduled_with_notice: 'bg-primary/20 text-primary border-primary/30',
  medical_leave: 'bg-warning/20 text-warning border-warning/30',
  unscheduled: 'bg-destructive/20 text-destructive border-destructive/30',
  office_closed: 'bg-success/20 text-success border-success/30',
  other: 'bg-accent/20 text-accent border-accent/30',
  closure: 'bg-success/20 text-success border-success/30',
};

const typeLabels: Record<string, string> = {
  scheduled_with_notice: 'Scheduled',
  unscheduled: 'Unscheduled',
  office_closed: 'Office Closed',
  medical_leave: 'Medical Leave',
  other: 'Other',
};

interface AttendanceCalendarProps {
  daysOff: DayOffRow[];
  closures: OfficeClosureRow[];
  isManager: boolean;
  onAddDayOff: (input: {
    date_start: string;
    date_end: string;
    type: 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other';
    hours?: number;
    notes?: string;
  }) => Promise<void>;
  onAddClosure: (input: { closure_date: string; name: string }) => Promise<void>;
}

export default function AttendanceCalendar({
  daysOff,
  closures,
  isManager,
  onAddDayOff,
  onAddClosure,
}: AttendanceCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventType, setEventType] = useState<'day_off' | 'closure'>('day_off');
  const [form, setForm] = useState({
    type: 'scheduled_with_notice' as 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other',
    date_start: '',
    date_end: '',
    hours: '0',
    notes: '',
    closure_name: '',
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  // Build events map
  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    const addEvent = (date: string, event: CalendarEvent) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(event);
    };

    (daysOff || []).forEach(d => {
      const start = new Date(d.date_start + 'T00:00:00');
      const end = new Date(d.date_end + 'T00:00:00');
      for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        const dateStr = cur.toISOString().split('T')[0];
        addEvent(dateStr, {
          id: d.id,
          date: dateStr,
          label: typeLabels[d.type] || d.type,
          type: 'day_off',
          subType: d.type,
          notes: d.notes,
        });
      }
    });

    (closures || []).forEach(c => {
      addEvent(c.closure_date, {
        id: c.id,
        date: c.closure_date,
        label: c.name,
        type: 'closure',
        subType: 'closure',
      });
    });

    return map;
  }, [daysOff, closures]);

  // Calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handleDayClick = (day: number) => {
    if (!isManager) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setForm({ ...form, date_start: dateStr, date_end: dateStr, closure_name: '' });
    setAddOpen(true);
  };

  const handleSave = async () => {
    if (eventType === 'closure') {
      if (!form.closure_name.trim() || !form.date_start) return;
      await onAddClosure({ closure_date: form.date_start, name: form.closure_name.trim() });
    } else {
      if (!form.date_start || !form.date_end) return;
      await onAddDayOff({
        date_start: form.date_start,
        date_end: form.date_end,
        type: form.type,
        hours: form.hours ? parseFloat(form.hours) : undefined,
        notes: form.notes || undefined,
      });
    }
    setAddOpen(false);
    setForm({ type: 'scheduled_with_notice', date_start: '', date_end: '', hours: '0', notes: '', closure_name: '' });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
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
          <Button variant="ghost" size="sm" onClick={today} className="text-xs ml-2">
            Today
          </Button>
        </div>
        {isManager && (
          <Button size="sm" onClick={() => { setSelectedDate(null); setAddOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            Add Event
          </Button>
        )}
      </div>

      {/* Calendar Grid */}
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {dayNames.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day, di) => {
                if (day === null) {
                  return <div key={di} className="min-h-[90px] bg-muted/20 border-r last:border-r-0" />;
                }
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const events = eventsMap.get(dateStr) || [];
                const isToday = dateStr === todayStr;
                const isWeekend = di === 0 || di === 6;

                return (
                  <div
                    key={di}
                    className={`min-h-[90px] border-r last:border-r-0 p-1 transition-colors ${
                      isManager ? 'cursor-pointer hover:bg-muted/40' : ''
                    } ${isWeekend ? 'bg-muted/10' : ''}`}
                    onClick={() => handleDayClick(day)}
                  >
                    <div className={`text-xs font-medium mb-1 flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {events.slice(0, 3).map((evt, ei) => (
                        <div
                          key={ei}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${
                            eventColors[evt.subType || 'other'] || eventColors.other
                          }`}
                          title={`${evt.label}${evt.notes ? ': ' + evt.notes : ''}`}
                        >
                          {evt.label}
                        </div>
                      ))}
                      {events.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{events.length - 3} more
                        </div>
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
        {Object.entries(eventColors).map(([key, cls]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded border ${cls}`} />
            <span className="text-muted-foreground capitalize">{typeLabels[key] || key}</span>
          </div>
        ))}
      </div>

      {/* Add Event Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Calendar Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Event Type</Label>
              <Select value={eventType} onValueChange={v => setEventType(v as 'day_off' | 'closure')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day_off">Day Off</SelectItem>
                  <SelectItem value="closure">Office Closure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {eventType === 'closure' ? (
              <>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={form.closure_name} onChange={e => setForm({ ...form, closure_name: e.target.value })} placeholder="e.g. Company Holiday" />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Start Date</Label>
                    <Input type="date" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value, date_end: form.date_end || e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>End Date</Label>
                    <Input type="date" value={form.date_end} onChange={e => setForm({ ...form, date_end: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled_with_notice">Scheduled w/ Notice</SelectItem>
                      <SelectItem value="unscheduled">Unscheduled</SelectItem>
                      <SelectItem value="medical_leave">Medical Leave</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Hours (optional)</Label>
                  <Input type="number" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Notes{form.type === 'medical_leave' ? <span className="text-destructive"> *</span> : ' (optional)'}</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Reason or description" />
                </div>
              </>
            )}

            <Button onClick={handleSave} className="w-full" disabled={
              eventType === 'closure' ? (!form.date_start || !form.closure_name.trim()) :
              (!form.date_start || !form.date_end || (form.type === 'medical_leave' && !form.notes.trim()))
            }>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
