import { usePracticeSettings, useUpsertPracticeSettings } from '@/hooks/usePracticeSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PMS_LABELS, PMS_SYSTEMS, normalizePmsSystem } from '@/lib/pms';

export function PracticeSettingsCard() {
  const { toast } = useToast();
  const { data: settings, isLoading } = usePracticeSettings();
  const upsert = useUpsertPracticeSettings();

  const targetDollars = settings?.monthly_collections_target_cents
    ? (settings.monthly_collections_target_cents / 100).toFixed(2)
    : '';

  const handleTargetChange = (value: string) => {
    const dollars = parseFloat(value);
    const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    upsert.mutate({ monthly_collections_target_cents: cents }, {
      onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  const handleVisibilityChange = (value: string) => {
    upsert.mutate({ collections_visibility: value }, {
      onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  const handlePmsChange = (value: string) => {
    upsert.mutate({ pms_system: normalizePmsSystem(value) }, {
      onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  const handleLeadDaysChange = (value: string) => {
    const days = Math.round(parseFloat(value));
    // 1–14 mirrors the database check constraint.
    if (!Number.isFinite(days) || days < 1 || days > 14) return;
    upsert.mutate({ confirmation_lead_days: days }, {
      onError: (err: Error) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Practice Settings
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
              <Label className="text-xs">Monthly Collections Target</Label>
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={targetDollars}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  className="pl-7"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Sets the target the Practice Vitals gauge paces against. Leave blank to fall back to last month.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Collections Visibility</Label>
              <Select
                value={settings?.collections_visibility || 'everyone'}
                onValueChange={handleVisibilityChange}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">Everyone sees it</SelectItem>
                  <SelectItem value="admin_only">Admins only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Employees won't see collections figures when set to admins only.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Practice Management System</Label>
              <Select
                value={settings?.pms_system ?? 'not_configured'}
                onValueChange={handlePmsChange}
              >
                <SelectTrigger className="w-48" aria-label="Practice Management System">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PMS_SYSTEMS.map(pms => (
                    <SelectItem key={pms} value={pms}>{PMS_LABELS[pms]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Lets features tailor their help to your PMS — for example, Broken
                Appointments can show where to find a patient's address in Dentrix.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Appointment Confirmation Window (days ahead)</Label>
              <Input
                type="number"
                min={1}
                max={14}
                step="1"
                value={settings?.confirmation_lead_days ?? 2}
                onChange={(e) => handleLeadDaysChange(e.target.value)}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">
                How many days before the visit your team confirms appointments. Goal
                starters and coaching prompts word themselves around this.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
