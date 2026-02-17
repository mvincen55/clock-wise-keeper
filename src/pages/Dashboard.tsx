import { useTodayEntry, useClockAction, PunchRow } from '@/hooks/useTimeEntries';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Clock, LogIn, LogOut, Coffee, Play, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGeoTracking } from '@/hooks/useGeoTracking';
import { LocationStatusPanel } from '@/components/LocationStatusPanel';
import { useWorkZones } from '@/hooks/useWorkZones';

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

export default function Dashboard() {
  const { data: todayEntry, isLoading } = useTodayEntry();
  const clockAction = useClockAction();
  const [now, setNow] = useState(new Date());
  const [autoClockEnabled, setAutoClockEnabled] = useState(false);
  const { data: zones } = useWorkZones();
  const geoState = useGeoTracking(autoClockEnabled && (zones?.length ?? 0) > 0);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const punches = todayEntry?.punches || [];
  const status = getStatus(punches);
  const runningMinutes = getRunningMinutes(punches);
  const isBusy = clockAction.isPending;

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

          {/* Action buttons - large, thumb reachable */}
          <div className="grid grid-cols-2 gap-3">
            {status === 'clocked_out' && (
              <Button
                className="col-span-2 h-16 text-lg font-semibold punch-glow"
                onClick={() => clockAction.mutate('clock_in')}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                Clock In
              </Button>
            )}

            {status === 'clocked_in' && (
              <>
                <Button
                  variant="destructive"
                  className="h-16 text-base font-semibold"
                  onClick={() => clockAction.mutate('clock_out')}
                  disabled={isBusy}
                >
                  {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                  Clock Out
                </Button>
                <Button
                  variant="secondary"
                  className="h-16 text-base font-semibold"
                  onClick={() => clockAction.mutate('break_start')}
                  disabled={isBusy}
                >
                  {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Coffee className="mr-2 h-4 w-4" />}
                  Start Break
                </Button>
              </>
            )}

            {status === 'on_break' && (
              <Button
                className="col-span-2 h-16 text-lg font-semibold"
                onClick={() => clockAction.mutate('break_end')}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5" />}
                End Break
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto Clock Toggle */}
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
            onCheckedChange={setAutoClockEnabled}
            disabled={!zones?.length}
          />
        </CardContent>
      </Card>

      {/* Location Status */}
      {autoClockEnabled && <LocationStatusPanel state={geoState} />}

      {/* Today's punches */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Today's Punches
          </CardTitle>
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
              {punches.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50">
                  <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
                    p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                  }`}>
                    {p.punch_type}
                  </span>
                  <span className="time-display text-sm">{formatTime(p.punch_time)}</span>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
