import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useFileIncidentReport,
  useUpdateIncidentReport,
  type IncidentReport,
  type IncidentReportInput,
} from '@/hooks/useIncidentReports';
import { getToday } from '@/lib/time-utils';
import {
  CATEGORY_LABELS,
  DEVICE_CATEGORIES,
  INCIDENT_CATEGORIES,
  PPE_LABELS,
  PPE_OPTIONS,
  SEVERITIES,
  SEVERITY_LABELS,
  TREATMENTS,
  TREATMENT_LABELS,
  type IncidentCategory,
} from '@/lib/incidents';

/**
 * File or correct an incident report.
 *
 * The subject picker only appears for owners and managers — an employee's
 * report always saves under their own record, with no way to point it at
 * someone else (RLS enforces the same rule server-side).
 */

type Props = {
  open: boolean;
  onClose: () => void;
  /** Editing an existing report; omit to file a new one. */
  report?: IncidentReport | null;
  /** Pre-selected subject (the Team page files against one person). */
  defaultEmployeeId?: string;
  /** Roster for the subject picker; only owners/managers can read it. */
  employees?: { id: string; display_name: string }[];
};

const blankForm = (employeeId: string): IncidentReportInput => ({
  employeeId,
  incidentDate: getToday(),
  incidentTime: '',
  category: 'sharps_injury',
  severity: 'minor',
  location: '',
  description: '',
  bodyPart: '',
  deviceInvolved: '',
  ppeWorn: 'unknown',
  witnesses: '',
  immediateAction: '',
  medicalTreatment: 'none',
  workRelated: true,
  daysAway: 0,
  signature: '',
});

const formFromReport = (r: IncidentReport): IncidentReportInput => ({
  employeeId: r.employee_id,
  incidentDate: r.incident_date,
  // A time column comes back as 'HH:MM:SS'; the input wants 'HH:MM'.
  incidentTime: r.incident_time ? r.incident_time.slice(0, 5) : '',
  category: r.category,
  severity: r.severity,
  location: r.location,
  description: r.description,
  bodyPart: r.body_part,
  deviceInvolved: r.device_involved,
  ppeWorn: r.ppe_worn,
  witnesses: r.witnesses,
  immediateAction: r.immediate_action,
  medicalTreatment: r.medical_treatment,
  workRelated: r.work_related,
  daysAway: r.days_away,
  // Signing is its own act on the filed report, never part of an edit.
  signature: '',
});

