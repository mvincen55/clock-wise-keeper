import { Link } from 'react-router-dom';
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
  const { data: settings, isLoading, isError } = useBrokenApptSettings();
  const upsert = useUpsertBrokenApptSettings();

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
        ) : isError ? <p role="alert">Could not load policy and office closures. Reload before editing settings.</p> : (
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
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  Letters are signed through the shared Letterhead &amp;
                  Correspondence system — pick the authorized signer while
                  printing, and manage signers and signatures under Letters →
                  Settings. There is no Broken Appointments–specific signature
                  setup anymore.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Office closed dates</p>
              <p className="text-xs text-muted-foreground">Full-day closures from the shared Office Closures calendar are automatically excluded from notice calculations. Previously saved policy dates are also retained. Weekends are excluded automatically.</p>
              <p className="text-xs text-muted-foreground">{settings?.officeClosedDates.length ?? 0} saved closed dates included.</p>
              <Button variant="outline" asChild><Link to="/settings/office#office-closures">Manage Office Closures</Link></Button>
              {!!settings?.legacyOfficeClosedDates.length && <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Previously entered policy dates. Remove any that no longer apply; manage new closures in Office Closures.</p>
                {settings.legacyOfficeClosedDates.map(date => <div key={date} className="flex items-center gap-2 text-xs">
                  <span>{date}</span><Button size="sm" variant="ghost" onClick={() => update({ officeClosedDates: settings.legacyOfficeClosedDates.filter(d => d !== date) })}>Remove {date}</Button>
                </div>)}
              </div>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
