import { useFofPolicySettings, useUpsertFofPolicySettings } from '@/hooks/useFofPolicySettings';
import { useDoctorNamesFromRegistry } from '@/hooks/useProviders';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Stethoscope } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function FofPolicySettingsCard() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useFofPolicySettings();
  const upsert = useUpsertFofPolicySettings();
  const doctorNames = useDoctorNamesFromRegistry();

  const update = (patch: Partial<typeof settings>) => {
    upsert.mutate(patch, {
      onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5" />
          FOF Policy Settings
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
            <div className="space-y-2">
              <Label className="text-xs">Membership Plan Display Name</Label>
              <Input
                value={settings?.membership_plan_name ?? ''}
                onChange={(e) => update({ membership_plan_name: e.target.value })}
                placeholder="Membership"
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">
                Appears on FOFs, deposit logs, and what the assistant calls the plan.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Treating Doctors</Label>
              <div className="flex flex-wrap gap-2">
                {doctorNames.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No active doctors yet.</span>
                ) : (
                  doctorNames.map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs">
                      {name}
                    </span>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Managed in the <strong>Treating Providers</strong> registry above (the single source of
                truth). This still populates the doctor dropdown on the FOF builder.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Day-of-Service Threshold</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={dollars(settings?.day_of_service_threshold_cents ?? 0)}
                    onChange={(e) => {
                      const dollars = parseFloat(e.target.value);
                      const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
                      update({ day_of_service_threshold_cents: cents });
                    }}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Patient portions under this are paid at the visit.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Minimum Standalone Payment</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={dollars(settings?.min_standalone_payment_cents ?? 0)}
                    onChange={(e) => {
                      const dollars = parseFloat(e.target.value);
                      const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
                      update({ min_standalone_payment_cents: cents });
                    }}
                    className="pl-7"
                  />
                </div>
                <p className="text-xs text-muted-foreground">First-visit portions under this use the simple day-of-service rule.</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Downgrade-to-amalgam default</Label>
                <p className="text-xs text-muted-foreground">
                  When on, new insurance plans default to downgrade logic (patient pays up to the office fee).
                </p>
              </div>
              <Switch
                checked={!!settings?.downgrade_default_on}
                onCheckedChange={(checked) => update({ downgrade_default_on: checked })}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
