import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgPtoPolicy, useSetOrgPtoPolicy, PTO_TIERS } from '@/hooks/usePtoEngine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * The office's PTO policy: the accrual inputs everyone follows unless their
 * own record is marked an exception. Owners change it; the new default
 * reaches every person without an exception in the same write. A person's
 * dates, starting balance, and any exception live on their record
 * (People → person → Time).
 */
export default function PtoPolicySettingsCard() {
  const { toast } = useToast();
  const { data: ctx } = useOrgContext();
  const { data: policy, isLoading, error } = useOrgPtoPolicy();
  const save = useSetOrgPtoPolicy();
  const isOwner = ctx?.role === 'owner';

  const [workedCap, setWorkedCap] = useState('40');
  const [maxBalance, setMaxBalance] = useState('100');
  const [allowNegative, setAllowNegative] = useState(false);

  useEffect(() => {
    if (!policy) return;
    setWorkedCap(String(policy.worked_hours_cap_weekly));
    setMaxBalance(String(policy.max_balance));
    setAllowNegative(policy.allow_negative);
  }, [policy]);

  const cap = Number(workedCap);
  const max = Number(maxBalance);
  const valid = workedCap.trim() !== '' && maxBalance.trim() !== '' && Number.isFinite(cap) && Number.isFinite(max) && cap >= 0 && max >= 0;
  const dirty = !!policy && (cap !== policy.worked_hours_cap_weekly || max !== policy.max_balance || allowNegative !== policy.allow_negative);

  const handleSave = async () => {
    if (!valid) { toast({ title: 'Enter nonnegative PTO limits', variant: 'destructive' }); return; }
    try {
      await save.mutateAsync({ worked_hours_cap_weekly: cap, max_balance: max, allow_negative: allowNegative });
      toast({ title: 'Office PTO policy saved', description: 'Everyone without an exception now follows it.' });
    } catch (err) {
      toast({ title: 'Could not save the policy', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          PTO policy
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The office default for accrual. A person follows it unless their record is marked an exception; dates and starting balances are set on each person's record in{' '}
          <Link to="/management/people?view=everyone" className="underline">People</Link>.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? (
          <p role="alert" className="text-sm text-destructive">The office policy could not be read.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Reading the office policy…</p>
        ) : !policy ? (
          <p className="text-sm text-muted-foreground">No office policy is on file yet; everyone accrues on the app defaults (40h weekly cap, 100h maximum, no negative balance) until an owner saves one.</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="pto-cap">Weekly worked-hours cap for accrual</Label>
            <Input id="pto-cap" type="number" min={0} step="0.01" value={workedCap} onChange={e => setWorkedCap(e.target.value)} disabled={!isOwner} className="w-28" />
            <p className="text-xs text-muted-foreground">Hours worked beyond this do not count toward accrual. Overtime (over 40 a week) never accrues, whatever this is set to. Accrual weeks run Sunday to Saturday.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pto-max">Maximum PTO balance (hours)</Label>
            <Input id="pto-max" type="number" min={0} step="0.01" value={maxBalance} onChange={e => setMaxBalance(e.target.value)} disabled={!isOwner} className="w-28" />
            <p className="text-xs text-muted-foreground">Accrual stops at this balance.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pto-negative">Allow a negative balance</Label>
            <div className="flex items-center gap-2 pt-1">
              <Switch id="pto-negative" checked={allowNegative} onCheckedChange={setAllowNegative} disabled={!isOwner} />
              <span className="text-xs text-muted-foreground">{allowNegative ? 'Allowed' : 'Not allowed'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isOwner ? (
            <Button onClick={handleSave} disabled={save.isPending || !valid || (!!policy && !dirty)}>
              {save.isPending ? 'Saving…' : 'Save office policy'}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only an owner changes the office policy.</p>
          )}
        </div>

        <div className="rounded-lg bg-muted/50 p-3">
          <h4 className="mb-2 text-sm font-medium">Accrual tiers</h4>
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
