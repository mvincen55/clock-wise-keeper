import { useState, useEffect, useMemo } from 'react';
import { useTimeEntries, useUpdateEntry, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useWorkSchedule, getScheduleForWeekday } from '@/hooks/useWorkSchedule';
import { useTardies, useUpsertTardy, useUpdateTardy, TardyRow } from '@/hooks/useTardies';
import { useAuth } from '@/hooks/useAuth';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { useAttendanceDayStatus, useRecomputeAttendance } from '@/hooks/useAttendanceDayStatus';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table2, ChevronDown, ChevronRight, Loader2, MapPin, Save, AlertTriangle, Filter, Pencil, ArrowUpDown } from 'lucide-react';
import { EditAuditDialog } from '@/components/EditAuditDialog';
import { TardyReasonModal } from '@/components/TardyReasonModal';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { useToast } from '@/hooks/use-toast';

function computeLateInfo(entry: TimeEntryRow, schedule: ReturnType<typeof useWorkSchedule>['data']) {
  if (!schedule?.length) return null;
  const sched = getScheduleForWeekday(schedule, entry.entry_date);
  if (!sched || !sched.enabled) return null;
  if (entry.is_remote && !sched.apply_to_remote) return null;

  const punches = entry.punches || [];
  const firstIn = punches.find(p => p.punch_type === 'in');
  if (!firstIn) return null;

  const arrivalDate = new Date(firstIn.punch_time);
  const [sh, sm] = sched.start_time.split(':').map(Number);
  const expectedDate = new Date(entry.entry_date + 'T00:00:00');
  expectedDate.setHours(sh, sm + sched.grace_minutes, 0, 0);

  const diffMs = arrivalDate.getTime() - expectedDate.getTime();
  const diffMin = Math.ceil(diffMs / 60000);

  if (diffMin >= sched.threshold_minutes) {
    return { minutesLate: diffMin, expectedStart: sched.start_time, actualStart: firstIn.punch_time };
  }
  return null;
}

