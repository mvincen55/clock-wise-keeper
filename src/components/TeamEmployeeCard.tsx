import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEmployeeAttendance } from '@/hooks/useEmployees';
import { useEmployeeScheduleAssignments, useEmployeeTardies, useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';
import { WEEKDAY_NAMES, DEFAULT_WEEKDAYS, summarizeWeekdays } from '@/hooks/useScheduleVersions';
import type { ScheduleWeekdayRow } from '@/hooks/useScheduleVersions';
import { useOrgContext } from '@/hooks/useOrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { ChevronDown, ChevronUp, Clock, Calendar, AlertTriangle, CalendarOff, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

type Employee = {
  id: string;
  display_name: string;
  email: string | null;
  user_id: string | null;
  timezone: string;
};

type WeekStats = { present: number; late: number; absent: number };

type WeekdayDraft = Omit<ScheduleWeekdayRow, 'id' | 'schedule_version_id'>;

const statusBadge: Record<string, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-success/20 text-success' },
  remote_ok: { label: 'Remote', className: 'bg-accent/20 text-accent' },
  late: { label: 'Late', className: 'bg-warning/20 text-warning' },
  absent: { label: 'Absent', className: 'bg-destructive/20 text-destructive' },
  incomplete: { label: 'Incomplete', className: 'bg-warning/20 text-warning' },
  closure: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
  day_off: { label: 'Day Off', className: 'bg-primary/20 text-primary' },
  unscheduled: { label: 'No Sched', className: 'bg-muted text-muted-foreground' },
  timezone_suspect: { label: 'TZ Issue', className: 'bg-destructive/20 text-destructive' },
};

const DAY_OFF_LABELS: Record<string, string> = {
  scheduled_with_notice: 'Scheduled',
  unscheduled: 'Unscheduled',
  office_closed: 'Office Closed',
  medical_leave: 'Medical',
  other: 'Other',
};

