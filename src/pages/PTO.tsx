import { useState, useEffect } from 'react';
import {
  usePtoSettings, useUpsertPtoSettings,
  usePtoSnapshots, useUpsertPtoSnapshot,
  usePtoLedger, useRecalculatePto,
  useCurrentPtoBalance, PTO_TIERS, getTierForDate,
  PtoLedgerWeek,
} from '@/hooks/usePtoEngine';
import { useAuth } from '@/hooks/useAuth';
import { useDaysOff } from '@/hooks/useDaysOff';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CalendarDays, TrendingUp, Clock, Settings as SettingsIcon, Printer, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/time-utils';
import { useToast } from '@/hooks/use-toast';

export default function PTO() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');

  const { data: settings, isLoading: settingsLoading } = usePtoSettings();
  const { data: snapshots } = usePtoSnapshots();
  const { data: ledger } = usePtoLedger();
  const { data: daysOff } = useDaysOff();
  const upsertSettings = useUpsertPtoSettings();
  const upsertSnapshot = useUpsertPtoSnapshot();
  const recalc = useRecalculatePto();
  const ptoState = useCurrentPtoBalance();

  // Local form state for settings
  const [hireDate, setHireDate] = useState('2022-02-07');
  const [workedCap, setWorkedCap] = useState(40);
  const [maxBalance, setMaxBalance] = useState(100);
  const [allowNegative, setAllowNegative] = useState(false);
  const [snapDate, setSnapDate] = useState('2026-02-14');
  const [snapBalance, setSnapBalance] = useState(-1.63);

  // Sync from DB
  useEffect(() => {
    if (settings) {
      setHireDate(settings.hire_date);
      setWorkedCap(Number(settings.worked_hours_cap_weekly));
      setMaxBalance(Number(settings.max_balance));
      setAllowNegative(settings.allow_negative);
    }
  }, [settings]);

  useEffect(() => {
    if (snapshots?.length) {
      setSnapDate(snapshots[0].snapshot_date);
      setSnapBalance(Number(snapshots[0].snapshot_balance_hours));
    }
  }, [snapshots]);

  const handleSaveSettings = async () => {
    try {
      await upsertSettings.mutateAsync({
        hire_date: hireDate,
        worked_hours_cap_weekly: workedCap,
        max_balance: maxBalance,
        allow_negative: allowNegative,
      });
      await upsertSnapshot.mutateAsync({
        snapshot_date: snapDate,
        snapshot_balance_hours: snapBalance,
      });
      toast({ title: 'PTO settings saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleRecalc = async () => {
    try {
      const result = await recalc.mutateAsync();
      toast({ title: `PTO recalculated: ${result.weeks} weeks, balance = ${result.balance.toFixed(2)}h` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const currentTier = settings
    ? getTierForDate(settings.hire_date, new Date().toISOString().split('T')[0])
    : PTO_TIERS[0];

  // PTO usage entries
  const ptoEntries = (daysOff || [])
    .filter(d => d.type !== 'office_closed')
    .sort((a, b) => b.date_start.localeCompare(a.date_start));

  const reversedLedger = [...(ledger || [])].reverse();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">PTO</h1>
          <p className="text-muted-foreground">Harelick Dental — Combined PTO Bank</p>
        </div>
        <Button onClick={handleRecalc} disabled={recalc.isPending} variant="secondary" size="sm">
          {recalc.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Recalculate
        </Button>
      </div>

      {/* Negative balance warning */}
      {ptoState.balance < 0 && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            PTO balance is negative: {ptoState.balance.toFixed(2)} hours
          </span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${ptoState.balance < 0 ? 'text-destructive' : 'text-success'}`}>
              {ptoState.balance.toFixed(2)}h
            </p>
            <p className="text-xs text-muted-foreground">Current Balance</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{(currentTier.rate * 100).toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">{currentTier.label}</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">
              {ptoState.currentWeek ? ptoState.currentWeek.accrual_credited.toFixed(2) : '—'}h
            </p>
            <p className="text-xs text-muted-foreground">Accrued This Week</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">
              {ptoState.currentWeek ? ptoState.currentWeek.pto_taken_hours.toFixed(2) : '0.00'}h
            </p>
            <p className="text-xs text-muted-foreground">PTO Used This Week</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="ledger">Weekly Ledger</TabsTrigger>
          <TabsTrigger value="usage">PTO Usage</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Balance Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Hire Date</p>
                  <p className="font-semibold">{settings ? formatDate(settings.hire_date) : '—'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Current Tier</p>
                  <p className="font-semibold">{currentTier.label} — {(currentTier.rate * 100).toFixed(2)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Weekly Cap</p>
                  <p className="font-semibold">{currentTier.weeklyCap.toFixed(2)}h</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Max Balance</p>
                  <p className="font-semibold">{settings ? Number(settings.max_balance) : 100}h</p>
                </div>
              </div>

              {snapshots?.length ? (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="text-muted-foreground">
                    Snapshot anchor: As of <span className="font-semibold">{formatDate(snapshots[0].snapshot_date)}</span>,
                    balance = <span className="font-semibold">{Number(snapshots[0].snapshot_balance_hours).toFixed(2)}h</span>
                  </p>
                </div>
              ) : null}

              {/* Last 4 weeks mini trend */}
              {reversedLedger.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Recent Weeks</p>
                  {reversedLedger.slice(0, 6).map((w, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(w.period_start)} – {formatDate(w.period_end)}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-success">+{w.accrual_credited.toFixed(2)}h</span>
                        {w.pto_taken_hours > 0 && <span className="text-xs text-destructive">-{w.pto_taken_hours.toFixed(2)}h</span>}
                        <span className={`text-sm font-semibold ${w.running_balance < 0 ? 'text-destructive' : ''}`}>
                          {w.running_balance.toFixed(2)}h
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly Ledger */}
        <TabsContent value="ledger">
          <Card className="card-elevated">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  PTO Ledger by Week
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {!ledger?.length ? (
                <p className="text-center text-muted-foreground py-12">No ledger data. Click "Recalculate" to generate.</p>
              ) : (
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">Period</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Worked (raw)</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Worked (cap)</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">PTO Taken</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Rate</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Accrual</th>
                      <th className="px-3 py-2 text-center font-medium text-muted-foreground text-xs">Capped?</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Credited</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground text-xs">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {reversedLedger.map((w, i) => {
                      const wasCapped = w.calculated_accrual > w.accrual_credited;
                      return (
                        <tr key={i} className="hover:bg-muted/30">
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {formatDate(w.period_start)}
                          </td>
                          <td className="px-3 py-2 text-right">{w.worked_hours_raw.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{w.worked_hours_capped.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-destructive">
                            {w.pto_taken_hours > 0 ? w.pto_taken_hours.toFixed(2) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right">{(w.tier_rate * 100).toFixed(2)}%</td>
                          <td className="px-3 py-2 text-right">{w.calculated_accrual.toFixed(2)}</td>
                          <td className="px-3 py-2 text-center">
                            {wasCapped ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">yes</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right text-success font-medium">+{w.accrual_credited.toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${w.running_balance < 0 ? 'text-destructive' : ''}`}>
                            {w.running_balance.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PTO Usage */}
        <TabsContent value="usage">
          <Card className="card-elevated">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  PTO Usage
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {ptoEntries.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No PTO entries recorded</p>
              ) : (
                <div className="divide-y">
                  {ptoEntries.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(d.date_start)}
                          {d.date_start !== d.date_end && ` — ${formatDate(d.date_end)}`}
                        </p>
                        {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded font-medium bg-primary/20 text-primary capitalize">
                          {d.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm font-semibold">{d.hours || 8}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                PTO Policy Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Hire Date</Label>
                  <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} className="w-48" />
                  <p className="text-xs text-muted-foreground">
                    Current tier: {currentTier.label} → {(currentTier.rate * 100).toFixed(2)}% (cap {currentTier.weeklyCap}h/wk)
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Worked-Hours Cap (weekly)</Label>
                  <Input type="number" min={0} value={workedCap} onChange={e => setWorkedCap(parseFloat(e.target.value) || 40)} className="w-24" />
                  <p className="text-xs text-muted-foreground">Hours worked beyond this are not counted for accrual.</p>
                </div>
                <div className="space-y-1">
                  <Label>Max PTO Balance</Label>
                  <Input type="number" min={0} value={maxBalance} onChange={e => setMaxBalance(parseFloat(e.target.value) || 100)} className="w-24" />
                  <p className="text-xs text-muted-foreground">Accrual stops when balance reaches this cap.</p>
                </div>
                <div className="space-y-1">
                  <Label>Allow Negative PTO Usage</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={allowNegative} onCheckedChange={setAllowNegative} />
                    <span className="text-xs text-muted-foreground">{allowNegative ? 'Enabled' : 'Disabled (default)'}</span>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-sm">Balance Snapshot Anchor</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Snapshot Date</Label>
                    <Input type="date" value={snapDate} onChange={e => setSnapDate(e.target.value)} className="w-48" />
                  </div>
                  <div className="space-y-1">
                    <Label>Snapshot Balance (hours)</Label>
                    <Input type="number" step="0.01" value={snapBalance} onChange={e => setSnapBalance(parseFloat(e.target.value) || 0)} className="w-32" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The engine recalculates forward from this snapshot. All weekly accruals and PTO usage after this date are computed.
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveSettings} disabled={upsertSettings.isPending}>
                  {upsertSettings.isPending ? 'Saving...' : 'Save Settings'}
                </Button>
                <Button variant="secondary" onClick={handleRecalc} disabled={recalc.isPending}>
                  {recalc.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Recalculate Now
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Harelick Dental Accrual Tiers</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {PTO_TIERS.map((t, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{t.label}</span>
                      <span className="font-semibold">{(t.rate * 100).toFixed(2)}% (max {t.weeklyCap}h/wk)</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
