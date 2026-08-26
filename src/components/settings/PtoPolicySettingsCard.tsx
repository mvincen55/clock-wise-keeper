import { useEffect, useState } from 'react';
import {
  usePtoSettings, useUpsertPtoSettings,
  usePtoSnapshots, useUpsertPtoSnapshot,
  useRecalculatePto,
  PTO_TIERS, getTierForDate,
} from '@/hooks/usePtoEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * PTO policy: accrual anchor, caps, and the balance snapshot the engine
 * recalculates from. Extracted from the PTO page's settings tab so every
 * policy surface lives in Settings; the PTO page links here for admins.
 *
 * Scope note: pto_settings rows are keyed per user (onConflict user_id), so
 * this card edits the signed-in admin's own accrual record — exactly what the
 * old PTO tab did. The caption says so instead of implying an org-wide write.
 */
export default function PtoPolicySettingsCard() {
  const { toast } = useToast();
  const { data: settings } = usePtoSettings();
  const { data: snapshots } = usePtoSnapshots();
  const upsertSettings = useUpsertPtoSettings();
  const upsertSnapshot = useUpsertPtoSnapshot();
  const recalc = useRecalculatePto();

  const [hireDate, setHireDate] = useState('');
  const [workedCap, setWorkedCap] = useState(40);
  const [maxBalance, setMaxBalance] = useState(100);
  const [allowNegative, setAllowNegative] = useState(false);
  const [snapDate, setSnapDate] = useState('');
  const [snapBalance, setSnapBalance] = useState(0);

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
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleRecalc = async () => {
    try {
      const result = await recalc.mutateAsync();
      toast({ title: `PTO recalculated: ${result.weeks} weeks, balance = ${result.balance.toFixed(2)}h` });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const currentTier = settings
    ? getTierForDate(settings.hire_date, new Date().toISOString().split('T')[0])
    : PTO_TIERS[0];

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          PTO Policy Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Accrual tiers are office-wide; the hire date and snapshot below anchor your own
          accrual record, which the engine recalculates from.
        </p>
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
            <p className="text-xs text-muted-foreground">
              Hours worked beyond this are not counted for accrual.
              Overtime hours (over 40/week) never accrue PTO, whatever this cap is set to.
            </p>
            <p className="text-xs text-muted-foreground">
              Note: accrual weeks run Sunday–Saturday, which can differ from the payroll
              report's week-start setting; the accrual ledger keeps its historical week
              boundaries on purpose.
            </p>
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
          <h4 className="font-medium text-sm mb-2">Office Accrual Tiers</h4>
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
  );
}