export default function IncidentReportModal({
  open,
  onClose,
  report,
  defaultEmployeeId,
  employees,
}: Props) {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const file = useFileIncidentReport();
  const update = useUpdateIncidentReport();
  const saving = file.isPending || update.isPending;

  const [form, setForm] = useState<IncidentReportInput>(() =>
    blankForm(defaultEmployeeId || ctx?.employee_id || '')
  );
  const [attested, setAttested] = useState(false);

  // Reset every time the dialog opens so a half-typed report never leaks
  // into the next one.
  useEffect(() => {
    if (!open) return;
    setForm(
      report
        ? formFromReport(report)
        : blankForm(defaultEmployeeId || ctx?.employee_id || '')
    );
    setAttested(false);
  }, [open, report, defaultEmployeeId, ctx?.employee_id]);

  const set = <K extends keyof IncidentReportInput>(key: K, value: IncidentReportInput[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const showDevice = DEVICE_CATEGORIES.includes(form.category as IncidentCategory);
  const subjectName =
    employees?.find(e => e.id === form.employeeId)?.display_name || 'this employee';
  const aboutSomeoneElse = !!ctx && form.employeeId !== ctx.employee_id;

  // Only the person a report is about can sign it, so the sign-as-you-file
  // box is offered on a new report about yourself and nowhere else. Anyone
  // who skips it signs later from the filed report.
  const canSignNow = !report && !aboutSomeoneElse;
  // Editing the facts of a signed report retires its signatures (the
  // database does that) — say so before the change is made, not after.
  const editingSigned = !!report && (!!report.employee_signed_at || !!report.manager_signed_at);

  const isValid =
    !!form.employeeId &&
    !!form.incidentDate &&
    form.description.trim().length > 0 &&
    // Ticking "sign it now" without typing a name would file the report
    // and then fail at the signature — ask for the name first.
    (!(attested && canSignNow) || (form.signature || '').trim().length > 1);

  const handleSubmit = async () => {
    if (!isValid) return;
    if (report) await update.mutateAsync({ id: report.id, ...form });
    else await file.mutateAsync(form);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{report ? 'Edit Incident Report' : 'New Incident Report'}</DialogTitle>
          <DialogDescription>
            {isManager
              ? 'Saves to the record of the employee it happened to. Workplace safety only — no patient names or chart numbers.'
              : 'Saves to your record. Your managers and owners can see it. Workplace safety only — no patient names or chart numbers.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isManager && employees && employees.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Who did this happen to?</Label>
              <Select value={form.employeeId} onValueChange={v => set('employeeId', v)}>
                <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aboutSomeoneElse && (
                <p className="text-xs text-muted-foreground">
                  Files under {subjectName}'s record. They will be notified and can read it.
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Filing for yourself. Reports save to your own record — a manager or owner
              files reports for anyone else on the team.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ir-date">Date of incident</Label>
              <Input
                id="ir-date"
                type="date"
                value={form.incidentDate}
                max={getToday()}
                onChange={e => set('incidentDate', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ir-time">Time (optional)</Label>
              <Input
                id="ir-time"
                type="time"
                value={form.incidentTime}
                onChange={e => set('incidentTime', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>What happened</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCIDENT_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={v => set('severity', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map(s => (
                    <SelectItem key={s} value={s}>{SEVERITY_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ir-description">Describe what happened</Label>
            <Textarea
              id="ir-description"
              rows={4}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What was being done, what went wrong, and what happened right after."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ir-location">Where in the office</Label>
              <Input
                id="ir-location"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Operatory 2, sterilization"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ir-body-part">Body part affected</Label>
              <Input
                id="ir-body-part"
                value={form.bodyPart}
                onChange={e => set('bodyPart', e.target.value)}
                placeholder="e.g. Left index finger"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ir-device">
                {showDevice ? 'Instrument or device involved' : 'Equipment involved (optional)'}
              </Label>
              <Input
                id="ir-device"
                value={form.deviceInvolved}
                onChange={e => set('deviceInvolved', e.target.value)}
                placeholder={showDevice ? 'e.g. Hu-Friedy scaler, 27g needle' : 'Optional'}
              />
              {showDevice && (
                <p className="text-xs text-muted-foreground">
                  Type and brand — a sharps log needs the device to spot patterns.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Gloves / PPE worn</Label>
              <Select value={form.ppeWorn} onValueChange={v => set('ppeWorn', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PPE_OPTIONS.map(p => (
                    <SelectItem key={p} value={p}>{PPE_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ir-action">What was done right away</Label>
            <Textarea
              id="ir-action"
              rows={2}
              value={form.immediateAction}
              onChange={e => set('immediateAction', e.target.value)}
              placeholder="e.g. Washed with soap and water, reported to Dr. …"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Medical treatment</Label>
              <Select
                value={form.medicalTreatment}
                onValueChange={v => set('medicalTreatment', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TREATMENTS.map(t => (
                    <SelectItem key={t} value={t}>{TREATMENT_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ir-witnesses">Witnesses (optional)</Label>
              <Input
                id="ir-witnesses"
                value={form.witnesses}
                onChange={e => set('witnesses', e.target.value)}
                placeholder="Who else was there"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ir-days-away">Work days missed</Label>
              <Input
                id="ir-days-away"
                type="number"
                min={0}
                value={form.daysAway}
                onChange={e => set('daysAway', Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
            <div className="flex items-end pb-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="ir-work-related"
                  checked={form.workRelated}
                  onCheckedChange={v => set('workRelated', v)}
                />
                <Label htmlFor="ir-work-related" className="font-normal">
                  Happened at work
                </Label>
              </div>
            </div>
          </div>

          {canSignNow && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ir-attest"
                  checked={attested}
                  onCheckedChange={v => {
                    const on = v === true;
                    setAttested(on);
                    if (!on) set('signature', '');
                  }}
                  className="mt-0.5"
                />
                <Label htmlFor="ir-attest" className="text-xs font-normal leading-snug">
                  Sign it now — I confirm this is an accurate account of what happened.
                  Signing sends it to a manager or owner to sign off on.
                </Label>
              </div>
              {attested && (
                <Input
                  id="ir-signature"
                  value={form.signature || ''}
                  onChange={e => set('signature', e.target.value)}
                  placeholder="Type your full name"
                  className="max-w-[260px] font-medium"
                  autoComplete="off"
                />
              )}
              <p className="text-xs text-muted-foreground">
                You can skip this and sign the filed report later.
              </p>
            </div>
          )}

          {editingSigned && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              This report is signed. Saving a change to what happened clears both
              signatures — it has to be signed again afterward.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {report ? 'Save Changes' : 'File Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
