import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import { parsePercentInput } from '@/lib/fof/plan-hydration';
import {
  useDeleteInsurancePlan,
  useInsurancePlans,
  useUpsertInsurancePlan,
  type FeeSchedule,
  type InsurancePlan,
  type InsurancePlanInput,
} from '@/hooks/useFeeSchedules';

/**
 * Saved insurance plans: the office's expected coverage percentages,
 * deductible and annual maximum for a carrier schedule, plus the plan's
 * rules (write-offs, office fees after the max, alternate-benefit
 * downgrade). De-identified configuration. On the FOF these values are
 * applied as UNVERIFIED estimates that staff confirm per patient — they
 * are never a patient's eligibility.
 */

const NO_SCHEDULE = '__none__';
const INHERIT = '__inherit__';

interface Draft {
  id?: string;
  name: string;
  feeScheduleId: string;
  pctPrev: string;
  pctBasic: string;
  pctMajor: string;
  deductible: string;
  annualMax: string;
  deductibleWaivedPreventive: boolean;
  writeoffApplies: boolean;
  officeFeesAfterMax: boolean;
  isInNetwork: boolean;
  isActive: boolean;
  downgrade: string; // INHERIT | 'yes' | 'no'
  sortOrder: number;
}

const draftFrom = (plan: InsurancePlan | null, defaultScheduleId: string): Draft => ({
  id: plan?.id,
  name: plan?.name ?? '',
  feeScheduleId: plan?.feeScheduleId ?? defaultScheduleId,
  pctPrev: String(plan?.preventivePct ?? 100),
  pctBasic: String(plan?.basicPct ?? 80),
  pctMajor: String(plan?.majorPct ?? 50),
  deductible: formatCents(plan?.deductibleCents ?? 5000),
  annualMax: formatCents(plan?.annualMaxCents ?? 150000),
  deductibleWaivedPreventive: plan?.deductibleWaivedPreventive ?? true,
  writeoffApplies: plan?.writeoffApplies ?? true,
  officeFeesAfterMax: plan?.officeFeesAfterMax ?? false,
  isInNetwork: plan?.isInNetwork ?? true,
  isActive: plan?.isActive ?? true,
  downgrade: plan?.alternateBenefitDowngrade === null || plan?.alternateBenefitDowngrade === undefined ? INHERIT : plan.alternateBenefitDowngrade ? 'yes' : 'no',
  sortOrder: plan?.sortOrder ?? 0,
});

function validate(draft: Draft): { input?: InsurancePlanInput; error?: string } {
  const pctPrev = parsePercentInput(draft.pctPrev);
  const pctBasic = parsePercentInput(draft.pctBasic);
  const pctMajor = parsePercentInput(draft.pctMajor);
  if (pctPrev === null || pctBasic === null || pctMajor === null) return { error: 'Coverage percentages must be whole numbers from 0 to 100.' };
  const deductible = parseCurrencyInput(draft.deductible);
  const annualMax = parseCurrencyInput(draft.annualMax);
  if (deductible === null || annualMax === null) return { error: 'Deductible and annual maximum must be dollar amounts (for example 50.00).' };
  if (!draft.name.trim()) return { error: 'Give the plan a name.' };
  return {
    input: {
      id: draft.id,
      name: draft.name.trim(),
      feeScheduleId: draft.feeScheduleId === NO_SCHEDULE ? null : draft.feeScheduleId,
      preventivePct: pctPrev,
      basicPct: pctBasic,
      majorPct: pctMajor,
      deductibleCents: deductible,
      annualMaxCents: annualMax,
      deductibleWaivedPreventive: draft.deductibleWaivedPreventive,
      writeoffApplies: draft.writeoffApplies,
      officeFeesAfterMax: draft.officeFeesAfterMax,
      isInNetwork: draft.isInNetwork,
      isActive: draft.isActive,
      alternateBenefitDowngrade: draft.downgrade === INHERIT ? null : draft.downgrade === 'yes',
      sortOrder: draft.sortOrder,
    },
  };
}

