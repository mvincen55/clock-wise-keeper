import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePracticeSettings,
  useSavePracticeSettings,
  type CollectionsVisibility,
} from '@/hooks/usePracticeGoal';

/** The office's monthly collections target and who gets to see it. */
export default function PracticeGoalSettingsCard() {
  const { data: settings } = usePracticeSettings();
  const save = useSavePracticeSettings();
  const [target, setTarget] = useState('');

  useEffect(() => {
    setTarget(
      settings?.monthly_collections_target_cents != null
        ? String(settings.monthly_collections_target_cents / 100)
        : ''
    );
  }, [settings?.monthly_collections_target_cents]);

  const saveTarget = async () => {
    try {
      await save.mutateAsync({
        monthly_collections_target_cents: target ? Math.round(Number(target) * 100) : null,
      });
      toast.success('Monthly target saved.');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the target.');
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Practice Goal
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          The monthly collections target shown on the dashboard. Progress is counted live from
          the deposit log.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Monthly collections target ($)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="135000"
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="w-40 text-sm"
              />
              <Button variant="secondary" onClick={saveTarget} disabled={save.isPending}>
                Save
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Who can see it</Label>
            <Select
              value={settings?.collections_visibility ?? 'team'}
              onValueChange={v =>
                save.mutate({ collections_visibility: v as CollectionsVisibility })
              }
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Whole team</SelectItem>
                <SelectItem value="admins">Owners &amp; managers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
