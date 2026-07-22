/**
 * Financial Options Form builder — itemized, plan-aware.
 *
 * HIPAA BOUNDARY — READ BEFORE EDITING:
 * Patient-entered data on this page (name, date, procedures chosen, dollar
 * amounts, remaining deductible/benefits) exists ONLY in component memory
 * and goes straight to the printer. It must never be sent to Supabase,
 * written to localStorage/sessionStorage, placed in the URL, logged,
 * toasted, or passed to analytics/audit calls. Only de-identified
 * configuration (templates, fee schedules, plan rules) may touch the
 * network. Keep it that way — the practice has no BAA covering patient
 * data in this app.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DollarSign,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import FofPrintSheet, { type FofPrintLine } from '@/components/fof/FofPrintSheet';
import { useFofSettings, useFofTemplates } from '@/hooks/useFofTemplates';
import {
  useFeeScheduleItems,
  useFeeSchedules,
  useInsurancePlans,
} from '@/hooks/useFeeSchedules';
import { computeFof } from '@/lib/fof/compute';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import {
  estimateInsurance,
  type FeeCategory,
  type FofLine,
  type PlanRules,
} from '@/lib/fof/insurance';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import { DEFAULT_PRACTICE_INFO } from '@/lib/fof/defaults';
import type { Cents, FofAmounts, FofOverrides, FofTemplate } from '@/lib/fof/types';

const NO_PLAN = '__none__';

const CATEGORY_SHORT: Record<FeeCategory, string> = {
  preventive: 'Prev',
  basic: 'Basic',
  major: 'Major',
  other: 'Other',
};

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface BuilderLine {
  key: string;
  code: string;
  description: string;
  category: FeeCategory;
  feeInput: string;
  allowedInput: string;
}

let lineCounter = 0;
const newLine = (): BuilderLine => ({
  key: `line-${++lineCounter}`,
  code: '',
  description: '',
  category: 'other',
  feeInput: '',
  allowedInput: '',
});

interface BuilderState {
  patientName: string;
  dateISO: string;
  note: string;
  lines: BuilderLine[];
  deductibleInput: string;
  annualMaxInput: string;
  insuranceOverride: string;
  writeOffOverride: string;
  portionOverride: string;
  discountOverride: string;
  prepayOverride: string;
  installmentOverrides: string[];
}

type ScalarField = keyof Omit<BuilderState, 'lines' | 'installmentOverrides'>;

type BuilderAction =
  | { type: 'set'; field: ScalarField; value: string }
  | { type: 'setLine'; index: number; patch: Partial<BuilderLine> }
  | { type: 'addLine' }
  | { type: 'removeLine'; index: number }
  | { type: 'setInstallment'; index: number; value: string }
  | { type: 'clearOverrides' }
  | { type: 'clearAll' };

const initialState = (): BuilderState => ({
  patientName: '',
  dateISO: todayISO(),
  note: '',
  lines: [newLine()],
  deductibleInput: '',
  annualMaxInput: '',
  insuranceOverride: '',
  writeOffOverride: '',
  portionOverride: '',
  discountOverride: '',
  prepayOverride: '',
  installmentOverrides: [],
});

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'setLine': {
      const lines = [...state.lines];
      lines[action.index] = { ...lines[action.index], ...action.patch };
      return { ...state, lines };
    }
    case 'addLine':
      return { ...state, lines: [...state.lines, newLine()] };
    case 'removeLine': {
      const lines = state.lines.filter((_, i) => i !== action.index);
      return { ...state, lines: lines.length ? lines : [newLine()] };
    }
    case 'setInstallment': {
      const next = [...state.installmentOverrides];
      next[action.index] = action.value;
      return { ...state, installmentOverrides: next };
    }
    case 'clearOverrides':
      return {
        ...state,
        insuranceOverride: '',
        writeOffOverride: '',
        portionOverride: '',
        discountOverride: '',
        prepayOverride: '',
        installmentOverrides: [],
      };
    case 'clearAll':
      return initialState();
    default:
      return state;
  }
}

function parseOverride(input: string): Cents | undefined {
  if (!input.trim()) return undefined;
  return parseCurrencyInput(input) ?? undefined;
}

/** Scales the fixed-width print sheet to fit its container. */
function ScaledPreview({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const available = outer.clientWidth;
      const natural = inner.scrollWidth;
      const scale = natural > 0 ? Math.min(1, available / natural) : 1;
      setLayout({ scale, height: inner.scrollHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full overflow-hidden">
      <div style={{ height: layout.height || undefined }}>
        <div
          ref={innerRef}
          style={{ transform: `scale(${layout.scale})`, transformOrigin: 'top left', width: 'fit-content' }}
          className="border shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface OverrideRowProps {
  label: string;
  computedCents: Cents;
  value: string;
  overridden: boolean;
  onChange: (value: string) => void;
}

function OverrideRow({ label, computedCents, value, overridden, onChange }: OverrideRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      {overridden && <Badge variant="secondary">custom</Badge>}
      <Input
        className="w-32 text-right"
        inputMode="decimal"
        autoComplete="off"
        placeholder={formatCents(computedCents)}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {overridden && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange('')} title="Reset to computed value">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export default function FofBuilder() {
  const { data: templates, isLoading: templatesLoading } = useFofTemplates();
  const { data: practice } = useFofSettings();
  const { data: schedules } = useFeeSchedules();
  const { data: plans } = useInsurancePlans();

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string>(NO_PLAN);

  const activeTemplates = useMemo(
    () => (templates ?? []).filter(t => t.isActive),
    [templates]
  );
  const template: FofTemplate | undefined =
    activeTemplates.find(t => t.id === templateId) ?? activeTemplates[0];

  const officeSchedule = (schedules ?? []).find(s => s.kind === 'office');
  const { data: officeItems } = useFeeScheduleItems(officeSchedule?.id ?? null);

  const insuranceEnabled = !!template?.showInsuranceEstimate;
  const plan = insuranceEnabled
    ? (plans ?? []).find(p => p.id === planId && p.isActive) ?? null
    : null;
  const { data: planItems } = useFeeScheduleItems(plan?.feeScheduleId ?? null);

  const officeByCode = useMemo(() => {
    const map = new Map<string, { description: string; feeCents: Cents; category: FeeCategory }>();
    for (const item of officeItems ?? []) {
      map.set(item.code, { description: item.description, feeCents: item.feeCents, category: item.category });
    }
    return map;
  }, [officeItems]);

  const allowedByCode = useMemo(() => {
    const map = new Map<string, Cents>();
    for (const item of planItems ?? []) map.set(item.code, item.feeCents);
    return map;
  }, [planItems]);

  const handleCodeChange = (index: number, rawCode: string) => {
    const code = rawCode.toUpperCase();
    const match = officeByCode.get(code.trim());
    dispatch({
      type: 'setLine',
      index,
      patch: match
        ? {
            code,
            description: match.description,
            feeInput: formatCents(match.feeCents),
            category: match.category,
          }
        : { code, category: categorizeCdtCode(code) },
    });
  };

  const handlePlanChange = (nextPlanId: string) => {
    setPlanId(nextPlanId);
    const nextPlan = (plans ?? []).find(p => p.id === nextPlanId);
    dispatch({ type: 'set', field: 'deductibleInput', value: nextPlan ? formatCents(nextPlan.deductibleCents) : '' });
    dispatch({ type: 'set', field: 'annualMaxInput', value: nextPlan ? formatCents(nextPlan.annualMaxCents) : '' });
  };

  const feeLines: FofLine[] = useMemo(
    () =>
      state.lines
        .filter(l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '')
        .map(l => ({
          code: l.code.trim(),
          description: l.description.trim(),
          category: l.category,
          officeFeeCents: parseCurrencyInput(l.feeInput) ?? 0,
          allowedCents: l.allowedInput.trim()
            ? parseCurrencyInput(l.allowedInput)
            : allowedByCode.get(l.code.trim()) ?? null,
        })),
    [state.lines, allowedByCode]
  );

  const planRules: PlanRules | null = plan
    ? {
        preventivePct: plan.preventivePct,
        basicPct: plan.basicPct,
        majorPct: plan.majorPct,
        deductibleWaivedPreventive: plan.deductibleWaivedPreventive,
        writeoffApplies: plan.writeoffApplies,
      }
    : null;

  const estimate = useMemo(
    () =>
      estimateInsurance(feeLines, planRules, {
        remainingDeductibleCents: parseCurrencyInput(state.deductibleInput) ?? plan?.deductibleCents ?? 0,
        remainingAnnualMaxCents: parseCurrencyInput(state.annualMaxInput) ?? plan?.annualMaxCents ?? 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feeLines, plan, state.deductibleInput, state.annualMaxInput]
  );

  const amounts: FofAmounts = useMemo(
    () => ({
      totalCents: estimate.totalCents,
      insuranceEstimateCents: parseOverride(state.insuranceOverride) ?? estimate.insurancePaysCents,
      writeOffCents: parseOverride(state.writeOffOverride) ?? estimate.writeOffCents,
    }),
    [estimate, state.insuranceOverride, state.writeOffOverride]
  );

  const overrides: FofOverrides = useMemo(
    () => ({
      patientPortionCents: parseOverride(state.portionOverride),
      discountCents: parseOverride(state.discountOverride),
      prepayTotalCents: parseOverride(state.prepayOverride),
      installmentsCents: state.installmentOverrides.map(parseOverride),
    }),
    [state.portionOverride, state.discountOverride, state.prepayOverride, state.installmentOverrides]
  );

  const computation = useMemo(
    () => (template ? computeFof(template, amounts, overrides) : null),
    [template, amounts, overrides]
  );

  const printLines: FofPrintLine[] = feeLines.map(l => ({
    code: l.code,
    description: l.description || l.code,
    feeCents: l.officeFeeCents,
  }));

  const isDirty =
    state.patientName.trim() !== '' ||
    state.note.trim() !== '' ||
    feeLines.length > 0;

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const setField = (field: ScalarField) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      dispatch({ type: 'set', field, value: e.target.value });

  const sheet = template && computation && (
    <FofPrintSheet
      practice={practice ?? DEFAULT_PRACTICE_INFO}
      template={template}
      patient={{ patientName: state.patientName, dateISO: state.dateISO, treatment: state.note }}
      amounts={amounts}
      computation={computation}
      lines={printLines}
    />
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Financial Options Form</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/fof/fees">
              <DollarSign className="h-4 w-4 mr-2" />
              Fees & Plans
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/fof/templates">
              <Settings2 className="h-4 w-4 mr-2" />
              Templates
            </Link>
          </Button>
          <Button onClick={() => window.print()} disabled={!template}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Print-only — nothing is saved</AlertTitle>
        <AlertDescription>
          Patient information on this page stays on this device and is never stored.
          Print the form before leaving this page; file the signed copy per office policy.
        </AlertDescription>
      </Alert>

      {templatesLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !template ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No active templates. <Link className="underline" to="/fof/templates">Create one</Link> to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Template & Patient</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={template.id} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fof-name">Patient Name</Label>
                    <Input
                      id="fof-name"
                      autoComplete="off"
                      value={state.patientName}
                      onChange={setField('patientName')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fof-date">Date</Label>
                    <Input
                      id="fof-date"
                      type="date"
                      autoComplete="off"
                      value={state.dateISO}
                      onChange={setField('dateISO')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Procedures</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <datalist id="fof-code-list">
                  {(officeItems ?? []).map(item => (
                    <option key={item.id} value={item.code}>{item.description}</option>
                  ))}
                </datalist>
                <div className="hidden sm:grid grid-cols-[5.5rem_1fr_5rem_6rem_6rem_2rem] gap-1.5 text-xs text-muted-foreground px-1">
                  <span>Code</span>
                  <span>Description</span>
                  <span>Category</span>
                  <span className="text-right">Office Fee</span>
                  {insuranceEnabled ? <span className="text-right">Allowed</span> : <span />}
                  <span />
                </div>
                {state.lines.map((line, i) => {
                  const autoAllowed = allowedByCode.get(line.code.trim());
                  return (
                    <div key={line.key} className="grid sm:grid-cols-[5.5rem_1fr_5rem_6rem_6rem_2rem] grid-cols-2 gap-1.5 items-center">
                      <Input
                        list="fof-code-list"
                        placeholder="D2740"
                        autoComplete="off"
                        className="font-mono"
                        value={line.code}
                        onChange={e => handleCodeChange(i, e.target.value)}
                      />
                      <Input
                        placeholder="Description"
                        autoComplete="off"
                        value={line.description}
                        onChange={e => dispatch({ type: 'setLine', index: i, patch: { description: e.target.value } })}
                      />
                      <Select
                        value={line.category}
                        onValueChange={v => dispatch({ type: 'setLine', index: i, patch: { category: v as FeeCategory } })}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(CATEGORY_SHORT) as FeeCategory[]).map(c => (
                            <SelectItem key={c} value={c}>{CATEGORY_SHORT[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="$0.00"
                        className="text-right"
                        value={line.feeInput}
                        onChange={e => dispatch({ type: 'setLine', index: i, patch: { feeInput: e.target.value } })}
                      />
                      {insuranceEnabled ? (
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder={autoAllowed !== undefined ? formatCents(autoAllowed) : 'auto'}
                          className="text-right"
                          value={line.allowedInput}
                          onChange={e => dispatch({ type: 'setLine', index: i, patch: { allowedInput: e.target.value } })}
                        />
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => dispatch({ type: 'removeLine', index: i })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-1">
                  <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'addLine' })}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Procedure
                  </Button>
                  <span className="text-sm font-medium">
                    Total: {formatCents(estimate.totalCents)}
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="fof-note">Additional Notes (optional)</Label>
                  <Textarea
                    id="fof-note"
                    autoComplete="off"
                    rows={2}
                    value={state.note}
                    onChange={setField('note')}
                  />
                </div>
              </CardContent>
            </Card>

            {insuranceEnabled && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Insurance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Plan</Label>
                    <Select value={planId} onValueChange={handlePlanChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PLAN}>No plan — enter amounts manually</SelectItem>
                        {(plans ?? []).filter(p => p.isActive).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {plan && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="fof-ded">Patient's Remaining Deductible</Label>
                          <Input
                            id="fof-ded"
                            inputMode="decimal"
                            autoComplete="off"
                            value={state.deductibleInput}
                            onChange={setField('deductibleInput')}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="fof-max">Patient's Remaining Annual Max</Label>
                          <Input
                            id="fof-max"
                            inputMode="decimal"
                            autoComplete="off"
                            value={state.annualMaxInput}
                            onChange={setField('annualMaxInput')}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Defaults are the plan's full deductible and annual max — adjust to what
                        this patient actually has left. These numbers are not saved.
                        Coverage: {plan.preventivePct}/{plan.basicPct}/{plan.majorPct}%.
                        Allowed fees auto-fill from {
                          (schedules ?? []).find(s => s.id === plan.feeScheduleId)?.name ?? 'office fees'
                        }; type in the Allowed column to override a line.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {computation && (
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Computed Amounts</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dispatch({ type: 'clearOverrides' })}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Reset all
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insuranceEnabled && (
                    <>
                      <OverrideRow
                        label="Estimated Insurance Payment"
                        computedCents={estimate.insurancePaysCents}
                        value={state.insuranceOverride}
                        overridden={state.insuranceOverride.trim() !== ''}
                        onChange={v => dispatch({ type: 'set', field: 'insuranceOverride', value: v })}
                      />
                      {template.showWriteOff && (
                        <OverrideRow
                          label="Estimated Insurance Write-Off"
                          computedCents={estimate.writeOffCents}
                          value={state.writeOffOverride}
                          overridden={state.writeOffOverride.trim() !== ''}
                          onChange={v => dispatch({ type: 'set', field: 'writeOffOverride', value: v })}
                        />
                      )}
                    </>
                  )}
                  <OverrideRow
                    label="Patient's Portion"
                    computedCents={computation.computed.patientPortionCents}
                    value={state.portionOverride}
                    overridden={computation.overridden.patientPortion}
                    onChange={v => dispatch({ type: 'set', field: 'portionOverride', value: v })}
                  />
                  {template.showPrepayOption && (
                    <>
                      <OverrideRow
                        label={template.discountLabel}
                        computedCents={computation.computed.discountCents}
                        value={state.discountOverride}
                        overridden={computation.overridden.discount}
                        onChange={v => dispatch({ type: 'set', field: 'discountOverride', value: v })}
                      />
                      <OverrideRow
                        label="Prepay TOTAL DUE"
                        computedCents={computation.computed.prepayTotalCents}
                        value={state.prepayOverride}
                        overridden={computation.overridden.prepayTotal}
                        onChange={v => dispatch({ type: 'set', field: 'prepayOverride', value: v })}
                      />
                    </>
                  )}
                  {template.showInstallmentOption &&
                    computation.computed.installmentsCents.map((cents, i) => (
                      <OverrideRow
                        key={i}
                        label={template.installmentLabels[i] ?? `Installment ${i + 1}`}
                        computedCents={cents}
                        value={state.installmentOverrides[i] ?? ''}
                        overridden={computation.overridden.installments[i]}
                        onChange={v => dispatch({ type: 'setInstallment', index: i, value: v })}
                      />
                    ))}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => dispatch({ type: 'clearAll' })}>
                Clear form
              </Button>
            </div>
          </div>

          <Card className="lg:sticky lg:top-4 self-start">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Print Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <ScaledPreview>{sheet}</ScaledPreview>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the sheet. Same props as the preview — cannot diverge. */}
      {sheet && createPortal(<div className="fof-print-root">{sheet}</div>, document.body)}
    </div>
  );
}
