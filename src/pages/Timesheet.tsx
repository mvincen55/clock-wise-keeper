import { useState, useEffect, useMemo } from 'react';
import { useTimeEntries, useUpdateEntry, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useWorkSchedule, getScheduleForWeekday } from '@/hooks/useWorkSchedule';
import { useTardies, useUpsertTardy, useUpdateTardy, TardyRow } from '@/hooks/useTardies';
import { useAuth } from '@/hooks/useAuth';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table2, ChevronDown, ChevronRight, Loader2, MapPin, Save, AlertTriangle, Filter } from 'lucide-react';
import { EditAuditDialog } from '@/components/EditAuditDialog';
import { TardyReasonModal } from '@/components/TardyReasonModal';
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
    return {
      minutesLate: diffMin,
      expectedStart: sched.start_time,
      actualStart: firstIn.punch_time,
    };
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
  const updateEntry = useUpdateEntry();
  const { toast } = useToast();
  const [comment, setComment] = useState(entry.entry_comment || '');
  const [commentDirty, setCommentDirty] = useState(false);
  const [auditDialog, setAuditDialog] = useState<{
    field: string; old: string; new: string; pendingUpdate: any;
  } | null>(null);

  const punches = entry.punches || [];
  const firstIn = punches.find(p => p.punch_type === 'in');
  const lastOut = [...punches].reverse().find(p => p.punch_type === 'out');

  const lateInfo = computeLateInfo(entry, schedule);
  const isLate = !!lateInfo;
  const needsReason = isLate && tardy && !tardy.reason_text && !tardy.resolved;

  const handleRemoteToggle = () => {
    setAuditDialog({
      field: 'is_remote',
      old: entry.is_remote ? 'Remote' : 'On-site',
      new: entry.is_remote ? 'On-site' : 'Remote',
      pendingUpdate: { is_remote: !entry.is_remote },
    });
  };

  const handleAuditConfirm = async (reason: string) => {
    if (!auditDialog) return;
    try {
      await updateEntry.mutateAsync({
        entryId: entry.id,
        updates: auditDialog.pendingUpdate,
        audit: {
          field_changed: auditDialog.field,
          old_value: auditDialog.old,
          new_value: auditDialog.new,
          reason_comment: reason,
        },
      });
      toast({ title: 'Updated with audit' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setAuditDialog(null);
  };

  const handleSaveComment = async () => {
    try {
      await updateEntry.mutateAsync({
        entryId: entry.id,
        updates: { entry_comment: comment || null },
      });
      setCommentDirty(false);
      toast({ title: 'Comment saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-muted/50 transition-colors ${isLate ? 'border-l-4 border-l-destructive' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3 font-medium">{formatDate(entry.entry_date)}</td>
        <td className="px-4 py-3 time-display text-sm">{firstIn ? formatTime(firstIn.punch_time) : '—'}</td>
        <td className="px-4 py-3 time-display text-sm">{lastOut ? formatTime(lastOut.punch_time) : '—'}</td>
        <td className="px-4 py-3 time-display text-sm font-semibold">
          {entry.total_minutes != null ? minutesToHHMM(entry.total_minutes) : '—'}
        </td>
        <td className="px-4 py-3">
          {isLate && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />
              {lateInfo.minutesLate}m late
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded ${
              entry.source === 'import' ? 'bg-accent/20 text-accent' :
              entry.source === 'auto_location' ? 'bg-success/20 text-success' :
              'bg-muted text-muted-foreground'
            }`}>
              {entry.source === 'auto_location' ? 'GPS' : entry.source}
            </span>
            {entry.is_remote && (
              <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Remote
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-muted/30 px-8 py-3">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Punch Details</p>
              {punches.length === 0 && <p className="text-sm text-muted-foreground">No punches recorded</p>}
              {punches.map(p => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className={`text-xs font-semibold uppercase w-8 ${p.punch_type === 'in' ? 'text-success' : 'text-destructive'}`}>
                    {p.punch_type}
                  </span>
                  <span className="time-display">{formatTime(p.punch_time)}</span>
                  {p.source !== 'manual' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                      {p.source === 'auto_location' ? 'GPS' : p.source}
                    </span>
                  )}
                  {p.low_confidence && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">low GPS</span>
                  )}
                </div>
              ))}

              {/* Tardy info */}
              {isLate && tardy && (
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">{lateInfo.minutesLate} minutes late</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      tardy.approval_status === 'approved' ? 'bg-success/20 text-success' :
                      tardy.approval_status === 'unapproved' ? 'bg-destructive/20 text-destructive' :
                      'bg-warning/20 text-warning'
                    }`}>
                      {tardy.approval_status}
                    </span>
                  </div>
                  {tardy.reason_text && (
                    <p className="text-sm text-muted-foreground italic">Reason: {tardy.reason_text}</p>
                  )}
                  {needsReason && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={e => { e.stopPropagation(); onTardyPrompt(entry, lateInfo); }}
                    >
                      Add Reason
                    </Button>
                  )}
                </div>
              )}

              {/* Remote toggle */}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Label className="text-xs">Remote</Label>
                <Switch checked={entry.is_remote} onCheckedChange={handleRemoteToggle} />
              </div>

              {/* Daily comment */}
              <div className="space-y-1 pt-2 border-t border-border">
                <Label className="text-xs">Daily Comment</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={comment}
                    onChange={e => { setComment(e.target.value); setCommentDirty(true); }}
                    rows={2}
                    placeholder="Optional comment for this day..."
                    className="text-sm"
                  />
                  {commentDirty && (
                    <Button size="sm" onClick={handleSaveComment} className="self-end">
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {entry.notes && (
                <p className="text-sm text-muted-foreground mt-2 italic">{entry.notes}</p>
              )}
            </div>
          </td>
        </tr>
      )}

      {auditDialog && (
        <EditAuditDialog
          open
          onClose={() => setAuditDialog(null)}
          onConfirm={handleAuditConfirm}
          fieldChanged={auditDialog.field}
          oldValue={auditDialog.old}
          newValue={auditDialog.new}
        />
      )}
    </>
  );
}

export default function Timesheet() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showOnlyLate, setShowOnlyLate] = useState(false);
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const { data: entries, isLoading } = useTimeEntries(startDate || undefined, endDate || undefined);
  const { data: schedule } = useWorkSchedule();
  const { data: tardies } = useTardies(startDate || undefined, endDate || undefined);
  const upsertTardy = useUpsertTardy();
  const updateTardy = useUpdateTardy();
  const { toast } = useToast();

  const [tardyModal, setTardyModal] = useState<{
    entry: TimeEntryRow;
    minutesLate: number;
    expectedStart: string;
    actualStart: string;
  } | null>(null);

  // Auto-detect tardies when entries or schedule changes
  useEffect(() => {
    if (!entries?.length || !schedule?.length || !user) return;

    entries.forEach(entry => {
      const info = computeLateInfo(entry, schedule);
      if (info) {
        // Upsert tardy record
        upsertTardy.mutate({
          time_entry_id: entry.id,
          entry_date: entry.entry_date,
          expected_start_time: info.expectedStart,
          actual_start_time: info.actualStart,
          minutes_late: info.minutesLate,
        });
      }
    });
  }, [entries, schedule]); // eslint-disable-line react-hooks/exhaustive-deps

  const tardyMap = useMemo(() => {
    const map = new Map<string, TardyRow>();
    (tardies || []).forEach(t => map.set(t.entry_date, t));
    return map;
  }, [tardies]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    let list = entries || [];
    if (showOnlyLate) {
      list = list.filter(e => tardyMap.has(e.entry_date) && !tardyMap.get(e.entry_date)!.resolved);
    }
    if (approvalFilter !== 'all') {
      list = list.filter(e => {
        const t = tardyMap.get(e.entry_date);
        return t && t.approval_status === approvalFilter;
      });
    }
    return list;
  }, [entries, showOnlyLate, approvalFilter, tardyMap]);

  const totalMinutes = filteredEntries.reduce((sum, e) => sum + (e.total_minutes || 0), 0);

  // Summary stats
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
        time_entry_id: tardyModal.entry.id,
        entry_date: tardyModal.entry.entry_date,
        expected_start_time: tardyModal.expectedStart,
        actual_start_time: tardyModal.actualStart,
        minutes_late: tardyModal.minutesLate,
        reason_text: reason,
      });
    }
    toast({ title: 'Tardy reason saved' });
    setTardyModal(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Timesheet</h1>
        <p className="text-muted-foreground">View and manage your time entries</p>
      </div>

      {/* Tardy summary cards */}
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
            <div className="flex items-center gap-2">
              <Switch checked={showOnlyLate} onCheckedChange={setShowOnlyLate} />
              <Label className="text-xs">Late only</Label>
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">First In</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Out</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Late</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : !filteredEntries.length ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted-foreground">No entries found</td>
                </tr>
              ) : (
                filteredEntries.map(entry => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    schedule={schedule}
                    tardy={tardyMap.get(entry.entry_date)}
                    onTardyPrompt={(e, info) => setTardyModal({ entry: e, ...info })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {tardyModal && (
        <TardyReasonModal
          open
          minutesLate={tardyModal.minutesLate}
          entryDate={formatDate(tardyModal.entry.entry_date)}
          onSubmit={handleTardyReason}
          onDismiss={() => setTardyModal(null)}
        />
      )}
    </div>
  );
}
