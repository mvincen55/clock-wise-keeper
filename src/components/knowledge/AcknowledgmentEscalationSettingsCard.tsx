import { useEffect, useState } from 'react';
import { BellRing, Clock3, Loader2, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useKnowledgeAcknowledgmentEscalationSettings,
  useSaveKnowledgeAcknowledgmentEscalationSettings,
} from '@/hooks/useKnowledgeAcknowledgments';

const DEFAULTS = {
  routine_reminders_enabled: true,
  quiet_hours_start: '19:00',
  quiet_hours_end: '07:00',
  email_after_workdays: 1,
  manager_after_workdays: 2,
  owner_after_workdays: 2,
  max_snoozes: 2,
  max_snooze_workdays: 3,
  question_pauses_escalation: true,
};

type Draft = typeof DEFAULTS;

function bounded(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export default function AcknowledgmentEscalationSettingsCard() {
  const { data: stored, isLoading } = useKnowledgeAcknowledgmentEscalationSettings();
  const save = useSaveKnowledgeAcknowledgmentEscalationSettings();
  const [draft, setDraft] = useState<Draft>(DEFAULTS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!stored || dirty) return;
    setDraft({
      routine_reminders_enabled: stored.routine_reminders_enabled,
      quiet_hours_start: stored.quiet_hours_start.slice(0, 5),
      quiet_hours_end: stored.quiet_hours_end.slice(0, 5),
      email_after_workdays: stored.email_after_workdays,
      manager_after_workdays: stored.manager_after_workdays,
      owner_after_workdays: stored.owner_after_workdays,
      max_snoozes: stored.max_snoozes,
      max_snooze_workdays: stored.max_snooze_workdays,
      question_pauses_escalation: stored.question_pauses_escalation,
    });
  }, [stored, dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await save.mutateAsync(draft);
      setDirty(false);
      toast.success('Acknowledgment escalation settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save escalation settings');
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BellRing className="h-5 w-5 text-primary" />
              Acknowledgment escalation
            </CardTitle>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Routine notices count the assigned person’s working days and only deliver during their work window. Days off, call-outs, closures, blocks, open questions, and visible snoozes pause the routine ladder.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Serious safety and integrity events stay immediate
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading escalation settings…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div>
                <p className="font-medium">Routine reminders</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Turning this off pauses routine acknowledgment chasing, not urgent safety or integrity workflows.
                </p>
              </div>
              <Switch
                checked={draft.routine_reminders_enabled}
                onCheckedChange={value => set('routine_reminders_enabled', value)}
              />
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <h3 className="font-medium">Quiet hours</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Routine notices must also fall inside the recipient’s scheduled shift. These hours are a second protection.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ack-quiet-start">Quiet starts</Label>
                  <Input
                    id="ack-quiet-start"
                    type="time"
                    value={draft.quiet_hours_start}
                    onChange={event => set('quiet_hours_start', event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ack-quiet-end">Quiet ends</Label>
                  <Input
                    id="ack-quiet-end"
                    type="time"
                    value={draft.quiet_hours_end}
                    onChange={event => set('quiet_hours_end', event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-medium">Escalation ladder</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Each gap is measured in the assigned person’s working days, not calendar days.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ack-email-days">In-app → email</Label>
                  <Input
                    id="ack-email-days"
                    type="number"
                    min={0}
                    max={10}
                    value={draft.email_after_workdays}
                    onChange={event => set('email_after_workdays', bounded(event.target.value, 0, 10))}
                  />
                  <p className="text-[11px] text-muted-foreground">Working days after the due notice</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ack-manager-days">Email → manager</Label>
                  <Input
                    id="ack-manager-days"
                    type="number"
                    min={0}
                    max={20}
                    value={draft.manager_after_workdays}
                    onChange={event => set('manager_after_workdays', bounded(event.target.value, 0, 20))}
                  />
                  <p className="text-[11px] text-muted-foreground">Working days before manager follow-up</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ack-owner-days">Manager → owner</Label>
                  <Input
                    id="ack-owner-days"
                    type="number"
                    min={0}
                    max={20}
                    value={draft.owner_after_workdays}
                    onChange={event => set('owner_after_workdays', bounded(event.target.value, 0, 20))}
                  />
                  <p className="text-[11px] text-muted-foreground">Working days before owner review</p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="font-medium">Reasoned pauses</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Snoozes remain limited and visible. Blocks and questions remain factual and attributable.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ack-max-snoozes">Maximum snoozes per version</Label>
                  <Input
                    id="ack-max-snoozes"
                    type="number"
                    min={0}
                    max={5}
                    value={draft.max_snoozes}
                    onChange={event => set('max_snoozes', bounded(event.target.value, 0, 5))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ack-max-snooze-days">Maximum length per snooze</Label>
                  <Input
                    id="ack-max-snooze-days"
                    type="number"
                    min={1}
                    max={10}
                    value={draft.max_snooze_workdays}
                    onChange={event => set('max_snooze_workdays', bounded(event.target.value, 1, 10))}
                  />
                  <p className="text-[11px] text-muted-foreground">Working days</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
                <div>
                  <p className="font-medium">Pause routine escalation for an unanswered question</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    The person may still acknowledge receipt while the clarification remains open.
                  </p>
                </div>
                <Switch
                  checked={draft.question_pauses_escalation}
                  onCheckedChange={value => set('question_pauses_escalation', value)}
                />
              </div>
            </section>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!dirty || save.isPending}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save escalation settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
