import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Clock3, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLateArrivalRule, useSaveLateArrivalRule } from '@/hooks/useLateArrivalRule';
import { DEFAULT_LATE_ARRIVAL_RULE, ruleExplanation, ruleSentence, type LateArrivalRule } from '@/lib/late-arrivals';

/**
 * Office settings → Attendance: the late-arrival rule. Both numbers are the
 * office's to set; the grace period and schedules above stay as they are.
 * There is no "check now": the database evaluates every change as it lands.
 */
export default function LateArrivalRuleCard() {
  const { data: rule, isLoading, error } = useLateArrivalRule();
  const save = useSaveLateArrivalRule();
  const { toast } = useToast();
  const [draft, setDraft] = useState<LateArrivalRule>(DEFAULT_LATE_ARRIVAL_RULE);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (rule && !dirty) setDraft(rule);
  }, [rule, dirty]);

  const set = <K extends keyof LateArrivalRule>(k: K, v: LateArrivalRule[K]) => {
    setDraft(d => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const num = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };

  const onSave = () => {
    save.mutate(draft, {
      onSuccess: () => {
        setDirty(false);
        toast({ title: 'Late-arrival rule saved', description: 'Everyone is re-checked against it; a report opens only where the rule is already met.' });
      },
      onError: (e: Error) => toast({ title: 'Could not save the rule', description: e.message, variant: 'destructive' }),
    });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Clock3 className="h-5 w-5" />
          Late-arrival rule
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">{ruleSentence(draft)}</p>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {error && <p role="alert" className="text-sm text-destructive">The rule could not be loaded.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="late-rule-count" className="text-xs">How many unexcused late arrivals</Label>
            <Input id="late-rule-count" type="number" min={1} max={99} step={1} value={draft.threshold_count} disabled={isLoading}
              onChange={e => set('threshold_count', Math.max(1, num(e.target.value, 1)))} />
          </div>
          <div>
            <Label htmlFor="late-rule-days" className="text-xs">Within how many days (rolling)</Label>
            <Input id="late-rule-days" type="number" min={1} max={365} step={1} value={draft.threshold_window_days} disabled={isLoading}
              onChange={e => set('threshold_window_days', Math.max(1, num(e.target.value, 1)))} />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch id="late-rule-active" checked={draft.is_active} disabled={isLoading} onCheckedChange={v => set('is_active', v)} aria-label="Turn the late-arrival rule on or off" />
            <Label htmlFor="late-rule-active" className="font-normal">{draft.is_active ? 'On' : 'Off'}</Label>
          </div>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {ruleExplanation(draft).map(line => <li key={line}>{line}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">
          Late arrivals are evaluated the moment a clock-in, an excuse decision, or a time correction lands; there is nothing to run by hand.
          Employees see this rule on their own Attendance page.
        </p>
        <div className="flex justify-end">
          <Button size="sm" disabled={!dirty || save.isPending || isLoading} onClick={onSave}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save rule
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
