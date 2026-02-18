import { useTodayEntry, useClockAction, PunchRow } from '@/hooks/useTimeEntries';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Clock, LogIn, LogOut, Coffee, Play, Loader2, Settings as SettingsIcon, Pencil, CalendarDays } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useGeoTracking } from '@/hooks/useGeoTracking';
import { LocationStatusPanel } from '@/components/LocationStatusPanel';
import { useWorkZones } from '@/hooks/useWorkZones';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { useDaysOff } from '@/hooks/useDaysOff';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { Link } from 'react-router-dom';

type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_break';

function getStatus(punches: PunchRow[]): ClockStatus {
  if (!punches.length) return 'clocked_out';
  const last = punches[punches.length - 1];
  if (last.punch_type === 'out') return 'clocked_out';
  return 'clocked_in';
}

function getRunningMinutes(punches: PunchRow[]): number {
  let total = 0;
  const sorted = [...punches].sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
  for (let i = 0; i < sorted.length; i += 2) {
    const inP = sorted[i];
    const outP = sorted[i + 1];
    if (inP?.punch_type === 'in') {
      const end = outP?.punch_type === 'out' ? new Date(outP.punch_time).getTime() : Date.now();
      total += (end - new Date(inP.punch_time).getTime()) / 60000;
    }
  }
  return Math.round(total);
}

// PTO helpers (same as PTO page)
const ACCRUAL_TIERS = [
  { minYears: 0, maxYears: 3, hoursPerWeek: 1.0 },
  { minYears: 3, maxYears: 5, hoursPerWeek: 1.5 },
  { minYears: 5, maxYears: 10, hoursPerWeek: 2.0 },
  { minYears: 10, maxYears: 999, hoursPerWeek: 2.5 },
];

