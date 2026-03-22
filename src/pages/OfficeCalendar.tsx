import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOfficeClosures, useAddClosure } from '@/hooks/useOfficeClosures';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAddDayOff } from '@/hooks/useDaysOff';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const eventColors: Record<string, string> = {
  off: 'bg-primary/20 text-primary border-primary/30',
  out: 'bg-destructive/20 text-destructive border-destructive/30',
  medical: 'bg-warning/20 text-warning border-warning/30',
  closure: 'bg-muted text-muted-foreground border-muted-foreground/30',
};

type CalendarEvent = {
  id: string;
  label: string;
  colorKey: string;
  employeeName?: string;
  createdBy?: string | null;
  source: 'days_off' | 'office_closures';
};

// Open Saturdays stored in localStorage per org
function getOpenSaturdays(orgId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`open-saturdays-${orgId}`) || '[]');
  } catch { return []; }
}

function setOpenSaturdays(orgId: string, dates: string[]) {
  localStorage.setItem(`open-saturdays-${orgId}`, JSON.stringify(dates));
}

export default function OfficeCalendar() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: employees } = useOrgEmployees();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [addOpen, setAddOpen] = useState(false);
  const [saturdayDialogOpen, setSaturdayDialogOpen] = useState(false);
  const [newSaturdayDate, setNewSaturdayDate] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [eventType, setEventType] = useState<'day_off' | 'closure' | 'open_saturday'>('day_off');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [form, setForm] = useState({
    type: 'scheduled_with_notice' as 'scheduled_with_notice' | 'unscheduled' | 'medical_leave' | 'other',
    date_start: '',
    date_end: '',
    hours: '0',
    notes: '',
    closure_name: '',
  });

  // Edit state for own events
  const [editOpen, setEditOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [editForm, setEditForm] = useState({ notes: '', hours: '0' });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
  
  const { data: allDaysOff } = useQuery({
    queryKey: ['org-days-off', ctx?.org_id, monthStart, monthEnd],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('days_off')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .lte('date_start', monthEnd)
        .gte('date_end', monthStart);
      return (data || []) as any[];
    },
  });

  const { data: closures } = useOfficeClosures(year);
  const addClosure = useAddClosure();
  const addDayOff = useAddDayOff();

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    (employees || []).forEach(e => map.set(e.id, e.display_name));
    return map;
  }, [employees]);

  const openSaturdays = useMemo(() => ctx ? getOpenSaturdays(ctx.org_id) : [], [ctx, saturdayDialogOpen]);

  // Build events map - include created_by and source
  const eventsMap = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const addEvent = (date: string, event: CalendarEvent) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(event);
    };

    (allDaysOff || []).forEach(d => {
      if (d.type === 'office_closed') return;
      const empName = employeeMap.get(d.employee_id) || 'Unknown';
      const initials = getInitials(empName);
      const isScheduled = ['scheduled_with_notice', 'medical_leave', 'other'].includes(d.type);
      const label = d.type === 'medical_leave' 
        ? `${initials} Medical`
        : `${initials} ${isScheduled ? 'Off' : 'Out'}`;
      const colorKey = d.type === 'medical_leave' ? 'medical' : isScheduled ? 'off' : 'out';
      
      const start = new Date(d.date_start + 'T00:00:00');
      const end = new Date(d.date_end + 'T00:00:00');
      for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        const dateStr = cur.toISOString().split('T')[0];
        addEvent(dateStr, { id: d.id, label, colorKey, employeeName: empName, createdBy: d.created_by, source: 'days_off' });
      }
    });

    (closures || []).forEach(c => {
      addEvent(c.closure_date, { id: c.id, label: c.name, colorKey: 'closure', createdBy: c.created_by, source: 'office_closures' });
    });

    return map;
  }, [allDaysOff, closures, employeeMap]);

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

  const handleSave = async () => {
    if (eventType === 'closure') {
      if (!form.closure_name.trim() || !form.date_start) return;
      try {
        await addClosure.mutateAsync({ closure_date: form.date_start, name: form.closure_name.trim() });
        toast({ title: 'Office closure added' });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    } else if (eventType === 'open_saturday') {
      if (!form.date_start || !ctx) return;
      const current = getOpenSaturdays(ctx.org_id);
      if (!current.includes(form.date_start)) {
        setOpenSaturdays(ctx.org_id, [...current, form.date_start]);
      }
      toast({ title: 'Saturday marked as open' });
    } else {
      if (!form.date_start || !form.date_end || !selectedEmployee) return;
      const emp = (employees || []).find(e => e.id === selectedEmployee);
      if (!emp) return;
      try {
        const { error } = await supabase.from('days_off').insert({
          user_id: emp.user_id || user!.id,
          org_id: ctx!.org_id,
          employee_id: emp.id,
          created_by: user!.id,
          date_start: form.date_start,
          date_end: form.date_end,
          type: form.type,
          hours: form.hours ? parseFloat(form.hours) : null,
          notes: form.notes || null,
        });
        if (error) throw error;
        toast({ title: 'Day off added' });
        qc.invalidateQueries({ queryKey: ['org-days-off'] });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    }
    setAddOpen(false);
    setForm({ type: 'scheduled_with_notice', date_start: '', date_end: '', hours: '0', notes: '', closure_name: '' });
  };

  const handleAddOpenSaturday = () => {
    if (!newSaturdayDate || !ctx) return;
    const d = new Date(newSaturdayDate + 'T00:00:00');
    if (d.getDay() !== 6) {
      toast({ title: 'Error', description: 'Selected date must be a Saturday', variant: 'destructive' });
      return;
    }
    const current = getOpenSaturdays(ctx.org_id);
    if (!current.includes(newSaturdayDate)) {
      setOpenSaturdays(ctx.org_id, [...current, newSaturdayDate]);
    }
    setNewSaturdayDate('');
    toast({ title: 'Saturday marked as open' });
  };

  const handleRemoveOpenSaturday = (dateStr: string) => {
    if (!ctx) return;
    const current = getOpenSaturdays(ctx.org_id);
    setOpenSaturdays(ctx.org_id, current.filter(d => d !== dateStr));
    toast({ title: 'Saturday removed from open list' });
  };

  const isClosedDay = (dateStr: string, dayOfWeek: number): { closed: boolean; closureName?: string } => {
    if (dayOfWeek === 0) return { closed: true, closureName: 'Closed' };
    if (dayOfWeek === 6 && !openSaturdays.includes(dateStr)) return { closed: true, closureName: 'Closed' };
    const closureEvents = (eventsMap.get(dateStr) || []).filter(e => e.colorKey === 'closure');
    if (closureEvents.length > 0) return { closed: true, closureName: closureEvents[0].label };
    return { closed: false };
  };

  // Handle clicking on own event to edit
  const handleEventClick = (e: React.MouseEvent, evt: CalendarEvent) => {
    e.stopPropagation();
    if (evt.createdBy !== user?.id) return; // only creator can interact
    setEditEvent(evt);
    setEditForm({ notes: '', hours: '0' });
    setEditOpen(true);
  };

  const handleDeleteEvent = async () => {
    if (!editEvent) return;
    try {
      if (editEvent.source === 'days_off') {
        const { error } = await supabase.from('days_off').delete().eq('id', editEvent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('office_closures').delete().eq('id', editEvent.id);
        if (error) throw error;
      }
      toast({ title: 'Event deleted' });
      qc.invalidateQueries({ queryKey: ['org-days-off'] });
      qc.invalidateQueries({ queryKey: ['office-closures'] });
      qc.invalidateQueries({ queryKey: ['days-off'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setEditOpen(false);
    setEditEvent(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Office Calendar</h1>
          <p className="text-muted-foreground">Team schedule, closures, and time off at a glance</p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <>
              <Button variant="outline" size="sm" onClick={() => setSaturdayDialogOpen(true)}>
                Open Saturdays
              </Button>
              <Button size="sm" onClick={() => {
                setSelectedDate(null);
                setForm({ type: 'scheduled_with_notice', date_start: '', date_end: '', hours: '0', notes: '', closure_name: '' });
                setEventType('day_off');
                setSelectedEmployee('');
                setAddOpen(true);
              }}>
                <Plus className="mr-1 h-4 w-4" />
                Add Event
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Calendar Navigation */}
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

      {/* Calendar Grid */}
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/50">
            {dayNames.map(d => (
              <div key={d} className="px-2 py-2 text-xs font-medium text-muted-foreground text-center">
                {d}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day, di) => {
                if (day === null) {
                  return <div key={di} className="min-h-[100px] bg-muted/20 border-r last:border-r-0" />;
                }
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const events = (eventsMap.get(dateStr) || []).filter(e => e.colorKey !== 'closure');
                const isToday = dateStr === todayStr;
                const { closed, closureName } = isClosedDay(dateStr, di);

                return (
                  <div
                    key={di}
                    className={`min-h-[100px] border-r last:border-r-0 p-1 ${
                      closed ? 'bg-muted/40' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className={`text-xs font-medium flex items-center justify-center w-6 h-6 rounded-full ${
                        isToday ? 'bg-primary text-primary-foreground' : closed ? 'text-muted-foreground' : 'text-foreground'
                      }`}>
                        {day}
                      </div>
                    </div>
                    {closed && closureName && (
                      <div className="text-[10px] leading-tight px-1 py-0.5 rounded bg-muted text-muted-foreground truncate mb-0.5 border border-muted-foreground/20">
                        {closureName}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {events.slice(0, 4).map((evt, ei) => {
                        const isOwn = evt.createdBy === user?.id;
                        return (
                          <div
                            key={ei}
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${
                              eventColors[evt.colorKey] || eventColors.off
                            } ${isOwn ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : ''}`}
                            title={evt.employeeName || evt.label}
                            onClick={isOwn ? (e) => handleEventClick(e, evt) : undefined}
                          >
                            {evt.label}
                          </div>
                        );
                      })}
                      {events.length > 4 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{events.length - 4} more
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
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded border ${eventColors.off}`} />
          <span className="text-muted-foreground">[Initials] Off — Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded border ${eventColors.out}`} />
          <span className="text-muted-foreground">[Initials] Out — Unscheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded border ${eventColors.medical}`} />
          <span className="text-muted-foreground">[Initials] Medical</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded border ${eventColors.closure}`} />
          <span className="text-muted-foreground">Office Closed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-muted/40 border border-muted-foreground/20" />
          <span className="text-muted-foreground">Weekend / Closed</span>
        </div>
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
              <Select value={eventType} onValueChange={v => setEventType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day_off">Day Off</SelectItem>
                  <SelectItem value="closure">Office Closure</SelectItem>
                  <SelectItem value="open_saturday">Mark Saturday Open</SelectItem>
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
            ) : eventType === 'open_saturday' ? (
              <div className="space-y-1">
                <Label>Saturday Date</Label>
                <Input type="date" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value })} />
                <p className="text-xs text-muted-foreground">Select a Saturday to mark as open/working day</p>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Employee</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {(employees || []).map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                      <SelectItem value="scheduled_with_notice">Scheduled (Off)</SelectItem>
                      <SelectItem value="unscheduled">Unscheduled (Out)</SelectItem>
                      <SelectItem value="medical_leave">Medical Leave</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Hours (optional)</Label>
                  <Input type="number" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Notes{form.type === 'medical_leave' ? <span className="text-destructive"> *</span> : ' (optional)'}</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </>
            )}

            <Button onClick={handleSave} className="w-full" disabled={
              eventType === 'closure' ? (!form.date_start || !form.closure_name.trim()) :
              eventType === 'open_saturday' ? !form.date_start :
              (!form.date_start || !form.date_end || !selectedEmployee || (form.type === 'medical_leave' && !form.notes.trim()))
            }>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Own Event Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your Event: {editEvent?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {editEvent?.employeeName ? `Employee: ${editEvent.employeeName}` : editEvent?.label}
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" className="flex-1" onClick={handleDeleteEvent}>
                <Trash2 className="mr-1 h-4 w-4" />
                Delete Event
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Open Saturdays Dialog */}
      <Dialog open={saturdayDialogOpen} onOpenChange={setSaturdayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Open Saturdays</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              By default, Saturdays are marked as closed. Add dates below for Saturdays when the office is open.
            </p>
            <div className="flex gap-2">
              <Input type="date" value={newSaturdayDate} onChange={e => setNewSaturdayDate(e.target.value)} className="flex-1" />
              <Button onClick={handleAddOpenSaturday} size="sm">Add</Button>
            </div>
            {openSaturdays.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {openSaturdays.sort().map(d => (
                  <div key={d} className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded text-sm">
                    <span>{new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => handleRemoveOpenSaturday(d)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No open Saturdays set</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
