import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Layers, ClipboardList, ArrowLeft, ArrowRight, Printer, Check,
  AlertTriangle, ShieldCheck, ArrowUp, ArrowDown, X, Plus, RotateCcw, Eraser,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useFeeSchedules, useFeeScheduleItems } from '@/hooks/useFeeSchedules';
import { useConsentForms } from '@/hooks/useConsentForms';
import { useConsentBundles, recordBundleUse } from '@/hooks/useConsentBundles';
import { useConsentPermissions } from '@/hooks/useConsentSettings';
import { logConsentAudit } from '@/hooks/useConsentAudit';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ConsentPrintSheet from '@/components/consents/ConsentPrintSheet';
import { ConsentPrintRoot } from '@/components/consents/ConsentPrinting';
import { ConsentPrivacyNote } from '@/components/consents/ConsentPrivacyNote';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import {
  SIGNATURE_ROLE_LABELS, categoryLabel, effectiveContent, emptyPacketFill,
  fillHasPatientInfo, packetTotals,
  type ConsentBundle, type ConsentForm, type PacketFill, type PacketProcedure,
} from '@/lib/consents/types';

/**
 * Complete Forms — the guided packet workflow.
 *
 * PRIVACY DESIGN: everything the team types here (patient name, teeth,
 * fees, answers) lives in this component's React state and nowhere else.
 * There is no save, no autosave, no draft table. It is cleared when the
 * packet finishes, when the office's inactivity timeout fires, when the
 * user leaves the workflow, and on refresh (memory-only by construction).
 */

const STEPS = ['Treatment', 'Forms', 'Patient Details', 'Financial', 'Review', 'Print'] as const;

type Origin = 'required' | 'recommended' | 'optional' | 'conditional' | 'manual' | 'financial';

