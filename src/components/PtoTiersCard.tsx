import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { usePtoAccrualTiers, useSavePtoAccrualTiers } from '@/hooks/usePtoEngine';
import { useOrgContext } from '@/hooks/useOrgContext';

interface TierDraft {
  minYears: string;
  maxYears: string;
  ratePct: string;
  weeklyCap: string;
  label: string;
}

/**
 * Org accrual tiers (Time Off Policy). Read-only list for team members;
 * managers edit in place. Rates/caps move accrual math — validated here
 * and CHECK-bounded in the database, with the ledger snapshot test
 * guarding the engine itself.
 */
export default function PtoTiersCard() {
  const { data: tiers, isLoading } = usePtoAccrualTiers();
  const save = useSavePtoAccrualTiers();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const [drafts, setDrafts] = useState<TierDraft[] | null>(null);

  useEffect(() => {
    if (tiers && drafts === null) {
      setDrafts(
        tiers.map(t => ({
          minYears: String(t.minYears),
          maxYears: String(t.maxYears),
          ratePct: (t.rate * 100).toFixed(2),
          weeklyCap: String(t.weeklyCap),
          label: t.label,
        }))
      );
    }
  }, [tiers, drafts]);

  if (isLoading || !tiers) {
    return (
      <div className="p-3 rounded-lg bg-muted/50 flex justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
      </div>
    );
  }

  if (!isManager || drafts === null) {
    return (
      <div className="p-3 rounded-lg bg-muted/50">
        <h4 className="font-medium text-sm mb-2">Office Accrual Tiers</h4>
        <div className="space-y-1 text-xs text-muted-foreground">
          {tiers.map((t, i) => (
            <div key={i} className="flex justify-between">
              <span>{t.label}</span>
              <span className="font-semibold">
                {(t.rate * 100).toFixed(2)}% (max {t.weeklyCap}h/wk)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const setField = (index: number, field: keyof TierDraft) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDrafts(d => d && d.map((t, i) => (i === index ? { ...t, [field]: e.target.value } : t)));

  const handleSave = () => {
    const parsed = drafts.map(d => ({
      minYears: Number(d.minYears),
      maxYears: Number(d.maxYears),
      rate: Number(d.ratePct) / 100,
      weeklyCap: Number(d.weeklyCap),
      label: d.label.trim(),
    }));
    if (parsed.some(t => [t.minYears, t.maxYears, t.rate, t.weeklyCap].some(n => !Number.isFinite(n)))) {
      toast.error('All tier values must be numbers');
      return;
    }
    save.mutate(parsed, {
      onSuccess: () => toast.success('Accrual tiers saved — hit Recalculate to apply'),
      onError: err => toast.error(`Save failed: ${err.message}`),
    });
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-2">
      <h4 className="font-medium text-sm">Office Accrual Tiers (org policy — managers)</h4>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_4rem_4rem_4.5rem_4.5rem_2rem] gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>Label</span><span>From yr</span><span>To yr</span><span>Rate %</span><span>Cap h/wk</span><span />
        </div>
        {drafts.map((d, i) => (
          <div key={i} className="grid grid-cols-[1fr_4rem_4rem_4.5rem_4.5rem_2rem] gap-1.5 items-center">
            <Input className="h-8 text-xs" value={d.label} onChange={setField(i, 'label')} />
            <Input className="h-8 text-xs" inputMode="decimal" value={d.minYears} onChange={setField(i, 'minYears')} />
            <Input className="h-8 text-xs" inputMode="decimal" value={d.maxYears} onChange={setField(i, 'maxYears')} />
            <Input className="h-8 text-xs" inputMode="decimal" value={d.ratePct} onChange={setField(i, 'ratePct')} />
            <Input className="h-8 text-xs" inputMode="decimal" value={d.weeklyCap} onChange={setField(i, 'weeklyCap')} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => setDrafts(x => x && x.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setDrafts(d => d && [...d, { minYears: '', maxYears: '', ratePct: '', weeklyCap: '', label: '' }])
          }
        >
          <Plus className="h-4 w-4 mr-1" /> Add Tier
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={handleSave}>
          {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Save Tiers
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Rates are % of basis hours (capped worked + PTO taken), 0–100; weekly caps 0–40h. Saving
        does not recompute past weeks — use Recalculate.
      </p>
    </div>
  );
}
