import { useState } from 'react';
import { CalendarX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  useBrokenApptSettings,
  useUpsertBrokenApptSettings,
} from '@/hooks/useBrokenApptSettings';
import type { BaSettings } from '@/lib/broken-appts/types';

/**
 * Admin card for the Broken Appointments module — fee, notice window,
 * history window, VIP prepay floor, closed dates, and per-office wording.
 * De-identified configuration only (FofPolicySettingsCard pattern).
 */
export function BrokenApptSettingsCard() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useBrokenApptSettings();
  const upsert = useUpsertBrokenApptSettings();
  const [closedDateInput, setClosedDateInput] = useState('');

  const update = (patch: Partial<BaSettings>) => {
    upsert.mutate(patch, {
      onError: (err: Error) =>
        toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  const numberField = (value: string, apply: (n: number) => void) => {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n >= 0) apply(n);
  };

  const addClosedDate = () => {
    if (!closedDateInput || !settings) return;
    if (settings.officeClosedDates.includes(closedDateInput)) return;
    update({ officeClosedDates: [...settings.officeClosedDates, closedDateInput].sort() });
    setClosedDateInput('');
  };

  const removeClosedDate = (date: string) => {
    if (!settings) return;
    update({ officeClosedDates: settings.officeClosedDates.filter(d => d !== date) });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <CalendarX className="h-5 w-5" />
          Broken Appointment Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Scheduling Fee</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={settings?.feeAmount ?? 75}
                    onChange={e => numberField(e.target.value, n => update({ feeAmount: n }))}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Posted (or charged) for a late cancellation or no-show.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Notice Window (business hours)</Label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={settings?.noticeBusinessHours ?? 48}
                  onChange={e =>
                    numberField(e.target.value, n => update({ noticeBusinessHours: Math.round(n) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Weekends and closed dates never count toward the window.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">History Window (years)</Label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={settings?.historyWindowYears ?? 5}
                  onChange={e =>
                    numberField(e.target.value, n => update({ historyWindowYears: Math.round(n) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  How far back broken appointments count toward the rung.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">VIP Prepay Floor</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={settings?.vipPrepayFloor ?? 150}
                    onChange={e => numberField(e.target.value, n => update({ vipPrepayFloor: n }))}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Doctor visits prepay the greater of this or the estimated portion.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Policy Effective Date (the transition rule)</Label>
              <Input
                type="date"
                value={settings?.policyEffectiveDate ?? ''}
                onChange={e => update({ policyEffectiveDate: e.target.value })}
                className="max-w-sm"
                aria-label="Policy effective date"
              />
              <p className="text-xs text-muted-foreground">
                Broken appointments before this date never count toward the ladder and get
                no retroactive letters — they only set the entry point: the first
                post-policy break is handled at Rung 2 (0002 for a late cancel, no
                courtesy credit; 0003 for a no-show).
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Module Name in Navigation</Label>
                <Input
                  value={settings?.moduleNavLabel ?? ''}
                  onChange={e => update({ moduleNavLabel: e.target.value })}
                  placeholder="Broken Appointments"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Office Phone on Letters &amp; Replies</Label>
                <Input
                  value={settings?.officePhone ?? ''}
                  onChange={e => update({ officePhone: e.target.value })}
                  placeholder="Blank = practice phone from branding"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Letter Signature Name</Label>
                <Input
                  value={settings?.signatureName ?? ''}
                  onChange={e => update({ signatureName: e.target.value })}
                  placeholder="Blank = practice name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Letter Signature Title</Label>
                <Input
                  value={settings?.signatureTitle ?? ''}
                  onChange={e => update({ signatureTitle: e.target.value })}
                  placeholder="Office Manager"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Office Closed Dates (excluded from notice math)</Label>
              <div className="flex flex-wrap gap-2">
                {(settings?.officeClosedDates ?? []).map(date => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"
                  >
                    {date}
                    <button
                      onClick={() => removeClosedDate(date)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${date}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 max-w-sm">
                <Input
                  type="date"
                  value={closedDateInput}
                  onChange={e => setClosedDateInput(e.target.value)}
                  aria-label="Closed date to add"
                />
                <Button variant="outline" onClick={addClosedDate} disabled={!closedDateInput}>
                  Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Holidays and closure days — like weekends, they contribute zero business
                hours to the cutoff.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
