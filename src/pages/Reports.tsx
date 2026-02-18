import { useState } from 'react';
import { useTimeEntries, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useDaysOff } from '@/hooks/useDaysOff';
import { useTardies, TardyRow } from '@/hooks/useTardies';
import { useAttendanceExceptions, AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Printer } from 'lucide-react';

type ReportType = 'weekly' | 'pay_period' | 'monthly' | 'pto' | 'tardy' | 'attendance_exceptions';

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('weekly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generated, setGenerated] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showLateFlags, setShowLateFlags] = useState(true);
  const [showTardyReasons, setShowTardyReasons] = useState(false);

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

  const handleGenerate = () => {
    if (startDate && endDate) setGenerated(true);
  };

  const handlePrint = () => window.print();

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="no-print">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">Generate printable time reports</p>
        </div>

        <Card className="card-elevated mt-4">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1">
              <Label>Report Type</Label>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setGenerated(false); }} />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setGenerated(false); }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <Switch checked={showAuditTrail} onCheckedChange={setShowAuditTrail} />
                <Label className="text-sm">Include audit trail</Label>
              </div>
              {reportType !== 'tardy' && reportType !== 'pto' && reportType !== 'attendance_exceptions' && (
                <>
                  <div className="flex items-center gap-3">
                    <Switch checked={showLateFlags} onCheckedChange={setShowLateFlags} />
                    <Label className="text-sm">Show late flags</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={showTardyReasons} onCheckedChange={setShowTardyReasons} />
                    <Label className="text-sm">Show tardy reasons</Label>
                  </div>
                </>
              )}
            </div>
            <Button onClick={handleGenerate} disabled={!startDate || !endDate}>
              <FileText className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
          </CardContent>
        </Card>
      </div>

      {generated && (
        <div>
          <div className="no-print flex justify-end mb-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>

          <Card className="card-elevated">
            <CardHeader className="border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">
                    {reportType === 'weekly' && 'Weekly Timesheet'}
                    {reportType === 'pay_period' && 'Pay Period Summary'}
                    {reportType === 'monthly' && 'Monthly Summary'}
                    {reportType === 'pto' && 'PTO Summary'}
                    {reportType === 'tardy' && 'Tardy Report'}
                    {reportType === 'attendance_exceptions' && 'Attendance Exceptions Report'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(startDate)} — {formatDate(endDate)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Generated: {new Date().toLocaleString()}</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reportType === 'attendance_exceptions' ? (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-4 p-4 border-b bg-muted/30">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-warning">{(exceptions || []).filter(e => e.type === 'missing_shift').length}</p>
                      <p className="text-xs text-muted-foreground">Missing Shifts</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-xs text-muted-foreground">Tardies</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{totalMinutesLate}</p>
                      <p className="text-xs text-muted-foreground">Total Min Late</p>
                    </div>
                  </div>

                  {/* Missing shifts */}
                  <div className="p-4 border-b">
                    <h3 className="font-semibold text-sm mb-3">Missing Shifts</h3>
                    {!(exceptions || []).filter(e => e.type === 'missing_shift').length ? (
                      <p className="text-sm text-muted-foreground">None</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Reason</th>
                            <th className="px-4 py-2 text-left">Resolution</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(exceptions || []).filter(e => e.type === 'missing_shift').map(e => (
                            <tr key={e.id}>
                              <td className="px-4 py-2">{formatDate(e.exception_date)}</td>
                              <td className="px-4 py-2 text-xs capitalize">{e.status}</td>
                              <td className="px-4 py-2 text-xs">{e.reason_text || '—'}</td>
                              <td className="px-4 py-2 text-xs capitalize">{e.resolution_action?.replace('_', ' ') || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Tardies section */}
                  <div className="p-4">
                    <h3 className="font-semibold text-sm mb-3">Tardies</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Min Late</th>
                          <th className="px-4 py-2 text-left">Reason</th>
                          <th className="px-4 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {activeTardies.map(t => (
                          <tr key={t.id}>
                            <td className="px-4 py-2">{formatDate(t.entry_date)}</td>
                            <td className="px-4 py-2 font-semibold">{t.minutes_late}</td>
                            <td className="px-4 py-2 text-xs">{t.reason_text || '—'}</td>
                            <td className="px-4 py-2 text-xs capitalize">{t.approval_status}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold">
                          <td className="px-4 py-3 text-right">Total:</td>
                          <td className="px-4 py-3">{totalMinutesLate} min</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              ) : reportType === 'tardy' ? (
                <>
                  <div className="grid grid-cols-3 gap-4 p-4 border-b bg-muted/30">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-xs text-muted-foreground">Late Days</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-warning">{trackedTardies.length}</p>
                      <p className="text-xs text-muted-foreground">Tracked Tardies</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{totalMinutesLate}</p>
                      <p className="text-xs text-muted-foreground">Total Min Late</p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Expected</th>
                        <th className="px-4 py-2 text-left">Actual</th>
                        <th className="px-4 py-2 text-left">Min Late</th>
                        <th className="px-4 py-2 text-left">Reason</th>
                        <th className="px-4 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {activeTardies.map(t => (
                        <tr key={t.id}>
                          <td className="px-4 py-2">{formatDate(t.entry_date)}</td>
                          <td className="px-4 py-2 time-display">{t.expected_start_time?.slice(0, 5)}</td>
                          <td className="px-4 py-2 time-display">
                            {new Date(t.actual_start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </td>
                          <td className="px-4 py-2 font-semibold">{t.minutes_late}</td>
                          <td className="px-4 py-2 text-xs max-w-[200px]">{t.reason_text || '—'}</td>
                          <td className="px-4 py-2 text-xs capitalize">{t.approval_status}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold">
                        <td colSpan={3} className="px-4 py-3 text-right">Total:</td>
                        <td className="px-4 py-3">{totalMinutesLate} min</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              ) : reportType === 'pto' ? (
                <div className="divide-y">
                  {(daysOff || [])
                    .filter(d => d.date_start >= startDate && d.date_start <= endDate)
                    .map(d => (
                      <div key={d.id} className="px-4 py-3 flex justify-between text-sm">
                        <span>{formatDate(d.date_start)}{d.date_start !== d.date_end ? ` — ${formatDate(d.date_end)}` : ''}</span>
                        <span className="font-medium capitalize">{d.type}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">First In</th>
                      <th className="px-4 py-2 text-left">Last Out</th>
                      <th className="px-4 py-2 text-left">Total</th>
                      <th className="px-4 py-2 text-left">Location</th>
                      <th className="px-4 py-2 text-left">Source</th>
                      {showLateFlags && <th className="px-4 py-2 text-left">Late</th>}
                      <th className="px-4 py-2 text-left">Comment</th>
                      {showTardyReasons && <th className="px-4 py-2 text-left">Reason</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(entries || []).map(e => {
                      const firstIn = e.punches.find(p => p.punch_type === 'in');
                      const lastOut = [...e.punches].reverse().find(p => p.punch_type === 'out');
                      const hasNonManual = e.punches.some(p => p.source !== 'manual');
                      const tardy = tardyMap.get(e.entry_date);
                      return (
                        <tr key={e.id}>
                          <td className="px-4 py-2">{formatDate(e.entry_date)}</td>
                          <td className="px-4 py-2 time-display">{firstIn ? formatTime(firstIn.punch_time) : '—'}</td>
                          <td className="px-4 py-2 time-display">{lastOut ? formatTime(lastOut.punch_time) : '—'}</td>
                          <td className="px-4 py-2 time-display font-semibold">{e.total_minutes != null ? minutesToHHMM(e.total_minutes) : '—'}</td>
                          <td className="px-4 py-2 text-xs">{e.is_remote ? 'Remote' : 'On-site'}</td>
                          <td className="px-4 py-2 text-xs">
                            {hasNonManual && <span className="text-accent">{e.source === 'auto_location' ? 'GPS' : e.source}</span>}
                          </td>
                          {showLateFlags && (
                            <td className="px-4 py-2 text-xs">
                              {tardy && !tardy.resolved && (
                                <span className="text-destructive font-medium">{tardy.minutes_late}m • {tardy.approval_status}</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-2 text-xs text-muted-foreground max-w-[150px] truncate">
                            {e.entry_comment || ''}
                          </td>
                          {showTardyReasons && (
                            <td className="px-4 py-2 text-xs text-muted-foreground max-w-[150px] truncate">
                              {tardy?.reason_text || ''}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td colSpan={3} className="px-4 py-3 text-right">Total Hours:</td>
                      <td className="px-4 py-3 time-display">{minutesToHHMM(totalMinutes)}</td>
                      <td colSpan={showLateFlags && showTardyReasons ? 5 : showLateFlags || showTardyReasons ? 4 : 3}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
