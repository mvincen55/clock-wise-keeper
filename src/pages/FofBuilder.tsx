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
import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
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
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import { useFofSettings, useFofTemplates } from '@/hooks/useFofTemplates';
import {
  useDeleteProcedureBundle,
  useFeeScheduleItems,
  useFeeSchedules,
  useProcedureBundles,
  useSaveProcedureBundle,
} from '@/hooks/useFeeSchedules';
import { useOrgContext } from '@/hooks/useOrgContext';
import { computeFof } from '@/lib/fof/compute';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import {
  estimateInsurance,
  type FeeCategory,
  type FofLine,
  type PlanRules,
} from '@/lib/fof/insurance';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import { friendlyCdtName } from '@/lib/fof/cdt-names';
import { computeFofDiscounts } from '@/lib/fof/discounts';
import {
  buildVisitSchedule,
  DAY_OF_SERVICE_THRESHOLD_CENTS,
  decideVisitPlan,
  planForCount,
  suggestVisitStage,
  VISIT_PLANS,
  visitSegmentsForCode,
} from '@/lib/fof/visits';
import { DEFAULT_PRACTICE_INFO } from '@/lib/fof/defaults';
import type { Cents, FofAmounts, FofOverrides, FofTemplate } from '@/lib/fof/types';

const NO_SCHEDULE = '__none__';

// Alternate-benefit downgrades: plans commonly pay posterior composites
// at the corresponding amalgam rate (by surface count).
const DOWNGRADE_MAP: Record<string, string> = {
  D2391: 'D2140',
  D2392: 'D2150',
  D2393: 'D2160',
  D2394: 'D2161',
};

// Printed on the form only when a filling actually gets downgraded, so the
// patient sees why the insurance estimate is lower than expected.
const DOWNGRADE_NOTE =
  'Your dental plan applies an "alternate benefit" to tooth-colored (composite) fillings on back teeth: insurance pays as if a silver (amalgam) filling were placed. You still receive the tooth-colored filling; the fee difference is included in your portion.';

// Printed when this treatment plan uses up the patient's annual max, so
// they aren't surprised when later visits aren't covered.
const MAXED_NOTE =
  "This treatment is expected to use the remainder of your dental plan's annual maximum. Until your benefits renew, additional services — including hygiene (cleaning) visits — will be your responsibility.";
const MAXED_NOTE_PREV_EXEMPT =
  "This treatment is expected to use the remainder of your dental plan's annual maximum. Preventive care does not count toward your maximum, so hygiene (cleaning) visits remain covered; other services will be your responsibility until your benefits renew.";

const CATEGORY_SHORT: Record<FeeCategory, string> = {
  preventive: 'Prev',
  basic: 'Basic',
  major: 'Maj',
  other: 'No Cov',
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
  tooth: string;
  visit: string;
  category: FeeCategory;
  feeInput: string;
  allowedInput: string;
  /** '' = downgrade applies (default for D2391–D2394), 'off' = plan pays composite rates. */
  downgrade: string;
}

let lineCounter = 0;
const newLine = (): BuilderLine => ({
  key: `line-${++lineCounter}`,
  code: '',
  description: '',
  tooth: '',
  visit: '',
  category: 'other',
  feeInput: '',
  allowedInput: '',
  downgrade: '',
});