function EntryRow({ entry, schedule, tardy, onTardyPrompt }: {
  entry: TimeEntryRow;
  schedule: ReturnType<typeof useWorkSchedule>['data'];
  tardy?: TardyRow;
  onTardyPrompt: (entry: TimeEntryRow, info: { minutesLate: number; expectedStart: string; actualStart: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  const hasEditedPunches = (entry.punches || []).some((p: any) => p.is_edited);
  const updateEntry = useUpdateEntry();
  const { toast } = useToast();
  const [comment, setComment] = useState(entry.entry_comment || '');
  const [commentDirty, setCommentDirty] = useState(false);
  const [auditDialog, setAuditDialog] = useState<{ field: string; old: string; new: string; pendingUpdate: any } | null>(null);

  const punches = entry.punches || [];
  const lateInfo = computeLateInfo(entry, schedule);
  const isLate = !!lateInfo;
  const needsReason = isLate && tardy && !tardy.reason_text && !tardy.resolved;
  const isIncomplete = punches.length > 0 && punches[punches.length - 1].punch_type === 'in';
  const isAbsent = punches.length === 0;

  const handleRemoteToggle = () => {
    setAuditDialog({
      field: 'is_remote', old: entry.is_remote ? 'Remote' : 'On-site',
      new: entry.is_remote ? 'On-site' : 'Remote', pendingUpdate: { is_remote: !entry.is_remote },
    });
  };

  const handleAuditConfirm = async (reason: string) => {
    if (!auditDialog) return;
    try {
      await updateEntry.mutateAsync({
        entryId: entry.id, updates: auditDialog.pendingUpdate,
        audit: { field_changed: auditDialog.field, old_value: auditDialog.old, new_value: auditDialog.new, reason_comment: reason },
      });
      toast({ title: 'Updated with audit' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setAuditDialog(null);
  };

  const handleSaveComment = async () => {
    try {
      await updateEntry.mutateAsync({ entryId: entry.id, updates: { entry_comment: comment || null } });
      setCommentDirty(false);
      toast({ title: 'Comment saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <tr className={`cursor-pointer hover:bg-muted/50 transition-colors ${isLate ? 'border-l-4 border-l-destructive' : ''}`} onClick={() => setExpanded(!expanded)}>
        <td className="px-4 py-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3 font-medium">{formatDate(entry.entry_date)}</td>
        <td className="px-4 py-3 time-display text-sm font-semibold">
          {entry.total_minutes != null ? (
            <>
              {minutesToHHMM(entry.total_minutes)}
              <span className="text-muted-foreground font-normal ml-1 text-xs">({(entry.total_minutes / 60).toFixed(2)}h)</span>
            </>
          ) : '—'}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded ${entry.is_remote ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
            {entry.is_remote ? 'Remote' : 'On-site'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isAbsent && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Absent</span>}
            {isIncomplete && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Incomplete</span>}
            {isLate && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" />{lateInfo.minutesLate}m late
              </span>
            )}
            {hasEditedPunches && (
              <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive flex items-center gap-1">
                <Pencil className="h-3 w-3" /> Edited
              </span>
            )}
            {entry.entry_comment && <span className="text-xs text-muted-foreground" title={entry.entry_comment}>💬</span>}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-muted/30 px-8 py-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Punch Details</p>
                <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setPunchEditorOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Punches
                </Button>
              </div>
              {punches.length === 0 && <p className="text-sm text-muted-foreground">No punches recorded</p>}
              {punches.map(p => {
                const isEdited = (p as any).is_edited;
                const hasGps = p.location_lat != null && p.location_lng != null;
                return (
                  <div key={p.id} className="flex items-center gap-3 text-sm">
                    <span className={`text-xs font-semibold uppercase w-8 ${p.punch_type === 'in' ? 'text-success' : 'text-destructive'}`}>{p.punch_type}</span>
                    <span className={`time-display ${isEdited ? 'text-destructive font-semibold' : ''}`}>{formatTime(p.punch_time)}</span>
                    {isEdited && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">edited</span>}
                    {p.source !== 'manual' && <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">{p.source === 'auto_location' ? 'GPS' : p.source}</span>}
                    {hasGps && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" /> GPS recorded</span>}
                    {p.low_confidence && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">low GPS</span>}
                  </div>
                );
              })}
              {isLate && tardy && (
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">{lateInfo!.minutesLate} minutes late</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${tardy.approval_status === 'approved' ? 'bg-success/20 text-success' : tardy.approval_status === 'unapproved' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
                      {tardy.approval_status}
                    </span>
                  </div>
                  {tardy.reason_text && <p className="text-sm text-muted-foreground italic">Reason: {tardy.reason_text}</p>}
                  {needsReason && (
                    <Button size="sm" variant="destructive" onClick={e => { e.stopPropagation(); onTardyPrompt(entry, lateInfo!); }}>Add Reason</Button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Label className="text-xs">Remote</Label>
                <Switch checked={entry.is_remote} onCheckedChange={handleRemoteToggle} />
              </div>
              <div className="space-y-1 pt-2 border-t border-border">
                <Label className="text-xs">Daily Comment</Label>
                <div className="flex gap-2">
                  <Textarea value={comment} onChange={e => { setComment(e.target.value); setCommentDirty(true); }} rows={2} placeholder="Optional comment for this day..." className="text-sm" />
                  {commentDirty && <Button size="sm" onClick={handleSaveComment} className="self-end"><Save className="h-4 w-4" /></Button>}
                </div>
              </div>
              {entry.notes && <p className="text-sm text-muted-foreground mt-2 italic">{entry.notes}</p>}
            </div>
          </td>
        </tr>
      )}
      {auditDialog && (
        <EditAuditDialog open onClose={() => setAuditDialog(null)} onConfirm={handleAuditConfirm} fieldChanged={auditDialog.field} oldValue={auditDialog.old} newValue={auditDialog.new} />
      )}
      <PunchEditorModal open={punchEditorOpen} onClose={() => setPunchEditorOpen(false)} entryId={entry.id} entryDate={entry.entry_date} punches={punches} />
    </>
  );
}

type SortMode = 'attention' | 'chronological';
type FilterMode = 'all' | 'absent' | 'late' | 'incomplete' | 'edited' | 'unapproved';

export default function Timesheet() {
  const { user } = useAuth();
  const { data: payrollSettings } = usePayrollSettings();
  
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
  const [sortMode, setSortMode] = useState<SortMode>('attention');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');

  const { data: entries, isLoading } = useTimeEntries(startDate || undefined, endDate || undefined);
  const { data: schedule } = useWorkSchedule();
  const { data: tardies } = useTardies(startDate || undefined, endDate || undefined);
  const currentYear = new Date().getFullYear();
  const { data: closures } = useOfficeClosures(currentYear);
  const closureDateSet = useMemo(() => new Set((closures || []).map(c => c.closure_date)), [closures]);
  const missingDays = useMissingShifts(startDate || undefined, endDate || undefined);
  const upsertTardy = useUpsertTardy();
  const updateTardy = useUpdateTardy();
  const { toast } = useToast();

  const [tardyModal, setTardyModal] = useState<{ entry: TimeEntryRow; minutesLate: number; expectedStart: string; actualStart: string } | null>(null);

  // Auto-detect tardies
  useEffect(() => {
    if (!entries?.length || !schedule?.length || !user) return;
    entries.forEach(entry => {
      const info = computeLateInfo(entry, schedule);
      if (info) {
        upsertTardy.mutate({
          time_entry_id: entry.id, entry_date: entry.entry_date,
          expected_start_time: info.expectedStart, actual_start_time: info.actualStart, minutes_late: info.minutesLate,
        });
      }
    });
  }, [entries, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  const tardyMap = useMemo(() => {
    const map = new Map<string, TardyRow>();
    (tardies || []).forEach(t => map.set(t.entry_date, t));
    return map;
  }, [tardies]);

  // Compute status flags for each entry
  const entriesWithStatus = useMemo(() => {
    return (entries || []).map(entry => {
      const punches = entry.punches || [];
      const lateInfo = computeLateInfo(entry, schedule);
      const tardy = tardyMap.get(entry.entry_date);
      return {
        entry,
        isAbsent: punches.length === 0,
        isIncomplete: punches.length > 0 && punches[punches.length - 1].punch_type === 'in',
        isLate: !!lateInfo,
        minutesLate: lateInfo?.minutesLate || 0,
        hasEdits: punches.some((p: any) => p.is_edited),
        tardyApproval: tardy?.approval_status || 'none',
      };
    });
  }, [entries, schedule, tardyMap]);

  // Filter
  const filteredEntries = useMemo(() => {
    let list = entriesWithStatus;
    switch (filterMode) {
      case 'absent': list = list.filter(e => e.isAbsent); break;
      case 'late': list = list.filter(e => e.isLate); break;
      case 'incomplete': list = list.filter(e => e.isIncomplete); break;
      case 'edited': list = list.filter(e => e.hasEdits); break;
      case 'unapproved': list = list.filter(e => e.tardyApproval === 'unreviewed' || e.tardyApproval === 'unapproved'); break;
    }
    if (approvalFilter !== 'all') {
      list = list.filter(e => e.tardyApproval === approvalFilter);
    }
    return list;
  }, [entriesWithStatus, filterMode, approvalFilter]);

  // Sort
  const sortedEntries = useMemo(() => {
    if (sortMode === 'chronological') {
      return [...filteredEntries].sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date));
    }
    // Attention first
    const priority = (e: typeof filteredEntries[0]) => {
      if (e.isAbsent) return 0;
      if (e.isIncomplete) return 1;
      if (e.isLate) return 2;
      if (e.hasEdits) return 3;
      return 4;
    };
    return [...filteredEntries].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return b.entry.entry_date.localeCompare(a.entry.entry_date);
    });
  }, [filteredEntries, sortMode]);

  const totalMinutes = sortedEntries.reduce((sum, e) => sum + (e.entry.total_minutes || 0), 0);

  const lateDays = (tardies || []).filter(t => !t.resolved).length;
  const trackedTardies = (tardies || []).filter(t => t.approval_status !== 'approved' && !t.resolved).length;
  const totalMinutesLate = (tardies || []).filter(t => !t.resolved).reduce((s, t) => s + t.minutes_late, 0);

  const handleTardyReason = async (reason: string) => {
    if (!tardyModal || !user) return;
    const existing = tardyMap.get(tardyModal.entry.entry_date);
    if (existing) {
      await updateTardy.mutateAsync({ id: existing.id, updates: { reason_text: reason } });
    } else {
      await upsertTardy.mutateAsync({
        time_entry_id: tardyModal.entry.id, entry_date: tardyModal.entry.entry_date,
        expected_start_time: tardyModal.expectedStart, actual_start_time: tardyModal.actualStart,
        minutes_late: tardyModal.minutesLate, reason_text: reason,
      });
    }
    toast({ title: 'Tardy reason saved' });
    setTardyModal(null);
  };

  // Count badges for filters
  const absentCount = entriesWithStatus.filter(e => e.isAbsent).length + missingDays.length;
  const lateCount = entriesWithStatus.filter(e => e.isLate).length;
  const incompleteCount = entriesWithStatus.filter(e => e.isIncomplete).length;
  const editedCount = entriesWithStatus.filter(e => e.hasEdits).length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Timesheet</h1>
        <p className="text-muted-foreground">View and manage your time entries</p>
      </div>

      {missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}

      {(tardies?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-2 bg-destructive/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Late Days: </span>
            <span className="font-semibold text-destructive">{lateDays}</span>
          </div>
          <div className="px-4 py-2 bg-warning/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Tracked: </span>
            <span className="font-semibold text-warning">{trackedTardies}</span>
          </div>
          <div className="px-4 py-2 bg-destructive/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Total Min Late: </span>
            <span className="font-semibold text-destructive">{totalMinutesLate}</span>
          </div>
        </div>
      )}

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
            <div className="space-y-1">
              <Label className="text-xs">Filter</Label>
              <Select value={filterMode} onValueChange={v => setFilterMode(v as FilterMode)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="absent">Absent ({absentCount})</SelectItem>
                  <SelectItem value="late">Late ({lateCount})</SelectItem>
                  <SelectItem value="incomplete">Incomplete ({incompleteCount})</SelectItem>
                  <SelectItem value="edited">Edited ({editedCount})</SelectItem>
                  <SelectItem value="unapproved">Unapproved Tardies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approval</Label>
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
            <Button
              variant={sortMode === 'attention' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortMode(s => s === 'attention' ? 'chronological' : 'attention')}
            >
              <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
              {sortMode === 'attention' ? 'Attention First' : 'Chronological'}
            </Button>
            <div className="px-3 py-2 bg-primary/10 rounded-lg">
              <span className="text-xs text-muted-foreground">Total: </span>
              <span className="time-display font-semibold text-primary">{minutesToHHMM(totalMinutes)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : !sortedEntries.length ? (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">No entries found</td></tr>
              ) : (
                sortedEntries.map(({ entry }) => (
                  <EntryRow key={entry.id} entry={entry} schedule={schedule} tardy={tardyMap.get(entry.entry_date)} onTardyPrompt={(e, info) => setTardyModal({ entry: e, ...info })} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {tardyModal && (
        <TardyReasonModal open minutesLate={tardyModal.minutesLate} entryDate={formatDate(tardyModal.entry.entry_date)} onSubmit={handleTardyReason} onDismiss={() => setTardyModal(null)} />
      )}
    </div>
  );
}