interface PacketEntry {
  formId: string;
  origin: Origin;
  included: boolean;
  /** Required bundle forms are locked by office settings. */
  locked: boolean;
  conditionLabel?: string;
}

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function CompleteForms() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: branding = GENERIC_BRANDING } = useOrgBranding();
  const { data: forms = [] } = useConsentForms();
  const { data: bundles = [] } = useConsentBundles();
  const { can, settings } = useConsentPermissions();
  const { data: schedules = [] } = useFeeSchedules();
  const officeSchedule = schedules.find(s => s.kind === 'office') ?? null;
  const { data: feeItems = [] } = useFeeScheduleItems(officeSchedule?.id ?? null);

  const [step, setStep] = useState(0);
  const [bundle, setBundle] = useState<ConsentBundle | null>(null);
  const [entries, setEntries] = useState<PacketEntry[]>([]);
  const [fill, setFill] = useState<PacketFill>(() => emptyPacketFill(todayIso()));
  const [procedureSearch, setProcedureSearch] = useState('');
  const [formSearch, setFormSearch] = useState('');
  const [printSelection, setPrintSelection] = useState<Set<string> | null>(null);
  const [printing, setPrinting] = useState(false);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const [leaveWarning, setLeaveWarning] = useState(false);

  const formsById = useMemo(() => new Map(forms.map(f => [f.id, f])), [forms]);
  // Archived forms never appear in the selection workflow; drafts print
  // from their draft with a visible warning in the library instead.
  const usableForms = useMemo(
    () => forms.filter(f => f.status !== 'archived' && effectiveContent(f)),
    [forms],
  );
  const activeBundles = bundles.filter(b => b.status === 'active');

  const financialForm = useMemo(() => {
    if (settings.financialFormId) {
      const chosen = formsById.get(settings.financialFormId);
      if (chosen && chosen.status !== 'archived') return chosen;
    }
    return usableForms.find(f => f.isFinancial) ?? null;
  }, [settings.financialFormId, formsById, usableForms]);

  const feeByCode = useMemo(() => {
    const map = new Map<string, { feeCents: number; description: string }>();
    for (const item of feeItems) map.set(item.code.toUpperCase(), { feeCents: item.feeCents, description: item.description });
    return map;
  }, [feeItems]);

  const hasPatientInfo = fillHasPatientInfo(fill);

  // ------------------------------------------------------------------
  // Clearing: the one exit every path funnels through.
  // ------------------------------------------------------------------
  const clearAll = useCallback((reason?: string) => {
    setFill(emptyPacketFill(todayIso()));
    setEntries([]);
    setBundle(null);
    setStep(0);
    setPrintSelection(null);
    setTimeoutWarning(false);
    if (reason) toast({ title: 'Patient information cleared', description: reason });
  }, [toast]);

  // Cleared on unmount — leaving the workflow never leaves data behind.
  useEffect(() => () => { setFill(emptyPacketFill(todayIso())); }, []);

  // Browser-level warning before closing/refreshing with unsent info.
  useEffect(() => {
    if (!hasPatientInfo) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPatientInfo]);

  // Office-configured inactivity timeout, with a warning first.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasPatientInfo) return;
    const timeoutMs = settings.clearTimeoutMinutes * 60_000;
    const warnMs = Math.max(timeoutMs - 60_000, timeoutMs / 2);
    const arm = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
      setTimeoutWarning(false);
      if (settings.warnBeforeClear) {
        warnTimer.current = setTimeout(() => setTimeoutWarning(true), warnMs);
      }
      idleTimer.current = setTimeout(
        () => clearAll(`No activity for ${settings.clearTimeoutMinutes} minutes.`),
        timeoutMs,
      );
    };
    arm();
    const activity = () => arm();
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    return () => {
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warnTimer.current) clearTimeout(warnTimer.current);
    };
  }, [hasPatientInfo, settings.clearTimeoutMinutes, settings.warnBeforeClear, clearAll]);

  // ------------------------------------------------------------------
  // Step 1 → 2: build the recommended form list.
  // ------------------------------------------------------------------
  const selectedCodes = fill.procedures.map(p => p.code.toUpperCase());

  const buildEntries = (fromBundle: ConsentBundle | null, codes: string[]): PacketEntry[] => {
    const list: PacketEntry[] = [];
    const seen = new Set<string>();
    if (fromBundle) {
      for (const item of fromBundle.items) {
        const form = formsById.get(item.formId);
        if (!form || form.status === 'archived') continue;
        if (form.isFinancial) continue; // the financial step owns this form
        seen.add(item.formId);
        list.push({
          formId: item.formId,
          origin: item.requirement === 'required' ? 'required' : item.requirement,
          included: item.requirement === 'required' || item.requirement === 'recommended',
          locked: item.requirement === 'required',
          conditionLabel: item.conditionLabel || undefined,
        });
      }
    }
    if (codes.length > 0) {
      for (const form of usableForms) {
        if (seen.has(form.id) || form.isFinancial) continue;
        if (form.procedureCodes.some(code => codes.includes(code.toUpperCase()))) {
          seen.add(form.id);
          list.push({ formId: form.id, origin: 'recommended', included: true, locked: false });
        }
      }
    }
    return list;
  };

  const continueFromTreatment = () => {
    setEntries(buildEntries(bundle, selectedCodes));
    if (bundle) {
      void recordBundleUse(bundle.id);
      // A bundle that carries the financial agreement pre-answers Step 4.
      if (bundle.items.some(i => formsById.get(i.formId)?.isFinancial)) {
        setFill(f => ({ ...f, includeFinancial: true }));
      }
    }
    setStep(1);
  };

  const chooseBundle = (b: ConsentBundle) => {
    setBundle(b);
    // Bundle codes seed the procedure list so fees pull automatically.
    setFill(f => {
      if (f.procedures.length > 0) return f;
      const procedures = b.procedureCodes.map(code => {
        const fee = feeByCode.get(code.toUpperCase());
        return {
          code: code.toUpperCase(),
          description: fee?.description ?? code.toUpperCase(),
          officeFeeCents: fee?.feeCents ?? null,
          feeCents: fee?.feeCents ?? null,
          overridden: false,
        } satisfies PacketProcedure;
      });
      return { ...f, procedures };
    });
  };

  const addProcedure = (code: string, description: string, feeCents: number | null) => {
    setFill(f => ({
      ...f,
      procedures: [
        ...f.procedures,
        { code: code.toUpperCase(), description, officeFeeCents: feeCents, feeCents, overridden: false },
      ],
    }));
    setProcedureSearch('');
  };

  const procedureMatches = useMemo(() => {
    const term = procedureSearch.trim().toLowerCase();
    if (!term) return [];
    return feeItems
      .filter(i => i.code.toLowerCase().includes(term) || i.description.toLowerCase().includes(term))
      .slice(0, 12);
  }, [procedureSearch, feeItems]);

  // ------------------------------------------------------------------
  // Included forms, in print order (financial agreement rides along).
  // ------------------------------------------------------------------
  const packetForms = useMemo(() => {
    const list = entries
      .filter(e => e.included)
      .map(e => formsById.get(e.formId))
      .filter((f): f is ConsentForm => !!f);
    if (fill.includeFinancial && financialForm && !list.some(f => f.id === financialForm.id)) {
      list.push(financialForm);
    }
    return list;
  }, [entries, formsById, fill.includeFinancial, financialForm]);

  const signatureSummary = (form: ConsentForm) => {
    const roles: string[] = [];
    if (form.requiresPatientSignature) roles.push(SIGNATURE_ROLE_LABELS.patient);
    if (form.requiresGuardianSignature || (fill.isMinor && settings.requireGuardianForMinors)) {
      roles.push(SIGNATURE_ROLE_LABELS.guardian);
    }
    if (form.requiresDoctorSignature) {
      roles.push(form.hygienistMayComplete ? 'Doctor (not needed when a hygienist completes)' : SIGNATURE_ROLE_LABELS.doctor);
    }
    if (form.requiresWitnessSignature || settings.requireWitnessDefault) roles.push(SIGNATURE_ROLE_LABELS.witness);
    return roles.length > 0 ? roles.join(' · ') : 'No signatures required';
  };

  // ------------------------------------------------------------------
  // Printing
  // ------------------------------------------------------------------
  const printableForms = printSelection
    ? packetForms.filter(f => printSelection.has(f.id))
    : packetForms;

  const doPrint = () => {
    setPrinting(true);
    // Fee overrides become part of the office audit trail — code and
    // amounts only, never the patient.
    for (const p of fill.procedures) {
      if (p.overridden && ctx) {
        void logConsentAudit({
          orgId: ctx.org_id,
          action: 'fee_overridden',
          entityType: 'packet',
          entityName: p.code,
          actorId: user?.id,
          actorName: user?.email ?? '',
          detail: { code: p.code, officeFeeCents: p.officeFeeCents, printedFeeCents: p.feeCents },
        });
      }
    }
    // Let the portal mount, then hand off to the browser's print dialog.
    requestAnimationFrame(() => {
      window.print();
      setStep(5);
    });
  };

  const stepBlocked = (): string | null => {
    if (step === 0 && !bundle && fill.procedures.length === 0) {
      return null; // custom packet is allowed — Continue just proceeds
    }
    if (step === 2) {
      if (!fill.patientName.trim()) return 'Enter the patient name before continuing.';
      if (!fill.date.trim()) return 'Enter the date before continuing.';
    }
    if (step === 3 && fill.includeFinancial) {
      if (!financialForm) return 'No financial agreement template exists yet — create one in the Form Library or turn this off.';
    }
    return null;
  };

  const next = () => {
    const blocked = stepBlocked();
    if (blocked) {
      toast({ title: blocked, variant: 'destructive' });
      return;
    }
    if (step === 0) return continueFromTreatment();
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => setStep(s => Math.max(s - 1, 0));

  const answersFor = (formId: string, blockId: string) => fill.answers[`${formId}:${blockId}`] ?? '';
  const setAnswer = (formId: string, blockId: string, value: string) =>
    setFill(f => ({ ...f, answers: { ...f.answers, [`${formId}:${blockId}`]: value } }));

  const totals = packetTotals(fill);
  const missingFees = fill.includeFinancial && fill.procedures.some(p => p.feeCents === null);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Complete Forms</h1>
          <p className="text-muted-foreground">Select, complete, print — then everything is cleared.</p>
        </div>
        {hasPatientInfo && (
          <Button
            variant="outline"
            onClick={() => setLeaveWarning(true)}
            className="text-destructive hover:text-destructive"
          >
            <Eraser className="mr-2 h-4 w-4" />Clear &amp; start over
          </Button>
        )}
      </div>

      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                i === step
                  ? 'bg-primary text-primary-foreground'
                  : i < step
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-3 bg-border" />}
          </li>
        ))}
      </ol>

      <ConsentPrivacyNote text="Patient information entered here is temporary and will not be permanently stored. It clears after printing, when you leave, or after the office's inactivity timeout." />

      {/* ---------------- Step 1: Treatment ---------------- */}
      {step === 0 && (
        <div className="space-y-4">
          <Card className="card-elevated">
            <CardContent className="space-y-3 p-4">
              <Label className="text-sm font-semibold">Search procedures</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={procedureSearch}
                  onChange={e => setProcedureSearch(e.target.value)}
                  placeholder={officeSchedule ? 'Search by code or name — e.g. D7140 or extraction' : 'No office fee schedule yet — add one under FOF → Fee Schedule'}
                  className="pl-8"
                  disabled={!officeSchedule}
                />
                {procedureMatches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-md">
                    {procedureMatches.map(item => (
                      <button
                        key={item.id}
                        onClick={() => addProcedure(item.code, item.description, item.feeCents)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
                      >
                        <span className="truncate">{item.code} — {item.description}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatCents(item.feeCents)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {fill.procedures.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {fill.procedures.map((p, i) => (
                    <Badge key={`${p.code}-${i}`} variant="secondary" className="gap-1 font-normal">
                      {p.code} · {p.description}
                      <button
                        onClick={() => setFill(f => ({ ...f, procedures: f.procedures.filter((_, j) => j !== i) }))}
                        aria-label={`Remove ${p.code}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Select as many procedures as the visit needs.</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Or start from a saved treatment bundle</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeBundles.map(b => (
                <button key={b.id} onClick={() => (bundle?.id === b.id ? setBundle(null) : chooseBundle(b))} className="text-left">
                  <Card className={`card-elevated h-full transition-colors ${bundle?.id === b.id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/40'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{b.name}</p>
                        {bundle?.id === b.id && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {b.items.length} forms{b.description ? ` — ${b.description}` : ''}
                      </p>
                    </CardContent>
                  </Card>
                </button>
              ))}
              {activeBundles.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No bundles yet — <Link className="text-primary underline" to="/consents/bundles">create one</Link> or continue with procedures only.
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Nothing selected? Continue anyway to build a custom packet form by form.
          </p>
        </div>
      )}

      {/* ---------------- Step 2: Forms ---------------- */}
      {step === 1 && (
        <div className="space-y-4">
          {(['required', 'conditional', 'recommended', 'optional', 'manual'] as Origin[]).map(group => {
            const groupEntries = entries.filter(e => e.origin === group);
            if (groupEntries.length === 0) return null;
            const titles: Record<string, string> = {
              required: 'Required',
              conditional: 'Conditional — answer to include',
              recommended: 'Recommended',
              optional: 'Optional',
              manual: 'Added by you',
            };
            return (
              <section key={group} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{titles[group]}</h2>
                {groupEntries.map(entry => {
                  const form = formsById.get(entry.formId);
                  if (!form) return null;
                  return (
                    <Card key={entry.formId} className="card-elevated">
                      <CardContent className="flex flex-wrap items-center gap-3 p-3">
                        {entry.origin === 'conditional' ? (
                          <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{form.name}</p>
                              <p className="text-xs text-muted-foreground">{entry.conditionLabel ?? 'Include this form?'}</p>
                            </div>
                            <RadioGroup
                              value={entry.included ? 'yes' : 'no'}
                              onValueChange={v =>
                                setEntries(prev => prev.map(e => (e.formId === entry.formId ? { ...e, included: v === 'yes' } : e)))
                              }
                              className="flex gap-3"
                            >
                              <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="yes" />Yes</label>
                              <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="no" />No</label>
                            </RadioGroup>
                          </div>
                        ) : (
                          <>
                            <Checkbox
                              checked={entry.included}
                              disabled={entry.locked}
                              onCheckedChange={v =>
                                setEntries(prev => prev.map(e => (e.formId === entry.formId ? { ...e, included: v === true } : e)))
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">
                                {form.name}
                                {form.isSample && <Badge variant="outline" className="ml-2 text-[10px]">Sample</Badge>}
                              </p>
                              <p className="text-xs text-muted-foreground">{categoryLabel(form.category)} · {signatureSummary(form)}</p>
                            </div>
                            {entry.locked && <Badge variant="outline">Locked by office settings</Badge>}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            );
          })}

          {entries.length === 0 && (
            <Card className="card-elevated">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No forms recommended yet — add them below to build a custom packet.
              </CardContent>
            </Card>
          )}

          <Card className="card-elevated">
            <CardContent className="space-y-2 p-4">
              <Label className="text-sm font-semibold">Add another form</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={formSearch}
                  onChange={e => setFormSearch(e.target.value)}
                  placeholder="Search the form library…"
                  className="pl-8"
                />
                {formSearch.trim() && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-64 overflow-y-auto">
                    {usableForms
                      .filter(f =>
                        !entries.some(e => e.formId === f.id) &&
                        !f.isFinancial &&
                        f.name.toLowerCase().includes(formSearch.trim().toLowerCase()))
                      .slice(0, 10)
                      .map(f => (
                        <button
                          key={f.id}
                          onClick={() => {
                            setEntries(prev => [...prev, { formId: f.id, origin: 'manual', included: true, locked: false }]);
                            setFormSearch('');
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <span className="truncate">{f.name}</span>
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---------------- Step 3: Patient Details ---------------- */}
      {step === 2 && (
        <div className="space-y-4">
          <Card className="card-elevated">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pf-name">Patient name *</Label>
                <Input id="pf-name" value={fill.patientName} onChange={e => setFill(f => ({ ...f, patientName: e.target.value }))} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-date">Date *</Label>
                <Input id="pf-date" type="date" value={fill.date} onChange={e => setFill(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-teeth">Tooth number(s)</Label>
                <Input id="pf-teeth" value={fill.toothNumbers} onChange={e => setFill(f => ({ ...f, toothNumbers: e.target.value }))} placeholder="e.g. 3, 14, 19" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-surface">Surface(s)</Label>
                <Input id="pf-surface" value={fill.surfaces} onChange={e => setFill(f => ({ ...f, surfaces: e.target.value }))} placeholder="e.g. MOD" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-provider">Treating provider</Label>
                <Input id="pf-provider" value={fill.providerName} onChange={e => setFill(f => ({ ...f, providerName: e.target.value }))} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-notes">Additional notes (printed nowhere unless a form has a notes field)</Label>
                <Input id="pf-notes" value={fill.notes} onChange={e => setFill(f => ({ ...f, notes: e.target.value }))} autoComplete="off" />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
                <span className="text-sm">
                  <span className="font-medium">Patient is a minor</span>
                  {settings.requireGuardianForMinors && (
                    <span className="block text-xs text-muted-foreground">
                      Office rule: a parent or guardian signature line is added for minors.
                    </span>
                  )}
                </span>
                <Switch checked={fill.isMinor} onCheckedChange={v => setFill(f => ({ ...f, isMinor: v }))} />
              </label>
            </CardContent>
          </Card>

          {/* Optional pre-fill of the packet's own questions */}
          {packetForms.some(form =>
            (effectiveContent(form)?.blocks ?? []).some(b => ['yesno', 'checkbox', 'medications', 'short_answer'].includes(b.type)),
          ) && (
            <Card className="card-elevated">
              <CardContent className="space-y-4 p-4">
                <div>
                  <p className="text-sm font-semibold">Form questions (optional)</p>
                  <p className="text-xs text-muted-foreground">
                    Pre-answer these to print them filled in — or leave them blank for the patient to complete on paper.
                  </p>
                </div>
                {packetForms.map(form => {
                  const interactive = (effectiveContent(form)?.blocks ?? []).filter(b =>
                    ['yesno', 'checkbox', 'medications', 'short_answer'].includes(b.type),
                  );
                  if (interactive.length === 0) return null;
                  return (
                    <div key={form.id} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{form.name}</p>
                      {interactive.map(block => {
                        const value = answersFor(form.id, block.id);
                        if (block.type === 'yesno') {
                          return (
                            <div key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                              <span className="text-sm">{block.label}</span>
                              <RadioGroup
                                value={value || 'blank'}
                                onValueChange={v => setAnswer(form.id, block.id, v === 'blank' ? '' : v)}
                                className="flex gap-3"
                              >
                                <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="yes" />Yes</label>
                                <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="no" />No</label>
                                <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="blank" />Leave blank</label>
                              </RadioGroup>
                            </div>
                          );
                        }
                        if (block.type === 'checkbox') {
                          return (
                            <label key={block.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                              <Checkbox
                                checked={value === 'checked'}
                                onCheckedChange={v => setAnswer(form.id, block.id, v === true ? 'checked' : '')}
                              />
                              {block.label}
                            </label>
                          );
                        }
                        if (block.type === 'medications') {
                          const chosen = new Set(value ? value.split('||') : []);
                          return (
                            <div key={block.id} className="space-y-1.5 rounded-lg border p-2.5">
                              <p className="text-sm font-medium">{block.label}</p>
                              {(block.items ?? []).map(item => (
                                <label key={item} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={chosen.has(item)}
                                    onCheckedChange={v => {
                                      const next = new Set(chosen);
                                      if (v === true) next.add(item); else next.delete(item);
                                      setAnswer(form.id, block.id, [...next].join('||'));
                                    }}
                                  />
                                  {item}
                                </label>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <div key={block.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                            <span className="text-sm">{block.label}</span>
                            <Input
                              value={value}
                              onChange={e => setAnswer(form.id, block.id, e.target.value)}
                              className="h-8 flex-1 min-w-40"
                              autoComplete="off"
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- Step 4: Financial ---------------- */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="card-elevated">
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">Would you like to include the financial agreement for this treatment?</p>
              <RadioGroup
                value={fill.includeFinancial ? 'yes' : 'no'}
                onValueChange={v => setFill(f => ({ ...f, includeFinancial: v === 'yes' }))}
                className="flex gap-4"
              >
                <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="yes" />Yes</label>
                <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="no" />No</label>
              </RadioGroup>
              {fill.includeFinancial && !financialForm && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  No financial agreement template yet — create one in the Form Library (category: Financial), or pick one in Office Settings.
                </p>
              )}
              {fill.includeFinancial && financialForm && (
                <p className="text-xs text-muted-foreground">
                  Using “{financialForm.name}”. The master template itself is unchanged — only this packet's amounts are filled in.
                </p>
              )}
            </CardContent>
          </Card>

          {fill.includeFinancial && (
            <Card className="card-elevated">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Fees for this treatment</p>
                  {officeSchedule && <p className="text-xs text-muted-foreground">Pulled from {officeSchedule.name}</p>}
                </div>
                {fill.procedures.map((p, i) => (
                  <div key={`${p.code}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{p.code}</span> — {p.description}
                    </span>
                    {p.overridden && <Badge variant="outline" className="border-warning text-warning">Overridden</Badge>}
                    {p.officeFeeCents !== null && p.overridden && (
                      <span className="text-xs text-muted-foreground line-through">{formatCents(p.officeFeeCents)}</span>
                    )}
                    <Input
                      value={p.feeCents === null ? '' : (p.feeCents / 100).toFixed(2)}
                      onChange={e => {
                        const cents = parseCurrencyInput(e.target.value);
                        setFill(f => ({
                          ...f,
                          procedures: f.procedures.map((proc, j) =>
                            j === i
                              ? { ...proc, feeCents: cents, overridden: cents !== proc.officeFeeCents }
                              : proc,
                          ),
                        }));
                      }}
                      disabled={!can('overrideFees') && p.officeFeeCents !== null}
                      className="h-8 w-28 text-right"
                      inputMode="decimal"
                      aria-label={`Fee for ${p.code}`}
                    />
                    {p.overridden && can('overrideFees') && p.officeFeeCents !== null && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Reset to office fee"
                        onClick={() =>
                          setFill(f => ({
                            ...f,
                            procedures: f.procedures.map((proc, j) =>
                              j === i ? { ...proc, feeCents: proc.officeFeeCents, overridden: false } : proc,
                            ),
                          }))
                        }
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      aria-label={`Remove ${p.code}`}
                      onClick={() => setFill(f => ({ ...f, procedures: f.procedures.filter((_, j) => j !== i) }))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={procedureSearch}
                    onChange={e => setProcedureSearch(e.target.value)}
                    placeholder="Add another procedure fee…"
                    className="pl-8"
                  />
                  {procedureMatches.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-md">
                      {procedureMatches.map(item => (
                        <button
                          key={item.id}
                          onClick={() => addProcedure(item.code, item.description, item.feeCents)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
                        >
                          <span className="truncate">{item.code} — {item.description}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatCents(item.feeCents)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {missingFees && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    A procedure has no fee — it prints as “—” unless you enter one.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    ['Discount / courtesy', 'discountCents'],
                    ['Insurance estimate', 'insuranceEstimateCents'],
                    ['Deposit received', 'depositCents'],
                  ] as const).map(([label, key]) => (
                    <div key={key} className="space-y-1.5">
                      <Label>{label}</Label>
                      <Input
                        value={fill[key] ? (fill[key] / 100).toFixed(2) : ''}
                        onChange={e => setFill(f => ({ ...f, [key]: parseCurrencyInput(e.target.value) ?? 0 }))}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label>Payment arrangement</Label>
                    <Input
                      value={fill.paymentArrangement}
                      onChange={e => setFill(f => ({ ...f, paymentArrangement: e.target.value }))}
                      placeholder="e.g. Half today, half at delivery"
                      autoComplete="off"
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-muted/60 p-3 text-sm">
                  <div className="flex justify-between"><span>Total treatment fee</span><strong>{formatCents(totals.totalCents)}</strong></div>
                  {(fill.insuranceEstimateCents > 0 || fill.depositCents > 0) && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Estimated patient portion</span><span>{formatCents(totals.estimatedPatientCents)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- Step 5: Review ---------------- */}
      {step === 4 && (
        <div className="space-y-4">
          <Card className="card-elevated">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Packet order ({packetForms.length} forms)</p>
                <p className="text-xs text-muted-foreground">Top prints first</p>
              </div>
              {packetForms.map((form, index) => {
                const entry = entries.find(e => e.formId === form.id);
                const removable = !entry?.locked && !(form.isFinancial && fill.includeFinancial);
                return (
                  <div key={form.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                    <div className="flex flex-col">
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5" disabled={index === 0}
                        aria-label="Move up"
                        onClick={() => {
                          const ids = packetForms.map(f => f.id);
                          const reordered = [...ids];
                          [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
                          setEntries(prev =>
                            [...prev].sort((a, b) => {
                              const ai = reordered.indexOf(a.formId);
                              const bi = reordered.indexOf(b.formId);
                              return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
                            }),
                          );
                        }}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-5 w-5" disabled={index === packetForms.length - 1}
                        aria-label="Move down"
                        onClick={() => {
                          const ids = packetForms.map(f => f.id);
                          const reordered = [...ids];
                          [reordered[index + 1], reordered[index]] = [reordered[index], reordered[index + 1]];
                          setEntries(prev =>
                            [...prev].sort((a, b) => {
                              const ai = reordered.indexOf(a.formId);
                              const bi = reordered.indexOf(b.formId);
                              return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
                            }),
                          );
                        }}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {index + 1}. {form.name}
                        {form.isSample && <Badge variant="outline" className="ml-2 text-[10px]">Sample</Badge>}
                        {form.currentVersion === 0 && <Badge variant="outline" className="ml-2 border-warning text-warning text-[10px]">Never published</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">Signatures: {signatureSummary(form)}</p>
                    </div>
                    {removable && (
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        aria-label={`Remove ${form.name}`}
                        onClick={() => setEntries(prev => prev.map(e => (e.formId === form.id ? { ...e, included: false } : e)))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {packetForms.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing in the packet — go back and add forms.</p>
              )}
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="space-y-0.5">
                <p><strong>{fill.patientName || 'No patient name'}</strong> · {fill.date}{fill.toothNumbers && ` · Teeth ${fill.toothNumbers}`}</p>
                <p className="text-xs text-muted-foreground">
                  {fill.includeFinancial
                    ? `Financial agreement included — total ${formatCents(totals.totalCents)}${fill.procedures.some(p => p.overridden) ? ' (includes overridden fees)' : ''}`
                    : 'No financial agreement in this packet'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>Edit details</Button>
            </CardContent>
          </Card>

          {/* Full packet preview */}
          {packetForms.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Packet preview — every page, exactly as it prints</p>
              <BrandPrintStyle branding={branding} />
              <div className="max-h-[70vh] space-y-4 overflow-y-auto rounded-lg bg-muted/50 p-3">
                {packetForms.map(form => (
                  <ScaledPrintPreview key={form.id}>
                    <ConsentPrintSheet
                      form={form}
                      content={effectiveContent(form)!}
                      branding={branding}
                      fill={fill}
                      versionDate={form.updatedAt}
                    />
                  </ScaledPrintPreview>
                ))}
              </div>
            </div>
          )}

          {/* Print selection */}
          {can('print') && packetForms.length > 0 && (
            <Card className="card-elevated">
              <CardContent className="space-y-3 p-4">
                <p className="text-sm font-semibold">Print</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => { setPrintSelection(null); doPrint(); }}>
                    <Printer className="mr-2 h-4 w-4" />Print entire packet
                  </Button>
                  <span className="text-xs text-muted-foreground">or select specific forms:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {packetForms.map(form => {
                    const selected = printSelection?.has(form.id) ?? false;
                    return (
                      <label key={form.id} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={v => {
                            setPrintSelection(prev => {
                              const next = new Set(prev ?? []);
                              if (v === true) next.add(form.id); else next.delete(form.id);
                              return next.size > 0 ? next : null;
                            });
                          }}
                        />
                        {form.name}
                      </label>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!printSelection || printSelection.size === 0}
                    onClick={doPrint}
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />Print selected only
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {!can('print') && (
            <p className="text-sm text-muted-foreground">Printing is limited by office settings — ask a manager.</p>
          )}
        </div>
      )}

      {/* ---------------- Step 6: Print & Clear ---------------- */}
      {step === 5 && (
        <Card className="card-elevated">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <Printer className="h-8 w-8 text-primary" />
            <div>
              <p className="text-lg font-semibold">Was the packet printed successfully?</p>
              <p className="text-sm text-muted-foreground">
                Choosing “Yes” clears all temporary patient information from this device.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => clearAll('The packet is done — nothing was stored.')}>
                <ShieldCheck className="mr-2 h-4 w-4" />Yes, clear patient information
              </Button>
              <Button variant="outline" onClick={doPrint}>
                <Printer className="mr-2 h-4 w-4" />Print again
              </Button>
              <Button variant="outline" onClick={() => setStep(4)}>
                <ArrowLeft className="mr-2 h-4 w-4" />Return to review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {step < 5 && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="outline" onClick={back} disabled={step === 0}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
          <p className="text-xs text-muted-foreground">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
          {step < 4 ? (
            <Button onClick={next}>
              Continue<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <span />
          )}
        </div>
      )}

      {/* Print root: mounted whenever a print can happen from this page */}
      {printing && printableForms.length > 0 && (
        <ConsentPrintRoot>
          <BrandPrintStyle branding={branding} />
          {printableForms.map(form => (
            <ConsentPrintSheet
              key={form.id}
              form={form}
              content={effectiveContent(form)!}
              branding={branding}
              fill={fill}
              versionDate={form.updatedAt}
            />
          ))}
        </ConsentPrintRoot>
      )}

      {/* Inactivity warning */}
      <AlertDialog open={timeoutWarning} onOpenChange={setTimeoutWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Still working on this packet?</AlertDialogTitle>
            <AlertDialogDescription>
              Patient information is about to be cleared automatically (office privacy timeout:
              {' '}{settings.clearTimeoutMinutes} minutes of inactivity). Any interaction keeps it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => clearAll('Cleared at your request.')}>Clear now</AlertDialogCancel>
            <AlertDialogAction onClick={() => setTimeoutWarning(false)}>Keep working</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual clear confirmation */}
      <AlertDialog open={leaveWarning} onOpenChange={setLeaveWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this packet?</AlertDialogTitle>
            <AlertDialogDescription>
              The packet has not been marked as printed. Clearing removes the patient details,
              answers, and fees typed so far — there is no undo, because nothing is stored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setLeaveWarning(false); clearAll('Cleared.'); }}>
              Clear patient information
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