export default function InsurancePlansCard({ schedules, isManager }: { schedules: FeeSchedule[]; isManager: boolean }) {
  const plans = useInsurancePlans();
  const upsert = useUpsertInsurancePlan();
  const remove = useDeleteInsurancePlan();
  const carriers = schedules.filter(s => s.kind === 'carrier');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [draft?.id]);

  const scheduleName = (id: string | null) => (id ? schedules.find(s => s.id === id)?.name ?? 'Deleted schedule' : 'No carrier schedule');

  const save = () => {
    if (!draft) return;
    const { input, error: problem } = validate(draft);
    if (!input) { setError(problem ?? 'Check the plan details.'); return; }
    upsert.mutate(input, {
      onSuccess: () => { toast.success(`Plan "${input.name}" saved`); setDraft(null); },
      onError: err => setError(err.message),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Insurance Plans (estimate defaults)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          A plan carries the coverage percentages, deductible and annual maximum the office expects for a carrier
          schedule, plus that plan's rules. When staff pick the carrier on a Financial Options Form these values
          fill in as <strong>unverified estimates</strong>; the patient's remaining deductible and maximum are
          confirmed per patient before the form prints and are never stored.
        </p>
        {plans.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : plans.error ? (
          <p role="alert" className="text-sm text-destructive">Saved plans could not be loaded: {plans.error.message}</p>
        ) : (plans.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved plans yet. Without one, the form starts from generic defaults (100/80/50, $50 deductible, $1,500 maximum) and says so.</p>
        ) : (
          <div className="space-y-2">
            {(plans.data ?? []).map(plan => (
              <div key={plan.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm" data-testid={`plan-${plan.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{plan.name}</span>
                    {!plan.isActive && <Badge variant="outline">Inactive</Badge>}
                    <Badge variant="secondary">{scheduleName(plan.feeScheduleId)}</Badge>
                    {plan.isInNetwork ? <Badge variant="secondary">In network</Badge> : <Badge variant="outline">Out of network</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {plan.preventivePct}/{plan.basicPct}/{plan.majorPct} · deductible {formatCents(plan.deductibleCents)}
                    {plan.deductibleWaivedPreventive ? ' (waived for preventive)' : ''} · annual max {formatCents(plan.annualMaxCents)}
                    {plan.writeoffApplies ? ' · write-offs apply' : ' · no write-offs'}
                    {plan.officeFeesAfterMax ? ' · office fees after max' : ''}
                    {plan.alternateBenefitDowngrade === null ? '' : plan.alternateBenefitDowngrade ? ' · downgrades composites' : ' · pays composite rates'}
                  </div>
                </div>
                {isManager && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit plan ${plan.name}`} onClick={() => setDraft(draftFrom(plan, carriers[0]?.id ?? NO_SCHEDULE))}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Delete plan ${plan.name}`}
                      onClick={() => { if (confirm(`Delete the plan "${plan.name}"?`)) remove.mutate(plan.id, { onError: err => toast.error(err.message) }); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isManager && (
          <Button variant="outline" size="sm" onClick={() => setDraft(draftFrom(null, carriers[0]?.id ?? NO_SCHEDULE))}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add plan
          </Button>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit ${draft.name || 'plan'}` : 'Add insurance plan'}</DialogTitle>
            <DialogDescription>Expected plan defaults for the form. Patient-specific remaining benefits are entered per form and never saved.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-name">Plan name</Label>
                  <Input id="plan-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="DD MA 100/80/50" />
                </div>
                <div className="space-y-1.5">
                  <Label>Carrier fee schedule</Label>
                  <Select value={draft.feeScheduleId} onValueChange={v => setDraft({ ...draft, feeScheduleId: v })}>
                    <SelectTrigger aria-label="Carrier fee schedule"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SCHEDULE}>No carrier schedule</SelectItem>
                      {carriers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.isActive ? '' : ' (inactive)'}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 grid-cols-3">
                {([['pctPrev', 'Preventive %'], ['pctBasic', 'Basic %'], ['pctMajor', 'Major %']] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`plan-${key}`}>{label}</Label>
                    <Input id={`plan-${key}`} inputMode="numeric" value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-deductible">Deductible (expected)</Label>
                  <Input id="plan-deductible" inputMode="decimal" value={draft.deductible} onChange={e => setDraft({ ...draft, deductible: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-max">Annual maximum (expected)</Label>
                  <Input id="plan-max" inputMode="decimal" value={draft.annualMax} onChange={e => setDraft({ ...draft, annualMax: e.target.value })} />
                </div>
              </div>
              {([
                ['deductibleWaivedPreventive', 'Deductible waived for preventive care'],
                ['writeoffApplies', 'Contracted write-offs apply (in-network plan)'],
                ['officeFeesAfterMax', 'Reverts to office fees once the annual max is used up'],
                ['isInNetwork', 'In network (no additional prepay discount)'],
                ['isActive', 'Active (offered on the form)'],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Switch id={`plan-${key}`} checked={draft[key]} onCheckedChange={v => setDraft({ ...draft, [key]: v })} />
                  <Label htmlFor={`plan-${key}`} className="text-sm font-normal">{label}</Label>
                </div>
              ))}
              <div className="space-y-1.5">
                <Label>Alternate benefit on posterior composites (D2391–D2394)</Label>
                <Select value={draft.downgrade} onValueChange={v => setDraft({ ...draft, downgrade: v })}>
                  <SelectTrigger aria-label="Alternate benefit downgrade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INHERIT}>Follow the office FOF setting</SelectItem>
                    <SelectItem value="yes">This plan downgrades to the amalgam benefit</SelectItem>
                    <SelectItem value="no">This plan pays composite rates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