function getAccrualTier(hireDate: string) {
  const years = (Date.now() - new Date(hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ACCRUAL_TIERS.find(t => years >= t.minYears && years < t.maxYears) || ACCRUAL_TIERS[0];
}

function getWeeksBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

export default function Dashboard() {
  const { data: todayEntry, isLoading } = useTodayEntry();
  const clockAction = useClockAction();
  const [now, setNow] = useState(new Date());
  const [autoClockEnabled, setAutoClockEnabled] = useState(false);
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  const { data: zones } = useWorkZones();
  const geoState = useGeoTracking(autoClockEnabled && (zones?.length ?? 0) > 0);
  const { data: daysOff } = useDaysOff();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const missingDays = useMissingShifts(fourteenDaysAgo.toISOString().split('T')[0]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const punches = todayEntry?.punches || [];
  const status = getStatus(punches);
  const runningMinutes = getRunningMinutes(punches);
  const isBusy = clockAction.isPending;

  // PTO widget
  const hireDate = typeof window !== 'undefined' ? localStorage.getItem('pto_hire_date') || '2024-01-01' : '2024-01-01';
  const snapshotDate = typeof window !== 'undefined' ? localStorage.getItem('pto_snapshot_date') || '2026-02-14' : '2026-02-14';
  const snapshotBalance = typeof window !== 'undefined' ? parseFloat(localStorage.getItem('pto_snapshot_balance') || '-1.63') : -1.63;

  const tier = getAccrualTier(hireDate);
  const today = new Date().toISOString().split('T')[0];
  const weeksSinceSnapshot = getWeeksBetween(snapshotDate, today);
  const accruedSinceSnapshot = weeksSinceSnapshot * tier.hoursPerWeek;

  const ptoUsed = useMemo(() => {
    if (!daysOff) return 0;
    return daysOff
      .filter(d => d.date_start >= snapshotDate && d.type !== 'office_closed')
      .reduce((sum, d) => sum + (d.hours || 8), 0);
  }, [daysOff, snapshotDate]);

  const currentPtoBalance = snapshotBalance + accruedSinceSnapshot - ptoUsed;

  const statusConfig = {
    clocked_out: { label: 'Clocked Out', color: 'text-muted-foreground', bg: 'bg-muted' },
    clocked_in: { label: 'Clocked In', color: 'text-success', bg: 'bg-success/10' },
    on_break: { label: 'On Break', color: 'text-accent', bg: 'bg-accent/10' },
  };
  const sc = statusConfig[status];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">{formatDate(now)}</p>
      </div>

      <div className="flex gap-2">
        <Link to="/settings#work-schedule">
          <Button variant="outline" size="sm"><SettingsIcon className="mr-2 h-4 w-4" />Edit Schedule</Button>
        </Link>
        <Link to="/pto">
          <Button variant="outline" size="sm"><CalendarDays className="mr-2 h-4 w-4" />PTO</Button>
        </Link>
      </div>

      {missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}

      {/* PTO Widget */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">PTO Balance</p>
                <p className="text-xs text-muted-foreground">Accrual: {tier.hoursPerWeek}h/week</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-xl font-bold time-display ${currentPtoBalance < 0 ? 'text-destructive' : 'text-success'}`}>
                {currentPtoBalance.toFixed(2)}h
              </p>
              <Link to="/pto" className="text-xs text-primary hover:underline">View Details →</Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clock display */}
      <Card className="card-elevated overflow-hidden">
        <div className="bg-clock-bg text-clock-fg p-8 text-center">
          <p className="time-display text-5xl md:text-6xl font-bold">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
          </p>
          <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${sc.bg} ${sc.color}`}>
            <span className={`h-2 w-2 rounded-full ${status === 'clocked_in' ? 'bg-success animate-pulse' : status === 'on_break' ? 'bg-accent animate-pulse' : 'bg-muted-foreground'}`} />
            {sc.label}
          </div>
        </div>
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <p className="text-sm text-muted-foreground mb-1">Today's Total</p>
            <p className="time-display text-3xl font-bold text-foreground">{minutesToHHMM(runningMinutes)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {status === 'clocked_out' && (
              <Button className="col-span-2 h-16 text-lg font-semibold punch-glow" onClick={() => clockAction.mutate('clock_in')} disabled={isBusy}>
                {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}Clock In
              </Button>
            )}
            {status === 'clocked_in' && (
              <>
                <Button variant="destructive" className="h-16 text-base font-semibold" onClick={() => clockAction.mutate('clock_out')} disabled={isBusy}>
                  {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}Clock Out
                </Button>
                <Button variant="secondary" className="h-16 text-base font-semibold" onClick={() => clockAction.mutate('break_start')} disabled={isBusy}>
                  {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Coffee className="mr-2 h-4 w-4" />}Start Break
                </Button>
              </>
            )}
            {status === 'on_break' && (
              <Button className="col-span-2 h-16 text-lg font-semibold" onClick={() => clockAction.mutate('break_end')} disabled={isBusy}>
                {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}End Break
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="font-medium">Auto Clock (GPS)</p>
            <p className="text-xs text-muted-foreground">{zones?.length ? `${zones.filter(z => z.is_active).length} active zone(s)` : 'No zones configured'}</p>
          </div>
          <Switch checked={autoClockEnabled} onCheckedChange={setAutoClockEnabled} disabled={!zones?.length} />
        </CardContent>
      </Card>

      {autoClockEnabled && <LocationStatusPanel state={geoState} />}

      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Today's Punches</CardTitle>
          {todayEntry && punches.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPunchEditorOpen(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : punches.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No punches yet today</p>
          ) : (
            <div className="space-y-2">
              {punches.map((p) => {
                const isEdited = (p as any).is_edited;
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
                    <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>{p.punch_type}</span>
                    <span className={`time-display text-sm ${isEdited ? 'text-destructive font-semibold' : ''}`}>{formatTime(p.punch_time)}</span>
                    {isEdited && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">edited</span>}
                    {p.source !== 'manual' && <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">{p.source === 'auto_location' ? 'GPS' : p.source}</span>}
                    {p.low_confidence && <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">low GPS</span>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {todayEntry && (
        <PunchEditorModal open={punchEditorOpen} onClose={() => setPunchEditorOpen(false)} entryId={todayEntry.id} entryDate={todayEntry.entry_date} punches={punches} />
      )}
    </div>
  );
}
