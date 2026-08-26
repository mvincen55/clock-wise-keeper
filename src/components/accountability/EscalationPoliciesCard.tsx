import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollText, Loader2, RefreshCw } from 'lucide-react';
import {
  useEscalationPolicies,
  useSavePolicy,
  useRunAccountabilityEngine,
  chainLabel,
  POLICY_LABELS,
  type EscalationPolicy,
  type PolicyKind,
} from '@/hooks/useAccountability';

const KINDS: PolicyKind[] = ['tardy_threshold', 'bypass_unresolved', 'checklist_gap', 'goal_stall', 'onboarding_stale'];

const DEFAULTS: Omit<EscalationPolicy, 'id' | 'org_id' | 'kind'> = {
  threshold_count: 3,
  threshold_window_days: 30,
  reviewer_role: 'manager',
  review_due_days: 3,
  escalate_to: 'owner',
  escalate_after_days: 2,
  is_active: false,
};

function PolicyRow({ kind, existing }: { kind: PolicyKind; existing?: EscalationPolicy }) {
  const save = useSavePolicy();
  const base = existing ?? ({ ...DEFAULTS, kind } as EscalationPolicy);
  const [draft, setDraft] = useState<EscalationPolicy>(base);
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof EscalationPolicy>(k: K, v: EscalationPolicy[K]) => {
    setDraft(d => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const num = (v: string) => Math.max(0, parseInt(v || '0', 10) || 0);

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{POLICY_LABELS[kind]}</p>
          <p className="text-xs text-muted-foreground">{chainLabel(draft)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!draft.is_active && <Badge variant="secondary">Off</Badge>}
          <Switch
            checked={draft.is_active}
            onCheckedChange={v => set('is_active', v)}
            aria-label={`Turn ${POLICY_LABELS[kind]} rule on or off`}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label className="text-xs">How many</Label>
          <Input
            type="number"
            min={1}
            value={draft.threshold_count}
            onChange={e => set('threshold_count', Math.max(1, num(e.target.value)))}
          />
        </div>
        <div>
          <Label className="text-xs">Within (days)</Label>
          <Input
            type="number"
            min={1}
            value={draft.threshold_window_days}
            onChange={e => set('threshold_window_days', Math.max(1, num(e.target.value)))}
          />
        </div>
        <div>
          <Label className="text-xs">Reviewed by</Label>
          <Select
            value={draft.reviewer_role}
            onValueChange={v => set('reviewer_role', v as 'manager' | 'owner')}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Review due in (days)</Label>
          <Input
            type="number"
            min={0}
            value={draft.review_due_days}
            onChange={e => set('review_due_days', num(e.target.value))}
          />
        </div>
        <div>
          <Label className="text-xs">If it sits, it goes to</Label>
          <Select
            value={draft.escalate_to ?? 'none'}
            onValueChange={v => set('escalate_to', v === 'none' ? null : 'owner')}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="none">Nobody — it stays put</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Idle days before it moves</Label>
          <Input
            type="number"
            min={0}
            value={draft.escalate_after_days}
            onChange={e => set('escalate_after_days', num(e.target.value))}
            disabled={!draft.escalate_to}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate({ ...draft, kind }, { onSuccess: () => setDirty(false) })}
        >
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save rule
        </Button>
      </div>
    </div>
  );
}

export default function EscalationPoliciesCard() {
  const { data: policies = [], isLoading } = useEscalationPolicies();
  const run = useRunAccountabilityEngine();

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Accountability chains
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => run.mutate('scan')}
            disabled={run.isPending}
          >
            {run.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Check now
          </Button>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          These rules turn patterns into a signed record. Documentation, not punishment — sometimes
          it's school, sometimes it's traffic; the record just says what happened.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules…
          </div>
        ) : (
          KINDS.map(kind => (
            <PolicyRow key={kind} kind={kind} existing={policies.find(p => p.kind === kind)} />
          ))
        )}
      </CardContent>
    </Card>
  );
}
