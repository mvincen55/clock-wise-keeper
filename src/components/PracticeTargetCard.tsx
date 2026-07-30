import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Target, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';

/**
 * The monthly collections target. It drives the Practice Pulse collections
 * pace signal and the once-a-month wax-seal moment when the office hits it.
 */
export default function PracticeTargetCard() {
  const { data: ctx } = useOrgContext();
  const { data: settings, isLoading } = usePracticeSettings();
  const qc = useQueryClient();
  const [dollars, setDollars] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings && dollars === '') {
      setDollars(
        settings.monthlyCollectionsTargetCents
          ? String(settings.monthlyCollectionsTargetCents / 100)
          : ''
      );
    }
  }, [settings, dollars]);

  const save = async () => {
    if (!ctx) return;
    const parsed = dollars.trim() === '' ? null : Math.round(Number(dollars) * 100);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('Enter a dollar amount');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('org_practice_settings').upsert(
      { org_id: ctx.org_id, monthly_collections_target_cents: parsed },
      { onConflict: 'org_id' }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['practice-settings'] });
    qc.invalidateQueries({ queryKey: ['practice-pulse'] });
    toast.success('Monthly collections target saved');
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Monthly Collections Target
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          Sets the collections pace signal on the Practice Pulse. When the month's
          collections reach this number, the pulse seals once for everyone.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="collections-target" className="text-xs">
              Target (USD per month)
            </Label>
            <Input
              id="collections-target"
              inputMode="decimal"
              className="w-48"
              placeholder="e.g. 180000"
              value={dollars}
              onChange={e => setDollars(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <Button onClick={save} disabled={saving || isLoading}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
