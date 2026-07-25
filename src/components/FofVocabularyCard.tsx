import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useFofSettings, useUpsertFofSettings } from '@/hooks/useFofTemplates';
import { formShortName } from '@/lib/fof/defaults';

/**
 * Manager editor for office vocabulary (Phase 2c): the membership plan's
 * display name and the doctors offered in the FOF builder dropdown.
 * Wording only — never dollar output.
 */
export default function FofVocabularyCard() {
  const { data: practice, isLoading } = useFofSettings();
  const upsert = useUpsertFofSettings();
  const [planName, setPlanName] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<string | null>(null);
  const [featureName, setFeatureName] = useState<string | null>(null);
  const [printTitle, setPrintTitle] = useState<string | null>(null);

  useEffect(() => {
    if (practice && planName === null) {
      setPlanName(practice.membershipPlanName);
      setDoctors(practice.doctorNames.join('\n'));
      setFeatureName(practice.featureDisplayName);
      setPrintTitle(practice.printFormTitle);
    }
  }, [practice, planName]);

  if (isLoading || planName === null || doctors === null || featureName === null || printTitle === null) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const handleSave = () => {
    const doctorNames = doctors
      .split('\n')
      .map(d => d.trim())
      .filter(Boolean);
    if (featureName.trim() === '' || printTitle.trim() === '') {
      toast.error('The feature name and printed form title cannot be blank');
      return;
    }
    upsert.mutate(
      {
        membershipPlanName: planName.trim(),
        doctorNames,
        featureDisplayName: featureName.trim(),
        printFormTitle: printTitle.trim(),
      },
      {
        onSuccess: () => toast.success('Vocabulary saved'),
        onError: err => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Office Vocabulary (Managers)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vocab-feature">Estimator feature name</Label>
            <Input
              id="vocab-feature"
              value={featureName}
              onChange={e => setFeatureName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              What the feature is called in the navigation and page headers. Routes and data
              never change — this is a label.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vocab-print-title">Printed form title</Label>
            <Input
              id="vocab-print-title"
              value={printTitle}
              onChange={e => setPrintTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              How the printed form names itself; its initials label the office copy
              (&quot;{formShortName(printTitle)} Detail&quot;).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vocab-plan">Membership plan name</Label>
            <Input
              id="vocab-plan"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="Blank = plain “Membership”"
            />
            <p className="text-xs text-muted-foreground">
              Prints as "Included with &lt;name&gt; Membership" on the FOF and labels the
              membership row on the Deposit Log.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vocab-doctors">Doctors (one per line)</Label>
            <textarea
              id="vocab-doctors"
              className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={doctors}
              onChange={e => setDoctors(e.target.value)}
              placeholder={'Dr. Smith\nDr. Jones'}
            />
            <p className="text-xs text-muted-foreground">
              Offered in the FOF builder's Doctor dropdown for treatment wording.
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={upsert.isPending} onClick={handleSave}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Vocabulary
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
