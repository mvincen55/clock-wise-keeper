import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTodayEntry, PunchRow } from '@/hooks/useTimeEntries';
import { useGuardedClockAction } from '@/hooks/useGuardedClockAction';
import ChecklistBypassDialog from '@/components/ChecklistBypassDialog';
import BypassReasonDialog from '@/components/BypassReasonDialog';
import { useUnresolvedBypasses } from '@/hooks/useChecklistBypasses';
import { useChecklistGating } from '@/hooks/useChecklistGating';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Clock, LogIn, LogOut, Loader2, Pencil, CalendarDays, MapPin, ListChecks } from 'lucide-react';
import { useGeoTracking } from '@/hooks/useGeoTracking';
import { LocationStatusPanel } from '@/components/LocationStatusPanel';
import { useWorkZones } from '@/hooks/useWorkZones';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { CorrectionRequestModal } from '@/components/CorrectionRequestModal';
import { useCurrentPtoBalance } from '@/hooks/usePtoEngine';
import { useOrgContext } from '@/hooks/useOrgContext';
import NeedsAttentionSection from '@/components/dashboard/NeedsAttentionSection';
import PracticeGoalCard from '@/components/dashboard/PracticeGoalCard';
import TodayAtOffice from '@/components/dashboard/TodayAtOffice';
import MyMomentumCard from '@/components/dashboard/MyMomentumCard';
import UserNotesBoard from '@/components/dashboard/UserNotesBoard';
import { cn } from '@/lib/utils';

type ClockStatus = 'clocked_out' | 'clocked_in';

function getStatus(punches: PunchRow[]): ClockStatus {
  if (!punches.length) return 'clocked_out';
  return punches[punches.length - 1].punch_type === 'out' ? 'clocked_out' : 'clocked_in';
}

function getRunningMinutes(punches: PunchRow[]): number {
  let total = 0;
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()
  );
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