interface BuilderState {
  patientName: string;
  dateISO: string;
  note: string;
  lines: BuilderLine[];
  officeDiscountInput: string;
  patientCreditInput: string;
  deductibleInput: string;
  annualMaxInput: string;
  pctPrev: string;
  pctBasic: string;
  pctMajor: string;
  spans2Years: string; // '' or 'yes' — treatment crosses a benefit-year renewal
  nextMaxInput: string;
  nextDedInput: string;
  afterMaxState: string; // '' or 'yes' — reverts to office fees once maxed out
  prevExemptState: string; // '' or 'yes' — preventive doesn't count toward the max
  paymentCountOverride: string;
  prepayOptionState: string; // '' = follow template, 'on'/'off' = per-form override
  installmentOptionState: string;
  isSenior: string; // '' or 'yes' — patient is 65+; memory only
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
  | { type: 'addLines'; lines: BuilderLine[] }
  | { type: 'removeLine'; index: number }
  | { type: 'setInstallment'; index: number; value: string }
  | { type: 'clearOverrides' }
  | { type: 'clearAll' };

const initialState = (): BuilderState => ({
  patientName: '',
  dateISO: todayISO(),
  note: '',
  lines: [newLine()],
  officeDiscountInput: '',
  patientCreditInput: '',
  deductibleInput: '',
  annualMaxInput: '',
  pctPrev: '100',
  pctBasic: '80',
  pctMajor: '50',
  spans2Years: '',
  nextMaxInput: '$1,500.00',
  nextDedInput: '$50.00',
  afterMaxState: '',
  prevExemptState: '',
  paymentCountOverride: '',
  prepayOptionState: '',
  installmentOptionState: '',
  isSenior: '',
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
    case 'addLines': {
      // Drop fully empty rows before appending a bundle's lines.
      const existing = state.lines.filter(
        l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== ''
      );
      return { ...state, lines: [...existing, ...action.lines] };
    }
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

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [feeScheduleId, setFeeScheduleId] = useState<string>(NO_SCHEDULE);
  // Table-of-allowance plans: a second schedule holding the set dollar
  // amounts the plan pays per code (patient owes the difference).
  const [payScheduleId, setPayScheduleId] = useState<string>(NO_SCHEDULE);
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [bundleName, setBundleName] = useState('');

  const { data: bundles } = useProcedureBundles();
  const saveBundle = useSaveProcedureBundle();
  const deleteBundle = useDeleteProcedureBundle();
  const { data: orgCtx } = useOrgContext();
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  const activeTemplates = useMemo(
    () => (templates ?? []).filter(t => t.isActive),
    [templates]
  );
  const template: FofTemplate | undefined =
    activeTemplates.find(t => t.id === templateId) ?? activeTemplates[0];

  const officeSchedule = (schedules ?? []).find(s => s.kind === 'office');
  const { data: officeItems } = useFeeScheduleItems(officeSchedule?.id ?? null);

  const insuranceEnabled = !!template?.showInsuranceEstimate;
  const insuranceActive = insuranceEnabled && feeScheduleId !== NO_SCHEDULE;
  const { data: carrierItems } = useFeeScheduleItems(
    insuranceActive ? feeScheduleId : null
  );
  const payActive = insuranceActive && payScheduleId !== NO_SCHEDULE;
  const { data: payItems } = useFeeScheduleItems(payActive ? payScheduleId : null);

  const officeByCode = useMemo(() => {
    const map = new Map<
      string,
      { code: string; description: string; feeCents: Cents; category: FeeCategory }
    >();
    for (const item of officeItems ?? []) {
      map.set(item.code.toUpperCase(), {
        code: item.code,
        description: item.description,
        feeCents: item.feeCents,
        category: item.category,
      });
    }
    return map;
  }, [officeItems]);

  const allowedByCode = useMemo(() => {
    const map = new Map<string, Cents>();
    for (const item of carrierItems ?? []) map.set(item.code.toUpperCase(), item.feeCents);
    return map;
  }, [carrierItems]);

  const payByCode = useMemo(() => {
    const map = new Map<string, Cents>();
    for (const item of payItems ?? []) map.set(item.code.toUpperCase(), item.feeCents);
    return map;
  }, [payItems]);

  const handleCodeChange = (index: number, rawCode: string) => {
    // Exact code match (case-insensitive) fills the line; anything else is
    // kept as typed so it can drive the description search below the row.
    const match = officeByCode.get(rawCode.trim().toUpperCase());
    dispatch({
      type: 'setLine',
      index,
      patch: match
        ? {
            code: match.code,
            description: match.description,
            feeInput: formatCents(match.feeCents),
            category: match.category,
          }
        : { code: rawCode, category: categorizeCdtCode(rawCode.trim().toUpperCase()) },
    });
  };

  // Code box doubles as a search box: match by code prefix or by words in
  // the description ("crown" → D2740…). Hidden once an exact code is set.
  const codeSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || officeByCode.has(query.trim().toUpperCase())) return [];
    const items = officeItems ?? [];
    const byCode = items.filter(it => it.code.toLowerCase().startsWith(q));
    const byDesc = items.filter(
      it => !it.code.toLowerCase().startsWith(q) && it.description.toLowerCase().includes(q)
    );
    return [...byCode, ...byDesc].slice(0, 6);
  };

