import { usePracticeSettings, useUpsertPracticeSettings } from '@/hooks/usePracticeSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  const handleOwnersClockInChange = (checked: boolean) => {
    upsert.mutate({ owners_clock_in: checked }, {
      onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
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

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="text-sm">Owners clock in</Label>
                <p className="text-xs text-muted-foreground">
                  When off, owners and doctors skip clock-in and checklist closeout gating.
                </p>
              </div>
              <Switch
                checked={!!settings?.owners_clock_in}
                onCheckedChange={handleOwnersClockInChange}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
