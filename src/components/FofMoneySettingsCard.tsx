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
  MONEY_SETTING_BOUNDS,
  useFofMoneySettings,
  useUpsertFofMoneySettings,
} from '@/hooks/useFofTemplates';

/**
 * Manager editor for the org's money thresholds (Phase 2a). These change
 * dollar output, so they are bounded: the inputs validate here for a
 * friendly message and the database CHECK constraints enforce the same
 * bounds authoritatively.
 */
export default function FofMoneySettingsCard() {
  const { data: settings, isLoading } = useFofMoneySettings();
  const upsert = useUpsertFofMoneySettings();
  const [thresholdInput, setThresholdInput] = useState<string | null>(null);
  const [minPaymentInput, setMinPaymentInput] = useState<string | null>(null);
  const [downgradeOn, setDowngradeOn] = useState<boolean | null>(null);

  useEffect(() => {
    if (settings && thresholdInput === null) {
      setThresholdInput((settings.dayOfServiceThresholdCents / 100).toFixed(2));
      setMinPaymentInput((settings.minStandalonePaymentCents / 100).toFixed(2));
      setDowngradeOn(settings.downgradeDefaultOn);
    }
  }, [settings, thresholdInput]);

  if (isLoading || thresholdInput === null || minPaymentInput === null || downgradeOn === null) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const bounds = MONEY_SETTING_BOUNDS;

  const handleSave = () => {
    const thresholdCents = parseCurrencyInput(thresholdInput);
    const minPaymentCents = parseCurrencyInput(minPaymentInput);
    if (
      thresholdCents === null ||
      thresholdCents < bounds.dayOfServiceThresholdCents.min ||
      thresholdCents > bounds.dayOfServiceThresholdCents.max
    ) {
      toast.error(
        `Day-of-service threshold must be between ${formatCents(bounds.dayOfServiceThresholdCents.min)} and ${formatCents(bounds.dayOfServiceThresholdCents.max)}`
      );
      return;
    }
    if (
      minPaymentCents === null ||
      minPaymentCents < bounds.minStandalonePaymentCents.min ||
      minPaymentCents > bounds.minStandalonePaymentCents.max
    ) {
      toast.error(
        `Minimum standalone payment must be between ${formatCents(bounds.minStandalonePaymentCents.min)} and ${formatCents(bounds.minStandalonePaymentCents.max)}`
      );
      return;
    }
    upsert.mutate(
      {
        dayOfServiceThresholdCents: thresholdCents,
        minStandalonePaymentCents: minPaymentCents,
        downgradeDefaultOn: downgradeOn,
      },
      {
        onSuccess: () => toast.success('Money settings saved'),
        onError: err => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payment Policy (Managers)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="money-threshold">Day-of-service threshold</Label>
            <Input
              id="money-threshold"
              inputMode="decimal"
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Patient portions under this are simply paid at the visit — nothing due before the
              first visit. Allowed: {formatCents(bounds.dayOfServiceThresholdCents.min)}–
              {formatCents(bounds.dayOfServiceThresholdCents.max)}.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="money-min-payment">Minimum standalone payment</Label>
            <Input
              id="money-min-payment"
              inputMode="decimal"
              value={minPaymentInput}
              onChange={e => setMinPaymentInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Schedule payments smaller than this fold into the payment before them. Allowed:{' '}
              {formatCents(bounds.minStandalonePaymentCents.min)}–
              {formatCents(bounds.minStandalonePaymentCents.max)}.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Switch id="money-downgrade" checked={downgradeOn} onCheckedChange={setDowngradeOn} />
              <Label htmlFor="money-downgrade">Downgrade fillings by default</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              When on, the alternate-benefit downgrade toggle starts checked for posterior
              composites (D2391–D2394) on new lines. Most plans pay composite rates — leave off
              unless your common plans downgrade (e.g. Altus). Staff can still change it per line.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={upsert.isPending} onClick={handleSave}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Payment Policy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