  // Template choice drives the agreement toggles: switching templates
  // clears any per-form override so e.g. Out-of-Network and Self-Pay
  // always come up with Prepay in Full on, In-Network with it off.
  const handleTemplateChange = (nextTemplateId: string) => {
    setTemplateId(nextTemplateId);
    dispatch({ type: 'set', field: 'prepayOptionState', value: '' });
    dispatch({ type: 'set', field: 'installmentOptionState', value: '' });
    dispatch({ type: 'set', field: 'paymentCountOverride', value: '' });
  };

  const lineFromCode = (rawCode: string): BuilderLine => {
    const match = officeByCode.get(rawCode.trim().toUpperCase());
    return {
      ...newLine(),
      code: match?.code ?? rawCode.toUpperCase(),
      description: match?.description ?? '',
      feeInput: match ? formatCents(match.feeCents) : '',
      category: match?.category ?? categorizeCdtCode(rawCode.toUpperCase()),
    };
  };

  const insertBundle = (bundleId: string) => {
    const bundle = (bundles ?? []).find(b => b.id === bundleId);
    if (!bundle) return;
    dispatch({ type: 'addLines', lines: bundle.codes.map(lineFromCode) });
  };

  const handleSaveBundle = () => {
    const codes = state.lines.map(l => l.code.trim()).filter(Boolean);
    saveBundle.mutate(
      { name: bundleName.trim(), codes },
      {
        onSuccess: () => {
          // De-identified: a bundle stores only the code list and name.
          toast.success(`Bundle "${bundleName.trim()}" saved (${codes.length} codes)`);
          setBundleDialogOpen(false);
          setBundleName('');
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  const handleScheduleChange = (nextId: string) => {
    setFeeScheduleId(nextId);
    if (nextId === NO_SCHEDULE || nextId === payScheduleId) setPayScheduleId(NO_SCHEDULE);
    if (nextId !== NO_SCHEDULE) {
      if (state.deductibleInput.trim() === '') {
        dispatch({ type: 'set', field: 'deductibleInput', value: '$50.00' });
      }
      if (state.annualMaxInput.trim() === '') {
        dispatch({ type: 'set', field: 'annualMaxInput', value: '$1,500.00' });
      }
    }
  };

  const feeLines: FofLine[] = useMemo(
    () =>
      state.lines
        .filter(l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '')
        .map(l => {
          const code = l.code.trim().toUpperCase();
          // Downgrades are decided per line (default on for D2391–D2394).
          const downgradeCode = l.downgrade !== 'off' ? DOWNGRADE_MAP[code] : undefined;
          return {
            code,
            description: l.description.trim(),
            category: l.category,
            officeFeeCents: parseCurrencyInput(l.feeInput) ?? 0,
            allowedCents: l.allowedInput.trim()
              ? parseCurrencyInput(l.allowedInput)
              : allowedByCode.get(code) ?? null,
            benefitBasisCents: downgradeCode ? allowedByCode.get(downgradeCode) ?? null : null,
            // Table-of-allowance plan: the set payment for the code (the
            // amalgam entry when downgraded); missing entry = not covered.
            fixedPayCents: payActive
              ? (downgradeCode ? payByCode.get(downgradeCode) : undefined) ??
                payByCode.get(code) ??
                0
              : null,
          };
        }),
    [state.lines, allowedByCode, payActive, payByCode]
  );

  const clampPct = (value: string, fallback: number) => {
    const n = parseInt(value, 10);
    return isNaN(n) ? fallback : Math.min(100, Math.max(0, n));
  };
  // Per-form insurance settings: coverage %s and benefits are typed in
  // directly (no plan configs). Write-offs are automatic — they apply
  // when the selected carrier schedule is marked in network (on the Fee
  // Schedules page) or the template itself is the In-Network one; only
  // contracted plans take write-offs.
  const selectedSchedule = (schedules ?? []).find(s => s.id === feeScheduleId);
  const writeoffsApplied =
    insuranceActive && ((selectedSchedule?.isInNetwork ?? false) || (template?.showWriteOff ?? false));
  const planRules: PlanRules | null = insuranceActive
    ? {
        preventivePct: clampPct(state.pctPrev, 100),
        basicPct: clampPct(state.pctBasic, 80),
        majorPct: clampPct(state.pctMajor, 50),
        deductibleWaivedPreventive: true,
        writeoffApplies: writeoffsApplied,
        officeFeesAfterMax: state.afterMaxState === 'yes',
        preventiveExemptFromMax: state.prevExemptState === 'yes',
      }
    : null;

  // Payment plan follows the treatment (front-loaded for implants and
  // dentures so the balance never runs behind the work), with visit
  // wording matched to the procedures; staff can force a payment count.
  const treatmentVisitPlan = useMemo(
    () => decideVisitPlan(feeLines.map(l => l.code)),
    [feeLines]
  );
  const overrideCount = parseInt(state.paymentCountOverride, 10);

  const estimate = useMemo(
    () =>
      estimateInsurance(feeLines, planRules, {
        remainingDeductibleCents: parseCurrencyInput(state.deductibleInput) ?? 0,
        remainingAnnualMaxCents: parseCurrencyInput(state.annualMaxInput) ?? 0,
        renewal:
          state.spans2Years === 'yes'
            ? {
                annualMaxCents: parseCurrencyInput(state.nextMaxInput) ?? 0,
                deductibleCents: parseCurrencyInput(state.nextDedInput) ?? 0,
              }
            : null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feeLines, planRules, state.deductibleInput, state.annualMaxInput, state.spans2Years, state.nextMaxInput, state.nextDedInput]
  );

  const isSenior = state.isSenior === 'yes';

  // Discount rules (membership/senior) key off the portion BEFORE any
  // rule-derived discount: total − manual discounts/credit − insurance.
  const portionBeforeAutoDiscount = useMemo(() => {
    if (!template) return 0;
    const insurance = template.showInsuranceEstimate
      ? parseOverride(state.insuranceOverride) ?? estimate.insurancePaysCents
      : 0;
    const writeOff = template.showWriteOff
      ? parseOverride(state.writeOffOverride) ?? estimate.writeOffCents
      : 0;
    return Math.max(
      0,
      estimate.totalCents -
        (parseCurrencyInput(state.officeDiscountInput) ?? 0) -
        (parseCurrencyInput(state.patientCreditInput) ?? 0) -
        insurance -
        writeOff
    );
  }, [template, estimate, state.insuranceOverride, state.writeOffOverride, state.officeDiscountInput, state.patientCreditInput]);

  const discounts = useMemo(
    () => (template ? computeFofDiscounts(template, isSenior, portionBeforeAutoDiscount) : null),
    [template, isSenior, portionBeforeAutoDiscount]
  );

  // Portions under $1,000 default to a single "Due at Time of Service"
  // payment — no installment schedule needed. The payment-count selector
  // overrides for patients who need a real schedule anyway.
  const projectedPortion = Math.max(
    0,
    portionBeforeAutoDiscount - (discounts?.autoDiscount?.cents ?? 0)
  );
  // Per-visit schedule from the actual treatment plan: each line's Visit #
  // (typed, or auto-suggested from the code) groups work into visits; the
  // portion is allocated by each visit's fees, paid "half a visit ahead".
  const visitWork = useMemo(() => {
    const active = state.lines.filter(
      l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== ''
    );
    if (active.length === 0) return null;
    // A typed Visit # pins the whole line to that visit; otherwise the
    // code's segments spread the fee across its clinical visits (crowns
    // split half to Prep, half to Delivery, etc.).
    const entries: { raw: number; feeCents: number; label: string }[] = [];
    for (const l of active) {
      const fee = parseCurrencyInput(l.feeInput) ?? 0;
      const lineLabel = friendlyCdtName(l.code) || l.description.trim();
      const typed = parseInt(l.visit, 10);
      if (typed >= 1) {
        entries.push({ raw: typed, feeCents: fee, label: lineLabel });
        continue;
      }
      const segments = visitSegmentsForCode(l.code);
      let remaining = fee;
      segments.forEach((segment, i) => {
        const part = i === segments.length - 1 ? remaining : Math.round(fee * segment.share);
        remaining -= part;
        entries.push({ raw: segment.stage, feeCents: part, label: segment.label || lineLabel });
      });
    }
    const distinct = [...new Set(entries.map(e => e.raw))].sort((a, b) => a - b);
    return distinct.map(v => {
      const group = entries.filter(e => e.raw === v);
      const top = group.reduce((best, e) => (e.feeCents > best.feeCents ? e : best), group[0]);
      return { label: top.label, feeCents: group.reduce((sum, e) => sum + e.feeCents, 0) };
    });
  }, [state.lines]);

  const schedulePortion = parseOverride(state.portionOverride) ?? projectedPortion;
  const scheduleFromVisits = visitWork ? buildVisitSchedule(schedulePortion, visitWork) : null;

  const autoVisitPlan =
    projectedPortion > 0 && projectedPortion < DAY_OF_SERVICE_THRESHOLD_CENTS
      ? VISIT_PLANS.dayOfService
      : scheduleFromVisits ?? treatmentVisitPlan;
  const visitPlan =
    overrideCount >= 1 && overrideCount <= 4 ? planForCount(overrideCount) : autoVisitPlan;

  // The TEMPLATE decides which agreements are offered (the In-Network
  // template ships with prepay off); the plan's network flag only affects
  // write-off math. Staff can toggle either agreement per form.
  const prepayShown =
    state.prepayOptionState === ''
      ? template?.showPrepayOption ?? false
      : state.prepayOptionState === 'on';
  const installmentShown =
    state.installmentOptionState === ''
      ? template?.showInstallmentOption ?? false
      : state.installmentOptionState === 'on';
  // The downgrade note prints only when it changed the math: an insurance
  // estimate is active and some line's benefit basis is below its allowed.
  const downgradeApplied =
    insuranceActive &&
    feeLines.some(
      l => l.benefitBasisCents != null && l.benefitBasisCents < (l.allowedCents ?? l.officeFeeCents)
    );
  // Maxed-out warning: this plan of treatment spends the rest of the
  // patient's annual max — tell them on the form (hygiene stays covered
  // when preventive is marked as not counting toward the max).
  const maxedOut = insuranceActive && estimate.maxedOut && state.annualMaxInput.trim() !== '';
  const extraFootnotes: string[] = [];
  if (downgradeApplied) extraFootnotes.push(DOWNGRADE_NOTE);
  if (maxedOut) {
    extraFootnotes.push(state.prevExemptState === 'yes' ? MAXED_NOTE_PREV_EXEMPT : MAXED_NOTE);
  }
  const effectiveTemplate: FofTemplate | undefined = template
    ? {
        ...template,
        showPrepayOption: prepayShown,
        showInstallmentOption: installmentShown,
        showWriteOff: writeoffsApplied,
        footnotes: extraFootnotes.length
          ? [...template.footnotes, ...extraFootnotes]
          : template.footnotes,
        // Discount rules decide the prepay percentage (template default,
        // senior-suppressed, or membership +5%).
        discountPercent: discounts?.prepayDiscountPercent ?? template.discountPercent,
        discountLabel: discounts?.prepayDiscountLabel ?? template.discountLabel,
      }
    : undefined;

  const amounts: FofAmounts = useMemo(
    () => ({
      totalCents: estimate.totalCents,
      insuranceEstimateCents: parseOverride(state.insuranceOverride) ?? estimate.insurancePaysCents,
      writeOffCents: parseOverride(state.writeOffOverride) ?? estimate.writeOffCents,
      officeDiscountCents: parseCurrencyInput(state.officeDiscountInput),
      patientCreditCents: parseCurrencyInput(state.patientCreditInput),
      autoDiscount: discounts?.autoDiscount ?? null,
      prepayDiscountBaseCents:
        discounts?.prepayDiscountBase === 'preDiscountTotal' ? portionBeforeAutoDiscount : null,
    }),
    [estimate, state.insuranceOverride, state.writeOffOverride, state.officeDiscountInput, state.patientCreditInput, discounts, portionBeforeAutoDiscount]
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
    () => (effectiveTemplate ? computeFof(effectiveTemplate, amounts, overrides, visitPlan) : null),
    [effectiveTemplate, amounts, overrides, visitPlan]
  );

  // The printout shows one patient-friendly treatment line (like the
  // office's existing forms), not the itemized code/fee list. It writes
  // itself from the procedures using plain-English CDT names and tooth
  // numbers; typing in the field takes over.
  const autoTreatment = useMemo(() => {
    const groups: { label: string; teeth: string[] }[] = [];
    for (const l of state.lines) {
      const code = l.code.trim();
      if (!code && !l.description.trim() && !l.feeInput.trim()) continue;
      // No friendly name and no description = intentionally unnamed —
      // omit from the printed line rather than exposing a raw code.
      const label = friendlyCdtName(code) || l.description.trim();
      if (!label) continue;
      let group = groups.find(g => g.label === label);
      if (!group) {
        group = { label, teeth: [] };
        groups.push(group);
      }
      const tooth = l.tooth.trim();
      if (tooth && !group.teeth.includes(tooth)) group.teeth.push(tooth);
    }
    return groups
      .map(g => (g.teeth.length ? `${g.label} ${g.teeth.map(t => `#${t}`).join(', ')}` : g.label))
      .join(', ');
  }, [state.lines]);
  const printedTreatment = state.note.trim() !== '' ? state.note : autoTreatment;

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

  const sheet = effectiveTemplate && computation && (
    <FofPrintSheet
      practice={practice ?? DEFAULT_PRACTICE_INFO}
      template={effectiveTemplate}
      patient={{ patientName: state.patientName, dateISO: state.dateISO, treatment: printedTreatment }}
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
                <Select value={template.id} onValueChange={handleTemplateChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="opt-prepay"
                      checked={prepayShown}
                      onCheckedChange={v =>
                        dispatch({ type: 'set', field: 'prepayOptionState', value: v ? 'on' : 'off' })
                      }
                    />
                    <Label htmlFor="opt-prepay">Prepay in Full option</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="opt-installment"
                      checked={installmentShown}
                      onCheckedChange={v =>
                        dispatch({ type: 'set', field: 'installmentOptionState', value: v ? 'on' : 'off' })
                      }
                    />
                    <Label htmlFor="opt-installment">Payment Installment option</Label>
                  </div>
                  {template.seniorDiscountApplies && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="opt-senior"
                        checked={isSenior}
                        onCheckedChange={v =>
                          dispatch({ type: 'set', field: 'isSenior', value: v ? 'yes' : '' })
                        }
                      />
                      <Label htmlFor="opt-senior">Patient is 65+</Label>
                    </div>
                  )}
                </div>
                {discounts?.autoDiscount && (
                  <p className="text-xs text-muted-foreground">
                    {discounts.autoDiscount.label} applies automatically — no prepay required.
                  </p>
                )}
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
                <div className="hidden sm:grid grid-cols-[4.6rem_1fr_2.9rem_2.9rem_4.5rem_5rem_5rem_2rem] gap-1.5 text-xs text-muted-foreground px-1">
                  <span>Code</span>
                  <span>Description</span>
                  <span>Tooth</span>
                  <span>Visit</span>
                  <span>Category</span>
                  <span className="text-right">Office Fee</span>
                  {insuranceEnabled ? <span className="text-right">Allowed</span> : <span />}
                  <span />
                </div>
                {state.lines.map((line, i) => {
                  const lineCode = line.code.trim().toUpperCase();
                  const autoAllowed = allowedByCode.get(lineCode);
                  const downgradeTo = DOWNGRADE_MAP[lineCode];
                  const suggestions = codeSuggestions(line.code);
                  return (
                    <Fragment key={line.key}>
                    <div className="grid sm:grid-cols-[4.6rem_1fr_2.9rem_2.9rem_4.5rem_5rem_5rem_2rem] grid-cols-2 gap-1.5 items-center">
                      <Input
                        placeholder="D2740 / crown"
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
                      <Input
                        placeholder="#"
                        autoComplete="off"
                        className="text-center"
                        value={line.tooth}
                        onChange={e => dispatch({ type: 'setLine', index: i, patch: { tooth: e.target.value } })}
                      />
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        className="text-center"
                        placeholder={
                          visitSegmentsForCode(line.code).length > 1
                            ? 'auto'
                            : String(suggestVisitStage(line.code))
                        }
                        value={line.visit}
                        onChange={e => dispatch({ type: 'setLine', index: i, patch: { visit: e.target.value } })}
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
                          placeholder={
                            line.category === 'other'
                              ? 'office fee'
                              : autoAllowed !== undefined
                                ? formatCents(autoAllowed)
                                : 'auto'
                          }
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
                    {suggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-1">
                        {suggestions.map(it => (
                          <Button
                            key={it.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs font-normal"
                            onClick={() => handleCodeChange(i, it.code)}
                          >
                            <span className="font-mono mr-1.5">{it.code}</span>
                            <span className="max-w-[16rem] truncate">{it.description}</span>
                          </Button>
                        ))}
                      </div>
                    )}
                    {insuranceActive && downgradeTo && (
                      <div className="flex items-center gap-2 pl-1">
                        <Switch
                          id={`fof-dg-${line.key}`}
                          checked={line.downgrade !== 'off'}
                          onCheckedChange={v =>
                            dispatch({ type: 'setLine', index: i, patch: { downgrade: v ? '' : 'off' } })
                          }
                        />
                        <Label
                          htmlFor={`fof-dg-${line.key}`}
                          className="text-xs text-muted-foreground font-normal"
                        >
                          Downgrades to amalgam benefit ({downgradeTo}) — turn off if this plan
                          pays composite rates
                        </Label>
                      </div>
                    )}
                    </Fragment>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'addLine' })}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Procedure
                  </Button>
                  {(bundles ?? []).length > 0 && (
                    <Select value="" onValueChange={insertBundle}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue placeholder="Insert bundle…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(bundles ?? []).map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name} ({b.codes.length})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {isManager && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={feeLines.length === 0}
                      onClick={() => setBundleDialogOpen(true)}
                    >
                      Save as Bundle
                    </Button>
                  )}
                  <span className="text-sm font-medium ml-auto">
                    Total: {formatCents(estimate.totalCents)}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="fof-office-discount">Office Discount (optional)</Label>
                    <Input
                      id="fof-office-discount"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="$0.00"
                      value={state.officeDiscountInput}
                      onChange={setField('officeDiscountInput')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fof-credit">Patient Current Credit (optional)</Label>
                    <Input
                      id="fof-credit"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="$0.00"
                      value={state.patientCreditInput}
                      onChange={setField('patientCreditInput')}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  These print under the Total only when an amount is entered, and reduce
                  the Patient's Portion.
                </p>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="fof-note">Treatment description (prints on the form)</Label>
                  <Textarea
                    id="fof-note"
                    autoComplete="off"
                    rows={2}
                    placeholder={autoTreatment || 'Auto-fills from the procedures above'}
                    value={state.note}
                    onChange={setField('note')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use the auto-written description; type to reword it
                    patient-friendly (add tooth numbers, etc.). Individual codes and fees
                    never print — only this line and the totals.
                  </p>
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
                    <Label>Carrier Fee Schedule</Label>
                    <Select value={feeScheduleId} onValueChange={handleScheduleChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SCHEDULE}>None — enter amounts manually</SelectItem>
                        {(schedules ?? []).filter(sch => sch.kind === 'carrier' && sch.isActive).map(sch => (
                          <SelectItem key={sch.id} value={sch.id}>{sch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {insuranceActive && (
                    <>
                      <div className="space-y-1.5">
                        <Label>Plan Payment Schedule (fee-schedule plans — optional)</Label>
                        <Select value={payScheduleId} onValueChange={setPayScheduleId}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_SCHEDULE}>
                              None — plan pays category percentages
                            </SelectItem>
                            {(schedules ?? [])
                              .filter(sch => sch.kind === 'carrier' && sch.isActive && sch.id !== feeScheduleId)
                              .map(sch => (
                                <SelectItem key={sch.id} value={sch.id}>{sch.name}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          For plans that pay a set dollar amount per code (some DD plans):
                          import the payment amounts as their own fee schedule and pick it
                          here. The patient owes the difference up to the carrier fee.
                        </p>
                      </div>
                      {!payActive && (
                        <div className="grid gap-3 grid-cols-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="fof-pct-prev">Preventive %</Label>
                            <Input
                              id="fof-pct-prev"
                              inputMode="numeric"
                              autoComplete="off"
                              value={state.pctPrev}
                              onChange={setField('pctPrev')}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="fof-pct-basic">Basic %</Label>
                            <Input
                              id="fof-pct-basic"
                              inputMode="numeric"
                              autoComplete="off"
                              value={state.pctBasic}
                              onChange={setField('pctBasic')}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="fof-pct-major">Major %</Label>
                            <Input
                              id="fof-pct-major"
                              inputMode="numeric"
                              autoComplete="off"
                              value={state.pctMajor}
                              onChange={setField('pctMajor')}
                            />
                          </div>
                        </div>
                      )}
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
                      <div className="flex items-center gap-2">
                        <Switch
                          id="fof-spans2"
                          checked={state.spans2Years === 'yes'}
                          onCheckedChange={v =>
                            dispatch({ type: 'set', field: 'spans2Years', value: v ? 'yes' : '' })
                          }
                        />
                        <Label htmlFor="fof-spans2">
                          Treatment spans 2 benefit years (plan renews mid-treatment)
                        </Label>
                      </div>
                      {state.spans2Years === 'yes' && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="fof-next-max">Next Year's Annual Max</Label>
                            <Input
                              id="fof-next-max"
                              inputMode="decimal"
                              autoComplete="off"
                              value={state.nextMaxInput}
                              onChange={setField('nextMaxInput')}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="fof-next-ded">Next Year's Deductible</Label>
                            <Input
                              id="fof-next-ded"
                              inputMode="decimal"
                              autoComplete="off"
                              value={state.nextDedInput}
                              onChange={setField('nextDedInput')}
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Switch
                          id="fof-aftermax"
                          checked={state.afterMaxState === 'yes'}
                          onCheckedChange={v =>
                            dispatch({ type: 'set', field: 'afterMaxState', value: v ? 'yes' : '' })
                          }
                        />
                        <Label htmlFor="fof-aftermax">
                          Reverts to office fees when maxed out (e.g. Altus, some DD plans)
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="fof-prev-exempt"
                          checked={state.prevExemptState === 'yes'}
                          onCheckedChange={v =>
                            dispatch({ type: 'set', field: 'prevExemptState', value: v ? 'yes' : '' })
                          }
                        />
                        <Label htmlFor="fof-prev-exempt">
                          Preventive doesn't count toward the annual max
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Write-offs {writeoffsApplied ? 'apply on this form' : "don't apply on this form"} —
                        they follow the carrier's "In network" marker on the Fee Schedules page.
                        Allowed fees auto-fill from the selected schedule; type in the Allowed
                        column to override a line. If this treatment maxes the patient out, the
                        form automatically explains that later visits (including hygiene) are out
                        of pocket. None of these patient numbers are saved.
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
                  {effectiveTemplate!.showPrepayOption && (
                    <>
                      {(effectiveTemplate!.discountPercent > 0 ||
                        effectiveTemplate!.discountLabel.trim() !== '') && (
                        <OverrideRow
                          label={effectiveTemplate!.discountLabel || 'Discount'}
                          computedCents={computation.computed.discountCents}
                          value={state.discountOverride}
                          overridden={computation.overridden.discount}
                          onChange={v => dispatch({ type: 'set', field: 'discountOverride', value: v })}
                        />
                      )}
                      <OverrideRow
                        label="Prepay TOTAL DUE"
                        computedCents={computation.computed.prepayTotalCents}
                        value={state.prepayOverride}
                        overridden={computation.overridden.prepayTotal}
                        onChange={v => dispatch({ type: 'set', field: 'prepayOverride', value: v })}
                      />
                    </>
                  )}
                  {effectiveTemplate!.showInstallmentOption && (
                    <>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="flex-1 text-sm font-medium">Payment plan</span>
                        <Select
                          value={state.paymentCountOverride || 'auto'}
                          onValueChange={v =>
                            dispatch({
                              type: 'set',
                              field: 'paymentCountOverride',
                              value: v === 'auto' ? '' : v,
                            })
                          }
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              Auto — {autoVisitPlan.labels.length} payment{autoVisitPlan.labels.length === 1 ? '' : 's'}
                            </SelectItem>
                            {[1, 2, 3, 4].map(n => (
                              <SelectItem key={n} value={String(n)}>
                                {n} payment{n === 1 ? '' : 's'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {computation.computed.installmentsCents.map((cents, i) => (
                        <OverrideRow
                          key={i}
                          label={computation.installmentLabels[i] ?? `Installment ${i + 1}`}
                          computedCents={cents}
                          value={state.installmentOverrides[i] ?? ''}
                          overridden={computation.overridden.installments[i]}
                          onChange={v => dispatch({ type: 'setInstallment', index: i, value: v })}
                        />
                      ))}
                    </>
                  )}
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

      <Dialog open={bundleDialogOpen} onOpenChange={open => !open && setBundleDialogOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Procedure Bundle</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bundle-name">Bundle Name</Label>
              <Input
                id="bundle-name"
                placeholder="e.g. Implant, Denture, Crown"
                value={bundleName}
                onChange={e => setBundleName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Saves the current procedure codes ({feeLines.length}) — fees always pull
                current schedule prices when the bundle is inserted later. No patient
                information is stored.
              </p>
            </div>
            {(bundles ?? []).length > 0 && (
              <div className="space-y-1">
                <Label>Existing Bundles</Label>
                {(bundles ?? []).map(b => (
                  <div key={b.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">{b.name} ({b.codes.join(', ')})</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() =>
                        deleteBundle.mutate(b.id, { onError: err => toast.error(err.message) })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBundleDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={bundleName.trim() === '' || saveBundle.isPending}
              onClick={handleSaveBundle}
            >
              {saveBundle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the sheet. Same props as the preview — cannot diverge. */}
      {sheet && createPortal(<div className="fof-print-root">{sheet}</div>, document.body)}
    </div>
  );
}
