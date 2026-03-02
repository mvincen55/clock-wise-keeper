import { useState, useEffect } from 'react';
import { useTimeEntries, TimeEntryRow, PunchRow } from '@/hooks/useTimeEntries';
import { useDaysOff } from '@/hooks/useDaysOff';
import { useTardies, TardyRow } from '@/hooks/useTardies';
import { useAttendanceExceptions } from '@/hooks/useAttendanceExceptions';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Printer, Download, MapPin, Hand, Clock, AlertTriangle, ChevronDown, ChevronRight, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

type ReportType = 'weekly' | 'pay_period' | 'monthly' | 'pto' | 'tardy' | 'attendance_exceptions';

const exportTypeMap: Record<ReportType, string | null> = {
  weekly: 'timesheet',
  pay_period: 'timesheet',
  monthly: 'timesheet',
  pto: 'pto',
  tardy: 'exceptions',
  attendance_exceptions: 'exceptions',
};

type AuditEvent = {
  id: string;
  event_type: string;
  action_type: string | null;
  created_at: string;
  actor_id: string | null;
  reason: string | null;
  before_json: any;
  after_json: any;
  event_details: any;
  related_date: string | null;
  related_entry_id: string | null;
};

function SourceBadge({ source }: { source: string }) {
  if (source === 'auto_location') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-accent text-accent font-medium">
        <MapPin className="h-2.5 w-2.5" /> GPS
      </Badge>
    );
  }
  if (source === 'import') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-muted-foreground/40 text-muted-foreground font-medium">
        <FileText className="h-2.5 w-2.5" /> Import
      </Badge>
    );
  }
  if (source === 'system_adjustment') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-warning text-warning font-medium">
        <Clock className="h-2.5 w-2.5" /> System
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-muted-foreground/30 text-muted-foreground font-medium">
      <Hand className="h-2.5 w-2.5" /> Manual
    </Badge>
  );
}

function PunchSourceList({ punches }: { punches: PunchRow[] }) {
  const sources = new Set(punches.map(p => p.source));
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from(sources).map(s => <SourceBadge key={s} source={s} />)}
    </div>
  );
}

/** Try to format a value as a human-readable time if it looks like an ISO timestamp */
function formatAuditValue(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'string') {
    // ISO timestamp
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) {
      return formatTime(val);
    }
    // HH:MM:SS time
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(val)) {
      const [h, m] = val.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }
    return val;
  }
  if (typeof val === 'object') {
    // For JSON objects, extract meaningful fields
    const obj = val as Record<string, unknown>;
    if (obj.punch_time) return formatTime(String(obj.punch_time));
    // Show a compact summary of changed fields
    const keys = Object.keys(obj);
    if (keys.length <= 3) {
      return keys.map(k => `${k}: ${formatAuditValue(obj[k])}`).join(', ');
    }
    return keys.length + ' fields changed';
  }
  return String(val);
}