export default function Dashboard() {
  const { data: todayEntry, isLoading } = useTodayEntry();
  const clockAction = useGuardedClockAction();
  const { data: unresolvedBypasses } = useUnresolvedBypasses();
  const { data: gating } = useChecklistGating();
  const [reasonPromptOpen, setReasonPromptOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [autoClockEnabled, setAutoClockEnabled] = useState(
    () => localStorage.getItem('timevault_auto_clock') !== 'false'
  );
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const { data: zones } = useWorkZones();
  const geoState = useGeoTracking(autoClockEnabled && (zones?.length ?? 0) > 0);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const missingDays = useMissingShifts(fourteenDaysAgo.toISOString().split('T')[0]);

  const ptoState = useCurrentPtoBalance();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const punches = todayEntry?.punches || [];
  const status = getStatus(punches);
  const runningMinutes = getRunningMinutes(punches);
  const isBusy = clockAction.isPending;

  const checklistTotal = gating?.gatingTotal ?? 0;
  const checklistDone = checklistTotal - (gating?.incompleteCount ?? 0);
  const afterMidday = now.getHours() >= 12;
  const checklistWarn = afterMidday && (gating?.incompleteCount ?? 0) > 0;

  const sc =
    status === 'clocked_in'
      ? { label: 'Clocked In', color: 'text-success', bg: 'bg-success/10' }
      : { label: 'Clocked Out', color: 'text-muted-foreground', bg: 'bg-muted' };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Today</h1>
        <p className="text-muted-foreground">{formatDate(now)}</p>
      </div>

      {/* 1 — MY DAY */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="card-elevated overflow-hidden lg:col-span-2">
          <div className="bg-clock-bg text-clock-fg p-6 text-center">
            <p className="time-display text-4xl md:text-5xl font-bold">
              {now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </p>
            <div
              className={`mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${sc.bg} ${sc.color}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${status === 'clocked_in' ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`}
              />
              {sc.label}
            </div>
          </div>
          <CardContent className="p-5">
            <div className="text-center mb-4">
              <p className="text-sm text-muted-foreground mb-1">Today's total</p>
              <p className="time-display text-3xl font-bold">{minutesToHHMM(runningMinutes)}</p>
            </div>
            {status === 'clocked_out' ? (
              <Button
                className="w-full h-14 text-lg font-semibold punch-glow"
                onClick={() => clockAction.run('clock_in')}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                Clock In
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="w-full h-14 text-lg font-semibold"
                onClick={() => clockAction.run('clock_out')}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogOut className="mr-2 h-5 w-5" />}
                Clock Out
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 content-start">
          <Card className={cn('card-elevated', checklistWarn && 'border-warning/50')}>
            <CardContent className="p-4">
              <Link to="/checklists" className="flex items-center gap-3">
                <ListChecks className={cn('h-5 w-5', checklistWarn ? 'text-warning' : 'text-primary')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">My checklist</p>
                  <p className="text-xs text-muted-foreground">
                    {checklistTotal === 0
                      ? 'Nothing assigned today'
                      : `${checklistDone} of ${checklistTotal} done`}
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CalendarDays className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">PTO balance</p>
                    <p className="text-xs text-muted-foreground truncate">{ptoState.tier.label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-lg font-bold time-display ${ptoState.balance < 0 ? 'text-destructive' : 'text-success'}`}
                  >
                    {ptoState.balance.toFixed(2)}h
                  </p>
                  <Link to="/pto" className="text-xs text-primary hover:underline">
                    Details →
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 2 — NEEDS ATTENTION */}
      <NeedsAttentionSection
        missingShifts={missingDays.length > 0 ? <MissingShiftBanner missingDays={missingDays} /> : undefined}
        onOpenBypassReason={() => setReasonPromptOpen(true)}
      />

      {/* 3 — PRACTICE GOAL */}
      <PracticeGoalCard />

      {/* 4 — TODAY AT THE OFFICE */}
      <TodayAtOffice isManager={isManager} />

      {/* 5 — MY MOMENTUM */}
      <MyMomentumCard />

      {/* 6 — MY NOTES */}
      <UserNotesBoard />

      {/* 7 — TIME DETAILS */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Time details
        </h2>

        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Today's punches
            </CardTitle>
            {todayEntry && punches.length > 0 && (
              isManager ? (
                <Button variant="outline" size="sm" onClick={() => setPunchEditorOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Request correction
                </Button>
              )
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : punches.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No punches yet today</p>
            ) : (
              <div className="space-y-2">
                {punches.map(p => {
                  const isEdited = (p as any).is_edited;
                  const hasGps = p.location_lat != null && p.location_lng != null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
                      <span
                        className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}
                      >
                        {p.punch_type}
                      </span>
                      <span className={`time-display text-sm ${isEdited ? 'text-destructive font-semibold' : ''}`}>
                        {formatTime(p.punch_time)}
                      </span>
                      {isEdited && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                          edited
                        </span>
                      )}
                      {p.source !== 'manual' && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                          {p.source === 'auto_location' ? 'GPS' : p.source}
                        </span>
                      )}
                      {hasGps && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" /> GPS recorded
                        </span>
                      )}
                      {p.low_confidence && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">low GPS</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Auto Clock (GPS)</p>
              <p className="text-xs text-muted-foreground">
                {zones?.length ? `${zones.filter(z => z.is_active).length} active zone(s)` : 'No zones configured'}
              </p>
            </div>
            <Switch
              checked={autoClockEnabled}
              onCheckedChange={v => {
                setAutoClockEnabled(v);
                localStorage.setItem('timevault_auto_clock', String(v));
              }}
              disabled={!zones?.length}
            />
          </CardContent>
        </Card>

        {autoClockEnabled && <LocationStatusPanel state={geoState} />}
      </section>

      {todayEntry && (
        <PunchEditorModal
          open={punchEditorOpen}
          onClose={() => setPunchEditorOpen(false)}
          entryId={todayEntry.id}
          entryDate={todayEntry.entry_date}
          punches={punches}
        />
      )}
      {todayEntry && (
        <CorrectionRequestModal
          open={correctionOpen}
          onClose={() => setCorrectionOpen(false)}
          prefill={{ target_table: 'time_entries', target_id: todayEntry.id, entry_date: todayEntry.entry_date }}
        />
      )}

      <ChecklistBypassDialog
        open={clockAction.dialogOpen}
        incompleteCount={clockAction.incompleteCount}
        openSharedCount={clockAction.openSharedCount}
        busy={clockAction.bypassing}
        onGoBack={clockAction.closeDialog}
        onBypass={clockAction.bypassAndClockOut}
      />

      <BypassReasonDialog
        bypass={unresolvedBypasses?.[0] ?? null}
        open={reasonPromptOpen}
        onOpenChange={setReasonPromptOpen}
      />
    </div>
  );
}
