import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, ChevronRight, Ruler, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import CalibrationWizard from '@/components/close-day/CalibrationWizard';
import {
  DEFAULT_STAFFING_RULES,
  useAddPhraseRule,
  useDeleteStaffingRule,
  useLayoutProfiles,
  usePhraseRules,
  useRemovePhraseRule,
  useSaveStaffingRule,
  useStaffingRules,
} from '@/hooks/useScheduleIntelligence';
import { usePracticeSettings, useUpsertPracticeSettings } from '@/hooks/usePracticeSettings';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import type { BlockCode, OperationalRole } from '@/lib/schedule-reader/types';

const PHRASE_CODES: Array<{ code: Exclude<BlockCode, 'UNCLASSIFIED'>; label: string }> = [
  { code: 'PROVIDER_OUT_EARLY', label: 'Provider out early' },
  { code: 'PROVIDER_STARTS_LATE', label: 'Provider starts late' },
  { code: 'PROVIDER_OFF', label: 'Provider off' },
  { code: 'LUNCH_BLOCK', label: 'Lunch' },
  { code: 'MEETING_BLOCK', label: 'Meeting' },
  { code: 'TRAINING_BLOCK', label: 'Training / CE' },
  { code: 'ADMIN_BLOCK', label: 'Admin time' },
  { code: 'EMERGENCY_RESERVE', label: 'Emergency reserve' },
  { code: 'EQUIPMENT_UNAVAILABLE', label: 'Equipment down' },
  { code: 'STAFFING_LIMITATION', label: 'Staffing limitation' },
  { code: 'OFFICE_CLOSED', label: 'Office closed' },
  { code: 'OTHER_OPERATIONAL_BLOCK', label: 'Other block' },
];

const DEPT_LABELS: Record<string, string> = {
  hygiene: 'Hygiene',
  doctor: 'Doctor',
  front_desk: 'Front desk',
  sterilization: 'Sterilization',
  other: 'Other',
};

/**
 * Manager setup for Schedule Intelligence: the one-time layout calibration,
 * the office's staffing expectations (nothing is hard-coded — one assistant
 * per dentist is a starting point, not a truth), and the operational phrase
 * shorthand the schedule reader should recognize.
 */
export default function ScheduleIntelligenceSetupCard() {
  const [expanded, setExpanded] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: profiles } = useLayoutProfiles();
  const { data: rules } = useStaffingRules();
  const { data: phrases } = usePhraseRules();
  const { data: settings } = usePracticeSettings();
  const saveRule = useSaveStaffingRule();
  const deleteRule = useDeleteStaffingRule();
  const addPhrase = useAddPhraseRule();
  const removePhrase = useRemovePhraseRule();
  const upsertSettings = useUpsertPracticeSettings();

  const [newPhrase, setNewPhrase] = useState('');
  const [newPhraseCode, setNewPhraseCode] =
    useState<Exclude<BlockCode, 'UNCLASSIFIED'>>('OTHER_OPERATIONAL_BLOCK');

  const seedDefaults = async () => {
    try {
      for (const rule of DEFAULT_STAFFING_RULES) {
        await saveRule.mutateAsync({
          department: rule.department,
          providerRole: rule.provider_role,
          supportRole: rule.support_role,
          providerCount: rule.provider_count,
          supportCount: rule.support_count,
          maxSimultaneousColumns: rule.max_simultaneous_columns,
        });
      }
      toast.success('Starting rules added — adjust them to how this office actually runs.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add default rules');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          className="flex w-full items-center justify-between"
          onClick={() => setExpanded(e => !e)}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="h-4 w-4 text-primary" />
            Schedule Intelligence setup
          </CardTitle>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          <section className="space-y-2">
            <p className="text-sm font-medium">Layout calibration</p>
            {(profiles ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not calibrated yet. Calibration teaches the on-device reader your practice
                software's columns, colors, and time grid — from a privacy-view capture that is
                never stored.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(profiles ?? []).map(p => (
                  <Badge key={p.id} variant={p.is_default ? 'secondary' : 'outline'}>
                    {p.name}
                    {p.pms_name ? ` · ${p.pms_name}` : ''}
                  </Badge>
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
              {(profiles ?? []).length === 0 ? 'Calibrate now' : 'Re-run calibration'}
            </Button>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Staffing expectations</p>
            <p className="text-xs text-muted-foreground">
              What "properly staffed" means here. The Office Coach compares real days against
              these — it never assumes a universal rule.
            </p>
            {(rules ?? []).length === 0 ? (
              <Button size="sm" variant="outline" onClick={seedDefaults} disabled={saveRule.isPending}>
                Add starting rules to review
              </Button>
            ) : (
              <div className="space-y-1.5">
                {(rules ?? []).map(rule => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <span>
                      <strong>{DEPT_LABELS[rule.department] ?? rule.department}:</strong>{' '}
                      {rule.provider_count} {ROLE_LABELS[rule.provider_role as OperationalRole] ?? rule.provider_role}
                      {rule.support_role &&
                        ` + ${rule.support_count ?? 1} ${ROLE_LABELS[rule.support_role as OperationalRole] ?? rule.support_role}`}
                      {rule.max_simultaneous_columns &&
                        ` · max ${rule.max_simultaneous_columns} columns at once`}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive"
                      onClick={() => deleteRule.mutate(rule.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium">Schedule phrase shorthand</p>
            <p className="text-xs text-muted-foreground">
              Short, generic office phrases the reader should recognize on the schedule (for
              example "doc gone" → Provider off). No names, no patient details — the reader
              rejects anything that isn't a plain office phrase.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="phrase-new" className="text-xs">
                  Phrase
                </Label>
                <Input
                  id="phrase-new"
                  className="h-8 w-44 text-xs"
                  value={newPhrase}
                  maxLength={40}
                  onChange={e => setNewPhrase(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Means</Label>
                <Select
                  value={newPhraseCode}
                  onValueChange={v => setNewPhraseCode(v as Exclude<BlockCode, 'UNCLASSIFIED'>)}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHRASE_CODES.map(pc => (
                      <SelectItem key={pc.code} value={pc.code} className="text-xs">
                        {pc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!newPhrase.trim() || addPhrase.isPending}
                onClick={() =>
                  addPhrase.mutate(
                    { phrase: newPhrase, code: newPhraseCode },
                    {
                      onSuccess: () => setNewPhrase(''),
                      onError: e => toast.error(e.message),
                    }
                  )
                }
              >
                Add
              </Button>
            </div>
            {(phrases ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(phrases ?? []).map(p => (
                  <Badge key={p.id} variant="outline" className="gap-1 text-[11px]">
                    "{p.phrase}" → {PHRASE_CODES.find(pc => pc.code === p.classification_code)?.label}
                    <button onClick={() => removePhrase.mutate(p.id)} aria-label="Remove phrase">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </section>

          <section className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Phone-photo fallback</p>
              <p className="text-xs text-muted-foreground">
                Allow capturing from a photo on this device when window capture isn't available.
                Photos are processed locally and never uploaded, but Purple Envelope can't remove
                the original from a phone's gallery.
              </p>
            </div>
            <Switch
              checked={settings?.mobile_capture_enabled ?? false}
              onCheckedChange={v => upsertSettings.mutate({ mobile_capture_enabled: v })}
            />
          </section>
        </CardContent>
      )}
      <CalibrationWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </Card>
  );
}