/** Human-readable event type labels */
function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    clock_in: 'Clock In',
    clock_out: 'Clock Out',
    break_start: 'Break Start',
    break_end: 'Break End',
    manual_edit: 'Manual Edit',
    punch_edit: 'Punch Edit',
    punch_added: 'Punch Added',
    punch_deleted: 'Punch Deleted',
    time_fix: 'Time Fix',
    system_adjustment: 'System Adjustment',
    day_off_added: 'Day Off Added',
    day_off_removed: 'Day Off Removed',
    comment_edit: 'Comment Edit',
    remote_toggle: 'Remote Toggle',
    request_create: 'Request Created',
    request_approved: 'Request Approved',
    request_denied: 'Request Denied',
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function AuditTrailRow({ event, actorName }: { event: AuditEvent; actorName?: string }) {
  const details = event.event_details || {};
  const ts = new Date(event.created_at);
  const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
  const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const oldVal = details.old_value ?? event.before_json;
  const newVal = details.new_value ?? event.after_json;
  const hasChange = oldVal != null || newVal != null;
  const reason = event.reason || details.reason_comment;
  const fieldLabel = details.field_changed
    ? String(details.field_changed).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null;

  return (
    <div className="flex items-start gap-4 py-2.5 px-4 text-xs">
      {/* Timestamp */}
      <div className="shrink-0 w-[130px] text-muted-foreground">
        <div className="font-medium text-foreground/70">{dateStr}</div>
        <div>{timeStr}</div>
      </div>

      {/* Action */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-semibold">
            {eventTypeLabel(event.event_type)}
          </Badge>
          {fieldLabel && (
            <span className="text-muted-foreground font-medium">{fieldLabel}</span>
          )}
        </div>

        {hasChange && (
          <div className="flex items-center gap-2 text-[12px] mt-0.5">
            {oldVal != null && (
              <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded line-through">
                {formatAuditValue(oldVal)}
              </span>
            )}
            {oldVal != null && newVal != null && (
              <span className="text-muted-foreground">→</span>
            )}
            {newVal != null && (
              <span className="bg-accent/10 text-accent-foreground px-1.5 py-0.5 rounded font-medium">
                {formatAuditValue(newVal)}
              </span>
            )}
          </div>
        )}

        {reason && (
          <p className="text-muted-foreground mt-0.5">
            <span className="italic">"{reason}"</span>
          </p>
        )}
      </div>

      {/* Actor */}
      <div className="shrink-0 text-right text-muted-foreground min-w-[80px]">
        <span className="font-medium text-foreground/70">{actorName || 'System'}</span>
      </div>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const { data: payrollSettings } = usePayrollSettings();

  const weekStartDay = payrollSettings?.week_start_day ?? 1;
  const nowDate = new Date();
  const dayOfWeek = nowDate.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  const currentPeriodStart = new Date(nowDate);
  currentPeriodStart.setDate(nowDate.getDate() - daysBack);
  const priorStart = new Date(currentPeriodStart);
  priorStart.setDate(currentPeriodStart.getDate() - 7);
  const priorEnd = new Date(priorStart);
  priorEnd.setDate(priorStart.getDate() + 6);

  const [reportType, setReportType] = useState<ReportType>('weekly');
  const [startDate, setStartDate] = useState(priorStart.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(priorEnd.toISOString().split('T')[0]);
  const [generated, setGenerated] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showLateFlags, setShowLateFlags] = useState(true);
  
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());
  const [actorNames, setActorNames] = useState<Map<string, string>>(new Map());

  const { data: entries } = useTimeEntries(startDate || undefined, endDate || undefined);
  const { data: daysOff } = useDaysOff();
  const { data: tardies } = useTardies(startDate || undefined, endDate || undefined);
  const { data: exceptions } = useAttendanceExceptions(startDate || undefined, endDate || undefined);

  const totalMinutes = entries?.reduce((sum, e) => sum + (e.total_minutes || 0), 0) || 0;
  const tardyMap = new Map<string, TardyRow>();
  (tardies || []).forEach(t => tardyMap.set(t.entry_date, t));

  const activeTardies = (tardies || []).filter(t => !t.resolved);
  const trackedTardies = activeTardies.filter(t => t.approval_status !== 'approved');
  const totalMinutesLate = activeTardies.reduce((s, t) => s + t.minutes_late, 0);
  const totalDays = entries?.length || 0;
  const editedDays = entries?.filter(e => e.punches.some(p => p.is_edited)).length || 0;

  // Fetch audit events and resolve actor names
  useEffect(() => {
    if (!generated || !showAuditTrail || !user) return;
    (async () => {
      const { data } = await supabase
        .from('audit_events')
        .select('*')
        .gte('related_date', startDate)
        .lte('related_date', endDate)
        .order('created_at', { ascending: false })
        .limit(500);
      const events = (data as AuditEvent[]) || [];
      setAuditEvents(events);

      // Resolve actor names from profiles
      const actorIds = [...new Set(events.map(e => e.actor_id).filter(Boolean))] as string[];
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', actorIds);
        const nameMap = new Map<string, string>();
        (profiles || []).forEach((p: any) => {
          nameMap.set(p.id, p.full_name || p.email || p.id.slice(0, 8));
        });
        setActorNames(nameMap);
      }
    })();
  }, [generated, showAuditTrail, startDate, endDate, user]);

  const auditByEntry = new Map<string, AuditEvent[]>();
  auditEvents.forEach(e => {
    if (e.related_entry_id) {
      const arr = auditByEntry.get(e.related_entry_id) || [];
      arr.push(e);
      auditByEntry.set(e.related_entry_id, arr);
    }
  });
  const auditByDate = new Map<string, AuditEvent[]>();
  auditEvents.forEach(e => {
    if (e.related_date) {
      const arr = auditByDate.get(e.related_date) || [];
      arr.push(e);
      auditByDate.set(e.related_date, arr);
    }
  });

  const toggleAudit = (id: string) => {
    setExpandedAudit(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleGenerate = () => {
    if (startDate && endDate) setGenerated(true);
  };

  const handlePrint = () => window.print();

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleDownloadCsv = (overrideType?: string) => {
    const isAudit = overrideType === 'audit';

    if (isAudit) {
      // Audit trail CSV — built from already-loaded auditEvents
      const header = ['Date', 'Time', 'Event', 'Field', 'Before', 'After', 'Actor', 'Reason'];
      const rows = auditEvents.map(a => {
        const ts = new Date(a.created_at);
        const dateStr = ts.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
        const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
        const details = a.event_details || {};
        const fieldLabel = details.field_changed ? String(details.field_changed).replace(/_/g, ' ') : '';
        const oldVal = formatAuditValue(details.old_value ?? a.before_json);
        const newVal = formatAuditValue(details.new_value ?? a.after_json);
        const actor = actorNames.get(a.actor_id || '') || 'System';
        const reason = a.reason || details.reason_comment || '';
        return [dateStr, timeStr, eventTypeLabel(a.event_type), fieldLabel, oldVal, newVal, actor, reason].map(escapeCsv).join(',');
      });
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `audit_${startDate}_${endDate}.csv`);
      return;
    }

    // Timesheet CSV — built from already-loaded entries (same data shown on screen)
    const isTimesheet = ['weekly', 'pay_period', 'monthly'].includes(reportType);
    if (isTimesheet) {
      const header = ['Date', 'First In', 'First In Source', 'Last Out', 'Last Out Source', 'Total', 'Minutes Late', 'Status', 'Remote', 'Edited', 'Comment'];
      const rows = (entries || []).map(e => {
        const firstIn = e.punches.find(p => p.punch_type === 'in');
        const lastOut = [...e.punches].reverse().find(p => p.punch_type === 'out');
        const tardy = tardyMap.get(e.entry_date);
        const hasEdits = e.punches.some(p => p.is_edited);
        const sourceLabel = (s: string) => s === 'auto_location' ? 'GPS' : s === 'system_adjustment' ? 'System' : s === 'import' ? 'Import' : 'Manual';
        return [
          formatDate(e.entry_date),
          firstIn ? formatTime(firstIn.punch_time) : '',
          firstIn ? sourceLabel(firstIn.source) : '',
          lastOut ? formatTime(lastOut.punch_time) : '',
          lastOut ? sourceLabel(lastOut.source) : '',
          e.total_minutes != null ? minutesToHHMM(e.total_minutes) : '',
          tardy && !tardy.resolved ? String(tardy.minutes_late) : '',
          tardy && !tardy.resolved ? `${tardy.minutes_late}m late` : '',
          e.is_remote ? 'Yes' : '',
          hasEdits ? 'Yes' : '',
          e.entry_comment || '',
        ].map(escapeCsv).join(',');
      });
      const totalRow = ['Total', '', '', '', '', minutesToHHMM(totalMinutes), '', '', '', '', ''].join(',');
      const csv = [header.join(','), ...rows, totalRow].join('\n');
      downloadCsvBlob(csv, `timesheet_${startDate}_${endDate}.csv`);
      return;
    }

    // Tardy CSV
    if (reportType === 'tardy') {
      const header = ['Date', 'Expected Start', 'Actual Start', 'Minutes Late', 'Reason', 'Status'];
      const rows = activeTardies.map(t => [
        formatDate(t.entry_date),
        t.expected_start_time?.slice(0, 5) || '',
        formatTime(t.actual_start_time),
        String(t.minutes_late),
        t.reason_text || '',
        t.approval_status,
      ].map(escapeCsv).join(','));
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `tardy_${startDate}_${endDate}.csv`);
      return;
    }

    // PTO CSV
    if (reportType === 'pto') {
      const header = ['Start Date', 'End Date', 'Type', 'Notes'];
      const filtered = (daysOff || []).filter(d => d.date_start >= startDate && d.date_start <= endDate);
      const rows = filtered.map(d => [
        formatDate(d.date_start),
        d.date_start !== d.date_end ? formatDate(d.date_end) : '',
        d.type?.replace(/_/g, ' ') || '',
        d.notes || '',
      ].map(escapeCsv).join(','));
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `pto_${startDate}_${endDate}.csv`);
      return;
    }

    // Attendance exceptions CSV
    if (reportType === 'attendance_exceptions') {
      const header = ['Date', 'Type', 'Status', 'Reason', 'Resolution'];
      const rows = (exceptions || []).map(e => [
        formatDate(e.exception_date),
        e.type?.replace(/_/g, ' ') || '',
        e.status || '',
        e.reason_text || '',
        e.resolution_action?.replace(/_/g, ' ') || '',
      ].map(escapeCsv).join(','));
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `exceptions_${startDate}_${endDate}.csv`);
      return;
    }

    toast.error('Unknown report type');
  };

  const downloadCsvBlob = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const renderTimesheetRow = (e: TimeEntryRow) => {
    const firstIn = e.punches.find(p => p.punch_type === 'in');
    const lastOut = [...e.punches].reverse().find(p => p.punch_type === 'out');
    const tardy = tardyMap.get(e.entry_date);
    const hasEdits = e.punches.some(p => p.is_edited);
    const entryAudit = auditByEntry.get(e.id) || [];
    const isExpanded = expandedAudit.has(e.id);

    return (
      <div key={e.id}>
        <div
          className={`grid grid-cols-[1fr_90px_90px_70px_auto_auto] md:grid-cols-[1.2fr_100px_100px_80px_120px_1fr] items-center gap-2 px-4 py-3 border-b hover:bg-muted/30 transition-colors ${hasEdits ? 'border-l-2 border-l-warning' : ''}`}
        >
          {/* Date */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{formatDate(e.entry_date)}</span>
            {hasEdits && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning text-warning">
                EDITED
              </Badge>
            )}
          </div>

          {/* First In */}
          <div className="text-sm font-mono">
            {firstIn ? (
              <div className="flex flex-col">
                <span>{formatTime(firstIn.punch_time)}</span>
                <SourceBadge source={firstIn.source} />
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>

          {/* Last Out */}
          <div className="text-sm font-mono">
            {lastOut ? (
              <div className="flex flex-col">
                <span>{formatTime(lastOut.punch_time)}</span>
                <SourceBadge source={lastOut.source} />
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>

          {/* Total */}
          <div className="text-sm font-mono font-semibold">
            {e.total_minutes != null ? minutesToHHMM(e.total_minutes) : '—'}
          </div>

          {/* Late flag */}
          <div>
            {showLateFlags && tardy && !tardy.resolved && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="text-xs text-destructive font-medium">{tardy.minutes_late}m late</span>
              </div>
            )}
            {e.is_remote && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Remote</Badge>
            )}
          </div>

          {/* Comment + Audit expand */}
          <div className="flex items-center gap-2 min-w-0">
            {e.entry_comment && (
              <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={e.entry_comment}>
                {e.entry_comment}
              </span>
            )}
            {showAuditTrail && entryAudit.length > 0 && (
              <button
                onClick={() => toggleAudit(e.id)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 shrink-0"
              >
                <History className="h-3 w-3" />
                {entryAudit.length}
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Expanded audit trail */}
        {showAuditTrail && isExpanded && entryAudit.length > 0 && (
          <div className="bg-muted/10 border-b space-y-1 py-2 px-2">
            {entryAudit.map(a => <AuditTrailRow key={a.id} event={a} actorName={actorNames.get(a.actor_id || '')} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Controls */}
      <div className="no-print">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Generate, print, and export time reports</p>

        <Card className="mt-4">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Report Type</Label>
                <Select value={reportType} onValueChange={v => { setReportType(v as ReportType); setGenerated(false); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly Timesheet</SelectItem>
                    <SelectItem value="pay_period">Pay Period Summary</SelectItem>
                    <SelectItem value="monthly">Monthly Summary</SelectItem>
                    <SelectItem value="pto">PTO Summary</SelectItem>
                    <SelectItem value="tardy">Tardy Report</SelectItem>
                    <SelectItem value="attendance_exceptions">Attendance Exceptions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Start Date</Label>
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setGenerated(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">End Date</Label>
                <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setGenerated(false); }} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={showAuditTrail} onCheckedChange={setShowAuditTrail} />
                <span className="text-sm">Audit trail</span>
              </label>
              {reportType !== 'tardy' && reportType !== 'pto' && reportType !== 'attendance_exceptions' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={showLateFlags} onCheckedChange={setShowLateFlags} />
                  <span className="text-sm">Late flags</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleGenerate} disabled={!startDate || !endDate} size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Generate
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDownloadCsv()} disabled={!startDate || !endDate}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              {showAuditTrail && (
                <Button variant="outline" size="sm" onClick={() => handleDownloadCsv('audit')} disabled={!startDate || !endDate}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Audit CSV
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generated Report */}
      {generated && (
        <div className="space-y-4">
          <div className="no-print flex justify-end">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-bold tracking-tight">
                    {reportType === 'weekly' && 'Weekly Timesheet'}
                    {reportType === 'pay_period' && 'Pay Period Summary'}
                    {reportType === 'monthly' && 'Monthly Summary'}
                    {reportType === 'pto' && 'PTO Summary'}
                    {reportType === 'tardy' && 'Tardy Report'}
                    {reportType === 'attendance_exceptions' && 'Attendance Exceptions'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(startDate)} — {formatDate(endDate)}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  {new Date().toLocaleString()}
                </p>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Timesheet reports */}
              {(reportType === 'weekly' || reportType === 'pay_period' || reportType === 'monthly') && (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-4 gap-0 border-b divide-x">
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold font-mono">{minutesToHHMM(totalMinutes)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Hours</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold">{totalDays}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Worked</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Late Days</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold text-warning">{editedDays}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edited Days</p>
                    </div>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_90px_90px_70px_auto_auto] md:grid-cols-[1.2fr_100px_100px_80px_120px_1fr] gap-2 px-4 py-2 bg-muted/50 border-b text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Date</span>
                    <span>First In</span>
                    <span>Last Out</span>
                    <span>Total</span>
                    <span>Status</span>
                    <span>Notes</span>
                  </div>

                  {/* Rows */}
                  {(entries || []).map(renderTimesheetRow)}

                  {/* Footer */}
                  <div className="grid grid-cols-[1fr_90px_90px_70px_auto_auto] md:grid-cols-[1.2fr_100px_100px_80px_120px_1fr] gap-2 px-4 py-3 bg-muted/30 border-t-2 font-bold text-sm">
                    <span className="text-right">Total</span>
                    <span></span>
                    <span></span>
                    <span className="font-mono">{minutesToHHMM(totalMinutes)}</span>
                    <span></span>
                    <span></span>
                  </div>
                </>
              )}

              {/* Tardy report */}
              {reportType === 'tardy' && (
                <>
                  <div className="grid grid-cols-3 gap-0 border-b divide-x">
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Late Days</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-warning">{trackedTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tracked</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{totalMinutesLate}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Min Late</p>
                    </div>
                  </div>

                  <div className="divide-y">
                    {activeTardies.map(t => (
                      <div key={t.id} className="grid grid-cols-[1.2fr_80px_100px_60px_1fr_80px] items-center gap-2 px-4 py-3 text-sm hover:bg-muted/30">
                        <span className="font-medium">{formatDate(t.entry_date)}</span>
                        <span className="font-mono text-muted-foreground">{t.expected_start_time?.slice(0, 5)}</span>
                        <span className="font-mono">{formatTime(t.actual_start_time)}</span>
                        <span className="font-bold text-destructive">{t.minutes_late}m</span>
                        <span className="text-xs text-muted-foreground truncate">{t.reason_text || '—'}</span>
                        <Badge
                          variant={t.approval_status === 'approved' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0 w-fit capitalize"
                        >
                          {t.approval_status}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-3 bg-muted/30 border-t-2 flex justify-between font-bold text-sm">
                    <span>Total Late</span>
                    <span className="text-destructive">{totalMinutesLate} min</span>
                  </div>
                </>
              )}

              {/* PTO report */}
              {reportType === 'pto' && (
                <div className="divide-y">
                  {(daysOff || [])
                    .filter(d => d.date_start >= startDate && d.date_start <= endDate)
                    .map(d => (
                      <div key={d.id} className="px-4 py-3 flex justify-between items-center text-sm hover:bg-muted/30">
                        <span className="font-medium">
                          {formatDate(d.date_start)}
                          {d.date_start !== d.date_end ? ` — ${formatDate(d.date_end)}` : ''}
                        </span>
                        <Badge variant="secondary" className="capitalize text-xs">{d.type?.replace(/_/g, ' ')}</Badge>
                      </div>
                    ))}
                  {!(daysOff || []).filter(d => d.date_start >= startDate && d.date_start <= endDate).length && (
                    <p className="p-6 text-center text-muted-foreground text-sm">No time off in this period</p>
                  )}
                </div>
              )}

              {/* Attendance exceptions */}
              {reportType === 'attendance_exceptions' && (
                <>
                  <div className="grid grid-cols-3 gap-0 border-b divide-x">
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-warning">{(exceptions || []).filter(e => e.type === 'missing_shift').length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Missing Shifts</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tardies</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{totalMinutesLate}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Min Late</p>
                    </div>
                  </div>

                  {(exceptions || []).filter(e => e.type === 'missing_shift').length > 0 && (
                    <div className="border-b">
                      <div className="px-4 py-2 bg-muted/40">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Missing Shifts</h3>
                      </div>
                      <div className="divide-y">
                        {(exceptions || []).filter(e => e.type === 'missing_shift').map(e => (
                          <div key={e.id} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center hover:bg-muted/30">
                            <span className="font-medium">{formatDate(e.exception_date)}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 w-fit capitalize">{e.status}</Badge>
                            <span className="text-xs text-muted-foreground">{e.reason_text || '—'}</span>
                            <span className="text-xs capitalize">{e.resolution_action?.replace('_', ' ') || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTardies.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-muted/40">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tardies</h3>
                      </div>
                      <div className="divide-y">
                        {activeTardies.map(t => (
                          <div key={t.id} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center hover:bg-muted/30">
                            <span className="font-medium">{formatDate(t.entry_date)}</span>
                            <span className="font-bold text-destructive">{t.minutes_late}m</span>
                            <span className="text-xs text-muted-foreground">{t.reason_text || '—'}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 w-fit capitalize">{t.approval_status}</Badge>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 bg-muted/30 border-t-2 flex justify-between font-bold text-sm">
                        <span>Total Late</span>
                        <span className="text-destructive">{totalMinutesLate} min</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Standalone audit trail section */}
          {showAuditTrail && auditEvents.length > 0 && (
            <Card>
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-accent" />
                  Audit Trail ({auditEvents.length} events)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[400px] overflow-y-auto">
                <div className="divide-y">
                  {auditEvents.map(e => (
                    <div key={e.id}>
                      <AuditTrailRow event={e} actorName={actorNames.get(e.actor_id || '')} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
