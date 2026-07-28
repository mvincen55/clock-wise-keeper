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
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  ChevronDown,
  ChevronUp,
  DollarSign,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import FofAssistantWidget from '@/components/fof/FofAssistantWidget';
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
import { resolveImportedFee } from '@/lib/fof/import-fee';
import {
  estimateInsurance,
  type FeeCategory,
  type FofLine,
  type PlanRules,
} from '@/lib/fof/insurance';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import { friendlyCdtName } from '@/lib/fof/cdt-names';
import { computeFofDiscounts } from '@/lib/fof/discounts';
import { buildNameVisitsPayload, safeProcedureLabel } from '@/lib/fof/ai';
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
import BrandPrintStyle from '@/components/BrandPrintStyle';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import type { Cents, FofAmounts, FofOverrides, FofTemplate } from '@/lib/fof/types';

const NO_SCHEDULE = '__none__';
// OON carriers the office has no fee schedule for: the full insurance
// estimate still runs, with allowable fees defaulting to office fees and
// every amount typed/overridable per line.
const MANUAL_SCHEDULE = '__manual__';

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
  'Your dental plan applies an "alternate benefit" to tooth-colored (composite) fillings on back teeth: insurance pays as if a silver (amalgam) filling were placed. You still receive the tooth-colored filling; the difference up to our standard fee is included in your portion.';

// Printed when this treatment plan uses up the patient's annual max, so
// they aren't surprised when later visits aren't covered.
const MAXED_NOTE =
  "This treatment is expected to use the remainder of your dental plan's annual maximum. Until your benefits renew, additional services — including hygiene (cleaning) visits — will be your responsibility.";
const MAXED_NOTE_PREV_EXEMPT =
  "This treatment is expected to use the remainder of your dental plan's annual maximum. Preventive care does not count toward your maximum, so hygiene (cleaning) visits remain covered; other services will be your responsibility until your benefits renew.";

// Printed when part of the insurance estimate is paid from NEXT year's
// benefits (treatment continues past the benefit-year renewal).
const RENEWAL_NOTE =
  "Because this treatment continues into your next insurance benefit year, part of the estimate is paid from next year's renewed benefits: your annual maximum starts over for the visits after renewal, and your deductible applies again. If your coverage changes at renewal, this estimate may change as well.";

// Fees billed AT their visit with no half-ahead prepay in the installment
// schedule — per office policy the surgical guide isn't prepaid.
const NO_PREPAY_CODES = new Set(['D5982']);

// Doctors the treatment wording can be attributed to.
const FOF_DOCTORS = ['Dr. Scott', 'Dr. Jennie', 'Dr. Robert', 'Dr. Nicole', 'Dr. Natalie'];
/** Dropdown option when treatment isn't tied to one doctor — the AI
 * writes in the practice's collective voice ("We'll…") instead. */
const FOF_NO_DOCTOR = 'No specific doctor';

// Procedures the Illumitrac membership plans include at no charge (per the
// office Policy Handbook / 2025 flyer): cleanings (adult/child/perio),
// exams, emergency exam, needed X-rays (CBCT D0367 excluded), fluoride and
// sealants (child plan). Per-line toggle covers used-up yearly allowances.
const ILLUMITRAC_INCLUDED = new Set([
  'D0120', 'D0140', 'D0150', // exams + emergency exam
  'D0210', 'D0220', 'D0230', 'D0272', 'D0274', 'D0330', // X-rays (no CBCT)
  'D1110', 'D1120', 'D4910', // cleanings incl. perio maintenance
  'D1206', 'D1208', 'D1351', // fluoride + sealant (child plan)
]);

const CATEGORY_SHORT: Record<FeeCategory, string> = {
  preventive: 'Preventive',
  basic: 'Basic',
  major: 'Major',
  workup: 'Work Up',
  other: 'No Coverage',
};

/**
 * Coverage bucket and Work Up are separate ideas: the DB/auto-categorizer
 * may say 'workup', which the builder splits into No Coverage + the
 * per-line Work Up flag (billed at its visit).
 */
function resolveCategory(cat: FeeCategory): { category: FeeCategory; workupFlag: string } {
  return cat === 'workup' ? { category: 'other', workupFlag: 'yes' } : { category: cat, workupFlag: '' };
}

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
  /** Per-line insurance payment override; '' = computed automatically. */
  insPayInput: string;
  /** '' = membership-included codes are free, 'off' = charge (allowance used). */
  membershipFree: string;
  /** 'yes' = work-up procedure: billed at its visit, never prepaid. */
  workupFlag: string;
  /** PMS entry date from an imported screenshot; office-copy page only. */
  entryDate: string;
  /** Warning when an imported fee differs from the fees on file. */
  feeFlag: string;
  /**
   * '' = plan pays composite rates (the default — most plans don't
   * downgrade), 'yes' = alternate-benefit downgrade applies (e.g. Altus).
   */
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
  insPayInput: '',
  membershipFree: '',
  workupFlag: '',
  entryDate: '',
  feeFlag: '',
  downgrade: '',
});

interface BuilderState {
  patientName: string;
  dateISO: string;
  note: string;
  noteEdited: string; // '' = treatment text auto-writes from lines, 'yes' = staff took over
  lines: BuilderLine[];
  officeDiscountInput: string;
  officeDiscountReason: string; // what the discount is for; blank = plain "Office Discount"
  patientCreditInput: string;
  deductibleInput: string;
  annualMaxInput: string;
  pctPrev: string;
  pctBasic: string;
  pctMajor: string;
  spans2Years: string; // '' or 'yes' — treatment crosses a benefit-year renewal
  nextMaxInput: string;
  nextDedInput: string;
  renewalVisitInput: string; // visit # where the new benefit year starts
  afterMaxState: string; // '' or 'yes' — reverts to office fees once maxed out
  prevExemptState: string; // '' or 'yes' — preventive doesn't count toward the max
  paymentCountOverride: string;
  importUsed: string; // 'yes' when rows came from a screenshot import (office copy notes it)
  prepayOptionState: string; // '' = follow template, 'on'/'off' = per-form override
  installmentOptionState: string;
  isSenior: string; // '' or 'yes' — patient is 65+; memory only
  insuranceOverride: string;
  writeOffOverride: string;
  portionOverride: string;
  discountOverride: string;
  prepayOverride: string;
  installmentOverrides: string[];
  installmentLabelOverrides: string[]; // '' = auto-generated visit name
}

type ScalarField = keyof Omit<
  BuilderState,
  'lines' | 'installmentOverrides' | 'installmentLabelOverrides'
>;

type BuilderAction =
  | { type: 'set'; field: ScalarField; value: string }
  | { type: 'setLine'; index: number; patch: Partial<BuilderLine> }
  | { type: 'addLine' }
  | { type: 'addLines'; lines: BuilderLine[] }
  | { type: 'setLines'; lines: BuilderLine[] }
  | { type: 'removeLine'; index: number }
  | { type: 'setInstallment'; index: number; value: string }
  | { type: 'setInstallmentLabel'; index: number; value: string }
  | { type: 'clearOverrides' }
  | { type: 'clearAll' };

