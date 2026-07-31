import { ReactNode, createContext, useContext, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTodayEntry, PunchRow, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useGuardedClockAction } from '@/hooks/useGuardedClockAction';
import { useClocksIn } from '@/hooks/usePracticeSettings';
import { useUnresolvedBypasses } from '@/hooks/useChecklistBypasses';
import { useClockInChase, useMiddayChase } from '@/hooks/useGentleChase';
import { useGeoTracking, LocationState } from '@/hooks/useGeoTracking';
import { useWorkZones } from '@/hooks/useWorkZones';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useTick } from '@/hooks/useTick';
import { getClockStatus, getRunningMinutes } from '@/lib/clock-status';
import { minutesToHHMM, formatTime } from '@/lib/time-utils';
import ChecklistBypassDialog from '@/components/ChecklistBypassDialog';
import BypassReasonDialog from '@/components/BypassReasonDialog';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { CorrectionRequestModal } from '@/components/CorrectionRequestModal';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Loader2, LogIn, LogOut, MapPin, Pencil, Table2 } from 'lucide-react';

type ClockContextValue = {
  clocksIn: boolean;
  punches: PunchRow[];
  todayEntry: TimeEntryRow | null | undefined;
  isLoading: boolean;
  isBusy: boolean;
  clockIn: () => void;
  clockOut: () => void;
  isManager: boolean;
  autoClockEnabled: boolean;
  setAutoClockEnabled: (v: boolean) => void;
  activeZoneCount: number;
  geoState: LocationState;
  openPunchEditor: () => void;
  openCorrection: () => void;
};

const ClockContext = createContext<ClockContextValue | null>(null);

export function useClock() {
  const ctx = useContext(ClockContext);
  if (!ctx) throw new Error('useClock must be used within ClockProvider');
  return ctx;
}

/**
 * One clock runtime for the whole shell. Owns the punch mutations, the
 * checklist-bypass guard dialogs, the gentle-chase notes, and GPS auto-clock —
 * which previously only ran while the Dashboard was open. The visible
 * controls (header chip, mobile bar) are thin consumers.
 */
