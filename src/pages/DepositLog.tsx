/**
 * Close the Day — the end-of-day workflow, grown out of the Deposit Log.
 *
 * Five steps: Money (the original deposit sheet, untouched), Practice Vitals,
 * Privacy View Capture (local-only schedule intelligence), Staffing Reality
 * (the human read of the day), and Seal the Day. One record per office day —
 * the deposit_logs row is the closeout identity.
 *
 * Money rules are unchanged: amounts only, no payer names, printing always
 * comes from the saved record.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Activity,
  Banknote,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  Printer,
  Stamp,
  Trash2,
  Users,
} from 'lucide-react';
import DepositPrintSheet from '@/components/DepositPrintSheet';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import { getToday, shiftDate } from '@/lib/time-utils';
import { formatCents, parseCurrencyInput } from '@/lib/money';
import {
  depositChecks,
  useDepositLog,
  useSaveDepositLog,
  type StaffingAssessment,
} from '@/hooks/useDepositLog';
import { useOrgBranding, useOrgDepositSettings } from '@/hooks/useOrgBranding';
import DepositSettingsCard from '@/components/DepositSettingsCard';
import DailyVitalsCard, { type VitalsForm } from '@/components/DailyVitalsCard';
import PrivacyViewCapture from '@/components/close-day/PrivacyViewCapture';
import StaffingRealityCard, {
  EMPTY_STAFFING,
  type StaffingForm,
} from '@/components/close-day/StaffingRealityCard';
import SealDayCard from '@/components/close-day/SealDayCard';
import CloseDayCoachCard from '@/components/close-day/CloseDayCoachCard';
import ScheduleIntelligenceSetupCard from '@/components/close-day/ScheduleIntelligenceSetupCard';
import { useProviderDayMetrics } from '@/hooks/useScheduleIntelligence';
import { useOrgContext } from '@/hooks/useOrgContext';

function dateLabel(date: string): string {
  if (date === getToday()) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface FormState {
  cash: string;
  checks: string[];
  insCc: string;
  ptCc: string;
  illumitrac: string;
  outsideFinancing: string;
  notes: string;
  vitals: VitalsForm;
  staffing: StaffingForm;
}

const centsToInput = (cents: number): string => (cents > 0 ? (cents / 100).toFixed(2) : '');

/** "Jane Berry" → "JB" for the printed Initials line. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);

const STEPS = [
  { label: 'Money', icon: Banknote },
  { label: 'Practice Vitals', icon: Activity },
  { label: 'Schedule', icon: Camera },
  { label: 'Staffing', icon: Users },
  { label: 'Seal', icon: Stamp },
] as const;

export default function DepositLog() {
  const [date, setDate] = useState(getToday());
  const [step, setStep] = useState(0);
  const { data: log, isLoading } = useDepositLog(date);
  const save = useSaveDepositLog();
  const { data: branding } = useOrgBranding();
  const { data: depositSettings } = useOrgDepositSettings();
  const { data: orgCtx } = useOrgContext();
  const { data: metrics } = useProviderDayMetrics(log?.id ?? null);
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  const [form, setForm] = useState<FormState | null>(null);
  // Unsaved edits block printing: the printed sheets always come from the
  // saved record, so what's on paper is exactly what's on file.
  const [dirty, setDirty] = useState(false);

  // Re-seed the form whenever a different day's record arrives.
  useEffect(() => {
    if (isLoading) {
      setForm(null);
      return;
    }
    setForm({
      cash: centsToInput(log?.cash_cents ?? 0),
      checks: depositChecks(log).map(c => (c / 100).toFixed(2)),
      insCc: centsToInput(log?.ins_cc_cents ?? 0),
      ptCc: centsToInput(log?.pt_cc_cents ?? 0),
      illumitrac: centsToInput(log?.illumitrac_cents ?? 0),
      outsideFinancing: centsToInput(log?.outside_financing_cents ?? 0),
      notes: log?.notes ?? '',
      vitals: {
        production: centsToInput(log?.production_cents ?? 0),
        hygieneCancellations: log?.hygiene_cancellations ?? 0,
        hygieneNoShows: log?.hygiene_no_shows ?? 0,
        doctorCancellations: log?.doctor_cancellations ?? 0,
        doctorNoShows: log?.doctor_no_shows ?? 0,
      },
      staffing: {
        assessment: (log?.staffing_assessment as StaffingAssessment | null) ?? null,
        pressure: log?.staffing_pressure ?? [],
        factors: log?.staffing_factors ?? [],
        note: log?.staffing_note ?? '',
      },
    });
    setDirty(false);
  }, [log, isLoading, date]);

  const updateForm = (updater: (f: FormState) => FormState) => {
    setForm(f => (f ? updater(f) : f));
    setDirty(true);
  };

  const totals = useMemo(() => {
    if (!form) return null;
    const cash = parseCurrencyInput(form.cash) ?? 0;
    const checkAmounts = form.checks.map(c => parseCurrencyInput(c) ?? 0);
    const checks = checkAmounts.reduce((a, b) => a + b, 0);
    const insCc = parseCurrencyInput(form.insCc) ?? 0;
    const ptCc = parseCurrencyInput(form.ptCc) ?? 0;
    const illumitrac = parseCurrencyInput(form.illumitrac) ?? 0;
    const financing = parseCurrencyInput(form.outsideFinancing) ?? 0;
    return {
      cash,
      checks,
      checkCount: checkAmounts.filter(c => c > 0).length,
      insCc,
      ptCc,
      illumitrac,
      financing,
      bank: cash + checks,
      cards: insCc + ptCc,
      grand: cash + checks + insCc + ptCc + illumitrac + financing,
      checkAmounts,
    };
  }, [form]);

  const setField = (field: keyof Omit<FormState, 'checks' | 'vitals' | 'staffing'>) => (value: string) =>
    updateForm(f => ({ ...f, [field]: value }));

  const handleSave = () => {
    if (!form || !totals) return;
    save.mutate(
      {
        depositDate: date,
        cashCents: totals.cash,
        checksCents: totals.checkAmounts.filter(c => c > 0),
        insCcCents: totals.insCc,
        ptCcCents: totals.ptCc,
        illumitracCents: totals.illumitrac,
        outsideFinancingCents: totals.financing,
        notes: form.notes,
        productionCents: parseCurrencyInput(form.vitals.production),
        hygieneCancellations: form.vitals.hygieneCancellations,
        hygieneNoShows: form.vitals.hygieneNoShows,
        doctorCancellations: form.vitals.doctorCancellations,
        doctorNoShows: form.vitals.doctorNoShows,
        staffingAssessment: form.staffing.assessment,
        staffingPressure: form.staffing.pressure,
        staffingFactors: form.staffing.factors,
        staffingNote: form.staffing.note,
      },
      {
        onSuccess: () => toast.success('Saved'),
        onError: err => toast.error(`Save failed: ${err.message}`),
      }
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6" />
            Close the Day
          </h1>
          <p className="text-muted-foreground text-sm">
            Money, vitals, schedule, staffing — then seal it. One record per day.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setDate(shiftDate(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-36 text-center">
            {dateLabel(date)}
            {log?.sealed_at && <Lock className="ml-1 inline h-3 w-3 text-success" />}
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={date >= getToday()}
            onClick={() => setDate(shiftDate(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <Button
            key={s.label}
            size="sm"
            variant={i === step ? 'default' : 'outline'}
            onClick={() => setStep(i)}
          >
            <s.icon className="mr-1.5 h-3.5 w-3.5" />
            {i + 1}. {s.label}
          </Button>
        ))}
      </div>

      <CloseDayCoachCard />

      {!form || !totals ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : step === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cash &amp; Checks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dep-cash">Cash</Label>
                  <Input
                    id="dep-cash"
                    inputMode="decimal"
                    placeholder="$0.00"
                    value={form.cash}
                    onChange={e => setField('cash')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Checks</Label>
                  {form.checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 text-right text-xs text-muted-foreground">{i + 1}</span>
                      <Input
                        inputMode="decimal"
                        placeholder="$0.00"
                        value={check}
                        onChange={e =>
                          updateForm(f => {
                            const checks = [...f.checks];
                            checks[i] = e.target.value;
                            return { ...f, checks };
                          })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive shrink-0"
                        onClick={() =>
                          updateForm(f => ({ ...f, checks: f.checks.filter((_, idx) => idx !== i) }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateForm(f => ({ ...f, checks: [...f.checks, ''] }))}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Check
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cards &amp; Other</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-inscc">Insurance Credit Cards</Label>
                    <Input id="dep-inscc" inputMode="decimal" placeholder="$0.00" value={form.insCc} onChange={e => setField('insCc')(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-ptcc">Patient Credit Cards</Label>
                    <Input id="dep-ptcc" inputMode="decimal" placeholder="$0.00" value={form.ptCc} onChange={e => setField('ptCc')(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-illumitrac">{depositSettings?.membershipRowLabel ?? 'Membership'}</Label>
                    <Input id="dep-illumitrac" inputMode="decimal" placeholder="$0.00" value={form.illumitrac} onChange={e => setField('illumitrac')(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-financing">{depositSettings?.outsideFinancingLabel ?? 'Outside Financing'}</Label>
                    <Input id="dep-financing" inputMode="decimal" placeholder="$0.00" value={form.outsideFinancing} onChange={e => setField('outsideFinancing')(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-notes">Notes (optional)</Label>
                  <Textarea id="dep-notes" rows={2} value={form.notes} onChange={e => setField('notes')(e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span>Total Cash</span><span>{formatCents(totals.cash)}</span></div>
                <div className="flex justify-between">
                  <span>Total Checks {totals.checkCount > 0 && `(${totals.checkCount})`}</span>
                  <span>{formatCents(totals.checks)}</span>
                </div>
                <div className="flex justify-between"><span>Insurance Credit Cards</span><span>{formatCents(totals.insCc)}</span></div>
                <div className="flex justify-between"><span>Patient Credit Cards</span><span>{formatCents(totals.ptCc)}</span></div>
                <div className="flex justify-between"><span>{depositSettings?.membershipRowLabel ?? 'Membership'}</span><span>{formatCents(totals.illumitrac)}</span></div>
                <div className="flex justify-between"><span>{depositSettings?.outsideFinancingLabel ?? 'Outside Financing'}</span><span>{formatCents(totals.financing)}</span></div>
                <div className="border-t pt-1.5 mt-1.5 space-y-1.5">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Bank deposit (cash + checks)</span><span>{formatCents(totals.bank)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Card deposits</span><span>{formatCents(totals.cards)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base">
                    <span>TOTAL</span><span>{formatCents(totals.grand)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-2">
              {log?.prepared_by_name ? (
                <p className="text-xs text-muted-foreground">
                  Last saved by {log.prepared_by_name}
                </p>
              ) : <span />}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!log || dirty}
                  title={!log || dirty ? 'Save the deposit log first' : undefined}
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Both Copies
                </Button>
                <Button onClick={handleSave} disabled={save.isPending || (!dirty && !!log)}>
                  {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {!log
                ? 'Save the deposit log to enable printing.'
                : dirty
                  ? 'Unsaved changes — save to enable printing.'
                  : 'Prints the Office Copy and the Bank Copy, one page each, initialed by whoever saved.'}
            </p>
          </div>
        </div>
      ) : step === 1 ? (
        <div className="max-w-xl space-y-4">
          {(metrics ?? []).length > 0 && (
            <Badge variant="outline" className="text-xs">
              <Check className="mr-1 h-3 w-3 text-success" />
              Prefilled from the confirmed schedule capture — correct anything it missed.
            </Badge>
          )}
          <DailyVitalsCard
            value={form.vitals}
            onChange={v => updateForm(f => ({ ...f, vitals: v }))}
          />
        </div>
      ) : step === 2 ? (
        <div className="max-w-2xl">
          <PrivacyViewCapture
            closeoutId={log?.id ?? null}
            date={date}
            onVitalsFromSchedule={counts =>
              updateForm(f => ({
                ...f,
                vitals: {
                  ...f.vitals,
                  hygieneCancellations: counts.hygieneCancellations,
                  hygieneNoShows: counts.hygieneNoShows,
                  doctorCancellations: counts.doctorCancellations,
                  doctorNoShows: counts.doctorNoShows,
                },
              }))
            }
          />
        </div>
      ) : step === 3 ? (
        <div className="max-w-xl">
          <StaffingRealityCard
            value={form.staffing}
            onChange={s => updateForm(f => ({ ...f, staffing: s }))}
          />
        </div>
      ) : (
        <div className="max-w-xl">
          <SealDayCard
            log={log ?? null}
            date={date}
            collectionsCents={totals.grand}
            staffing={form.staffing}
            metrics={metrics ?? []}
            dirty={dirty}
          />
        </div>
      )}

      {form && step > 0 && step < 4 && (
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes.' : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep(s => s + 1)}>
              Next step
            </Button>
            <Button size="sm" onClick={handleSave} disabled={save.isPending || (!dirty && !!log)}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}

      {isManager && (
        <div className="space-y-4">
          <ScheduleIntelligenceSetupCard />
          <DepositSettingsCard />
        </div>
      )}

      {/* Print-only: the two paper copies, fed from the SAVED record so
          what's on paper is exactly what's on file. Portaled so printing
          shows nothing but the sheets (same mechanism as the FOF).
          Identity and printed wording come from the org rows. */}
      {log && !dirty && branding && depositSettings &&
        createPortal(
          <div className="deposit-print-root">
            <BrandPrintStyle branding={branding} />
            <DepositPrintSheet
              date={date}
              cashCents={log.cash_cents}
              checksCents={depositChecks(log)}
              insCcCents={log.ins_cc_cents}
              ptCcCents={log.pt_cc_cents}
              illumitracCents={log.illumitrac_cents}
              outsideFinancingCents={log.outside_financing_cents}
              preparedBy={log.prepared_by_name}
              initials={initialsOf(log.prepared_by_name)}
              branding={branding}
              settings={depositSettings}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
