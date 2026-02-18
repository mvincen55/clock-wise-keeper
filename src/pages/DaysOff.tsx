import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDaysOff, useAddDayOff, useDeleteDayOff, DayOffRow } from '@/hooks/useDaysOff';
import { useTardies, useUpdateTardy, TardyRow } from '@/hooks/useTardies';
import { TardyReviewModal } from '@/components/TardyReviewModal';
import { TimeFixModal } from '@/components/TimeFixModal';
import { AttendanceActions } from '@/components/AttendanceActions';
import { useAttendanceExceptions, AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import { useAttendanceDayStatus, useRecomputeAttendance, AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/time-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CalendarDays, Plus, Trash2, Loader2, AlertTriangle, Clock, Building2, Bug, RefreshCw, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const typeLabels: Record<string, string> = {
  scheduled_with_notice: 'Scheduled w/ Notice',
  unscheduled: 'Unscheduled',
  office_closed: 'Office Closed',
  medical_leave: 'Medical Leave',
  other: 'Other',
};

const typeColors: Record<string, string> = {
  scheduled_with_notice: 'bg-primary/20 text-primary',
  unscheduled: 'bg-destructive/20 text-destructive',
  office_closed: 'bg-success/20 text-success',
  medical_leave: 'bg-warning/20 text-warning',
  other: 'bg-accent/20 text-accent',
};

const exceptionStatusColors: Record<string, string> = {
  open: 'bg-warning/20 text-warning',
  resolved: 'bg-success/20 text-success',
  ignored: 'bg-muted text-muted-foreground',
};

type AttendanceFilter = 'all' | 'absent' | 'late' | 'incomplete' | 'days_off' | 'closures' | 'remote' | 'onsite';
type DaysOffFilter = 'all' | 'scheduled_with_notice' | 'unscheduled' | 'medical_leave' | 'other';

function DebugDrawer({ row, open, onClose }: { row: AttendanceDayStatusRow | null; open: boolean; onClose: () => void }) {
  if (!row) return null;
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[340px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Bug className="h-4 w-4" /> Debug: {formatDate(row.entry_date)}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Scheduled:</span>
            <span className="font-mono">{row.is_scheduled_day ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Expected Start:</span>
            <span className="font-mono">{row.schedule_expected_start?.slice(0, 5) || '—'}</span>
            <span className="text-muted-foreground">Expected End:</span>
            <span className="font-mono">{row.schedule_expected_end?.slice(0, 5) || '—'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Office Closed:</span>
            <span className={row.office_closed ? 'text-success font-semibold' : ''}>{row.office_closed ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Day Off:</span>
            <span className={row.has_day_off ? 'text-primary font-semibold' : ''}>{row.has_day_off ? 'Yes' : 'No'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Has Punches:</span>
            <span>{row.has_punches ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Remote:</span>
            <span>{row.is_remote ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Has Edits:</span>
            <span>{row.has_edits ? 'Yes' : 'No'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Absent:</span>
            <span className={row.is_absent ? 'text-destructive font-semibold' : ''}>{row.is_absent ? 'YES' : 'No'}</span>
            <span className="text-muted-foreground">Incomplete:</span>
            <span className={row.is_incomplete ? 'text-warning font-semibold' : ''}>{row.is_incomplete ? 'YES' : 'No'}</span>
            <span className="text-muted-foreground">Late:</span>
            <span className={row.is_late ? 'text-destructive font-semibold' : ''}>{row.is_late ? `YES (${row.minutes_late}m)` : 'No'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Tardy Status:</span>
            <span className="capitalize">{row.tardy_approval_status}</span>
            <span className="text-muted-foreground">Day Comment:</span>
            <span>{row.has_day_comment ? 'Yes' : 'No'}</span>
          </div>
          <div className="border-t pt-2">
            <span className="text-muted-foreground text-xs">Computed at: </span>
            <span className="text-xs font-mono">{new Date(row.computed_at).toLocaleString()}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function DaysOff() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: payrollSettings } = usePayrollSettings();
  const { toast } = useToast();

  // Default date range to current pay period
  const weekStartDay = payrollSettings?.week_start_day ?? 1;
  const nowDate = new Date();
  const dayOfWeek = nowDate.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  const defaultStart = new Date(nowDate);
  defaultStart.setDate(nowDate.getDate() - daysBack);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultStart.getDate() + 6);

  const [startDate, setStartDate] = useState(defaultStart.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(defaultEnd.toISOString().split('T')[0]);

  const { data: daysOff, isLoading: daysOffLoading } = useDaysOff();
  const { data: tardies, isLoading: tardiesLoading } = useTardies(startDate, endDate);
  const { data: exceptions } = useAttendanceExceptions(startDate, endDate);
  const { data: closures } = useOfficeClosures(new Date().getFullYear());
  const { data: statusRows, isLoading: statusLoading } = useAttendanceDayStatus(startDate, endDate);
  const recompute = useRecomputeAttendance();
  const addDayOff = useAddDayOff();
  const deleteDayOff = useDeleteDayOff();
  const updateTardy = useUpdateTardy();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('status');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
  const [daysOffFilter, setDaysOffFilter] = useState<DaysOffFilter>('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [debugRow, setDebugRow] = useState<AttendanceDayStatusRow | null>(null);
  const [reviewTardy, setReviewTardy] = useState<TardyRow | null>(null);
  const [fixRow, setFixRow] = useState<AttendanceDayStatusRow | null>(null);

  const userTimezone = payrollSettings?.timezone || 'America/New_York';

  const requiresNotes = (type: string) => type === 'medical_leave' || type === 'unscheduled';

  const [form, setForm] = useState({
    date_start: '',
    date_end: '',
    type: 'scheduled_with_notice' as 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other',
    hours: '0',
    notes: '',
  });

  const formNotesRequired = requiresNotes(form.type);

  const handleAdd = async () => {
    if (!form.date_start || !form.date_end) return;
    if (formNotesRequired && !form.notes.trim()) return;
    try {
      await addDayOff.mutateAsync({
        date_start: form.date_start,
        date_end: form.date_end,
        type: form.type,
        hours: form.hours ? parseFloat(form.hours) : undefined,
        notes: form.notes || undefined,
      });
      setOpen(false);
      setForm({ date_start: '', date_end: '', type: 'scheduled_with_notice', hours: '0', notes: '' });
      toast({ title: 'Day off added' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDayOff.mutateAsync(id);
      toast({ title: 'Day off removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleTardyReview = async (id: string, status: 'approved' | 'unapproved', reason: string) => {
    try {
      await updateTardy.mutateAsync({
        id,
        updates: {
          approval_status: status,
          reason_text: reason,
          approved_by: status === 'approved' ? user?.id : null,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
        },
      });
      toast({ title: `Tardy marked as ${status}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRecompute = async () => {
    if (!startDate || !endDate) return;
    try {
      const count = await recompute.mutateAsync({ startDate, endDate });
      toast({ title: `Recomputed ${count} days` });
    } catch (err: any) {
      toast({ title: 'Recompute failed', description: err.message, variant: 'destructive' });
    }
  };

  // Build a lookup of days_off by date for counter classification
  const daysOffByDate = useMemo(() => {
    const map = new Map<string, DayOffRow[]>();
    (daysOff || []).forEach(d => {
      // Expand date range
      const start = new Date(d.date_start + 'T00:00:00');
      const end = new Date(d.date_end + 'T00:00:00');
      for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        const key = cur.toISOString().split('T')[0];
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(d);
      }
    });
    return map;
  }, [daysOff]);

  // Closure dates set for quick lookup
  const closureDates = useMemo(() => {
    const set = new Set<string>();
    (closures || []).forEach(c => set.add(c.closure_date));
    return set;
  }, [closures]);

  // Summary counters - properly categorized
  const summary = useMemo(() => {
    const rows = statusRows || [];

    // Absent: is_absent AND (no day_off covering OR day_off type=unscheduled)
    const absentCount = rows.filter(r => {
      if (!r.is_absent) return false;
      const dayOffs = daysOffByDate.get(r.entry_date) || [];
      if (dayOffs.length === 0) return true; // no day off = truly absent
      // If covered only by unscheduled, still counts as absent
      return dayOffs.every(d => d.type === 'unscheduled');
    }).length;

    // Days Off: days covered by days_off with type IN (scheduled_with_notice, medical_leave, other)
    const daysOffCount = rows.filter(r => {
      const dayOffs = daysOffByDate.get(r.entry_date) || [];
      return dayOffs.some(d => ['scheduled_with_notice', 'medical_leave', 'other'].includes(d.type));
    }).length;

    // Closures: office_closed from attendance_day_status OR days_off type=office_closed
    const closuresCount = rows.filter(r => {
      if (r.office_closed) return true;
      const dayOffs = daysOffByDate.get(r.entry_date) || [];
      return dayOffs.some(d => d.type === 'office_closed');
    }).length;

    return {
      absent: absentCount,
      late: rows.filter(r => r.is_late).length,
      incomplete: rows.filter(r => r.is_incomplete).length,
      daysOff: daysOffCount,
      closures: closuresCount,
      remote: rows.filter(r => r.is_remote).length,
      edited: rows.filter(r => r.has_edits).length,
      unreviewedTardies: (tardies || []).filter(t => t.approval_status === 'unreviewed' && !t.resolved).length,
      needsTimeFix: rows.filter(r => r.timezone_suspect).length,
      missingShifts: rows.filter(r => {
        if (!r.is_absent) return false;
        if (r.office_closed) return false;
        const dayOffs = daysOffByDate.get(r.entry_date) || [];
        // Exclude if covered by scheduled/medical/other day off
        if (dayOffs.some(d => ['scheduled_with_notice', 'medical_leave', 'other'].includes(d.type))) return false;
        return true;
      }).length,
    };
  }, [statusRows, tardies, daysOffByDate]);

  // Filtered + sorted status rows
  const filteredStatus = useMemo(() => {
    let list = statusRows || [];
    if (attendanceFilter === 'all') {
      list = list.filter(r => r.is_scheduled_day || r.has_punches || r.office_closed || r.has_day_off);
    }
    switch (attendanceFilter) {
      case 'absent': list = list.filter(r => r.is_absent); break;
      case 'late': list = list.filter(r => r.is_late); break;
      case 'incomplete': list = list.filter(r => r.is_incomplete); break;
      case 'days_off': list = list.filter(r => r.has_day_off); break;
      case 'closures': list = list.filter(r => r.office_closed); break;
      case 'remote': list = list.filter(r => r.is_remote); break;
      case 'onsite': list = list.filter(r => !r.is_remote && r.has_punches); break;
    }
    const priority = (r: AttendanceDayStatusRow) => {
      if (r.is_absent) return 0;
      if (r.is_incomplete) return 1;
      if (r.is_late) return 2;
      if (r.has_edits) return 3;
      return 4;
    };
    return [...list].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return b.entry_date.localeCompare(a.entry_date);
    });
  }, [statusRows, attendanceFilter]);

  // Days Off tab: exclude office_closed, apply filter
  const filteredDaysOff = useMemo(() => {
    let list = (daysOff || []).filter(d => d.type !== 'office_closed');
    if (daysOffFilter !== 'all') {
      list = list.filter(d => d.type === daysOffFilter);
    }
    return [...list].sort((a, b) => b.date_start.localeCompare(a.date_start));
  }, [daysOff, daysOffFilter]);

  // Missing Shifts: truly absent, not closures, not covered by scheduled/medical/other day off
  const missingShiftRows = useMemo(() => {
    return (statusRows || []).filter(r => {
      if (!r.is_absent) return false;
      if (r.office_closed) return false;
      const dayOffs = daysOffByDate.get(r.entry_date) || [];
      if (dayOffs.some(d => ['scheduled_with_notice', 'medical_leave', 'other'].includes(d.type))) return false;
      return true;
    }).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  }, [statusRows, daysOffByDate]);

  const activeTardies = (tardies || []).filter(t => !t.resolved);

  const filteredTardies = useMemo(() => {
    let list = activeTardies;
    if (showOnlyTracked) list = list.filter(t => t.approval_status !== 'approved');
    if (approvalFilter !== 'all') list = list.filter(t => t.approval_status === approvalFilter);
    return list;
  }, [activeTardies, showOnlyTracked, approvalFilter]);

  // Closures tab: office_closures + legacy days_off with type=office_closed
  const closuresList = useMemo(() => {
    const fromClosures = (closures || []).map(c => ({
      id: c.id,
      date: c.closure_date,
      name: c.name,
      source: 'office_closures' as const,
    }));
    const fromDaysOff = (daysOff || []).filter(d => d.type === 'office_closed').map(d => ({
      id: d.id,
      date: d.date_start,
      name: d.notes || 'Office Closed',
      source: 'days_off' as const,
    }));
    return [...fromClosures, ...fromDaysOff].sort((a, b) => b.date.localeCompare(a.date));
  }, [closures, daysOff]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Attendance</h1>
          <p className="text-muted-foreground">Track days off, tardies, missing shifts, and closures</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRecompute} disabled={recompute.isPending}>
            {recompute.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Recompute
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Day Off</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Day Off</DialogTitle></DialogHeader>
              <div className="space-y-4">
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
                      {Object.entries(typeLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Hours (optional)</Label>
                  <Input type="number" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Notes{formNotesRequired ? <span className="text-destructive"> *</span> : ' (optional)'}</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={formNotesRequired ? 'Required: describe the reason' : 'Vacation, doctor appointment, etc.'} />
                </div>
                <Button onClick={handleAdd} disabled={addDayOff.isPending || (formNotesRequired && !form.notes.trim())} className="w-full">
                  {addDayOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Date range selector */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary counters */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
        <Card className="card-elevated border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{summary.absent}</p>
            <p className="text-xs text-muted-foreground">Absent</p>
          </CardContent>
        </Card>
        <Card className="card-elevated border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{summary.late}</p>
            <p className="text-xs text-muted-foreground">Late</p>
          </CardContent>
        </Card>
        <Card className="card-elevated border-warning/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-warning">{summary.incomplete}</p>
            <p className="text-xs text-muted-foreground">Incomplete</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{summary.daysOff}</p>
            <p className="text-xs text-muted-foreground">Days Off</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-success">{summary.closures}</p>
            <p className="text-xs text-muted-foreground">Closures</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{summary.remote}</p>
            <p className="text-xs text-muted-foreground">Remote</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-accent">{summary.edited}</p>
            <p className="text-xs text-muted-foreground">Edited</p>
          </CardContent>
        </Card>
      </div>

      {/* Unreviewed Queue */}
      {(summary.unreviewedTardies > 0 || summary.missingShifts > 0 || summary.incomplete > 0 || summary.needsTimeFix > 0) && (
        <Card className="card-elevated border-warning/40">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Unreviewed Items</p>
            <div className="flex flex-wrap gap-2">
              {summary.unreviewedTardies > 0 && (
                <button onClick={() => { setTab('tardies'); setApprovalFilter('unreviewed'); }} className="text-xs px-3 py-1.5 rounded-full bg-destructive/10 text-destructive font-medium hover:bg-destructive/20 transition-colors">
                  {summary.unreviewedTardies} Unreviewed Tardies
                </button>
              )}
              {summary.missingShifts > 0 && (
                <button onClick={() => setTab('missing')} className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">
                  {summary.missingShifts} Missing Shifts
                </button>
              )}
              {summary.incomplete > 0 && (
                <button onClick={() => { setTab('status'); setAttendanceFilter('incomplete'); }} className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">
                  {summary.incomplete} Incomplete Punches
                </button>
              )}
              {summary.needsTimeFix > 0 && (
                <button onClick={() => { setTab('status'); setAttendanceFilter('all'); }} className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">
                  {summary.needsTimeFix} Needs Time Fix
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="status">Attendance Status</TabsTrigger>
          <TabsTrigger value="days_off">Days Off</TabsTrigger>
          <TabsTrigger value="tardies">
            Tardies
            {activeTardies.length > 0 && (
              <span className="ml-1.5 text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">{activeTardies.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing">
            Missing Shifts
            {summary.missingShifts > 0 && (
              <span className="ml-1.5 text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded-full">{summary.missingShifts}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="closures">Closures</TabsTrigger>
        </TabsList>

        {/* ATTENDANCE STATUS TAB */}
        <TabsContent value="status">
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={attendanceFilter} onValueChange={v => setAttendanceFilter(v as AttendanceFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Days</SelectItem>
                <SelectItem value="absent">Absent ({summary.absent})</SelectItem>
                <SelectItem value="late">Late ({summary.late})</SelectItem>
                <SelectItem value="incomplete">Incomplete ({summary.incomplete})</SelectItem>
                <SelectItem value="days_off">Days Off ({summary.daysOff})</SelectItem>
                <SelectItem value="closures">Closures ({summary.closures})</SelectItem>
                <SelectItem value="remote">Remote ({summary.remote})</SelectItem>
                <SelectItem value="onsite">On-site</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Schedule</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tardy</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {statusLoading ? (
                    <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : !filteredStatus.length ? (
                    <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No attendance data for this range</td></tr>
                  ) : (
                    filteredStatus.map(row => (
                      <tr key={row.id} className={`hover:bg-muted/50 ${row.is_absent ? 'border-l-4 border-l-destructive' : row.is_late ? 'border-l-4 border-l-warning' : ''}`}>
                        <td className="px-4 py-3 font-medium">{formatDate(row.entry_date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {row.is_absent && <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">Absent</span>}
                            {row.is_incomplete && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Incomplete</span>}
                            {row.is_late && <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">{row.minutes_late}m late</span>}
                            {row.has_edits && <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent font-medium">Edited</span>}
                            {row.timezone_suspect && <button onClick={() => setFixRow(row)} className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium hover:bg-warning/30 cursor-pointer transition-colors">⚠ Needs Time Fix</button>}
                            {row.office_closed && <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Closed</span>}
                            {row.has_day_off && <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-medium">Day Off</span>}
                            {!row.is_absent && !row.is_incomplete && !row.is_late && !row.office_closed && !row.has_day_off && row.has_punches && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">OK</span>
                            )}
                            {!row.is_scheduled_day && !row.office_closed && !row.has_day_off && !row.has_punches && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Not scheduled</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {row.is_scheduled_day ? `${row.schedule_expected_start?.slice(0, 5)} – ${row.schedule_expected_end?.slice(0, 5)}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${row.is_remote ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {row.is_remote ? 'Remote' : row.has_punches ? 'On-site' : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize">{row.tardy_approval_status !== 'unreviewed' ? row.tardy_approval_status : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <AttendanceActions row={row} alwaysShow />
                            {row.has_punches && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/timesheet?date=${row.entry_date}`)} title="View in Timesheet">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDebugRow(row)} title="Debug">
                              <Bug className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* DAYS OFF TAB — excludes office_closed, with filter pills */}
        <TabsContent value="days_off">
          <div className="flex flex-wrap gap-2 mb-4">
            {(['all', 'scheduled_with_notice', 'unscheduled', 'medical_leave', 'other'] as DaysOffFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDaysOffFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  daysOffFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {f === 'all' ? 'All' : typeLabels[f]}
              </button>
            ))}
          </div>
          <Card className="card-elevated">
            <CardContent className="p-0">
              {daysOffLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !filteredDaysOff.length ? (
                <p className="text-center text-muted-foreground py-12">No days off recorded</p>
              ) : (
                <div className="divide-y">
                  {filteredDaysOff.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {formatDate(d.date_start)}
                            {d.date_start !== d.date_end && ` — ${formatDate(d.date_end)}`}
                          </p>
                          {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[d.type]}`}>
                          {typeLabels[d.type]}
                        </span>
                        {d.hours != null && <span className="text-xs text-muted-foreground">{d.hours}h</span>}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(d.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TARDIES TAB */}
        <TabsContent value="tardies">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <div className="flex items-center gap-2">
              <Switch checked={showOnlyTracked} onCheckedChange={setShowOnlyTracked} />
              <Label className="text-xs">Tracked only</Label>
            </div>
            <Select value={approvalFilter} onValueChange={setApprovalFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="unapproved">Unapproved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expected</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actual</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Minutes Late</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tardiesLoading ? (
                    <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : !filteredTardies.length ? (
                    <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No tardies recorded</td></tr>
                  ) : (
                    filteredTardies.map(t => (
                      <tr key={t.id} className={t.timezone_suspect ? 'bg-warning/5' : ''}>
                        <td className="px-4 py-3 font-medium">
                          {formatDate(t.entry_date)}
                          {t.timezone_suspect && (
                            <button onClick={() => {
                              const statusRow = (statusRows || []).find(r => r.entry_date === t.entry_date);
                              setFixRow(statusRow || { entry_date: t.entry_date, schedule_expected_start: t.expected_start_time, timezone_suspect: true } as any);
                            }} className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium hover:bg-warning/30 cursor-pointer transition-colors" title="Click to fix">⚠ Needs Time Fix</button>
                          )}
                        </td>
                        <td className="px-4 py-3 time-display text-sm">{t.expected_start_time?.slice(0, 5)}</td>
                        <td className="px-4 py-3 time-display text-sm">
                          {t.timezone_suspect ? (
                            <span className="text-warning italic">—</span>
                          ) : (
                            new Date(t.actual_start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-destructive">
                          {t.timezone_suspect ? '—' : t.minutes_late}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.reason_text || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            t.approval_status === 'approved' ? 'bg-success/20 text-success' :
                            t.approval_status === 'unapproved' ? 'bg-destructive/20 text-destructive' :
                            'bg-warning/20 text-warning'
                          }`}>{t.approval_status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReviewTardy(t)}>
                            {t.approval_status === 'unreviewed' ? 'Review' : 'Edit'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredTardies.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-right">Totals:</td>
                      <td className="px-4 py-3 text-destructive">{filteredTardies.filter(t => !t.timezone_suspect).reduce((s, t) => s + t.minutes_late, 0)} min</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          <TardyReviewModal
            open={!!reviewTardy}
            tardy={reviewTardy}
            onSubmit={handleTardyReview}
            onClose={() => setReviewTardy(null)}
          />
        </TabsContent>

        {/* MISSING SHIFTS TAB — truly absent, not closures, not scheduled/medical/other day off */}
        <TabsContent value="missing">
          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Schedule</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Coverage</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {statusLoading ? (
                    <tr><td colSpan={4} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : !missingShiftRows.length ? (
                    <tr><td colSpan={4} className="py-12 text-center text-muted-foreground">No missing shifts — all clear!</td></tr>
                  ) : (
                    missingShiftRows.map(row => {
                      const dayOffs = daysOffByDate.get(row.entry_date) || [];
                      const hasUnscheduled = dayOffs.some(d => d.type === 'unscheduled');
                      return (
                        <tr key={row.id} className="border-l-4 border-l-destructive hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium">{formatDate(row.entry_date)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {row.schedule_expected_start?.slice(0, 5)} – {row.schedule_expected_end?.slice(0, 5)}
                          </td>
                          <td className="px-4 py-3">
                            {hasUnscheduled ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">Unscheduled Day Off</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">No coverage</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <AttendanceActions row={row} alwaysShow />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* CLOSURES TAB */}
        <TabsContent value="closures">
          <Card className="card-elevated">
            <CardContent className="p-0">
              {!closuresList.length ? (
                <p className="text-center text-muted-foreground py-12">No office closures recorded.</p>
              ) : (
                <div className="divide-y">
                  {closuresList.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-success" />
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(c.date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Office Closed</span>
                        {c.source === 'days_off' && <span className="text-xs text-muted-foreground">(legacy)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DebugDrawer row={debugRow} open={!!debugRow} onClose={() => setDebugRow(null)} />

      <TimeFixModal
        open={!!fixRow}
        entryDate={fixRow?.entry_date || ''}
        timeEntryId={null}
        scheduleStart={fixRow?.schedule_expected_start || null}
        timezone={userTimezone}
        onClose={() => setFixRow(null)}
      />
    </div>
  );
}
