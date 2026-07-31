import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffingAssessment } from '@/hooks/useDepositLog';

export type StaffingForm = {
  assessment: StaffingAssessment | null;
  pressure: string[];
  factors: string[];
  note: string;
};

export const EMPTY_STAFFING: StaffingForm = {
  assessment: null,
  pressure: [],
  factors: [],
  note: '',
};

const ASSESSMENTS: { value: StaffingAssessment; label: string }[] = [
  { value: 'extra_coverage', label: 'More coverage than needed' },
  { value: 'about_right', label: 'About right' },
  { value: 'stretched', label: 'Stretched' },
  { value: 'understaffed', label: 'Understaffed' },
  { value: 'unsafe', label: 'Unsafe or unsustainable' },
];

const PRESSURE_AREAS = [
  { value: 'hygiene', label: 'Hygiene' },
  { value: 'doctor_side', label: 'Doctor side' },
  { value: 'assisting', label: 'Assisting' },
  { value: 'front_desk', label: 'Front desk' },
  { value: 'sterilization', label: 'Sterilization' },
  { value: 'whole_office', label: 'Whole office' },
];

const FACTORS = [
  { value: 'callout_absence', label: 'Callout or absence' },
  { value: 'provider_unavailable', label: 'Provider unavailable' },
  { value: 'schedule_too_dense', label: 'Schedule too dense' },
  { value: 'too_many_columns', label: 'Too many simultaneous columns' },
  { value: 'same_day_additions', label: 'Same-day additions' },
  { value: 'cancellations_reshuffling', label: 'Cancellations and reshuffling' },
  { value: 'new_employee_training', label: 'New employee or training' },
  { value: 'equipment_interruption', label: 'Equipment interruption' },
  { value: 'communication_breakdown', label: 'Communication breakdown' },
  { value: 'other', label: 'Other' },
];

type Props = {
  value: StaffingForm;
  onChange: (next: StaffingForm) => void;
};

/**
 * Step 4 — Staffing Reality. The front desk's human read of the day. This is
 * deliberately separate from the automated schedule analysis: when the two
 * disagree, both are kept — the disagreement itself is meaningful data, and
 * the automated result never overwrites what the closer says it felt like.
 */
export default function StaffingRealityCard({ value, onChange }: Props) {
  const toggle = (key: 'pressure' | 'factors', v: string) =>
    onChange({
      ...value,
      [key]: value[key].includes(v)
        ? value[key].filter(x => x !== v)
        : [...value[key], v],
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Staffing reality
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>How well did staffing match today's workload?</Label>
          <div className="flex flex-col gap-1.5">
            {ASSESSMENTS.map(a => (
              <Button
                key={a.value}
                type="button"
                size="sm"
                variant={value.assessment === a.value ? 'default' : 'outline'}
                className={cn(
                  'justify-start',
                  a.value === 'unsafe' &&
                    value.assessment !== 'unsafe' &&
                    'border-destructive/40 text-destructive hover:text-destructive'
                )}
                onClick={() => onChange({ ...value, assessment: a.value })}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>

        {value.assessment && value.assessment !== 'about_right' && (
          <>
            <div className="space-y-1.5">
              <Label>Where was the pressure?</Label>
              <div className="flex flex-wrap gap-1.5">
                {PRESSURE_AREAS.map(p => (
                  <Button
                    key={p.value}
                    type="button"
                    size="sm"
                    variant={value.pressure.includes(p.value) ? 'secondary' : 'outline'}
                    onClick={() => toggle('pressure', p.value)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>What contributed?</Label>
              <div className="flex flex-wrap gap-1.5">
                {FACTORS.map(f => (
                  <Button
                    key={f.value}
                    type="button"
                    size="sm"
                    variant={value.factors.includes(f.value) ? 'secondary' : 'outline'}
                    onClick={() => toggle('factors', f.value)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="staffing-note">Anything worth remembering? (optional)</Label>
          <Textarea
            id="staffing-note"
            rows={2}
            value={value.note}
            onChange={e => onChange({ ...value, note: e.target.value })}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            Business operations only. Do not enter patient names or identifying information.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