function getLast30Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function TeamEmployeeCard({ employee, stats }: { employee: Employee; stats: WeekStats }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('attendance');
  const range = useMemo(() => getLast30Days(), []);

  return (
    <Card className="card-elevated overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {employee.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{employee.display_name}</p>
            <p className="text-xs text-muted-foreground">{employee.email || 'No email'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.late > 0 && <Badge variant="outline" className="text-warning border-warning/30 text-xs">{stats.late} late</Badge>}
          {stats.absent > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">{stats.absent} absent</Badge>}
          {stats.present > 0 && <Badge variant="outline" className="text-success border-success/30 text-xs">{stats.present} present</Badge>}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <CardContent className="border-t pt-3 pb-4 px-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-4 mb-3">
              <TabsTrigger value="attendance" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Attendance</TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs"><Clock className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
              <TabsTrigger value="tardies" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Tardies</TabsTrigger>
              <TabsTrigger value="callouts" className="text-xs"><CalendarOff className="h-3 w-3 mr-1" />Callouts</TabsTrigger>
            </TabsList>
            <TabsContent value="attendance"><AttendanceTab employeeId={employee.id} range={range} /></TabsContent>
            <TabsContent value="schedule"><ScheduleTab employee={employee} /></TabsContent>
            <TabsContent value="tardies"><TardiesTab employeeId={employee.id} range={range} /></TabsContent>
            <TabsContent value="callouts"><CalloutsTab employeeId={employee.id} /></TabsContent>
          </Tabs>
          <div className="mt-3 flex justify-end">
            <Link to={`/team/${employee.id}`}>
              <Button variant="outline" size="sm" className="text-xs"><Pencil className="h-3 w-3 mr-1" />Full Detail</Button>
            </Link>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Attendance Tab ─── */
function AttendanceTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  const { data: attendance, isLoading } = useEmployeeAttendance(employeeId, range);
  if (isLoading) return <LoadingSpinner />;
  if (!attendance?.length) return <EmptyState text="No attendance data for last 30 days." />;
  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {attendance.map(row => {
        const sb = statusBadge[row.status_code] || statusBadge.ok;
        return (
          <div key={row.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium w-20 text-xs">{formatDate(row.entry_date)}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sb.className}`}>{sb.label}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {row.schedule_expected_start && <span>Sched: {row.schedule_expected_start?.toString().slice(0, 5)}</span>}
              {row.minutes_late != null && row.minutes_late > 0 && <span className="text-warning font-semibold">+{row.minutes_late}min</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Schedule Tab (full CRUD) ─── */
function ScheduleTab({ employee }: { employee: Employee }) {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: assignments, isLoading } = useEmployeeScheduleAssignments(employee.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formRemote, setFormRemote] = useState(false);
  const [formWeekdays, setFormWeekdays] = useState<WeekdayDraft[]>([...DEFAULT_WEEKDAYS]);

  const openCreate = () => {
    setEditingAssignment(null);
    setFormName('');
    setFormStart(new Date().toISOString().split('T')[0]);
    setFormEnd('');
    setFormRemote(false);

    // Copy from current active assignment if exists
    const active = assignments?.find((a: any) => !a.effective_end || a.effective_end >= new Date().toISOString().split('T')[0]);
    if (active?.schedule_version?.weekdays?.length) {
      setFormWeekdays(active.schedule_version.weekdays.map((w: any) => ({
        weekday: w.weekday, enabled: w.enabled, start_time: w.start_time,
        end_time: w.end_time, grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
      })));
      setFormRemote(active.schedule_version.apply_to_remote);
    } else {
      setFormWeekdays([...DEFAULT_WEEKDAYS]);
    }
    setModalOpen(true);
  };

  const openEdit = (a: any) => {
    setEditingAssignment(a);
    const sv = a.schedule_version;
    setFormName(sv?.name || '');
    setFormStart(a.effective_start);
    setFormEnd(a.effective_end || '');
    setFormRemote(sv?.apply_to_remote || false);
    if (sv?.weekdays?.length) {
      setFormWeekdays(sv.weekdays.map((w: any) => ({
        weekday: w.weekday, enabled: w.enabled, start_time: w.start_time,
        end_time: w.end_time, grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
      })));
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formStart || !user || !ctx) return;
    if (!formWeekdays.some(w => w.enabled)) {
      toast({ title: 'At least one weekday must be enabled', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingAssignment) {
        // Update existing schedule version + assignment
        const sv = editingAssignment.schedule_version;
        await supabase.from('schedule_versions').update({
          name: formName || null,
          effective_start_date: formStart,
          effective_end_date: formEnd || null,
          apply_to_remote: formRemote,
        }).eq('id', sv.id);

        for (const wd of sv.weekdays) {
          const draft = formWeekdays.find((d: any) => d.weekday === wd.weekday);
          if (draft) {
            await supabase.from('schedule_weekdays').update({
              enabled: draft.enabled, start_time: draft.start_time, end_time: draft.end_time,
              grace_minutes: draft.grace_minutes, threshold_minutes: draft.threshold_minutes,
            }).eq('id', wd.id);
          }
        }

        await supabase.from('schedule_assignments').update({
          effective_start: formStart,
          effective_end: formEnd || null,
        }).eq('id', editingAssignment.id);

        toast({ title: 'Schedule updated' });
      } else {
        // Auto-end previous active assignments AND their schedule versions
        if (assignments?.length) {
          const newEndDate = new Date(formStart + 'T00:00:00');
          newEndDate.setDate(newEndDate.getDate() - 1);
          const newEndStr = newEndDate.toISOString().split('T')[0];
          for (const a of assignments as any[]) {
            if (!a.effective_end || a.effective_end >= formStart) {
              await supabase.from('schedule_assignments').update({
                effective_end: newEndStr,
              }).eq('id', a.id);
              // Also end-date the schedule version to avoid GiST exclusion conflict
              if (a.schedule_version?.id) {
                await supabase.from('schedule_versions').update({
                  effective_end_date: newEndStr,
                }).eq('id', a.schedule_version.id);
              }
            }
          }
        }

        // Create schedule version
        const { data: version, error: vErr } = await supabase.from('schedule_versions').insert({
          user_id: employee.user_id || user.id,
          org_id: ctx.org_id,
          employee_id: employee.id,
          name: formName || null,
          effective_start_date: formStart,
          effective_end_date: formEnd || null,
          apply_to_remote: formRemote,
          timezone: employee.timezone || 'America/New_York',
          week_start_day: 1,
        }).select('id').single();
        if (vErr) throw vErr;

        // Create weekdays
        const wdRows = formWeekdays.map(w => ({
          schedule_version_id: version.id, weekday: w.weekday, enabled: w.enabled,
          start_time: w.start_time, end_time: w.end_time,
          grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
        }));
        const { error: wErr } = await supabase.from('schedule_weekdays').insert(wdRows);
        if (wErr) throw wErr;

        // Create assignment
        const { error: aErr } = await supabase.from('schedule_assignments').insert({
          org_id: ctx.org_id,
          employee_id: employee.id,
          schedule_version_id: version.id,
          effective_start: formStart,
          effective_end: formEnd || null,
        });
        if (aErr) throw aErr;

        toast({ title: 'Schedule created & assigned' });
      }

      qc.invalidateQueries({ queryKey: ['employee-schedule-assignments', employee.id] });
      qc.invalidateQueries({ queryKey: ['schedule-versions'] });
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (assignmentId: string, versionId: string) => {
    try {
      await supabase.from('schedule_assignments').delete().eq('id', assignmentId);
      await supabase.from('schedule_weekdays').delete().eq('schedule_version_id', versionId);
      await supabase.from('schedule_versions').delete().eq('id', versionId);
      qc.invalidateQueries({ queryKey: ['employee-schedule-assignments', employee.id] });
      toast({ title: 'Schedule removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
        <Plus className="h-3.5 w-3.5 mr-1" />Add Schedule
      </Button>

      {!assignments?.length ? (
        <EmptyState text="No schedule assigned yet." />
      ) : (
        <div className="space-y-2">
          {(assignments as any[]).map(a => {
            const sv = a.schedule_version;
            if (!sv) return null;
            const weekdays = (sv.weekdays || []).sort((x: any, y: any) => x.weekday - y.weekday);
            const isActive = a.effective_start <= today && (!a.effective_end || a.effective_end >= today);

            return (
              <div key={a.id} className={`rounded-lg border ${isActive ? 'border-primary/30' : 'border-muted'}`}>
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{sv.name || 'Schedule'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(a.effective_start)}{a.effective_end ? ` → ${formatDate(a.effective_end)}` : ' → Present'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isActive && <Badge variant="default" className="text-xs mr-1">Active</Badge>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id, sv.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {weekdays.map((w: any) => (
                    <div key={w.weekday} className={`flex items-center gap-3 px-3 py-1.5 text-xs ${!w.enabled ? 'opacity-40' : ''}`}>
                      <span className="w-10 font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
                      {w.enabled ? (
                        <>
                          <span className="font-mono">{w.start_time?.slice(0, 5)} – {w.end_time?.slice(0, 5)}</span>
                          {w.grace_minutes > 0 && <span className="text-muted-foreground">({w.grace_minutes}m grace)</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Off</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-3 py-1.5 border-t text-xs text-muted-foreground">
                  Remote: {sv.apply_to_remote ? 'Yes' : 'No'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Schedule' : 'New Schedule'} — {employee.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm">Name (optional)</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Summer Hours" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Start Date *</Label>
                <Input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">End Date (optional)</Label>
                <Input type="date" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formRemote} onCheckedChange={setFormRemote} />
              <Label className="text-sm">Apply to remote days</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Weekday Rules</Label>
              <WeekdayEditor weekdays={formWeekdays} onChange={setFormWeekdays} />
            </div>
            <Button onClick={handleSave} disabled={saving || !formStart} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingAssignment ? 'Save Changes' : 'Create & Assign'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Weekday Editor ─── */
function WeekdayEditor({ weekdays, onChange }: { weekdays: WeekdayDraft[]; onChange: (w: WeekdayDraft[]) => void }) {
  const update = (idx: number, patch: Partial<WeekdayDraft>) => {
    const next = [...weekdays];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="divide-y rounded-lg border">
      {weekdays.sort((a, b) => a.weekday - b.weekday).map((w, idx) => (
        <div key={w.weekday} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${!w.enabled ? 'opacity-50' : ''}`}>
          <div className="w-20 flex items-center gap-1.5">
            <Switch checked={w.enabled} onCheckedChange={v => update(idx, { enabled: v })} />
            <span className="text-xs font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Input type="time" value={w.start_time?.slice(0, 5)} onChange={e => update(idx, { start_time: e.target.value })} disabled={!w.enabled} className="w-[6.5rem] text-xs h-7" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="time" value={w.end_time?.slice(0, 5)} onChange={e => update(idx, { end_time: e.target.value })} disabled={!w.enabled} className="w-[6.5rem] text-xs h-7" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">Grace</Label>
            <Input type="number" min={0} value={w.grace_minutes} onChange={e => update(idx, { grace_minutes: parseInt(e.target.value) || 0 })} disabled={!w.enabled} className="w-14 text-xs h-7" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">Thresh</Label>
            <Input type="number" min={1} value={w.threshold_minutes} onChange={e => update(idx, { threshold_minutes: parseInt(e.target.value) || 1 })} disabled={!w.enabled} className="w-14 text-xs h-7" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Tardies Tab ─── */
function TardiesTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  const { data: tardies, isLoading } = useEmployeeTardies(employeeId, range.start, range.end);
  if (isLoading) return <LoadingSpinner />;
  if (!tardies?.length) return <EmptyState text="No tardies in last 30 days. 🎉" />;

  const approvalBadge: Record<string, { label: string; className: string }> = {
    unreviewed: { label: 'Unreviewed', className: 'bg-muted text-muted-foreground' },
    approved: { label: 'Approved', className: 'bg-success/20 text-success' },
    unapproved: { label: 'Unapproved', className: 'bg-destructive/20 text-destructive' },
  };

  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {tardies.map((t: any) => {
        const ab = approvalBadge[t.approval_status] || approvalBadge.unreviewed;
        return (
          <div key={t.id} className="px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs w-20">{formatDate(t.entry_date)}</span>
                <span className="text-warning font-semibold text-xs">+{t.minutes_late}min</span>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ab.className}`}>{ab.label}</span>
            </div>
            {t.reason_text && <p className="text-xs text-muted-foreground mt-1 italic">"{t.reason_text}"</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Callouts Tab ─── */
function CalloutsTab({ employeeId }: { employeeId: string }) {
  const { data: daysOff, isLoading } = useEmployeeDaysOff(employeeId);
  if (isLoading) return <LoadingSpinner />;
  if (!daysOff?.length) return <EmptyState text="No callouts or days off recorded." />;

  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {daysOff.map((d: any) => (
        <div key={d.id} className="px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs w-20">{formatDate(d.date_start)}</span>
              {d.date_start !== d.date_end && <span className="text-xs text-muted-foreground">→ {formatDate(d.date_end)}</span>}
            </div>
            <Badge variant="outline" className="text-xs">{DAY_OFF_LABELS[d.type] || d.type}</Badge>
          </div>
          {d.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{d.notes}"</p>}
          {d.hours != null && <p className="text-xs text-muted-foreground mt-0.5">{d.hours}h</p>}
        </div>
      ))}
    </div>
  );
}

/* ─── Helpers ─── */
function LoadingSpinner() {
  return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
}
function EmptyState({ text }: { text: string }) {
  return <p className="text-center text-muted-foreground text-sm py-6">{text}</p>;
}
