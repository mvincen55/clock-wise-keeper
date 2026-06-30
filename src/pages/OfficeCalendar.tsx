import { useState, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Plus, Trash2, Printer, FileText, Loader2, ShieldCheck, Pencil } from 'lucide-react';
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
  gcal: 'bg-accent/30 text-accent-foreground border-accent/50',
};

type GCalEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string;
};

type CalendarEvent = {
  id: string;
  label: string;
  colorKey: string;
  employeeName?: string;
  employeeId?: string;
  createdBy?: string | null;
  source: 'days_off' | 'office_closures';
  dateStart?: string;
  dateEnd?: string;
  type?: string;
  hours?: number | null;
  notes?: string | null;
  closureName?: string;
};

function getOpenSaturdays(orgId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`open-saturdays-${orgId}`) || '[]');
  } catch { return []; }
}

function setOpenSaturdays(orgId: string, dates: string[]) {
  localStorage.setItem(`open-saturdays-${orgId}`, JSON.stringify(dates));
}

const actionLabels: Record<string, string> = {
  calendar_add_day_off: 'Added Day Off',
  calendar_add_closure: 'Added Closure',
  calendar_delete_day_off: 'Deleted Day Off',
  calendar_delete_closure: 'Deleted Closure',
  calendar_edit_day_off: 'Edited Day Off',
  calendar_edit_closure: 'Edited Closure',
};

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

  // Edit/delete state
  const [editOpen, setEditOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [editMode, setEditMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [editForm, setEditForm] = useState({
    type: 'scheduled_with_notice' as string,
    date_start: '',
    date_end: '',
    hours: '0',
    notes: '',
    closure_name: '',
    employee_id: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  // Audit report state
  const [reportOpen, setReportOpen] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

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

  // Pull Google "HDA - Fairhaven" calendar events for the visible month
  const { data: gcalEvents } = useQuery({
    queryKey: ['gcal-office', year, month],
    queryFn: async () => {
      const timeMin = new Date(year, month, 1).toISOString();
      const timeMax = new Date(year, month + 1, 1).toISOString();
      const { data, error } = await supabase.functions.invoke('google-calendar-events', {
        body: null,
        method: 'GET',
        // supabase-js doesn't accept query params directly; use URL via fetch fallback
      } as any).catch(() => ({ data: null, error: new Error('invoke failed') }));
      // Fallback: call via fetch with query string (functions.invoke can't pass GET params)
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        if (!res.ok) return [] as GCalEvent[];
        const json = await res.json();
        return (json.events || []) as GCalEvent[];
      } catch {
        return [] as GCalEvent[];
      }
    },
    staleTime: 60_000,
  });

  const [gcalDetail, setGcalDetail] = useState<GCalEvent | null>(null);

  const gcalByDay = useMemo(() => {
    const map = new Map<string, GCalEvent[]>();
    (gcalEvents || []).forEach((g) => {
      // Day-key in local time. allDay events have YYYY-MM-DD already.
      const startStr = g.start;
      if (!startStr) return;
      let dateKey: string;
      if (g.allDay) {
        dateKey = startStr.slice(0, 10);
      } else {
        const d = new Date(startStr);
        dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(g);
    });
    return map;
  }, [gcalEvents]);

  // Fetch audit log for calendar events
  const { data: auditLog } = useQuery({
    queryKey: ['calendar-audit', ctx?.org_id],
    enabled: !!ctx?.org_id && isManager,
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_events')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .in('event_type', [
          'calendar_add_day_off', 'calendar_add_closure',
          'calendar_delete_day_off', 'calendar_delete_closure',
          'calendar_edit_day_off', 'calendar_edit_closure',
        ])
        .order('created_at', { ascending: false })
        .limit(200);
      return (data || []) as any[];
    },
  });

  const actorIds = useMemo(() => {
    const ids = new Set<string>();
    (auditLog || []).forEach((e: any) => ids.add(e.user_id));
    return Array.from(ids);
  }, [auditLog]);

  const { data: profiles } = useQuery({
    queryKey: ['profiles-for-audit', actorIds],
    enabled: actorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds);
      return (data || []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    (profiles || []).forEach(p => map.set(p.id, p.full_name || p.email || p.id));
    return map;
  }, [profiles]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    (employees || []).forEach(e => map.set(e.id, e.display_name));
    return map;
  }, [employees]);

  const openSaturdays = useMemo(() => ctx ? getOpenSaturdays(ctx.org_id) : [], [ctx, saturdayDialogOpen]);

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
        addEvent(dateStr, {
          id: d.id, label, colorKey, employeeName: empName,
          employeeId: d.employee_id,
          createdBy: d.created_by, source: 'days_off',
          dateStart: d.date_start, dateEnd: d.date_end, type: d.type,
          hours: d.hours, notes: d.notes,
        });
      }
    });

    (closures || []).forEach(c => {
      addEvent(c.closure_date, {
        id: c.id, label: c.name, colorKey: 'closure',
        createdBy: c.created_by, source: 'office_closures',
        dateStart: c.closure_date, closureName: c.name,
      });
    });

    return map;
  }, [allDaysOff, closures, employeeMap]);

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

  const logAudit = async (eventType: string, details: Record<string, any>) => {
    if (!ctx || !user) return;
    try {
      await supabase.from('audit_events').insert({
        org_id: ctx.org_id,
        user_id: user.id,
        actor_id: user.id,
        event_type: eventType,
        event_details: details,
        target_table: details.source || 'days_off',
        target_id: details.target_id || null,
        action_type: eventType,
      });
    } catch { /* non-critical */ }
  };

  const handleSave = async () => {
    if (eventType === 'closure') {
      if (!form.closure_name.trim() || !form.date_start) return;
      try {
        await addClosure.mutateAsync({ closure_date: form.date_start, name: form.closure_name.trim() });
        await logAudit('calendar_add_closure', {
          source: 'office_closures', closure_date: form.date_start, name: form.closure_name.trim(),
        });
        toast({ title: 'Office closure added' });
        qc.invalidateQueries({ queryKey: ['calendar-audit'] });
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
        const { data: inserted, error } = await supabase.from('days_off').insert({
          user_id: emp.user_id || user!.id,
          org_id: ctx!.org_id,
          employee_id: emp.id,
          created_by: user!.id,
          date_start: form.date_start,
          date_end: form.date_end,
          type: form.type,
          hours: form.hours ? parseFloat(form.hours) : null,
          notes: form.notes || null,
        }).select('id').single();
        if (error) throw error;
        await logAudit('calendar_add_day_off', {
          source: 'days_off', target_id: inserted?.id,
          employee: emp.display_name, date_start: form.date_start,
          date_end: form.date_end, type: form.type, notes: form.notes || null,
        });
        toast({ title: 'Day off added' });
        qc.invalidateQueries({ queryKey: ['org-days-off'] });
        qc.invalidateQueries({ queryKey: ['calendar-audit'] });
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

  // Manager/owner can click any event to view/edit/delete
  const handleEventClick = (e: React.MouseEvent, evt: CalendarEvent) => {
    e.stopPropagation();
    if (!isManager) return; // employees can't interact
    setEditEvent(evt);
    setEditMode('view');
    setConfirmPassword('');
    setVerified(false);
    // Pre-fill edit form
    if (evt.source === 'days_off') {
      setEditForm({
        type: evt.type || 'scheduled_with_notice',
        date_start: evt.dateStart || '',
        date_end: evt.dateEnd || '',
        hours: String(evt.hours ?? '0'),
        notes: evt.notes || '',
        closure_name: '',
        employee_id: evt.employeeId || '',
      });
    } else {
      setEditForm({
        type: '',
        date_start: evt.dateStart || '',
        date_end: '',
        hours: '0',
        notes: '',
        closure_name: evt.closureName || evt.label || '',
        employee_id: '',
      });
    }
    setEditOpen(true);
  };

  const handleVerify = async () => {
    if (!user?.email || !confirmPassword) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email, password: confirmPassword,
      });
      if (error) throw error;
      setVerified(true);
      toast({ title: 'Identity verified' });
    } catch {
      toast({ title: 'Verification failed', description: 'Incorrect password.', variant: 'destructive' });
    } finally {
      setVerifying(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!editEvent || !verified) return;
    try {
      const auditDetails: Record<string, any> = {
        source: editEvent.source, target_id: editEvent.id, label: editEvent.label,
        employee: editEvent.employeeName || null, date_start: editEvent.dateStart,
        date_end: editEvent.dateEnd, type: editEvent.type,
      };
      if (editEvent.source === 'days_off') {
        const { error } = await supabase.from('days_off').delete().eq('id', editEvent.id);
        if (error) throw error;
        await logAudit('calendar_delete_day_off', auditDetails);
      } else {
        const { error } = await supabase.from('office_closures').delete().eq('id', editEvent.id);
        if (error) throw error;
        await logAudit('calendar_delete_closure', auditDetails);
      }
      toast({ title: 'Event deleted' });
      qc.invalidateQueries({ queryKey: ['org-days-off'] });
      qc.invalidateQueries({ queryKey: ['office-closures'] });
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['calendar-audit'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setEditOpen(false);
    setEditEvent(null);
    setVerified(false);
    setConfirmPassword('');
  };

  const handleEditSave = async () => {
    if (!editEvent || !verified) return;
    try {
      const before: Record<string, any> = {
        date_start: editEvent.dateStart, date_end: editEvent.dateEnd,
        type: editEvent.type, notes: editEvent.notes, hours: editEvent.hours,
        closure_name: editEvent.closureName,
      };

      if (editEvent.source === 'days_off') {
        const { error } = await supabase.from('days_off').update({
          date_start: editForm.date_start,
          date_end: editForm.date_end,
          type: editForm.type as any,
          hours: editForm.hours ? parseFloat(editForm.hours) : null,
          notes: editForm.notes || null,
        }).eq('id', editEvent.id);
        if (error) throw error;
        await logAudit('calendar_edit_day_off', {
          source: 'days_off', target_id: editEvent.id,
          employee: editEvent.employeeName,
          before, after: { date_start: editForm.date_start, date_end: editForm.date_end, type: editForm.type, notes: editForm.notes, hours: editForm.hours },
        });
      } else {
        const { error } = await supabase.from('office_closures').update({
          closure_date: editForm.date_start,
          name: editForm.closure_name,
        }).eq('id', editEvent.id);
        if (error) throw error;
        await logAudit('calendar_edit_closure', {
          source: 'office_closures', target_id: editEvent.id,
          before, after: { closure_date: editForm.date_start, name: editForm.closure_name },
        });
      }
      toast({ title: 'Event updated' });
      qc.invalidateQueries({ queryKey: ['org-days-off'] });
      qc.invalidateQueries({ queryKey: ['office-closures'] });
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['calendar-audit'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setEditOpen(false);
    setEditEvent(null);
    setVerified(false);
    setConfirmPassword('');
  };

  const handlePrintReport = () => {
    if (!reportRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Calendar Change Log</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 24px; color: #1a1a1a; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 13px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
        th { background: #f5f5f5; font-weight: 600; }
      </style></head><body>
      ${reportRef.current.innerHTML}
      <script>window.onload = function() { window.print(); }</script>
      </body></html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Office Calendar</h1>
          <p className="text-muted-foreground">Team schedule, closures, and time off at a glance</p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              <FileText className="mr-1 h-4 w-4" />
              Change Log
            </Button>
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
          </div>
        )}
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

          {weeks.map((weekRow, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
              {weekRow.map((day, di) => {
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
                      <div
                        className={`text-[10px] leading-tight px-1 py-0.5 rounded bg-muted text-muted-foreground truncate mb-0.5 border border-muted-foreground/20 ${
                          isManager && closureName !== 'Closed' ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : ''
                        }`}
                        onClick={() => {
                          if (!isManager || closureName === 'Closed') return;
                          // Find the closure event
                          const closureEvt = (eventsMap.get(dateStr) || []).find(e => e.colorKey === 'closure');
                          if (closureEvt) handleEventClick({ stopPropagation: () => {} } as any, closureEvt);
                        }}
                      >
                        {closureName}
                      </div>
                    )}
                    <div className="space-y-0.5">
                      {events.slice(0, 4).map((evt, ei) => (
                        <div
                          key={ei}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate ${
                            eventColors[evt.colorKey] || eventColors.off
                          } ${isManager ? 'cursor-pointer hover:ring-1 hover:ring-primary/50' : ''}`}
                          title={evt.employeeName || evt.label}
                          onClick={isManager ? (e) => handleEventClick(e, evt) : undefined}
                        >
                          {evt.label}
                        </div>
                      ))}
                      {events.length > 4 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{events.length - 4} more
                        </div>
                      )}
                      {(gcalByDay.get(dateStr) || []).slice(0, 3).map((g) => (
                        <div
                          key={g.id}
                          className={`text-[10px] leading-tight px-1 py-0.5 rounded border truncate cursor-pointer hover:ring-1 hover:ring-primary/50 ${eventColors.gcal}`}
                          title={g.summary}
                          onClick={(e) => { e.stopPropagation(); setGcalDetail(g); }}
                        >
                          📅 {g.summary}
                        </div>
                      ))}
                      {(gcalByDay.get(dateStr) || []).length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1">
                          +{(gcalByDay.get(dateStr) || []).length - 3} more
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
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded border ${eventColors.gcal}`} />
          <span className="text-muted-foreground">📅 Google (HDA - Fairhaven)</span>
        </div>
      </div>

      {/* Google Calendar event detail */}
      <Dialog open={!!gcalDetail} onOpenChange={(v) => !v && setGcalDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{gcalDetail?.summary}</DialogTitle>
          </DialogHeader>
          {gcalDetail && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">When</span>
                <span className="font-medium">
                  {gcalDetail.allDay
                    ? `${gcalDetail.start} (all day)`
                    : `${new Date(gcalDetail.start).toLocaleString()} – ${new Date(gcalDetail.end).toLocaleTimeString()}`}
                </span>
              </div>
              {gcalDetail.location && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-medium text-right max-w-[220px]">{gcalDetail.location}</span>
                </div>
              )}
              {gcalDetail.description && (
                <div className="text-muted-foreground whitespace-pre-wrap border-t pt-2">
                  {gcalDetail.description}
                </div>
              )}
              {gcalDetail.htmlLink && (
                <a
                  href={gcalDetail.htmlLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs text-primary underline pt-2"
                >
                  Open in Google Calendar →
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Event Dialog (managers only) */}
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

      {/* Event Detail / Edit / Delete Dialog (managers only) */}
      <Dialog open={editOpen} onOpenChange={(v) => {
        if (!v) { setEditOpen(false); setVerified(false); setConfirmPassword(''); setEditMode('view'); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editMode === 'view' ? 'Event Details' : editMode === 'edit' ? 'Edit Event' : 'Delete Event'}
            </DialogTitle>
          </DialogHeader>

          {/* VIEW MODE */}
          {editMode === 'view' && editEvent && (
            <div className="space-y-4">
              <div className="space-y-2 text-sm">
                {editEvent.employeeName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Employee</span>
                    <span className="font-medium">{editEvent.employeeName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium">{editEvent.source === 'office_closures' ? 'Office Closure' : (editEvent.type || '').replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {editEvent.dateStart}{editEvent.dateEnd && editEvent.dateEnd !== editEvent.dateStart ? ` → ${editEvent.dateEnd}` : ''}
                  </span>
                </div>
                {editEvent.source === 'office_closures' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{editEvent.closureName || editEvent.label}</span>
                  </div>
                )}
                {editEvent.notes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Notes</span>
                    <span className="font-medium text-right max-w-[200px]">{editEvent.notes}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditMode('edit')}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Edit
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => setEditMode('delete')}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {/* EDIT MODE */}
          {editMode === 'edit' && editEvent && (
            <div className="space-y-4">
              {!verified ? (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Verify your identity to edit
                  </div>
                  <div className="space-y-1">
                    <Label>Password</Label>
                    <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter your password" onKeyDown={e => e.key === 'Enter' && handleVerify()} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleVerify} disabled={!confirmPassword || verifying} className="flex-1">
                      {verifying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                      Verify
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setEditMode('view')}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {editEvent.source === 'days_off' ? (
                    <>
                      <div className="text-sm text-muted-foreground mb-1">Employee: <span className="font-medium text-foreground">{editEvent.employeeName}</span></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Start Date</Label>
                          <Input type="date" value={editForm.date_start} onChange={e => setEditForm({ ...editForm, date_start: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>End Date</Label>
                          <Input type="date" value={editForm.date_end} onChange={e => setEditForm({ ...editForm, date_end: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Type</Label>
                        <Select value={editForm.type} onValueChange={v => setEditForm({ ...editForm, type: v })}>
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
                        <Label>Hours</Label>
                        <Input type="number" value={editForm.hours} onChange={e => setEditForm({ ...editForm, hours: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Notes</Label>
                        <Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <Label>Date</Label>
                        <Input type="date" value={editForm.date_start} onChange={e => setEditForm({ ...editForm, date_start: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label>Closure Name</Label>
                        <Input value={editForm.closure_name} onChange={e => setEditForm({ ...editForm, closure_name: e.target.value })} />
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={handleEditSave}>Save Changes</Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setEditMode('view'); setVerified(false); setConfirmPassword(''); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DELETE MODE */}
          {editMode === 'delete' && editEvent && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {editEvent.employeeName ? `Employee: ${editEvent.employeeName}` : editEvent.label}
                {editEvent.dateStart && (
                  <span className="ml-2">• {new Date(editEvent.dateStart + 'T00:00:00').toLocaleDateString()}</span>
                )}
              </p>
              {!verified ? (
                <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Verify your identity to delete
                  </div>
                  <div className="space-y-1">
                    <Label>Password</Label>
                    <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter your password" onKeyDown={e => e.key === 'Enter' && handleVerify()} />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleVerify} disabled={!confirmPassword || verifying} className="flex-1">
                      {verifying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1 h-4 w-4" />}
                      Verify
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setEditMode('view')}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    Identity verified
                  </div>
                  <div className="flex gap-2">
                    <Button variant="destructive" className="flex-1" onClick={handleDeleteEvent}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Delete Event
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => { setEditMode('view'); setVerified(false); setConfirmPassword(''); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Log Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Calendar Change Log</span>
              <Button variant="outline" size="sm" onClick={handlePrintReport}>
                <Printer className="mr-1 h-4 w-4" />
                Print
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div ref={reportRef}>
            <h1 style={{ fontSize: '18px', fontWeight: 700 }}>Calendar Change Log</h1>
            <p className="subtitle" style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
              {ctx?.org_name || 'Organization'} • Generated {new Date().toLocaleDateString()}
            </p>
            {(auditLog || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No changes recorded yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #ddd', padding: '6px 10px', textAlign: 'left', background: '#f5f5f5', fontWeight: 600 }}>Date & Time</th>
                    <th style={{ border: '1px solid #ddd', padding: '6px 10px', textAlign: 'left', background: '#f5f5f5', fontWeight: 600 }}>Action</th>
                    <th style={{ border: '1px solid #ddd', padding: '6px 10px', textAlign: 'left', background: '#f5f5f5', fontWeight: 600 }}>By</th>
                    <th style={{ border: '1px solid #ddd', padding: '6px 10px', textAlign: 'left', background: '#f5f5f5', fontWeight: 600 }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {(auditLog || []).map((entry: any) => {
                    const details = entry.event_details || {};
                    const isDelete = entry.event_type.includes('delete');
                    const isEdit = entry.event_type.includes('edit');
                    const detailParts: string[] = [];
                    if (details.employee) detailParts.push(`Employee: ${details.employee}`);
                    if (details.name) detailParts.push(`Name: ${details.name}`);
                    if (details.date_start) detailParts.push(`Date: ${details.date_start}${details.date_end && details.date_end !== details.date_start ? ` → ${details.date_end}` : ''}`);
                    if (details.closure_date) detailParts.push(`Date: ${details.closure_date}`);
                    if (details.type) detailParts.push(`Type: ${details.type}`);
                    if (details.label) detailParts.push(`Label: ${details.label}`);
                    if (isEdit && details.before) detailParts.push(`[edited]`);

                    return (
                      <tr key={entry.id}>
                        <td style={{ border: '1px solid #ddd', padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {new Date(entry.created_at).toLocaleString()}
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>
                          <span style={{ color: isDelete ? '#dc2626' : isEdit ? '#ca8a04' : '#16a34a', fontWeight: 500 }}>
                            {actionLabels[entry.event_type] || entry.event_type}
                          </span>
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: '6px 10px' }}>
                          {profileMap.get(entry.user_id) || 'Unknown'}
                        </td>
                        <td style={{ border: '1px solid #ddd', padding: '6px 10px', fontSize: '12px' }}>
                          {detailParts.join(' • ') || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
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
              <p className="text-sm text-muted-foreground text-center py-4">No open Saturdays added yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
