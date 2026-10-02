import { useState, useMemo } from 'react';
import { useTimeEntries, useUpdateEntry, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useNavigate } from 'react-router-dom';
import { useTardies, TardyRow } from '@/hooks/useTardies';
import { useAuth } from '@/hooks/useAuth';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { LateArrivalNotice } from '@/components/LateArrivalNotice';
import { LateArrivalPrompt } from '@/components/LateArrivalPrompt';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { EXCUSE_CLASSES, EXCUSE_LABELS, awaitsEmployeeAnswer, countsTowardThreshold, excuseState, isLiveLateArrival } from '@/lib/late-arrivals';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Loader2, MapPin, Save, AlertTriangle, Pencil, ArrowUpDown, Download } from 'lucide-react';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { AuditHistoryModal } from '@/components/AuditHistoryModal';
import { CorrectionRequestModal } from '@/components/CorrectionRequestModal';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Lateness is the attendance engine's to decide (it writes the `tardies`
 * row from the schedule, the office grace period, and the first punch of
 * the day); this page only reads it. A row that a correction made on time,
 * or whose clock looks mis-zoned, is not a late arrival here either.
 */
function lateArrivalFor(tardy: TardyRow | undefined) {
  return tardy && isLiveLateArrival(tardy) ? tardy : null;
}