const initialState = (): BuilderState => ({
  patientName: '',
  dateISO: todayISO(),
  note: '',
  noteEdited: '',
  lines: [newLine()],
  officeDiscountInput: '',
  officeDiscountReason: '',
  patientCreditInput: '',
  deductibleInput: '',
  annualMaxInput: '',
  pctPrev: '100',
  pctBasic: '80',
  pctMajor: '50',
  spans2Years: '',
  nextMaxInput: '$1,500.00',
  nextDedInput: '$50.00',
  renewalVisitInput: '',
  afterMaxState: '',
  prevExemptState: '',
  paymentCountOverride: '',
  importUsed: '',
  prepayOptionState: '',
  installmentOptionState: '',
  isSenior: '',
  insuranceOverride: '',
  writeOffOverride: '',
  portionOverride: '',
  discountOverride: '',
  prepayOverride: '',
  installmentOverrides: [],
  installmentLabelOverrides: [],
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
    case 'setLines':
      return { ...state, lines: action.lines.length ? action.lines : [newLine()] };
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
    case 'setInstallmentLabel': {
      const next = [...state.installmentLabelOverrides];
      next[action.index] = action.value;
      return { ...state, installmentLabelOverrides: next };
    }
    case 'clearOverrides':
      return {
        ...state,
        installmentLabelOverrides: [],
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

interface SectionHeaderProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Shown at the right while the section is closed. */
  summary?: string;
  extra?: ReactNode;
}

/** Clickable card header that opens/closes its section. */
function SectionHeader({ title, open, onToggle, summary, extra }: SectionHeaderProps) {
  return (
    <CardHeader className="pb-3 cursor-pointer select-none" onClick={onToggle}>
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex items-center gap-2 min-w-0">
          {extra}
          {!open && summary && (
            <span className="text-sm text-muted-foreground truncate">{summary}</span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>
    </CardHeader>
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
  const { data: branding } = useOrgBranding();
  const { data: schedules } = useFeeSchedules();

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [feeScheduleId, setFeeScheduleId] = useState<string>(NO_SCHEDULE);
  // Collapsible builder sections (UI-only; patient data untouched).
  // Discounts & Credits and Amounts & Payment Plan start closed — their
  // header summaries carry the numbers until staff need the detail.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    discounts: true,
    amounts: true,
  });
  const toggleSection = (key: string) =>
    setCollapsed(c => ({ ...c, [key]: !c[key] }));
  // Table-of-allowance plans: a second schedule holding the set dollar
  // amounts the plan pays per code (patient owes the difference).
  const [payScheduleId, setPayScheduleId] = useState<string>(NO_SCHEDULE);
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const [aiNaming, setAiNaming] = useState(false);
  const [doctorName, setDoctorName] = useState(FOF_DOCTORS[0]);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  // In-app confirm dialog (native confirm() shows ugly browser chrome).
  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    body: string;
    action: string;
    onConfirm: () => void;
  }>(null);

  const { data: bundles } = useProcedureBundles();
  const saveBundle = useSaveProcedureBundle();
  const deleteBundle = useDeleteProcedureBundle();
  const { data: orgCtx } = useOrgContext();
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';
  // Who's signed in — printed on the office copy's created-by line.
  const { user } = useAuth();
  const { data: myProfile } = useQuery({
    queryKey: ['my-profile', user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from('profiles').select('full_name, email').eq('id', user!.id).maybeSingle())
        .data,
  });
  const createdBy = myProfile?.full_name || myProfile?.email || user?.email || '';

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
    insuranceActive && feeScheduleId !== MANUAL_SCHEDULE ? feeScheduleId : null
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
            // Auto-fill with the patient-friendly wording that prints on
            // the form (schedule description as fallback).
            description: friendlyCdtName(match.code) || match.description,
            feeInput: formatCents(match.feeCents),
            ...resolveCategory(match.category),
          }
        : { code: rawCode, ...resolveCategory(categorizeCdtCode(rawCode.trim().toUpperCase())) },
    });
  };

  // A line's effective visit: the typed number, else the stage suggested
  // from the code (multi-segment codes start at their earliest stage).
  const effectiveVisit = (l: BuilderLine): number => {
    const typed = parseInt(l.visit, 10);
    if (!isNaN(typed)) return typed;
    const code = l.code.trim();
    if (!code) return 1;
    const segments = visitSegmentsForCode(code);
    if (segments.length > 1) return Math.min(...segments.map(s => s.stage));
    return suggestVisitStage(code);
  };

  // Changing a visit number re-files the line into visit order (on blur,
  // so rows don't jump mid-keystroke). Untyped lines sort by their
  // suggested stage; empty lines sink to the bottom; ties keep their order.
  const visitSortKey = (l: BuilderLine): number =>
    l.code.trim() === '' && l.visit.trim() === '' ? 99 : effectiveVisit(l);
  const sortLinesByVisit = () => {
    const sorted = state.lines
      .map((l, i) => [l, i] as const)
      .sort((a, b) => visitSortKey(a[0]) - visitSortKey(b[0]) || a[1] - b[1])
      .map(([l]) => l);
    if (sorted.some((l, i) => l !== state.lines[i])) {
      dispatch({ type: 'setLines', lines: sorted });
    }
  };

  // Code box doubles as a search box: match by code prefix, schedule
  // description, or the patient-friendly name ("crown" → D2740…).
  // Hidden once an exact code is set.
  const codeSuggestions = (query: string) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || officeByCode.has(query.trim().toUpperCase())) return [];
    const items = officeItems ?? [];
    const matchesText = (it: (typeof items)[number]) =>
      it.description.toLowerCase().includes(q) ||
      (friendlyCdtName(it.code) || '').toLowerCase().includes(q);
    const byCode = items.filter(it => it.code.toLowerCase().startsWith(q));
    const byDesc = items.filter(it => !it.code.toLowerCase().startsWith(q) && matchesText(it));
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
      description: match
        ? friendlyCdtName(match.code) || match.description
        : friendlyCdtName(rawCode.toUpperCase()) || '',
      feeInput: match ? formatCents(match.feeCents) : '',
      ...resolveCategory(match?.category ?? categorizeCdtCode(rawCode.toUpperCase())),
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
    setPayScheduleId(NO_SCHEDULE);
    // A different carrier means a different plan: plan-specific toggles
    // start from their defaults (all off) rather than carrying over.
    dispatch({ type: 'set', field: 'afterMaxState', value: '' });
    dispatch({ type: 'set', field: 'prevExemptState', value: '' });
    dispatch({ type: 'set', field: 'spans2Years', value: '' });
    if (nextId !== NO_SCHEDULE) {
      if (state.deductibleInput.trim() === '') {
        dispatch({ type: 'set', field: 'deductibleInput', value: '$50.00' });
      }
      if (state.annualMaxInput.trim() === '') {
        dispatch({ type: 'set', field: 'annualMaxInput', value: '$1,500.00' });
      }
    }
  };

  // Visit # where the new benefit year starts (2-year treatment plans);
  // null = no boundary known, renewal falls back to when the max runs out.
  const renewalVisitRaw = parseInt(state.renewalVisitInput, 10);
  const renewalVisit =
    state.spans2Years === 'yes' && !isNaN(renewalVisitRaw) && renewalVisitRaw > 0
      ? renewalVisitRaw
      : null;

  // Illumitrac membership templates include certain procedures at no
  // charge — those lines cost $0 (still listed for the patient) unless
  // the per-line switch says the year's allowance is used up.
  const membershipActive = (template?.membershipDiscountPercent ?? 0) > 0;
  const freeUnderMembership = (l: BuilderLine) =>
    membershipActive &&
    ILLUMITRAC_INCLUDED.has(l.code.trim().toUpperCase()) &&
    l.membershipFree !== 'off';

  const feeLineEntries = useMemo(
    () =>
      state.lines
        .filter(l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '')
        .map(l => {
          const code = l.code.trim().toUpperCase();
          // Downgrades are decided per line (default on for D2391–D2394).
          const downgradeCode = l.downgrade === 'yes' ? DOWNGRADE_MAP[code] : undefined;
          return {
            key: l.key,
            visit: effectiveVisit(l),
            line: {
              code,
              description: l.description.trim(),
              category: l.category,
              // Membership-included fees stay in the total (the patient
              // sees the value); they come off as their own covered row.
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
              inRenewalYear: renewalVisit !== null && effectiveVisit(l) >= renewalVisit,
              insurancePaysOverrideCents: l.insPayInput.trim()
                ? parseCurrencyInput(l.insPayInput)
                : null,
            } satisfies FofLine,
          };
        })
        // Benefits are consumed chronologically: deductible/max math runs
        // in visit order even if the list hasn't been re-sorted yet.
        .sort((a, b) => a.visit - b.visit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.lines, allowedByCode, payActive, payByCode, renewalVisit, membershipActive]
  );
  const feeLines: FofLine[] = useMemo(
    () => feeLineEntries.map(entry => entry.line),
    [feeLineEntries]
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

  // Per-row estimates keyed back to builder lines (entries are visit-sorted
  // in the same order estimateInsurance processed them).
  const perLineByKey = useMemo(() => {
    const map = new Map<string, (typeof estimate.perLine)[number]>();
    feeLineEntries.forEach((entry, i) => {
      const lineEstimate = estimate.perLine[i];
      if (lineEstimate) map.set(entry.key, lineEstimate);
    });
    return map;
  }, [feeLineEntries, estimate]);

  const isSenior = state.isSenior === 'yes';

  // Membership-covered fees: shown in the total, then written off as a row.
  const membershipCoveredCents = state.lines.reduce(
    (sum, l) => sum + (freeUnderMembership(l) ? parseCurrencyInput(l.feeInput) ?? 0 : 0),
    0
  );

  // Manual dollars taken off the top (collapsed-section summary).
  const manualAdjustmentsCents =
    (parseCurrencyInput(state.officeDiscountInput) ?? 0) +
    (parseCurrencyInput(state.patientCreditInput) ?? 0);

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
        membershipCoveredCents -
        insurance -
        writeOff
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, estimate, state.insuranceOverride, state.writeOffOverride, state.officeDiscountInput, state.patientCreditInput, membershipCoveredCents]);

  // The TEMPLATE decides which agreements are offered; staff can toggle
  // either per form (definitions live up here so the discount rules can
  // react to a forced-on prepay).
  const prepayShown =
    state.prepayOptionState === ''
      ? template?.showPrepayOption ?? false
      : state.prepayOptionState === 'on';
  const installmentShown =
    state.installmentOptionState === ''
      ? template?.showInstallmentOption ?? false
      : state.installmentOptionState === 'on';

  // Turning Prepay in Full ON for a template that normally has no prepay
  // (Financing, In-Network) is a manager override: the standard courtesy
  // rates come back with it — 5% under 65, 10% at 65+ — so the senior
  // toggle reappears too.
  const prepayForcedOn =
    prepayShown &&
    !!template &&
    !template.showPrepayOption &&
    !template.seniorDiscountApplies &&
    template.membershipDiscountPercent === 0;
  const discountRulesTemplate = template
    ? prepayForcedOn
      ? { ...template, seniorDiscountApplies: true }
      : template
    : null;

  const discounts = useMemo(
    () =>
      discountRulesTemplate
        ? computeFofDiscounts(discountRulesTemplate, isSenior, portionBeforeAutoDiscount)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, prepayForcedOn, isSenior, portionBeforeAutoDiscount]
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
    // Appointment-style names: the noun of the procedure carries into its
    // lab segments ("Crown Prep", "Denture Impressions"), surgical codes
    // get a "Surgery" suffix, and an all-workup visit is the Work Up Visit.
    const nounOf = (label: string) => {
      const clean = label.replace(/\(.*?\)/g, '').trim();
      // "Implant Crown" stays a compound — the office says "Implant Crown
      // Delivery", never just "Crown Delivery" for implant restorations.
      if (/implant crown/i.test(clean)) return 'Implant Crown';
      const words = clean.split(/\s+/);
      return words[words.length - 1] || label;
    };
    const isSurgical = (code: string) => {
      const m = /^D(\d{4})$/i.exec(code.trim());
      if (!m) return false;
      const num = parseInt(m[1], 10);
      return (num >= 6010 && num < 6055) || (num >= 7000 && num < 8000) || (num >= 4210 && num < 4300);
    };
    const entries: {
      raw: number;
      feeCents: number;
      label: string;
      /** Code-derived wording only — safe to leave the browser (AI naming). */
      safeLabel: string;
      dueAtVisit: boolean;
      workup: boolean;
    }[] = [];
    for (const l of active) {
      // Membership-covered procedures owe nothing at their visit.
      const fee = freeUnderMembership(l) ? 0 : parseCurrencyInput(l.feeInput) ?? 0;
      const base = friendlyCdtName(l.code) || l.description.trim();
      const lineLabel =
        isSurgical(l.code) && !/surger/i.test(base) ? `${base} Surgery` : base;
      // Parallel label built from the code alone: typed descriptions may
      // print, but must never reach the AI (HIPAA — no BAA).
      const safeBase = safeProcedureLabel(l.code) ?? '';
      const safeLineLabel =
        isSurgical(l.code) && safeBase && !/surger/i.test(safeBase)
          ? `${safeBase} Surgery`
          : safeBase;
      const workup = l.workupFlag === 'yes';
      // Work-up procedures (and the surgical guide) are billed at their
      // visit, never prepaid ahead.
      const dueAtVisit = NO_PREPAY_CODES.has(l.code.trim().toUpperCase()) || workup;
      const typed = parseInt(l.visit, 10);
      if (typed >= 1) {
        entries.push({ raw: typed, feeCents: fee, label: lineLabel, safeLabel: safeLineLabel, dueAtVisit, workup });
        continue;
      }
      const segments = visitSegmentsForCode(l.code);
      let remaining = fee;
      segments.forEach((segment, i) => {
        const part = i === segments.length - 1 ? remaining : Math.round(fee * segment.share);
        remaining -= part;
        const label = segment.label ? `${nounOf(base)} ${segment.label}` : lineLabel;
        const safeLabel = segment.label
          ? `${safeBase ? nounOf(safeBase) : ''} ${segment.label}`.trim()
          : safeLineLabel;
        entries.push({ raw: segment.stage, feeCents: part, label, safeLabel, dueAtVisit, workup });
      });
    }
    const distinct = [...new Set(entries.map(e => e.raw))].sort((a, b) => a - b);
    const visitsOut = distinct.map(v => {
      const group = entries.filter(e => e.raw === v);
      const top = group.reduce((best, e) => (e.feeCents > best.feeCents ? e : best), group[0]);
      const allWorkup = group.every(e => e.workup);
      return {
        label: allWorkup ? 'Work Up Visit' : top.label,
        safeLabel: allWorkup ? 'Work Up Visit' : top.safeLabel,
        feeCents: group.reduce((sum, e) => sum + e.feeCents, 0),
        dueAtVisitCents: group.reduce((sum, e) => sum + (e.dueAtVisit ? e.feeCents : 0), 0),
      };
    });
    // Two visits with the same kind of work would produce two identical
    // payment names ("At the Extraction Visit" twice) — confusing on the
    // schedule. Repeats get First/Second/... prefixes.
    const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
    const labelCounts = new Map<string, number>();
    for (const v of visitsOut) labelCounts.set(v.label, (labelCounts.get(v.label) ?? 0) + 1);
    const seen = new Map<string, number>();
    return visitsOut.map(v => {
      if ((labelCounts.get(v.label) ?? 0) < 2 || !v.label) return v;
      const idx = seen.get(v.label) ?? 0;
      seen.set(v.label, idx + 1);
      const ord = ORDINALS[idx] ?? `${idx + 1}th`;
      return {
        ...v,
        label: `${ord} ${v.label}`,
        safeLabel: v.safeLabel ? `${ord} ${v.safeLabel}` : v.safeLabel,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lines, membershipActive]);

  const schedulePortion = parseOverride(state.portionOverride) ?? projectedPortion;
  const scheduleFromVisits = visitWork ? buildVisitSchedule(schedulePortion, visitWork) : null;

  const autoVisitPlan =
    projectedPortion > 0 && projectedPortion < DAY_OF_SERVICE_THRESHOLD_CENTS
      ? VISIT_PLANS.dayOfService
      : scheduleFromVisits ?? treatmentVisitPlan;
  const forcedPlan =
    overrideCount >= 1 && overrideCount <= 4 ? planForCount(overrideCount) : null;
  // Office policy holds in EVERY plan shape: under $1,000 nothing is due
  // before the first visit — a forced payment count (or generic plan)
  // that opens with "Upon Scheduling" collects that payment at the first
  // visit instead. (The visit-schedule builder already handles this.)
  const basePlan = forcedPlan ?? autoVisitPlan;
  const rawVisitPlan =
    basePlan &&
    basePlan.key !== 'visitSchedule' &&
    projectedPortion > 0 &&
    projectedPortion < DAY_OF_SERVICE_THRESHOLD_CENTS &&
    /scheduling/i.test(basePlan.labels[0] ?? '')
      ? { ...basePlan, labels: ['At the First Visit', ...basePlan.labels.slice(1)] }
      : basePlan;
  // Staff-edited payment names take over the auto visit labels.
  const visitPlan = rawVisitPlan
    ? {
        ...rawVisitPlan,
        labels: rawVisitPlan.labels.map(
          (label, i) => state.installmentLabelOverrides[i]?.trim() || label
        ),
      }
    : rawVisitPlan;

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
  // Next-year benefits in play: say so on the form so the patient
  // understands why insurance keeps paying after this year's max.
  if (insuranceActive && state.spans2Years === 'yes' && estimate.renewalPaysCents > 0) {
    extraFootnotes.push(RENEWAL_NOTE);
  }
  // Tell the patient which listed procedures their membership covers.
  const membershipFreeLabels = [
    ...new Set(
      state.lines
        .filter(l => freeUnderMembership(l) && (l.code.trim() !== '' || l.feeInput.trim() !== ''))
        .map(l => l.description.trim() || l.code.trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
  if (membershipFreeLabels.length > 0) {
    extraFootnotes.push(
      `Included at no charge with your Illumitrac membership: ${membershipFreeLabels.join(', ')}.`
    );
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
      officeDiscountLabel: state.officeDiscountReason.trim() || undefined,
      patientCreditCents: parseCurrencyInput(state.patientCreditInput),
      membershipCoveredCents,
      autoDiscount: discounts?.autoDiscount ?? null,
      prepayDiscountBaseCents:
        discounts?.prepayDiscountBase === 'preDiscountTotal' ? portionBeforeAutoDiscount : null,
    }),
    [estimate, state.insuranceOverride, state.writeOffOverride, state.officeDiscountInput, state.officeDiscountReason, state.patientCreditInput, discounts, portionBeforeAutoDiscount, membershipCoveredCents]
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

  // AI pass over the payment names and treatment wording. HIPAA: the
  // request is built ONLY from CDT codes, code-derived labels, and
  // strictly-validated tooth numbers (src/lib/fof/ai.ts) — staff-typed
  // descriptions, edited labels, patient fields, and dollar amounts never
  // leave the browser. The doctor name comes from the fixed FOF_DOCTORS
  // dropdown, never free text.
  const aiCall = async (wantTreatment: boolean) => {
    if (!computation) return null;
    const byVisit = new Map<number, { code: string; tooth: string }[]>();
    for (const l of state.lines) {
      if (!l.code.trim()) continue;
      byVisit.set(effectiveVisit(l), [
        ...(byVisit.get(effectiveVisit(l)) ?? []),
        { code: l.code, tooth: l.tooth },
      ]);
    }
    const visitEntries = [...byVisit.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, entries]) => entries);
    // Display slot labels can embed typed descriptions (custom codes
    // fall back to them), so the AI slots are REBUILT from the
    // code-derived safeLabels — same schedule structure, safe wording.
    const safeSchedule =
      rawVisitPlan?.key === 'visitSchedule' && visitWork
        ? buildVisitSchedule(
            schedulePortion,
            visitWork.map(v => ({
              label: v.safeLabel,
              feeCents: v.feeCents,
              dueAtVisitCents: v.dueAtVisitCents,
            }))
          )
        : null;
    const autoSlots =
      safeSchedule?.labels ?? rawVisitPlan?.labels ?? computation.installmentLabels;
    const { data, error } = await supabase.functions.invoke('name-visits', {
      body: {
        ...buildNameVisitsPayload(visitEntries, autoSlots),
        wantTreatment,
        // "No specific doctor" → empty name; the AI writes as "we".
        doctorName: doctorName === FOF_NO_DOCTOR ? '' : doctorName,
      },
    });
    if (error) throw new Error(error.message);
    return { data, slotCount: autoSlots.length };
  };

  const aiNamePayments = async () => {
    setAiNaming(true);
    try {
      const result = await aiCall(false);
      if (!result) return;
      const names: string[] = result.data?.names ?? [];
      if (names.length !== result.slotCount) {
        throw new Error('AI returned an unexpected number of names');
      }
      names.forEach((name, i) =>
        dispatch({ type: 'setInstallmentLabel', index: i, value: name })
      );
      toast.success('Payment names updated — edit any of them freely');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI naming failed');
    } finally {
      setAiNaming(false);
    }
  };

  // Auto-polish: once the treatment settles (2.5s of quiet), AI rewords
  // the treatment summary like a human and names the payments — silently,
  // and never overwriting anything staff already typed.
  const aiSignature = useMemo(
    () =>
      JSON.stringify([
        doctorName,
        state.lines.map(l => [l.code, l.tooth, l.description, l.visit, l.feeInput]),
      ]),
    [state.lines, doctorName]
  );
  const [aiText, setAiText] = useState<{ signature: string; treatment: string } | null>(null);
  const aiRanForRef = useRef<string>('');
  useEffect(() => {
    if (feeLines.length === 0 || importing || !computation) return;
    if (aiRanForRef.current === aiSignature) return;
    const timer = setTimeout(async () => {
      aiRanForRef.current = aiSignature;
      try {
        const result = await aiCall(true);
        if (!result) return;
        if (typeof result.data?.treatment === 'string' && result.data.treatment.trim() !== '') {
          setAiText({ signature: aiSignature, treatment: result.data.treatment.trim() });
        }
        const names: string[] = result.data?.names ?? [];
        const noManualNames = state.installmentLabelOverrides.every(l => !l || l.trim() === '');
        if (names.length === result.slotCount && noManualNames) {
          names.forEach((name, i) =>
            dispatch({ type: 'setInstallmentLabel', index: i, value: name })
          );
        }
      } catch {
        // Silent — the auto wording is a bonus, never an error state.
      }
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSignature, feeLines.length, importing]);

  // The reminder every import path goes through — no patient info in the
  // image, ever.
  const askNoPatientInfo = (onConfirm: () => void) =>
    setConfirmState({
      title: 'Before you import',
      body:
        "Make sure the screenshot does NOT show the patient's name or any other " +
        'personal information — crop it out first. Only procedure codes, fees, and ' +
        'dates should be visible.',
      action: 'Import',
      onConfirm,
    });

  // Screenshot import: staff crop out patient identifiers first; the
  // image is parsed in memory (never stored) and only procedure rows come
  // back. The Fee column fills the lines, but every ESTIMATE (allowable,
  // ins pays, portion) is recomputed from our own schedules — never taken
  // from the screenshot — and differing fees get flagged.
  // Large screenshots (retina captures are often multi-MB PNGs) get
  // downscaled/re-encoded in memory so they fit the function's payload
  // cap; nothing ever touches disk or storage.
  const shrinkForUpload = (dataUrl: string): Promise<string> =>
    new Promise(resolve => {
      if (dataUrl.length < 4_000_000) return resolve(dataUrl);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 2200 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const importScreenshot = async (file: File) => {
    setImporting(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the image'));
        reader.readAsDataURL(file);
      });
      const image = await shrinkForUpload(dataUrl);
      const { data, error } = await supabase.functions.invoke('parse-treatment', {
        body: { image },
      });
      if (error) {
        // invoke() wraps non-2xx responses in a generic message; the
        // function's JSON body has the actual reason.
        let message = error.message;
        try {
          const body = (await (
            error as { context?: { json?: () => Promise<unknown> } }
          ).context?.json?.()) as { error?: string } | undefined;
          if (body?.error) message = body.error;
        } catch {
          /* keep the generic message */
        }
        throw new Error(message);
      }
      const rows: {
        code: string;
        tooth: string;
        description: string;
        fee: number | null;
        officeFee: number | null;
        entryDate: string;
        visit: number | null;
      }[] = data?.rows ?? [];
      if (rows.length === 0) throw new Error('No procedures found in the screenshot');
      // Renumber the screenshot's visit groups to start at Visit 1 (a
      // case that begins at "Visit 5" in the PMS becomes Visit 1 here).
      const visitNumbers = rows
        .map(r => r.visit)
        .filter((v): v is number => typeof v === 'number' && isFinite(v));
      const minVisit = visitNumbers.length > 0 ? Math.min(...visitNumbers) : null;
      let differed = 0;
      let unpriced = 0;
      const lines = rows.map(r => {
        const base = lineFromCode(r.code);
        const code = r.code.trim().toUpperCase();
        // OFFICE column → our own fee schedule → the plain "Fee" column,
        // which may be a carrier's contracted rate. See resolveImportedFee.
        const resolved = resolveImportedFee({
          code,
          pmsOfficeFeeCents: r.officeFee !== null ? Math.round(r.officeFee * 100) : null,
          onFileFeeCents: officeByCode.get(code)?.feeCents ?? null,
          contractedFeeCents: r.fee !== null ? Math.round(r.fee * 100) : null,
        });
        if (resolved.unpriced) unpriced++;
        else if (resolved.flag) differed++;
        return {
          ...base,
          tooth: r.tooth,
          description: base.description || r.description,
          feeInput:
            resolved.feeCents !== null ? formatCents(resolved.feeCents) : base.feeInput,
          entryDate: r.entryDate,
          visit:
            r.visit !== null && minVisit !== null ? String(r.visit - minVisit + 1) : base.visit,
          feeFlag: resolved.flag,
        };
      });
      dispatch({ type: 'addLines', lines });
      dispatch({ type: 'set', field: 'importUsed', value: 'yes' });
      const notes: string[] = [];
      if (differed > 0) {
        notes.push(`${differed} fee difference${differed === 1 ? '' : 's'} flagged`);
      }
      if (unpriced > 0) {
        notes.push(`${unpriced} with no office fee on file`);
      }
      const summary = `Imported ${lines.length} procedure${lines.length === 1 ? '' : 's'}${
        notes.length ? ` — ${notes.join(', ')}` : ''
      }. Estimates come from your fee schedules, not the screenshot.`;
      // A row priced off the screenshot needs a look before it prints, so
      // it does not get a green tick.
      if (unpriced > 0) toast.warning(summary);
      else toast.success(summary);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Screenshot import failed');
    } finally {
      setImporting(false);
    }
  };

  // Paste-to-import: Ctrl/Cmd+V with a screenshot on the clipboard runs
  // the same import (text pastes into inputs are untouched).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (importing) return;
      const item = [...(e.clipboardData?.items ?? [])].find(it => it.type.startsWith('image/'));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      askNoPatientInfo(() => importScreenshot(file));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  // The printout shows one patient-friendly treatment line (like the
  // office's existing forms), not the itemized code/fee list. Each row's
  // Description IS what prints (it auto-fills patient-friendly); a
  // blanked description intentionally omits that procedure from the line.
  const autoTreatment = useMemo(() => {
    // Group by tooth so the tooth number reads once per group ("Tooth #2:
    // Surgical Guide, Dental Implant, …") instead of trailing every item.
    const general: string[] = [];
    const byTooth: { tooth: string; labels: string[] }[] = [];
    for (const l of state.lines) {
      const code = l.code.trim();
      if (!code && !l.description.trim() && !l.feeInput.trim()) continue;
      // Custom PMS codes (non-D) belong on the office copy, not the
      // patient-facing treatment line.
      if (code !== '' && !/^D\d{4}$/i.test(code)) continue;
      const label = l.description.trim();
      if (!label) continue;
      // Denture/partial codes read "Lower Partial Denture" — the arch is
      // in the name, tooth numbers are noise on the patient line.
      const numMatch = /^D(\d{4})$/i.exec(code);
      const dentureCode =
        numMatch !== null && +numMatch[1] >= 5000 && +numMatch[1] < 5900;
      const tooth = dentureCode ? '' : l.tooth.trim();
      if (!tooth) {
        if (!general.includes(label)) general.push(label);
        continue;
      }
      let group = byTooth.find(g => g.tooth === tooth);
      if (!group) {
        group = { tooth, labels: [] };
        byTooth.push(group);
      }
      if (!group.labels.includes(label)) group.labels.push(label);
    }
    const toothLabel = (tooth: string) => {
      const parts = tooth.split(/[\s,;/]+/).filter(Boolean);
      return parts.length > 1 ? `Teeth #${parts.join(', #')}` : `Tooth #${parts[0] ?? tooth}`;
    };
    return [
      ...(general.length ? [general.join(', ')] : []),
      ...byTooth.map(g => `${toothLabel(g.tooth)}: ${g.labels.join(', ')}`),
    ].join('; ');
  }, [state.lines]);
  // The textarea holds the REAL text: it auto-writes from the procedures
  // (AI's human wording once it arrives, list-style until then) until the
  // staff edits it, then their wording sticks.
  const noteEdited = state.noteEdited === 'yes';
  const aiTreatment = aiText && aiText.signature === aiSignature ? aiText.treatment : '';
  const printedTreatment = noteEdited ? state.note : aiTreatment || autoTreatment;

  // Context for the floating FOF assistant — de-identified BY
  // CONSTRUCTION: code-derived procedure wording (never typed
  // descriptions) plus the AI's own generated treatment text (never the
  // staff-edited note, which could name the patient).
  const assistantContext = useMemo(() => {
    const byVisit = new Map<number, { code: string; tooth: string }[]>();
    for (const l of state.lines) {
      if (!l.code.trim()) continue;
      byVisit.set(effectiveVisit(l), [
        ...(byVisit.get(effectiveVisit(l)) ?? []),
        { code: l.code, tooth: l.tooth },
      ]);
    }
    if (byVisit.size === 0) return null;
    const visitEntries = [...byVisit.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, entries]) => entries);
    return {
      visits: buildNameVisitsPayload(visitEntries, []).visits,
      treatment: aiTreatment,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lines, aiTreatment]);

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

  // Office-copy detail lines for the auto-printed second page: the exact
  // codes and amounts behind the patient-facing summary. Memory-only.
  const officeLines = state.lines
    .filter(l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '')
    .map(l => {
      const code = l.code.trim().toUpperCase();
      const per = perLineByKey.get(l.key);
      // Fillings never show surface detail \u2014 office copy included. A raw
      // PMS description ("Composite - 2 srf, ant") collapses to the
      // friendly name; other codes keep whatever staff typed.
      const fillMatch = /^D2(1[4-6]\d|3[0-9]\d)$/.exec(code);
      const description = fillMatch
        ? friendlyCdtName(code) || l.description.trim()
        : l.description.trim();
      return {
        code,
        tooth: l.tooth.trim(),
        visit: String(effectiveVisit(l)),
        category:
          CATEGORY_SHORT[l.category] + (l.workupFlag === 'yes' ? ' \u00b7 Work Up' : ''),
        description,
        officeFeeCents: parseCurrencyInput(l.feeInput) ?? 0,
        // No-coverage lines print no allowable — a carrier fee is
        // meaningless (and misleading) on a line insurance won't touch.
        allowableCents:
          insuranceActive && l.category !== 'other'
            ? l.allowedInput.trim()
              ? parseCurrencyInput(l.allowedInput)
              : allowedByCode.get(code) ?? null
            : null,
        entryDate: l.entryDate,
        insPaysCents: per?.insurancePaysCents ?? 0,
        writeOffCents: per?.writeOffCents ?? 0,
      };
    });

  const sheet = effectiveTemplate && computation && (
    <FofPrintSheet
      practice={practice ?? DEFAULT_PRACTICE_INFO}
      template={effectiveTemplate}
      patient={{ patientName: state.patientName, dateISO: state.dateISO, treatment: printedTreatment }}
      amounts={amounts}
      computation={computation}
      officeLines={officeLines}
      createdBy={createdBy}
      doctorName={doctorName === FOF_NO_DOCTOR ? '' : doctorName}
      importedFromScreenshot={state.importUsed === 'yes'}
    />
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <FofAssistantWidget context={assistantContext} />
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
                <CardTitle className="text-base">Patient</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
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
                  <div className="space-y-1.5">
                    <Label>Doctor</Label>
                    <Select value={doctorName} onValueChange={setDoctorName}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOF_DOCTORS.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                        <SelectItem value={FOF_NO_DOCTOR}>{FOF_NO_DOCTOR}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                      onCheckedChange={v => {
                        // Standard policy: no prepay discount with contract
                        // insurance or financing — overriding needs a
                        // deliberate yes (SLH / Office Manager approval).
                        if (v && template && !template.showPrepayOption) {
                          setConfirmState({
                            title: 'Against standard policy',
                            body:
                              'This template has no Prepay in Full option — contract ' +
                              'insurance and financing get no additional discounts unless ' +
                              'approved by SLH or the Office Manager. Turn it on anyway?',
                            action: 'Turn it on',
                            onConfirm: () =>
                              dispatch({ type: 'set', field: 'prepayOptionState', value: 'on' }),
                          });
                          return;
                        }
                        dispatch({ type: 'set', field: 'prepayOptionState', value: v ? 'on' : 'off' });
                      }}
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
                  {(template.seniorDiscountApplies || prepayForcedOn) && (
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
              </CardContent>
            </Card>

            {insuranceEnabled && (
              <Card>
                <SectionHeader
                  title="Insurance"
                  open={!collapsed.insurance}
                  onToggle={() => toggleSection('insurance')}
                  summary={
                    !insuranceActive
                      ? 'No carrier selected'
                      : feeScheduleId === MANUAL_SCHEDULE
                        ? 'Out of network — manual'
                        : selectedSchedule?.name
                  }
                />
                <CardContent className={collapsed.insurance ? 'hidden' : 'space-y-3'}>
                  <div className="space-y-1.5">
                    <Label>Carrier Fee Schedule</Label>
                    <Select value={feeScheduleId} onValueChange={handleScheduleChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SCHEDULE}>None — no insurance on this form</SelectItem>
                        <SelectItem value={MANUAL_SCHEDULE}>
                          Out of network — no fee schedule (enter amounts manually)
                        </SelectItem>
                        {(schedules ?? []).filter(sch => sch.kind === 'carrier' && sch.isActive).map(sch => (
                          <SelectItem key={sch.id} value={sch.id}>{sch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {insuranceActive && (
                    <>
                      {(schedules ?? []).some(sch => sch.kind === 'payment' && sch.isActive) && (
                        <div className="space-y-1.5">
                          <Label>Plan Payment Table (fee-schedule plans — optional)</Label>
                          <Select value={payScheduleId} onValueChange={setPayScheduleId}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_SCHEDULE}>
                                None — plan pays category percentages
                              </SelectItem>
                              {(schedules ?? [])
                                .filter(sch => sch.kind === 'payment' && sch.isActive)
                                .map(sch => (
                                  <SelectItem key={sch.id} value={sch.id}>{sch.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            For plans that pay a set dollar amount per code: the plan pays
                            its table amount and the patient owes the difference up to the
                            {' '}{selectedSchedule?.name ?? 'carrier'} fee. Payment tables
                            are imported on the Fee Schedules page.
                          </p>
                        </div>
                      )}
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
                        <>
                          <div className="grid gap-3 sm:grid-cols-3">
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
                            <div className="space-y-1.5">
                              <Label htmlFor="fof-renewal-visit">New Year Starts at Visit #</Label>
                              <Input
                                id="fof-renewal-visit"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="e.g. 3"
                                value={state.renewalVisitInput}
                                onChange={setField('renewalVisitInput')}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Visits at or after that number use next year's max and
                            deductible; earlier visits can only draw on what's left this
                            year. Left blank, the renewal kicks in whenever this year's
                            max runs out.
                          </p>
                        </>
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
                      {state.annualMaxInput.trim() !== '' && (
                        <p className="text-xs font-medium">
                          {estimate.maxedOut
                            ? 'This treatment uses up the patient’s annual max — the form will say so.'
                            : `${formatCents(estimate.remainingMaxCents)} of the patient’s annual max is left after this treatment.`}
                        </p>
                      )}
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

            <Card>
              <SectionHeader
                title="Procedures"
                open={!collapsed.procedures}
                onToggle={() => toggleSection('procedures')}
                summary={`${feeLines.length} · ${formatCents(estimate.totalCents)}`}
              />
              <CardContent className={collapsed.procedures ? 'hidden' : 'space-y-2'}>
                {state.lines.map((line, i) => {
                  const lineCode = line.code.trim().toUpperCase();
                  const autoAllowed = allowedByCode.get(lineCode);
                  const downgradeTo = DOWNGRADE_MAP[lineCode];
                  const suggestions = codeSuggestions(line.code);
                  const microLabel = 'text-[10px] uppercase tracking-wide text-muted-foreground';
                  return (
                    <div key={line.key} className="rounded-md border p-2 space-y-1.5">
                      <div className="flex gap-1.5 items-center">
                        <Input
                          placeholder="D2740 / crown"
                          autoComplete="off"
                          className="font-mono w-28 shrink-0"
                          value={line.code}
                          onChange={e => handleCodeChange(i, e.target.value)}
                        />
                        <Input
                          placeholder="Description"
                          autoComplete="off"
                          className="flex-1 min-w-0"
                          value={line.description}
                          onChange={e => dispatch({ type: 'setLine', index: i, patch: { description: e.target.value } })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          onClick={() => dispatch({ type: 'removeLine', index: i })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
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
                      <div
                        className={
                          insuranceEnabled
                            ? 'grid grid-cols-3 sm:grid-cols-[3.2rem_3.2rem_minmax(4rem,1fr)_5.8rem_5.8rem_5.8rem] gap-1.5'
                            : 'grid grid-cols-3 sm:grid-cols-[3.5rem_3.5rem_minmax(4.5rem,1fr)_6.5rem] gap-1.5'
                        }
                      >
                        <div className="space-y-0.5">
                          <span className={microLabel}>Tooth</span>
                          <Input
                            placeholder="#"
                            autoComplete="off"
                            className="text-center"
                            value={line.tooth}
                            onChange={e => dispatch({ type: 'setLine', index: i, patch: { tooth: e.target.value } })}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <span className={microLabel}>Visit</span>
                          <Input
                            inputMode="numeric"
                            autoComplete="off"
                            className="text-center"
                            placeholder={
                              visitSegmentsForCode(line.code).length > 1
                                ? ''
                                : String(suggestVisitStage(line.code))
                            }
                            value={line.visit}
                            onChange={e => dispatch({ type: 'setLine', index: i, patch: { visit: e.target.value } })}
                            onBlur={sortLinesByVisit}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <span className={microLabel}>Category</span>
                          <Select
                            value={line.category}
                            onValueChange={v => dispatch({ type: 'setLine', index: i, patch: { category: v as FeeCategory } })}
                          >
                            <SelectTrigger className="h-10">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(CATEGORY_SHORT) as FeeCategory[])
                                .filter(c => c !== 'workup')
                                .map(c => (
                                  <SelectItem key={c} value={c}>{CATEGORY_SHORT[c]}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <span className={microLabel}>Office Fee</span>
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="$0.00"
                            className="text-right"
                            value={line.feeInput}
                            onChange={e => dispatch({ type: 'setLine', index: i, patch: { feeInput: e.target.value } })}
                          />
                        </div>
                        {insuranceEnabled && (
                          <>
                            <div className="space-y-0.5">
                              <span className={microLabel}>Allowable</span>
                              <Input
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder={
                                  line.category === 'other' ||
                                  line.category === 'workup' ||
                                  autoAllowed === undefined
                                    ? 'office fee'
                                    : 'auto'
                                }
                                className="text-right"
                                value={
                                  line.allowedInput !== ''
                                    ? line.allowedInput
                                    : autoAllowed !== undefined
                                      ? formatCents(autoAllowed)
                                      : ''
                                }
                                onChange={e => dispatch({ type: 'setLine', index: i, patch: { allowedInput: e.target.value } })}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className={microLabel}>Ins Pays</span>
                              <Input
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="$0.00"
                                className="text-right"
                                value={
                                  line.insPayInput !== ''
                                    ? line.insPayInput
                                    : insuranceActive
                                      ? formatCents(
                                          perLineByKey.get(line.key)?.insurancePaysCents ?? 0
                                        )
                                      : ''
                                }
                                onChange={e => dispatch({ type: 'setLine', index: i, patch: { insPayInput: e.target.value } })}
                                onBlur={() => {
                                  // Snap to what the plan can actually pay:
                                  // an override beyond the remaining max (or
                                  // unparseable) settles to the effective
                                  // amount so the cell never overstates.
                                  if (line.insPayInput.trim() === '') return;
                                  const typed = parseCurrencyInput(line.insPayInput);
                                  const effective = perLineByKey.get(line.key)?.insurancePaysCents;
                                  if (effective !== undefined && typed !== effective) {
                                    dispatch({
                                      type: 'setLine',
                                      index: i,
                                      patch: { insPayInput: formatCents(effective) },
                                    });
                                  }
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {insuranceActive && downgradeTo && (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`fof-dg-${line.key}`}
                            checked={line.downgrade === 'yes'}
                            onCheckedChange={v =>
                              dispatch({ type: 'setLine', index: i, patch: { downgrade: v ? 'yes' : '' } })
                            }
                          />
                          <Label
                            htmlFor={`fof-dg-${line.key}`}
                            className="text-xs text-muted-foreground font-normal"
                          >
                            Plan downgrades to the amalgam benefit ({downgradeTo}) — most plans
                            pay composite rates; turn on for plans like Altus
                          </Label>
                        </div>
                      )}
                      {membershipActive && ILLUMITRAC_INCLUDED.has(lineCode) && (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`fof-mem-${line.key}`}
                            checked={line.membershipFree !== 'off'}
                            onCheckedChange={v =>
                              dispatch({ type: 'setLine', index: i, patch: { membershipFree: v ? '' : 'off' } })
                            }
                          />
                          <Label
                            htmlFor={`fof-mem-${line.key}`}
                            className="text-xs text-muted-foreground font-normal"
                          >
                            Included with Illumitrac — no charge (turn off if this year's
                            allowance is used up)
                          </Label>
                        </div>
                      )}
                      {(line.workupFlag === 'yes' ||
                        line.category === 'other' ||
                        categorizeCdtCode(lineCode) === 'workup') && (
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`fof-wu-${line.key}`}
                            checked={line.workupFlag === 'yes'}
                            onCheckedChange={v =>
                              dispatch({ type: 'setLine', index: i, patch: { workupFlag: v ? 'yes' : '' } })
                            }
                          />
                          <Label
                            htmlFor={`fof-wu-${line.key}`}
                            className="text-xs text-muted-foreground font-normal"
                          >
                            Work Up — billed at its visit, not prepaid (combines with the
                            category above)
                          </Label>
                        </div>
                      )}
                      {(line.feeFlag !== '' || line.entryDate !== '') && (
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                          {line.feeFlag !== '' && (
                            <span className="text-amber-600 font-medium">⚠ {line.feeFlag}</span>
                          )}
                          {line.entryDate !== '' && (
                            <span className="text-muted-foreground">
                              Entry date: {line.entryDate} (office copy only)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'addLine' })}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Procedure
                  </Button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) importScreenshot(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={importing}
                    title="Upload or paste (Ctrl+V) a treatment-plan screenshot — crop out the patient's name first. Estimates still come from your fee schedules."
                    onClick={() => askNoPatientInfo(() => importInputRef.current?.click())}
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import Screenshot
                  </Button>
                  {(bundles ?? []).length > 0 && (
                    <Select value="" onValueChange={insertBundle}>
                      <SelectTrigger className="h-9 w-44">
                        <SelectValue placeholder="Insert bundle…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(bundles ?? []).map(b => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
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
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="fof-note">Treatment description (prints on the form)</Label>
                  <div className="relative">
                    <Textarea
                      id="fof-note"
                      autoComplete="off"
                      rows={2}
                      className="pr-16"
                      placeholder="Writes itself from the procedures above"
                      value={printedTreatment}
                      onChange={e => {
                        dispatch({ type: 'set', field: 'note', value: e.target.value });
                        dispatch({ type: 'set', field: 'noteEdited', value: 'yes' });
                      }}
                    />
                    {noteEdited && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute bottom-1 right-1 h-5 px-1.5 text-[10px]"
                        title="Rewrite from the procedures"
                        onClick={() => {
                          dispatch({ type: 'set', field: 'note', value: '' });
                          dispatch({ type: 'set', field: 'noteEdited', value: '' });
                        }}
                      >
                        <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                        auto
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Writes itself from the procedures and stays editable — once you change
                    it, your wording sticks ("Back to auto" re-syncs). Individual codes and
                    fees never print — only this line and the totals.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <SectionHeader
                title="Discounts & Credits"
                open={!collapsed.discounts}
                onToggle={() => toggleSection('discounts')}
                summary={
                  manualAdjustmentsCents > 0 ? `−${formatCents(manualAdjustmentsCents)}` : 'None'
                }
              />
              <CardContent className={collapsed.discounts ? 'hidden' : 'space-y-2'}>
                <div className="grid gap-3 sm:grid-cols-2">
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
                {(parseCurrencyInput(state.officeDiscountInput) ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="fof-office-discount-reason">
                      What's this discount for? (prints as the line's name)
                    </Label>
                    <Input
                      id="fof-office-discount-reason"
                      autoComplete="off"
                      placeholder='Leave blank to print "Office Discount"'
                      value={state.officeDiscountReason}
                      onChange={setField('officeDiscountReason')}
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  These print under the Total only when an amount is entered, and reduce
                  the Patient's Portion. Courtesy discounts (senior, membership, prepay)
                  apply automatically per the template.
                </p>
              </CardContent>
            </Card>

            {computation && (
              <Card>
                <SectionHeader
                  title="Amounts & Payment Plan"
                  open={!collapsed.amounts}
                  onToggle={() => toggleSection('amounts')}
                  summary={`You pay ${formatCents(computation.effective.patientPortionCents)}`}
                  extra={
                    !collapsed.amounts && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => {
                          e.stopPropagation();
                          dispatch({ type: 'clearOverrides' });
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset all
                      </Button>
                    )
                  }
                />
                <CardContent className={collapsed.amounts ? 'hidden' : 'space-y-2'}>
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
                        label="Total Due with Prepay"
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
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={aiNaming || feeLines.length === 0}
                          onClick={aiNamePayments}
                          title="Have AI suggest friendlier payment names — edit freely after"
                        >
                          {aiNaming ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          AI names
                        </Button>
                      </div>
                      {computation.computed.installmentsCents.map((cents, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {/* The payment name is live text — edit it and the
                              printout follows; clear it to go back to auto. */}
                          <Input
                            className="flex-1 min-w-0 text-sm"
                            autoComplete="off"
                            value={
                              (state.installmentLabelOverrides[i] ?? '') !== ''
                                ? state.installmentLabelOverrides[i]
                                : computation.installmentLabels[i] ?? `Installment ${i + 1}`
                            }
                            onChange={e =>
                              dispatch({ type: 'setInstallmentLabel', index: i, value: e.target.value })
                            }
                          />
                          {computation.overridden.installments[i] && (
                            <Badge variant="secondary">custom</Badge>
                          )}
                          <Input
                            className="w-32 shrink-0 text-right"
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={formatCents(cents)}
                            value={state.installmentOverrides[i] ?? ''}
                            onChange={e =>
                              dispatch({ type: 'setInstallment', index: i, value: e.target.value })
                            }
                          />
                          {computation.overridden.installments[i] && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              title="Reset to computed value"
                              onClick={() => dispatch({ type: 'setInstallment', index: i, value: '' })}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
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

      <AlertDialog open={!!confirmState} onOpenChange={open => !open && setConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmState?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmState?.onConfirm();
                setConfirmState(null);
              }}
            >
              {confirmState?.action ?? 'Continue'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Brand accent for the preview and printed sheets (org rows). */}
      {branding && <BrandPrintStyle branding={branding} />}

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the sheet. Same props as the preview — cannot diverge. */}
      {sheet && createPortal(<div className="fof-print-root">{sheet}</div>, document.body)}
    </div>
  );
}
