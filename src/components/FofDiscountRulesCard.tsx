import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { formatCents, parseCurrencyInput } from '@/lib/money';
import {
  DISCOUNT_RULE_BOUNDS,
  useFofDiscountRules,
  useUpsertFofDiscountRule,
} from '@/hooks/useFofRules';

/**
 * Manager editor for the named discount programs (Phase 2b). Templates
 * reference these rules; changing a rate or disabling a program here
 * applies everywhere at once. Values move dollar output, so they are
 * bounded here and by the database CHECK constraints.
 */
export default function FofDiscountRulesCard() {
  const { data: rules, isLoading } = useFofDiscountRules();
  const upsert = useUpsertFofDiscountRule();
  const [form, setForm] = useState<{
    senior: { enabled: boolean; percent: string; threshold: string };
    prepay: { enabled: boolean; percent: string };
    membership: { enabled: boolean; percent: string; extra: string };
  } | null>(null);

  useEffect(() => {
    if (rules && !form) {
      setForm({
        senior: {
          enabled: rules.senior.enabled,
          percent: String(rules.senior.percent),
          threshold: (rules.senior.thresholdCents / 100).toFixed(2),
        },
        prepay: { enabled: rules.prepay.enabled, percent: String(rules.prepay.percent) },
        membership: {
          enabled: rules.membership.enabled,
          percent: String(rules.membership.percent),
          extra: String(rules.membership.extraPercent),
        },
      });
    }
  }, [rules, form]);

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const parsePct = (raw: string): number | null => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };

  const handleSave = async () => {
    const seniorPct = parsePct(form.senior.percent);
    const prepayPct = parsePct(form.prepay.percent);
    const membershipPct = parsePct(form.membership.percent);
    const extraPct = parsePct(form.membership.extra);
    const thresholdCents = parseCurrencyInput(form.senior.threshold);
    if (seniorPct === null || prepayPct === null || membershipPct === null || extraPct === null) {
      toast.error('Percents must be between 0 and 100');
      return;
    }
    if (
      thresholdCents === null ||
      thresholdCents < DISCOUNT_RULE_BOUNDS.thresholdCents.min ||
      thresholdCents > DISCOUNT_RULE_BOUNDS.thresholdCents.max
    ) {
      toast.error(
        `Threshold must be between ${formatCents(DISCOUNT_RULE_BOUNDS.thresholdCents.min)} and ${formatCents(DISCOUNT_RULE_BOUNDS.thresholdCents.max)}`
      );
      return;
    }
    try {
      await upsert.mutateAsync({
        ruleKey: 'senior',
        enabled: form.senior.enabled,
        percent: seniorPct,
        thresholdCents,
      });
      await upsert.mutateAsync({
        ruleKey: 'prepay',
        enabled: form.prepay.enabled,
        percent: prepayPct,
      });
      await upsert.mutateAsync({
        ruleKey: 'membership',
        enabled: form.membership.enabled,
        percent: membershipPct,
        extraPercent: extraPct,
      });
      toast.success('Discount rules saved');
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const ruleRow = (
    title: string,
    description: string,
    enabled: boolean,
    onEnabled: (v: boolean) => void,
    fields: React.ReactNode
  ) => (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{title}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabled} />
      </div>
      {enabled && <div className="grid gap-3 sm:grid-cols-3">{fields}</div>}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Discount Programs (Managers)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ruleRow(
          'Senior 65+',
          'Automatic under the threshold; earned by prepay-in-full above it. Applies on templates marked "65+ discount rules apply".',
          form.senior.enabled,
          v => setForm(f => f && { ...f, senior: { ...f.senior, enabled: v } }),
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rule-senior-pct">Percent (0–100)</Label>
              <Input
                id="rule-senior-pct"
                inputMode="decimal"
                value={form.senior.percent}
                onChange={e => setForm(f => f && { ...f, senior: { ...f.senior, percent: e.target.value } })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-senior-threshold">Threshold ($0–$5,000)</Label>
              <Input
                id="rule-senior-threshold"
                inputMode="decimal"
                value={form.senior.threshold}
                onChange={e => setForm(f => f && { ...f, senior: { ...f.senior, threshold: e.target.value } })}
              />
            </div>
          </>
        )}
        {ruleRow(
          'Prepay (under 65)',
          'Earned by prepay-in-full on treatment at the senior threshold or more.',
          form.prepay.enabled,
          v => setForm(f => f && { ...f, prepay: { ...f.prepay, enabled: v } }),
          <div className="space-y-1.5">
            <Label htmlFor="rule-prepay-pct">Percent (0–100)</Label>
            <Input
              id="rule-prepay-pct"
              inputMode="decimal"
              value={form.prepay.percent}
              onChange={e => setForm(f => f && { ...f, prepay: { ...f.prepay, percent: e.target.value } })}
            />
          </div>
        )}
        {ruleRow(
          'In-house membership',
          'Applies automatically on membership templates. The extra percent is the 65+ prepay-in-full add-on, off the same base.',
          form.membership.enabled,
          v => setForm(f => f && { ...f, membership: { ...f.membership, enabled: v } }),
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rule-mem-pct">Percent (0–100)</Label>
              <Input
                id="rule-mem-pct"
                inputMode="decimal"
                value={form.membership.percent}
                onChange={e =>
                  setForm(f => f && { ...f, membership: { ...f.membership, percent: e.target.value } })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-mem-extra">65+ prepay extra (0–100)</Label>
              <Input
                id="rule-mem-extra"
                inputMode="decimal"
                value={form.membership.extra}
                onChange={e =>
                  setForm(f => f && { ...f, membership: { ...f.membership, extra: e.target.value } })
                }
              />
            </div>
          </>
        )}
        <div className="flex justify-end">
          <Button disabled={upsert.isPending} onClick={handleSave}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Discount Programs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
