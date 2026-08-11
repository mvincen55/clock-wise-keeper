import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VitalsForm = {
  production: string;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
  /**
   * Aggregate whole-number answers, kept as text so blank stays blank:
   * '' = not recorded, '0' = an explicit, deliberate zero. Counts only —
   * never a patient name or appointment detail.
   */
  newPatientsScheduled: string;
  newPatientsSeen: string;
};

export type VitalsCountKey = Exclude<
  keyof VitalsForm,
  'production' | 'newPatientsScheduled' | 'newPatientsSeen'
>;

/**
 * Parse a whole-count answer: '' → null (not recorded), otherwise a
 * nonnegative integer. The save path uses this so a blank question can never
 * silently become a stored zero.
 */
export function parseCountAnswer(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

const ROWS: { key: VitalsCountKey; label: string }[] = [
  { key: 'hygieneCancellations', label: 'Hygiene cancellations' },
  { key: 'hygieneNoShows', label: 'Hygiene no-shows' },
  { key: 'doctorCancellations', label: 'Doctor cancellations' },
  { key: 'doctorNoShows', label: 'Doctor no-shows' },
];

const SLIDER_MAX = 15;

/** Calm purple at zero, warming toward amber as the count climbs. */
function tint(value: number): string {
  const t = Math.min(value / SLIDER_MAX, 1);
  const hue = 270 - t * 230; // 270 purple → 40 amber
  const sat = 30 + t * 55;
  const light = 55 - t * 8;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

type Props = {
  value: VitalsForm;
  onChange: (next: VitalsForm) => void;
};

/**
 * Today's vitals — production and the four ways the schedule fell apart.
 * One thumb-drag answers each question; typing is the exception, not the rule.
 */
export default function DailyVitalsCard({ value, onChange }: Props) {
  const [typing, setTyping] = useState<VitalsCountKey | null>(null);

  const setCount = (key: VitalsCountKey, n: number) =>
    onChange({ ...value, [key]: Math.max(0, Math.round(n) || 0) });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Today's vitals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="dep-production">Production</Label>
          <Input
            id="dep-production"
            inputMode="decimal"
            placeholder="$0.00"
            value={value.production}
            onChange={e => onChange({ ...value, production: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            What the practice produced today — the deposit is what was collected.
          </p>
        </div>

        {/* New patients: two separate aggregate counts. Scheduled is the
            pipeline; seen is the only number that advances the goal. Blank
            means "not recorded" — 0 is a real answer, so it must be typed. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dep-np-scheduled">
              How many new-patient appointments did we schedule today?
            </Label>
            <Input
              id="dep-np-scheduled"
              inputMode="numeric"
              placeholder="Count"
              value={value.newPatientsScheduled}
              onChange={e =>
                onChange({ ...value, newPatientsScheduled: e.target.value.replace(/[^\d]/g, '') })
              }
            />
            <p className="text-xs text-muted-foreground">
              Booked today for a first visit — the pipeline. A count only; 0 is a real answer.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dep-np-seen">
              How many new patients completed their first visit today?
            </Label>
            <Input
              id="dep-np-seen"
              inputMode="numeric"
              placeholder="Count"
              value={value.newPatientsSeen}
              onChange={e =>
                onChange({ ...value, newPatientsSeen: e.target.value.replace(/[^\d]/g, '') })
              }
            />
            <p className="text-xs text-muted-foreground">
              Completed first visits — the only number that counts toward the new-patient goal.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {ROWS.map(row => {
            const count = value[row.key];
            const color = tint(count);
            const overflow = count > SLIDER_MAX;
            return (
              <div key={row.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm font-normal">{row.label}</Label>
                  {typing === row.key ? (
                    <Input
                      autoFocus
                      inputMode="numeric"
                      className="h-8 w-20 text-right"
                      value={String(count)}
                      onChange={e => setCount(row.key, Number(e.target.value.replace(/\D/g, '')))}
                      onBlur={() => setTyping(null)}
                      onKeyDown={e => e.key === 'Enter' && setTyping(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTyping(row.key)}
                      title="Tap to type a bigger number"
                      className="min-w-10 text-right text-2xl font-semibold tabular-nums leading-none transition-colors"
                      style={{ color: count > 0 ? color : undefined }}
                    >
                      <span className={cn(count === 0 && 'text-muted-foreground')}>{count}</span>
                    </button>
                  )}
                </div>
                <Slider
                  value={[Math.min(count, SLIDER_MAX)]}
                  min={0}
                  max={SLIDER_MAX}
                  step={1}
                  onValueChange={([n]) => setCount(row.key, n)}
                  aria-label={row.label}
                  style={
                    {
                      '--vitals-tint': color,
                    } as React.CSSProperties
                  }
                  className="[&_[role=slider]]:border-[var(--vitals-tint)] [&>span>span]:bg-[var(--vitals-tint)]"
                />
                {overflow && (
                  <p className="text-xs text-muted-foreground">
                    {count} recorded — beyond the slider.{' '}
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setCount(row.key, SLIDER_MAX)}
                    >
                      bring it back
                    </Button>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
