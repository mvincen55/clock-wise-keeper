import { useEffect, useState } from 'react';
import {
  usePracticeSettings,
  useUpsertPracticeSettings,
  type PracticeSettingsPatch,
} from '@/hooks/usePracticeSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PMS_LABELS, PMS_SYSTEMS, normalizePmsSystem } from '@/lib/pms';
import { daysInMonthOf, weeklyPaceForMonth } from '@/lib/metric-pace';
import { getToday } from '@/lib/time-utils';

/**
 * Practice settings — office-wide configuration, admins only (the page gates
 * rendering and RLS enforces writes).
 *
 * The Office Performance Goals section keeps production, collections, and
 * new-patients-seen strictly parallel and strictly separate: each has its own
 * optional target and its own visibility control. A blank target means "no
 * goal configured" — the dashboards state that instead of inventing a pace.
 *
 * Save behavior is intentional: goal inputs commit on blur or Enter, never on
 * every keystroke of a half-typed dollar amount.
 */

const VISIBILITY_ITEMS = (
  <SelectContent>
    <SelectItem value="everyone">Everyone sees it</SelectItem>
    <SelectItem value="admin_only">Admins only</SelectItem>
  </SelectContent>
);

/** A goal input that commits once, on blur or Enter — not per keystroke. */
function GoalInput({
  id,
  kind,
  savedValue,
  onCommit,
}: {
  id: string;
  kind: 'currency' | 'count';
  /** Cents for currency, whole count otherwise. 0 = no goal → blank input. */
  savedValue: number;
  onCommit: (next: number) => void;
}) {
  const toText = (v: number) =>
    v > 0 ? (kind === 'currency' ? (v / 100).toFixed(2) : String(v)) : '';
  const [draft, setDraft] = useState(() => toText(savedValue));
  // Re-seed when the saved value changes underneath (initial load, other tab).
  useEffect(() => setDraft(toText(savedValue)), [savedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    const parsed = parseFloat(draft);
    const next = !Number.isFinite(parsed) || parsed <= 0
      ? 0
      : kind === 'currency'
        ? Math.round(parsed * 100)
        : Math.round(parsed);
    if (next !== savedValue) onCommit(next);
    setDraft(toText(next));
  };

  return (
    <div className="relative max-w-xs">
      {kind === 'currency' && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
      )}
      <Input
        id={id}
        type="number"
        min={0}
        step={kind === 'currency' ? '0.01' : '1'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={kind === 'currency' ? 'pl-7' : 'w-28'}
        placeholder={kind === 'currency' ? '0.00' : '0'}
      />
    </div>
  );
}

export function PracticeSettingsCard() {
  const { toast } = useToast();
  const { data: settings, isLoading } = usePracticeSettings();
  const upsert = useUpsertPracticeSettings();

  const saveSetting = (patch: PracticeSettingsPatch) =>
    upsert.mutate(patch, {
      onError: (err: Error) =>
        toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

  const handlePmsChange = (value: string) => saveSetting({ pms_system: normalizePmsSystem(value) });

  const handleLeadDaysChange = (value: string) => {
    const days = Math.round(parseFloat(value));
    // 1–14 mirrors the database check constraint.
    if (!Number.isFinite(days) || days < 1 || days > 14) return;
    saveSetting({ confirmation_lead_days: days });
  };

  const npTarget = settings?.monthly_new_patients_seen_target_count ?? 0;
  const weeklyPace = weeklyPaceForMonth(npTarget, daysInMonthOf(getToday()));

  const goals: {
    key: string;
    label: string;
    kind: 'currency' | 'count';
    value: number;
    visibility: string;
    explanation: string;
    onTarget: (n: number) => void;
    onVisibility: (v: string) => void;
  }[] = [
    {
      key: 'production',
      label: 'Monthly production goal',
      kind: 'currency',
      value: settings?.monthly_production_target_cents ?? 0,
      visibility: settings?.production_visibility || 'everyone',
      explanation: 'The value of care delivered. This is different from money collected.',
      onTarget: n => saveSetting({ monthly_production_target_cents: n }),
      onVisibility: v => saveSetting({ production_visibility: v }),
    },
    {
      key: 'collections',
      label: 'Monthly collections goal',
      kind: 'currency',
      value: settings?.monthly_collections_target_cents ?? 0,
      visibility: settings?.collections_visibility || 'everyone',
      explanation:
        'Money received by the office. Insurance timing means this will not always match production.',
      onTarget: n => saveSetting({ monthly_collections_target_cents: n }),
      onVisibility: v => saveSetting({ collections_visibility: v }),
    },
    {
      key: 'new-patients',
      label: 'Monthly new patients seen goal',
      kind: 'count',
      value: npTarget,
      visibility: settings?.new_patients_visibility || 'everyone',
      explanation:
        'Counts completed first visits. New patients scheduled are tracked separately as the pipeline.',
      onTarget: n => saveSetting({ monthly_new_patients_seen_target_count: n }),
      onVisibility: v => saveSetting({ new_patients_visibility: v }),
    },
  ];

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Practice Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <section className="space-y-5">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Target className="h-4 w-4 text-primary" />
                  Office performance goals
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each goal is optional and controls its own dashboard visibility. Leave a goal
                  blank and Home shows the factual total with no pace verdict. Owners and
                  managers always see all three.
                </p>
              </div>

              {goals.map(g => (
                <div key={g.key} className="space-y-2 rounded-md border p-3">
                  <Label htmlFor={`goal-${g.key}`} className="text-xs">{g.label}</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <GoalInput
                      id={`goal-${g.key}`}
                      kind={g.kind}
                      savedValue={g.value}
                      onCommit={g.onTarget}
                    />
                    <Select value={g.visibility} onValueChange={g.onVisibility}>
                      <SelectTrigger className="w-44" aria-label={`${g.label} visibility`}>
                        <SelectValue />
                      </SelectTrigger>
                      {VISIBILITY_ITEMS}
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">{g.explanation}</p>
                  {g.key === 'new-patients' && weeklyPace !== null && (
                    <p className="text-xs text-muted-foreground">
                      About {weeklyPace} new patient{weeklyPace === 1 ? '' : 's'} per week keeps
                      this month on pace — a calendar approximation, since working days vary.
                    </p>
                  )}
                  {g.key === 'collections' && g.value > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Dashboards may show last month&rsquo;s recorded pace as a comparison, but
                      it is never treated as a target.
                    </p>
                  )}
                </div>
              ))}
            </section>

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
