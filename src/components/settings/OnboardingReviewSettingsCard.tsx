import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { usePracticeSettings, useUpsertPracticeSettings } from '@/hooks/usePracticeSettings';
import { parseReviewDays } from '@/lib/onboarding-lifecycle';

/**
 * Office policy for scheduled onboarding reviews: the day offsets at which
 * a review task lands on the manager checklist when onboarding starts.
 * Defaults are the product (7 / 30 / 60 / 90); every number is the
 * office's to change.
 */
export default function OnboardingReviewSettingsCard() {
  const { data: settings } = usePracticeSettings();
  const upsert = useUpsertPracticeSettings();

  const [raw, setRaw] = useState('7, 30, 60, 90');

  useEffect(() => {
    if (settings) setRaw(settings.onboarding_review_days.join(', '));
  }, [settings]);

  const save = () => {
    const parsed = parseReviewDays(raw);
    if (!parsed.ok || !parsed.days) {
      toast.error(parsed.reason ?? 'Enter review days like 7, 30, 60, 90.');
      return;
    }
    upsert.mutate(
      { onboarding_review_days: parsed.days },
      {
        onSuccess: () => toast.success('Onboarding review schedule saved'),
        onError: e => toast.error(e instanceof Error ? e.message : 'Could not save settings'),
      },
    );
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" />
          Onboarding Reviews
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          When onboarding starts for a new hire, review tasks land on the manager
          checklist at these day marks. An onboarding completes only when every item is
          dual-signed AND every scheduled review is checked off.
        </p>
        <div className="max-w-xs">
          <Label htmlFor="review-days" className="text-xs">
            Review days after start (comma-separated)
          </Label>
          <Input id="review-days" value={raw} onChange={e => setRaw(e.target.value)} />
        </div>
        <Button size="sm" onClick={save} disabled={upsert.isPending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