function EntryRow({ entry, tardy, onAnswer }: {
  entry: TimeEntryRow;
  tardy?: TardyRow;
  onAnswer: (tardy: TardyRow) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  const [auditHistoryOpen, setAuditHistoryOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const hasEditedPunches = (entry.punches || []).some((p: any) => p.is_edited);
  const updateEntry = useUpdateEntry();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const [comment, setComment] = useState(entry.entry_comment || '');
  const [commentDirty, setCommentDirty] = useState(false);

  const punches = entry.punches || [];
  const late = lateArrivalFor(tardy);
  const isLate = !!late;
  const awaitsAnswer = !!late && awaitsEmployeeAnswer(late);
  const isIncomplete = punches.length > 0 && punches[punches.length - 1].punch_type === 'in';
  const isAbsent = punches.length === 0;

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
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded ${entry.is_remote ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {entry.location_status === 'remote' ? 'Remote' : entry.location_status === 'onsite' ? 'On-site' : 'Location unavailable'}
            </span>
            {isAbsent && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Absent</span>}
            {isIncomplete && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Incomplete</span>}
            {late && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                <AlertTriangle className="h-3 w-3" />{late.minutes_late}m late
              </span>
            )}
            {hasEditedPunches && (
              <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive flex items-center gap-1">
                <Pencil className="h-3 w-3" /> Edited
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]" title={entry.entry_comment || ''}>
          {entry.entry_comment || ''}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-muted/30 px-8 py-3">
            <div className="space-y-3">
              {/* Resolve in Attendance banner */}
              {(isAbsent || isIncomplete) && (
                <div className="flex items-center justify-between p-2 rounded bg-warning/10 border border-warning/20">
                  <span className="text-xs text-warning font-medium">
                    {isAbsent ? 'Missing punches' : 'Incomplete punches'} — resolve in Attendance
                  </span>
                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={e => { e.stopPropagation(); navigate(`/days-off?date=${entry.entry_date}`); }}>
                    Resolve in Attendance
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Punch Details</p>
                {/* Punch editing is manager-only (RLS blocks employee punch
                    UPDATE/DELETE); employees use Request Correction below. */}
                {isManager && (
                  <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setPunchEditorOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Punches
                  </Button>
                )}
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
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">{p.source === 'auto_location' ? 'GPS' : p.source === 'import' ? 'Import' : p.source === 'manual' ? 'Manual' : 'System'}</span>
                    {hasGps && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" /> GPS recorded</span>}
                    {p.low_confidence && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">low GPS</span>}
                  </div>
                );
              })}
              {late && (
                <div className="pt-2 border-t border-border space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">{late.minutes_late} minutes late</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${EXCUSE_CLASSES[excuseState(late)]}`}>
                      {EXCUSE_LABELS[excuseState(late)]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {late.acknowledged_at ? `Acknowledged ${formatDate(late.acknowledged_at)}` : excuseState(late) === 'pending' ? 'Waiting on your manager' : awaitsAnswer ? 'Waiting on your answer' : ''}
                    </span>
                  </div>
                  {late.reason_text && <p className="text-sm text-muted-foreground italic">Your explanation: {late.reason_text}</p>}
                  {late.manager_note && <p className="text-sm text-muted-foreground">Manager note: {late.manager_note}</p>}
                  {awaitsAnswer && (
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onAnswer(late); }}>
                      Acknowledge, request excused, or report incorrect time
                    </Button>
                  )}
                </div>
              )}
              <div className="space-y-1 pt-2 border-t border-border">
                <Label className="text-xs">Daily Comment</Label>
                <div className="flex gap-2">
                  <Textarea value={comment} onChange={e => { setComment(e.target.value); setCommentDirty(true); }} rows={2} placeholder="Optional comment for this day..." className="text-sm" />
                  {commentDirty && <Button size="sm" onClick={handleSaveComment} className="self-end"><Save className="h-4 w-4" /></Button>}
                </div>
              </div>
              {/* Governance actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setAuditHistoryOpen(true); }}>
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Audit History
                </Button>
                {!isManager && (
                  <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setCorrectionOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Request Correction
                  </Button>
                )}
              </div>
              {entry.notes && <p className="text-sm text-muted-foreground mt-2 italic">{entry.notes}</p>}
            </div>
          </td>
        </tr>
      )}
      <PunchEditorModal open={punchEditorOpen} onClose={() => setPunchEditorOpen(false)} entryId={entry.id} entryDate={entry.entry_date} punches={entry.all_punches || punches} />
      <AuditHistoryModal
        open={auditHistoryOpen}
        onClose={() => setAuditHistoryOpen(false)}
        employeeId={ctx?.employee_id || ''}
        entryDate={entry.entry_date}
      />
      <CorrectionRequestModal
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        prefill={{ target_table: 'time_entries', target_id: entry.id, entry_date: entry.entry_date }}
      />
    </>
  );
}

type FilterMode = 'all' | 'absent' | 'late' | 'incomplete' | 'edited' | 'awaiting';
type RemoteFilter = 'all' | 'onsite' | 'remote';

async function exportToExcel(
  sortedEntries: { entry: TimeEntryRow; isAbsent: boolean; isIncomplete: boolean; isLate: boolean; minutesLate: number; hasEdits: boolean; excuse: string }[],
  tardyMap: Map<string, TardyRow>,
) {
  const XLSX = await import('xlsx');

  const data = sortedEntries.map(({ entry, isAbsent, isIncomplete, isLate, minutesLate }) => {
      const d = new Date(entry.entry_date + 'T00:00:00');
      const day = d.toLocaleDateString('en-US', { weekday: 'short' });
      const totalHHMM = entry.total_minutes != null ? minutesToHHMM(entry.total_minutes) : '';
      const totalHrs = entry.total_minutes != null ? Number((entry.total_minutes / 60).toFixed(2)) : '';
      const location = entry.location_status === 'remote' ? 'Remote' : entry.location_status === 'onsite' ? 'On-site' : 'Location unavailable';
      const status = isAbsent ? 'Absent' : isIncomplete ? 'Missing clock-out' : isLate ? 'Late' : 'Arrived';
      const late = lateArrivalFor(tardyMap.get(entry.entry_date));
      const excuse = late ? EXCUSE_LABELS[excuseState(late)] : '';
      const comment = entry.entry_comment || '';

      const punches = (entry.punches || []).sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
      const punchCols: Record<string, string> = {};
      for (let i = 0; i < 6; i++) {
        const label = i % 2 === 0 ? `Punch In ${Math.floor(i / 2) + 1}` : `Punch Out ${Math.floor(i / 2) + 1}`;
        punchCols[label] = punches[i] ? formatTime(punches[i].punch_time) : '';
      }

      return {
        Date: entry.entry_date,
        Day: day,
        'Total HH:MM': totalHHMM,
        'Total Hours': totalHrs,
        Location: location,
        Status: status,
        'Minutes Late': isLate ? minutesLate : '',
        'Late Arrival': excuse,
        Comment: comment,
        ...punchCols,
      };
    });

  const ws = XLSX.utils.json_to_sheet(data);
  // Auto-size columns
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.max(key.length, ...data.map(r => String((r as any)[key] || '').length)) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Timesheet');
  XLSX.writeFile(wb, 'timesheet-export.xlsx');
}

export default function Timesheet() {
  const { user } = useAuth();
  const { data: payrollSettings } = usePayrollSettings();
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
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [excuseFilter, setExcuseFilter] = useState<string>('all');
  const [remoteFilter, setRemoteFilter] = useState<RemoteFilter>('all');

  const { data: entries, isLoading } = useTimeEntries(startDate || undefined, endDate || undefined);
  const { data: tardies } = useTardies(startDate || undefined, endDate || undefined);
  const missingDays = useMissingShifts(startDate || undefined, endDate || undefined);

  const [promptTardy, setPromptTardy] = useState<TardyRow | null>(null);

  // This page is one person's record. A manager's read returns the whole
  // office's late arrivals, so keep only the signed-in person's before
  // keying by date.
  const tardyMap = useMemo(() => {
    const map = new Map<string, TardyRow>();
    (tardies || []).filter(t => t.user_id === user?.id).forEach(t => map.set(t.entry_date, t));
    return map;
  }, [tardies, user?.id]);

  // Compute status flags for each entry
  const entriesWithStatus = useMemo(() => {
    return (entries || []).map(entry => {
      const punches = entry.punches || [];
      const late = lateArrivalFor(tardyMap.get(entry.entry_date));
      return {
        entry,
        isAbsent: punches.length === 0,
        isIncomplete: punches.length > 0 && punches[punches.length - 1].punch_type === 'in',
        isLate: !!late,
        minutesLate: late?.minutes_late || 0,
        hasEdits: punches.some((p: any) => p.is_edited),
        excuse: late ? excuseState(late) : 'none',
        awaitsAnswer: !!late && awaitsEmployeeAnswer(late),
      };
    });
  }, [entries, tardyMap]);

  // Filter
  const filteredEntries = useMemo(() => {
    let list = entriesWithStatus;
    // Remote filter
    if (remoteFilter === 'remote') list = list.filter(e => e.entry.location_status === 'remote');
    else if (remoteFilter === 'onsite') list = list.filter(e => e.entry.location_status === 'onsite');

    switch (filterMode) {
      case 'absent': list = list.filter(e => e.isAbsent); break;
      case 'late': list = list.filter(e => e.isLate); break;
      case 'incomplete': list = list.filter(e => e.isIncomplete); break;
      case 'edited': list = list.filter(e => e.hasEdits); break;
      case 'awaiting': list = list.filter(e => e.awaitsAnswer); break;
    }
    if (excuseFilter !== 'all') {
      list = list.filter(e => e.excuse === excuseFilter);
    }
    return list;
  }, [entriesWithStatus, filterMode, excuseFilter, remoteFilter]);

  // Status filters narrow the list without moving older days above newer ones.
  const sortedEntries = useMemo(
    () => [...filteredEntries].sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date)),
    [filteredEntries],
  );

  const totalMinutes = sortedEntries.reduce((sum, e) => sum + (e.entry.total_minutes || 0), 0);

  const myLateArrivals = useMemo(() => [...tardyMap.values()].filter(isLiveLateArrival), [tardyMap]);
  const lateDays = myLateArrivals.length;
  const countingTardies = myLateArrivals.filter(countsTowardThreshold).length;
  const totalMinutesLate = myLateArrivals.reduce((s, t) => s + t.minutes_late, 0);

  // Count badges for filters
  const absentCount = entriesWithStatus.filter(e => e.isAbsent).length + missingDays.length;
  const lateCount = entriesWithStatus.filter(e => e.isLate).length;
  const incompleteCount = entriesWithStatus.filter(e => e.isIncomplete).length;
  const editedCount = entriesWithStatus.filter(e => e.hasEdits).length;
  const awaitingCount = entriesWithStatus.filter(e => e.awaitsAnswer).length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Timesheet</h1>
        <p className="text-muted-foreground">View and manage your time entries</p>
      </div>

      {missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}

      <LateArrivalNotice />

      {lateDays > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-2 bg-destructive/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Late Days: </span>
            <span className="font-semibold text-destructive">{lateDays}</span>
          </div>
          <div className="px-4 py-2 bg-warning/10 rounded-lg" title="Unexcused late arrivals that count toward the office's late-arrival rule">
            <span className="text-xs text-muted-foreground">Counting toward the rule: </span>
            <span className="font-semibold text-warning">{countingTardies}</span>
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
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="absent">Absent ({absentCount})</SelectItem>
                  <SelectItem value="late">Late ({lateCount})</SelectItem>
                  <SelectItem value="awaiting">Waiting on my answer ({awaitingCount})</SelectItem>
                  <SelectItem value="incomplete">Incomplete ({incompleteCount})</SelectItem>
                  <SelectItem value="edited">Edited ({editedCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location</Label>
              <Select value={remoteFilter} onValueChange={v => setRemoteFilter(v as RemoteFilter)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="onsite">On-site only</SelectItem>
                  <SelectItem value="remote">Remote only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Late arrivals</Label>
              <Select value={excuseFilter} onValueChange={setExcuseFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending review</SelectItem>
                  <SelectItem value="unexcused">Unexcused</SelectItem>
                  <SelectItem value="excused">Excused</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="px-3 py-2 bg-primary/10 rounded-lg">
              <span className="text-xs text-muted-foreground">Total: </span>
              <span className="time-display font-semibold text-primary">{minutesToHHMM(totalMinutes)}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => exportToExcel(sortedEntries, tardyMap)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground" aria-sort="descending">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : !sortedEntries.length ? (
                <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">No entries found</td></tr>
              ) : (
                sortedEntries.map(({ entry }) => (
                  <EntryRow key={entry.id} entry={entry} tardy={tardyMap.get(entry.entry_date)} onAnswer={setPromptTardy} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <LateArrivalPrompt open={!!promptTardy} tardy={promptTardy} onClose={() => setPromptTardy(null)} />
    </div>
  );
}
