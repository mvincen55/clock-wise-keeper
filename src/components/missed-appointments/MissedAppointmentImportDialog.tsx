import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useImportMissedAppointmentEvents } from '@/hooks/useMissedAppointmentEvents';
import {
  MISSED_APPOINTMENT_CODE_LABELS,
  MISSED_APPOINTMENT_DEPARTMENT_LABELS,
  choiceForProvider,
  defaultProviderChoices,
  parseDentrixMissedAppointments,
  planMissedAppointmentImport,
  providerLabelCounts,
  type ExistingMissedAppointment,
  type MissedAppointmentCode,
  type MissedAppointmentProviderChoice,
  type MissedAppointmentProviderRef,
} from '@/lib/missed-appointments';

const NO_PROVIDER = 'none';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: ExistingMissedAppointment[];
  providers: MissedAppointmentProviderRef[];
};

/**
 * "Import from Dentrix": paste the appointment export (or a day sheet), see
 * what was read and how each Dentrix provider maps to the office's registry,
 * fix a mapping if needed, and record the postings. The paste is parsed in
 * the browser and only the date, code, and provider of each posting leave
 * this dialog; the patient column is dropped before a row exists.
 */
export function MissedAppointmentImportDialog({ open, onOpenChange, existing, providers }: Props) {
  const { data: ctx } = useOrgContext();
  const importEvents = useImportMissedAppointmentEvents();
  const [text, setText] = useState('');
  const [code, setCode] = useState<MissedAppointmentCode>('9100');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [newDaysOnlyChoice, setNewDaysOnlyChoice] = useState<boolean | null>(null);

  const parsed = useMemo(() => parseDentrixMissedAppointments(text), [text]);
  const isDaySheet = parsed.format === 'day_sheet';
  // A day sheet credits a posting to the chair's provider where the export
  // names the appointment's provider, so by default it only fills days the
  // export has not covered.
  const newDaysOnly = newDaysOnlyChoice ?? isDaySheet;
  const labels = useMemo(() => providerLabelCounts(parsed.rows), [parsed.rows]);
  const choices = useMemo(() => {
    const auto = defaultProviderChoices(parsed.rows, providers);
    const merged: Record<string, MissedAppointmentProviderChoice> = { ...auto };
    for (const [label, providerId] of Object.entries(overrides)) {
      if (!(label in merged)) continue;
      merged[label] = choiceForProvider(label, providerId === NO_PROVIDER ? null : providers.find(p => p.id === providerId) ?? null);
    }
    return merged;
  }, [parsed.rows, providers, overrides]);

  const plan = useMemo(() => planMissedAppointmentImport({
    rows: parsed.rows, code, choices, orgId: ctx?.org_id ?? '', userId: ctx?.user_id ?? '', existing, newDaysOnly,
  }), [parsed.rows, code, choices, ctx?.org_id, ctx?.user_id, existing, newDaysOnly]);

  const days = new Set(parsed.rows.map(r => r.business_date)).size;
  const unmatched = labels.filter(l => !choices[l.label]?.matched);

  const reset = () => { setText(''); setOverrides({}); setNewDaysOnlyChoice(null); setCode('9100'); };

  const handleImport = async () => {
    if (!ctx?.org_id || !plan.inserts.length) return;
    try {
      const added = await importEvents.mutateAsync(plan.inserts);
      const parts = [`Recorded ${added} posting${added === 1 ? '' : 's'}`];
      if (plan.alreadyRecorded) parts.push(`${plan.alreadyRecorded} already recorded`);
      if (plan.skippedForRecordedDays) parts.push(`${plan.skippedForRecordedDays} skipped on recorded days`);
      toast.success(parts.join(' · '));
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The postings could not be recorded');
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import from Dentrix</DialogTitle>
          <DialogDescription>
            Paste the Appt_Date / Appt_Provider export, or a day sheet. Only the date, the code, and the provider of each
            posting are kept; the patient column is dropped before anything is recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="missed-import-code">What these postings are</Label>
              <Select value={code} onValueChange={v => setCode(v as MissedAppointmentCode)} disabled={isDaySheet}>
                <SelectTrigger id="missed-import-code" aria-label="What these postings are"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9100">9100 · {MISSED_APPOINTMENT_CODE_LABELS['9100']}</SelectItem>
                  <SelectItem value="9101">9101 · {MISSED_APPOINTMENT_CODE_LABELS['9101']}</SelectItem>
                </SelectContent>
              </Select>
              {isDaySheet && <p className="text-xs text-muted-foreground">A day sheet says which code each line is.</p>}
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Switch id="missed-import-new-days" checked={newDaysOnly} onCheckedChange={v => setNewDaysOnlyChoice(v)} />
              <Label htmlFor="missed-import-new-days" className="text-sm font-normal leading-snug">
                Only add days with nothing recorded yet
              </Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="missed-import-text">Pasted Dentrix text</Label>
            <Textarea
              id="missed-import-text"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={'Appt_Date\tAppt_Provider\n9/8/2025\tLucia Bizarro\n9/8/2025\tScott L. Harelick'}
            />
          </div>

          {parsed.format !== 'empty' && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1" data-testid="missed-import-preview">
              <p>
                <span className="font-medium">{parsed.rows.length} posting{parsed.rows.length === 1 ? '' : 's'}</span>
                {' '}on {days} day{days === 1 ? '' : 's'} read from {parsed.lineCount} line{parsed.lineCount === 1 ? '' : 's'}
                {isDaySheet ? ' of a day sheet' : ' of an appointment export'}
                {parsed.skipped.length > 0 && ` · ${parsed.skipped.length} line${parsed.skipped.length === 1 ? '' : 's'} skipped (${describeSkips(parsed.skipped)})`}
              </p>
              {parsed.droppedColumns.length > 0 && (
                <p className="text-muted-foreground">Dropped and never recorded: {parsed.droppedColumns.join(', ')}.</p>
              )}
              <p>
                <span className="font-medium">{plan.inserts.length} new</span>
                {plan.byCode['9100'] > 0 || plan.byCode['9101'] > 0
                  ? ` (${plan.byCode['9100']} no-show${plan.byCode['9100'] === 1 ? '' : 's'}, ${plan.byCode['9101']} late cancellation${plan.byCode['9101'] === 1 ? '' : 's'})`
                  : ''}
                {plan.alreadyRecorded > 0 && ` · ${plan.alreadyRecorded} already recorded`}
                {plan.skippedForRecordedDays > 0 && ` · ${plan.skippedForRecordedDays} skipped on ${plan.recordedDaysSkipped.length} day${plan.recordedDaysSkipped.length === 1 ? '' : 's'} already recorded`}
              </p>
            </div>
          )}

          {labels.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Providers</p>
              {unmatched.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {unmatched.map(u => u.label).join(', ')}: not in the provider registry, so recorded under Other unless you pick someone.
                </p>
              )}
              <div className="divide-y rounded-md border">
                {labels.map(({ label, count }) => {
                  const choice = choices[label];
                  const value = overrides[label] ?? choice?.providerId ?? NO_PROVIDER;
                  return (
                    <div key={label} className="grid items-center gap-2 p-2 sm:grid-cols-[1fr_auto_200px_90px]">
                      <span className="text-sm">{label}</span>
                      <span className="text-xs text-muted-foreground">{count}</span>
                      <Select value={value} onValueChange={v => setOverrides(o => ({ ...o, [label]: v }))}>
                        <SelectTrigger aria-label={`Provider for ${label}`} className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_PROVIDER}>Not a provider · Other</SelectItem>
                          {providers.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.displayName}{p.active ? '' : ' (inactive)'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Badge variant={choice?.matched ? 'secondary' : 'outline'} className="justify-self-start">
                        {MISSED_APPOINTMENT_DEPARTMENT_LABELS[choice?.department ?? 'other']}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={!plan.inserts.length || importEvents.isPending}>
            {importEvents.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record {plan.inserts.length} posting{plan.inserts.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeSkips(skipped: { line: number; reason: string }[]): string {
  const byReason = new Map<string, number[]>();
  for (const s of skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.line]);
  return [...byReason.entries()]
    .map(([reason, lines]) => `${reason}: line${lines.length === 1 ? '' : 's'} ${lines.slice(0, 6).join(', ')}${lines.length > 6 ? '…' : ''}`)
    .join('; ');
}
