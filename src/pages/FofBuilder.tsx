/**
 * Financial Options Form builder.
 *
 * HIPAA BOUNDARY — READ BEFORE EDITING:
 * Patient-entered data on this page (name, date, treatment, dollar amounts)
 * exists ONLY in component memory and goes straight to the printer. It must
 * never be sent to Supabase, written to localStorage/sessionStorage, placed
 * in the URL, logged, toasted, or passed to analytics/audit calls. Only
 * de-identified template configuration may touch the network. Keep it that
 * way — the practice has no BAA covering patient data in this app.
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
import { Loader2, Printer, RotateCcw, Settings2, ShieldCheck } from 'lucide-react';
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import { useFofSettings, useFofTemplates } from '@/hooks/useFofTemplates';
import { computeFof } from '@/lib/fof/compute';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import { DEFAULT_PRACTICE_INFO } from '@/lib/fof/defaults';
import type { Cents, FofAmounts, FofOverrides, FofTemplate } from '@/lib/fof/types';

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface BuilderState {
  patientName: string;
  dateISO: string;
  treatment: string;
  totalInput: string;
  insuranceInput: string;
  writeOffInput: string;
  portionOverride: string;
  discountOverride: string;
  prepayOverride: string;
  installmentOverrides: string[];
}

type BuilderAction =
  | { type: 'set'; field: keyof Omit<BuilderState, 'installmentOverrides'>; value: string }
  | { type: 'setInstallment'; index: number; value: string }
  | { type: 'clearOverrides' }
  | { type: 'clearAll' };

const initialState: BuilderState = {
  patientName: '',
  dateISO: todayISO(),
  treatment: '',
  totalInput: '',
  insuranceInput: '',
  writeOffInput: '',
  portionOverride: '',
  discountOverride: '',
  prepayOverride: '',
  installmentOverrides: [],
};

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'setInstallment': {
      const next = [...state.installmentOverrides];
      next[action.index] = action.value;
      return { ...state, installmentOverrides: next };
    }
    case 'clearOverrides':
      return {
        ...state,
        portionOverride: '',
        discountOverride: '',
        prepayOverride: '',
        installmentOverrides: [],
      };
    case 'clearAll':
      return { ...initialState, dateISO: todayISO() };
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
  const [state, dispatch] = useReducer(reducer, initialState);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const activeTemplates = useMemo(
    () => (templates ?? []).filter(t => t.isActive),
    [templates]
  );
  const template: FofTemplate | undefined =
    activeTemplates.find(t => t.id === templateId) ?? activeTemplates[0];

  const amounts: FofAmounts = useMemo(
    () => ({
      totalCents: parseCurrencyInput(state.totalInput),
      insuranceEstimateCents: parseCurrencyInput(state.insuranceInput),
      writeOffCents: parseCurrencyInput(state.writeOffInput),
    }),
    [state.totalInput, state.insuranceInput, state.writeOffInput]
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

  const isDirty =
    state.patientName.trim() !== '' ||
    state.treatment.trim() !== '' ||
    state.totalInput.trim() !== '';

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const setField = (field: keyof Omit<BuilderState, 'installmentOverrides'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      dispatch({ type: 'set', field, value: e.target.value });

  const sheet = template && computation && (
    <FofPrintSheet
      practice={practice ?? DEFAULT_PRACTICE_INFO}
      template={template}
      patient={{ patientName: state.patientName, dateISO: state.dateISO, treatment: state.treatment }}
      amounts={amounts}
      computation={computation}
    />
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Financial Options Form</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/fof/templates">
              <Settings2 className="h-4 w-4 mr-2" />
              Manage Templates
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
                <CardTitle className="text-base">Template</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Patient Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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
                <div className="space-y-1.5">
                  <Label htmlFor="fof-treatment">Treatment</Label>
                  <Textarea
                    id="fof-treatment"
                    autoComplete="off"
                    rows={2}
                    placeholder="e.g. Crown/Core Buildup 6,10,11 Bridge 7-9"
                    value={state.treatment}
                    onChange={setField('treatment')}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fof-total">Total (Estimated) Cost</Label>
                    <Input
                      id="fof-total"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="$0.00"
                      value={state.totalInput}
                      onChange={setField('totalInput')}
                    />
                  </div>
                  {template.showInsuranceEstimate && (
                    <div className="space-y-1.5">
                      <Label htmlFor="fof-ins">Est. Insurance Payment</Label>
                      <Input
                        id="fof-ins"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="$0.00"
                        value={state.insuranceInput}
                        onChange={setField('insuranceInput')}
                      />
                    </div>
                  )}
                  {template.showWriteOff && (
                    <div className="space-y-1.5">
                      <Label htmlFor="fof-writeoff">Est. Insurance Write-Off</Label>
                      <Input
                        id="fof-writeoff"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="$0.00"
                        value={state.writeOffInput}
                        onChange={setField('writeOffInput')}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

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
