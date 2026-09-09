import { useFofPaymentPolicy, useUpsertFofPaymentPolicy } from '@/hooks/useFofPaymentPolicy';
import {
  MILESTONE_KINDS,
  TREATMENT_CLASSES,
  TREATMENT_CLASS_LABELS,
  DEFAULT_MILESTONE_LABELS,
  type MilestoneKind,
  type TreatmentClass,
} from '@/lib/fof/payment-plan';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Receipt } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { PaymentPolicyPatch } from '@/hooks/useFofPaymentPolicy';

/**
 * Organization-scoped payment rules for the Financial Options Form.
 *
 * Everything on this card is de-identified office CONFIGURATION stored on the
 * office's own `fof_settings` row — there is no second source of truth and no
 * patient information passes through here. An office that never turns the
 * master switch on keeps its existing schedule exactly as it is today.
 */
export function FofPaymentPolicyCard() {
  const { toast } = useToast();
  const { data: policy, isLoading } = useFofPaymentPolicy();
  const upsert = useUpsertFofPaymentPolicy();

  const save = (patch: PaymentPolicyPatch) => {
    upsert.mutate(patch, {
      onError: (err: any) =>
        toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
    });
  };

  const toggleKind = (cls: TreatmentClass, tier: 'atOrAbove' | 'below', kind: MilestoneKind) => {
    if (!policy) return;
    const current = policy.strategies[cls][tier];
    const next = current.includes(kind)
      ? current.filter(k => k !== kind)
      : MILESTONE_KINDS.filter(k => current.includes(k) || k === kind);
    save({
      payment_strategies: {
        ...policy.strategies,
        [cls]: { ...policy.strategies[cls], [tier]: next },
      },
    });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Payment Plan Rules
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-5">
        {isLoading || !policy ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Use these payment rules</Label>
                <p className="text-xs text-muted-foreground">
                  When off, financial options forms keep the older automatic schedule.
                </p>
              </div>
              <Switch
                checked={policy.enabled}
                onCheckedChange={v => save({ payment_policy_enabled: v })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Larger-treatment threshold</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={(policy.thresholdCents / 100).toFixed(2)}
                    onBlur={e => {
                      const value = parseFloat(e.target.value);
                      save({
                        payment_threshold_cents: Number.isFinite(value)
                          ? Math.round(value * 100)
                          : 0,
                      });
                    }}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Treatment at or above this amount is split across more payments.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm">Exactly at the amount counts as larger</Label>
                  <p className="text-xs text-muted-foreground">
                    Turn off to treat an exact match as the smaller tier.
                  </p>
                </div>
                <Switch
                  checked={policy.thresholdInclusive}
                  onCheckedChange={v => save({ payment_threshold_inclusive: v })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Codes always paid at the work-up appointment</Label>
              <Input
                defaultValue={policy.workUpCodes.join(', ')}
                placeholder="D0367, D0470, D6190"
                onBlur={e =>
                  save({
                    payment_work_up_codes: e.target.value
                      .split(',')
                      .map(c => c.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Separate codes with commas. These are collected in full up front and are left out
                of later balances.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Implant placement always splits in advance</Label>
                <p className="text-xs text-muted-foreground">
                  Half at scheduling and half at surgery, even below the threshold.
                </p>
              </div>
              <Switch
                checked={policy.implantAdvanceException}
                onCheckedChange={v => save({ payment_implant_advance_exception: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Treatment done alongside other work splits too</Label>
                <p className="text-xs text-muted-foreground">
                  Stops a smaller procedure being left as "pay that day" when it is scheduled with
                  larger work.
                </p>
              </div>
              <Switch
                checked={policy.mixedGroupTierUplift}
                onCheckedChange={v => save({ payment_mixed_group_uplift: v })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Combining payments</Label>
                <Select
                  value={policy.combineMode}
                  onValueChange={v =>
                    save({ payment_combine_mode: v as 'linked_events' | 'never' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linked_events">
                      Combine when due at the same appointment
                    </SelectItem>
                    <SelectItem value="never">Always list separately</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Leftover cents go to</Label>
                <Select
                  value={policy.rounding}
                  onValueChange={v => save({ payment_rounding: v as 'last' | 'first' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last">The last payment</SelectItem>
                    <SelectItem value="first">The first payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="strategies">
                <AccordionTrigger className="text-sm">
                  When each kind of treatment is paid
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {TREATMENT_CLASSES.filter(c => c !== 'zero_fee_marker').map(cls => (
                    <div key={cls} className="rounded-lg border p-3 space-y-3">
                      <p className="text-sm font-medium">{TREATMENT_CLASS_LABELS[cls]}</p>
                      {(['atOrAbove', 'below'] as const).map(tier => (
                        <div key={tier} className="space-y-1.5">
                          <span className="text-xs text-muted-foreground">
                            {tier === 'atOrAbove'
                              ? 'At or above the threshold'
                              : 'Below the threshold'}
                          </span>
                          <div className="flex flex-wrap gap-3">
                            {MILESTONE_KINDS.map(kind => (
                              <label
                                key={kind}
                                className="flex items-center gap-1.5 text-xs font-normal"
                              >
                                <Checkbox
                                  checked={policy.strategies[cls][tier].includes(kind)}
                                  onCheckedChange={() => toggleKind(cls, tier, kind)}
                                />
                                {policy.labels[kind] || DEFAULT_MILESTONE_LABELS[kind]}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="labels">
                <AccordionTrigger className="text-sm">Wording on the form</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  {MILESTONE_KINDS.map(kind => (
                    <div key={kind} className="space-y-1.5">
                      <Label className="text-xs">{DEFAULT_MILESTONE_LABELS[kind]}</Label>
                      <Input
                        defaultValue={policy.labels[kind]}
                        onBlur={e =>
                          save({
                            payment_milestone_labels: {
                              ...policy.labels,
                              [kind]: e.target.value.trim() || DEFAULT_MILESTONE_LABELS[kind],
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Wording is printed for patients only — it never changes how payments are
                    calculated.
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}