export function ClockProvider({ children }: { children: ReactNode }) {
  const clocksIn = useClocksIn();
  const { data: todayEntry, isLoading } = useTodayEntry();
  const clockAction = useGuardedClockAction();
  const { data: unresolvedBypasses } = useUnresolvedBypasses();
  const { data: orgCtx } = useOrgContext();
  const [reasonPromptOpen, setReasonPromptOpen] = useState(false);
  const [reasonPrompted, setReasonPrompted] = useState(false);
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [autoClockEnabled, setAutoClockEnabledState] = useState(
    () => localStorage.getItem('timevault_auto_clock') !== 'false'
  );

  const { data: zones } = useWorkZones();
  const geoState = useGeoTracking(clocksIn && autoClockEnabled && (zones?.length ?? 0) > 0);

  const chaseAtClockIn = useClockInChase();
  useMiddayChase();

  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';
  const punches = todayEntry?.punches || [];

  const value = useMemo<ClockContextValue>(() => ({
    clocksIn,
    punches,
    todayEntry,
    isLoading,
    isBusy: clockAction.isPending,
    clockIn: () => {
      clockAction.run('clock_in');
      chaseAtClockIn();
      if (!reasonPrompted && (unresolvedBypasses?.length ?? 0) > 0) {
        setReasonPrompted(true);
        setReasonPromptOpen(true);
      }
    },
    clockOut: () => clockAction.run('clock_out'),
    isManager,
    autoClockEnabled,
    setAutoClockEnabled: (v: boolean) => {
      setAutoClockEnabledState(v);
      localStorage.setItem('timevault_auto_clock', String(v));
    },
    activeZoneCount: zones?.filter(z => z.is_active).length ?? 0,
    geoState,
    openPunchEditor: () => setPunchEditorOpen(true),
    openCorrection: () => setCorrectionOpen(true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [clocksIn, todayEntry, isLoading, clockAction.isPending, clockAction.run,
       isManager, autoClockEnabled, zones, geoState, reasonPrompted, unresolvedBypasses]);

  return (
    <ClockContext.Provider value={value}>
      {children}

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
    </ClockContext.Provider>
  );
}

const GEO_LABEL: Record<LocationState['status'], string> = {
  active: 'GPS auto-clock active',
  permission_missing: 'Location permission needed',
  inactive: 'GPS auto-clock off',
  unavailable: 'Location unavailable',
};

/** Popover body: recent punches, correction access, and the full timesheet. */
function ClockPopoverBody({ runningMinutes }: { runningMinutes: number }) {
  const clock = useClock();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">Today's total</p>
        <p className="time-display text-xl font-bold">{minutesToHHMM(runningMinutes)}</p>
      </div>

      {clock.punches.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Today's punches</p>
          {clock.punches.map(p => (
            <div key={p.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                {p.punch_type}
              </span>
              <span className={`time-display text-xs ${p.is_edited ? 'text-destructive font-semibold' : ''}`}>
                {formatTime(p.punch_time)}
              </span>
              {p.location_lat != null && p.location_lng != null && (
                <MapPin className="ml-auto h-3 w-3 text-primary" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No punches yet today.</p>
      )}

      {clock.activeZoneCount > 0 && (
        <div className="flex items-center justify-between rounded-md border px-2.5 py-2">
          <div>
            <p className="text-xs font-medium">Auto clock (GPS)</p>
            <p className="text-[11px] text-muted-foreground">{GEO_LABEL[clock.geoState.status]}</p>
          </div>
          <Switch checked={clock.autoClockEnabled} onCheckedChange={clock.setAutoClockEnabled} />
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        {clock.todayEntry && clock.punches.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={clock.isManager ? clock.openPunchEditor : clock.openCorrection}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {clock.isManager ? 'Edit punches' : 'Request correction'}
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to="/timesheet"><Table2 className="mr-1.5 h-3.5 w-3.5" />Timesheet</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Compact global time control (blueprint §6). `header` renders the desktop
 * utility-header chip; `bar` renders the mobile sticky clock bar that sits
 * above the bottom navigation. Hidden entirely for members who don't clock in.
 */
export default function GlobalTimeControl({ variant }: { variant: 'header' | 'bar' }) {
  const clock = useClock();
  const now = useTick(1000);

  if (!clock.clocksIn) return null;

  const status = getClockStatus(clock.punches);
  const runningMinutes = getRunningMinutes(clock.punches);
  const clockedIn = status === 'clocked_in';

  const statusDot = (
    <span className={`h-2 w-2 shrink-0 rounded-full ${clockedIn ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
  );

  const actionButton = (
    <Button
      size="sm"
      variant={clockedIn ? 'destructive' : 'default'}
      className="h-8"
      disabled={clock.isBusy || clock.isLoading}
      onClick={clockedIn ? clock.clockOut : clock.clockIn}
    >
      {clock.isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : clockedIn ? (
        <><LogOut className="mr-1.5 h-4 w-4" />Clock Out</>
      ) : (
        <><LogIn className="mr-1.5 h-4 w-4" />Clock In</>
      )}
    </Button>
  );

  if (variant === 'header') {
    return (
      <div className="flex items-center gap-2 rounded-full border bg-card py-1 pl-3 pr-1">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity" aria-label="Time details">
              {statusDot}
              <span className="time-display font-semibold tabular-nums">
                {clockedIn
                  ? minutesToHHMM(runningMinutes)
                  : now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <ClockPopoverBody runningMinutes={runningMinutes} />
          </PopoverContent>
        </Popover>
        {actionButton}
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-card/95 backdrop-blur px-4 py-2 md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2.5 text-left" aria-label="Time details">
              {statusDot}
              <div>
                <p className="text-xs font-medium leading-tight">
                  {clockedIn ? 'Clocked in' : 'Clocked out'}
                </p>
                <p className="time-display text-sm font-bold leading-tight tabular-nums">
                  {clockedIn
                    ? minutesToHHMM(runningMinutes)
                    : now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-80">
            <ClockPopoverBody runningMinutes={runningMinutes} />
          </PopoverContent>
        </Popover>
        {actionButton}
      </div>
    </div>
  );
}
