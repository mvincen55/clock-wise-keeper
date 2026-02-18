import { useState, useMemo } from 'react';
import { useDaysOff, useAddDayOff, useDeleteDayOff, DayOffRow } from '@/hooks/useDaysOff';
import { useTardies, useUpdateTardy, TardyRow } from '@/hooks/useTardies';
import { useAttendanceExceptions, AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
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
import { CalendarDays, Plus, Trash2, Loader2, AlertTriangle, Clock, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const typeLabels: Record<string, string> = {
  scheduled_with_notice: 'Scheduled w/ Notice',
  unscheduled: 'Unscheduled',
  office_closed: 'Office Closed',
  other: 'Other',
};

const typeColors: Record<string, string> = {
  scheduled_with_notice: 'bg-primary/20 text-primary',
  unscheduled: 'bg-destructive/20 text-destructive',
  office_closed: 'bg-success/20 text-success',
  other: 'bg-accent/20 text-accent',
  tardy: 'bg-destructive/20 text-destructive',
};

const exceptionStatusColors: Record<string, string> = {
  open: 'bg-warning/20 text-warning',
  resolved: 'bg-success/20 text-success',
  ignored: 'bg-muted text-muted-foreground',
};

export default function DaysOff() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: daysOff, isLoading } = useDaysOff(year);
  const { data: tardies, isLoading: tardiesLoading } = useTardies(`${year}-01-01`, `${year}-12-31`);
  const { data: exceptions } = useAttendanceExceptions(`${year}-01-01`, `${year}-12-31`);
  const { data: closures } = useOfficeClosures(year);
  const addDayOff = useAddDayOff();
  const deleteDayOff = useDeleteDayOff();
  const updateTardy = useUpdateTardy();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [showOfficeClosed, setShowOfficeClosed] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  const [form, setForm] = useState({
    date_start: '',
    date_end: '',
    type: 'scheduled_with_notice' as 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'other',
    hours: '',
    notes: '',
  });

  const handleAdd = async () => {
    if (!form.date_start || !form.date_end) return;
    try {
      await addDayOff.mutateAsync({
        date_start: form.date_start,
        date_end: form.date_end,
        type: form.type,
        hours: form.hours ? parseFloat(form.hours) : undefined,
        notes: form.notes || undefined,
      });
      setOpen(false);
      setForm({ date_start: '', date_end: '', type: 'scheduled_with_notice', hours: '', notes: '' });
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

  const handleApproval = async (tardy: TardyRow, status: 'approved' | 'unapproved' | 'unreviewed') => {
    try {
      await updateTardy.mutateAsync({
        id: tardy.id,
        updates: {
          approval_status: status,
          approved_by: status === 'approved' ? user?.id : null,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
        },
      });
      toast({ title: `Tardy marked as ${status}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const countByType = (daysOff || []).reduce((acc, d) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activeTardies = (tardies || []).filter(t => !t.resolved);
  const trackedTardies = activeTardies.filter(t => t.approval_status !== 'approved');
  const openExceptions = (exceptions || []).filter(e => e.status === 'open');

  const filteredTardies = useMemo(() => {
    let list = activeTardies;
    if (showOnlyTracked) list = list.filter(t => t.approval_status !== 'approved');
    if (approvalFilter !== 'all') list = list.filter(t => t.approval_status === approvalFilter);
    return list;
  }, [activeTardies, showOnlyTracked, approvalFilter]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Attendance</h1>
          <p className="text-muted-foreground">Track days off, tardies, missing shifts, and closures</p>
        </div>
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
                <Input type="number" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="8" />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Vacation, doctor appointment, etc." />
              </div>
              <Button onClick={handleAdd} disabled={addDayOff.isPending} className="w-full">
                {addDayOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {Object.entries(typeLabels).map(([key, label]) => (
          <Card key={key} className="card-elevated">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{countByType[key] || 0}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
        <Card className="card-elevated border-destructive/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
            <p className="text-xs text-muted-foreground">Tardies</p>
          </CardContent>
        </Card>
        <Card className="card-elevated border-warning/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">{openExceptions.length}</p>
            <p className="text-xs text-muted-foreground">Missing Shifts</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{closures?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Closures</p>
          </CardContent>
        </Card>
        <Card className="card-elevated border-warning/30">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">{trackedTardies.length}</p>
            <p className="text-xs text-muted-foreground">Tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Year selector */}
      <div className="flex gap-2 items-center">
        <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>← {year - 1}</Button>
        <span className="font-semibold">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Days Off</TabsTrigger>
          <TabsTrigger value="tardies">
            Tardies
            {activeTardies.length > 0 && (
              <span className="ml-1.5 text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">{activeTardies.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing">
            Missing Shifts
            {openExceptions.length > 0 && (
              <span className="ml-1.5 text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded-full">{openExceptions.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="closures">
            Closures
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="card-elevated">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !daysOff?.length ? (
                <p className="text-center text-muted-foreground py-12">No days off recorded for {year}</p>
              ) : (
                <div className="divide-y">
                  {daysOff.map(d => (
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
                        {d.hours && <span className="text-xs text-muted-foreground">{d.hours}h</span>}
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
                      <tr key={t.id}>
                        <td className="px-4 py-3 font-medium">{formatDate(t.entry_date)}</td>
                        <td className="px-4 py-3 time-display text-sm">{t.expected_start_time?.slice(0, 5)}</td>
                        <td className="px-4 py-3 time-display text-sm">
                          {new Date(t.actual_start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-destructive">{t.minutes_late}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.reason_text || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            t.approval_status === 'approved' ? 'bg-success/20 text-success' :
                            t.approval_status === 'unapproved' ? 'bg-destructive/20 text-destructive' :
                            'bg-warning/20 text-warning'
                          }`}>{t.approval_status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Select value={t.approval_status} onValueChange={v => handleApproval(t, v as any)}>
                            <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unreviewed">Unreviewed</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="unapproved">Unapproved</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredTardies.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-right">Totals:</td>
                      <td className="px-4 py-3 text-destructive">{filteredTardies.reduce((s, t) => s + t.minutes_late, 0)} min</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="missing">
          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resolution</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resolved At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!exceptions?.length ? (
                    <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">No attendance exceptions recorded</td></tr>
                  ) : (
                    exceptions.map(e => (
                      <tr key={e.id}>
                        <td className="px-4 py-3 font-medium">{formatDate(e.exception_date)}</td>
                        <td className="px-4 py-3 text-xs capitalize">{e.type.replace('_', ' ')}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${exceptionStatusColors[e.status]}`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{e.reason_text || '—'}</td>
                        <td className="px-4 py-3 text-xs capitalize">{e.resolution_action?.replace('_', ' ') || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {e.resolved_at ? new Date(e.resolved_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="closures">
          <Card className="card-elevated">
            <CardContent className="p-0">
              {!closures?.length ? (
                <p className="text-center text-muted-foreground py-12">No office closures for {year}. Add them in Settings.</p>
              ) : (
                <div className="divide-y">
                  {closures.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-success" />
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(c.closure_date)}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Office Closed</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
