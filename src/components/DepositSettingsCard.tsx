import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import {
  useOrgDepositSettings,
  useUpsertOrgDepositSettings,
  type OrgDepositSettings,
} from '@/hooks/useOrgBranding';

/**
 * Manager editor for the office-specific wording printed on the Deposit
 * Log (deposit account line, bank labels, envelope callout). Layout —
 * check-line count, bank split structure — stays in code; only wording
 * is configurable here.
 */
export default function DepositSettingsCard() {
  const { data: settings, isLoading } = useOrgDepositSettings();
  const upsert = useUpsertOrgDepositSettings();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OrgDepositSettings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const set = (field: keyof OrgDepositSettings) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => (f ? { ...f, [field]: e.target.value } : f));

  return (
    <Card>
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <CardTitle className="text-base flex items-center justify-between">
          Printed Wording (Managers)
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {isLoading || !form ? (
            <div className="py-4 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="dep-set-account">Bank Copy "Deposit To" line</Label>
                  <Input
                    id="dep-set-account"
                    value={form.accountLine}
                    onChange={set('accountLine')}
                    placeholder="Bank name and deposit account"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-set-cash">Bank split — cash &amp; checks label</Label>
                  <Input id="dep-set-cash" value={form.bankSplitCashLabel} onChange={set('bankSplitCashLabel')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-set-cards">Bank split — card deposits label</Label>
                  <Input id="dep-set-cards" value={form.bankSplitCardsLabel} onChange={set('bankSplitCardsLabel')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-set-total">Bank copy total label</Label>
                  <Input id="dep-set-total" value={form.bankTotalLabel} onChange={set('bankTotalLabel')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-set-envelope">Envelope callout (both copies)</Label>
                  <Input
                    id="dep-set-envelope"
                    value={form.envelopeNote}
                    onChange={set('envelopeNote')}
                    placeholder="Blank = not printed"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="dep-set-office-note">Office copy filing note</Label>
                  <Input id="dep-set-office-note" value={form.officeCopyNote} onChange={set('officeCopyNote')} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={upsert.isPending}
                  onClick={() =>
                    upsert.mutate(form, {
                      onSuccess: () => toast.success('Deposit wording saved'),
                      onError: err => toast.error(`Save failed: ${err.message}`),
                    })
                  }
                >
                  {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Wording
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
