/**
 * Financial Options Form builder — itemized, plan-aware.
 *
 * HIPAA BOUNDARY — READ BEFORE EDITING:
 * Patient-entered data on this page (name, date, procedures chosen, dollar
 * amounts, remaining deductible/benefits, imported treatment plans) exists
 * ONLY in component memory and goes straight to the printer. It must never
 * be sent to Supabase, written to localStorage/sessionStorage, placed in
 * the URL, logged, toasted, or passed to analytics/audit calls. Only
 * de-identified configuration (templates, fee schedules, plan rules) may
 * touch the network, and the one AI request this page makes (name-visits)
 * is built from vetted procedure codes alone. A screenshot of a treatment
 * plan is read on this device and never uploaded. Keep it that way — the
 * practice has no BAA covering patient data in this app.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useBlocker } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogDescription,
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
  ClipboardPaste,
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
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useMyProfile';
import FofAssistantWidget from '@/components/fof/FofAssistantWidget';
import FofPrintSheet, { type FofPrintMode } from '@/components/fof/FofPrintSheet';
import TreatmentImportReview from '@/components/fof/TreatmentImportReview';
import { useFofSettings, useFofTemplates } from '@/hooks/useFofTemplates';
import {
  useDeleteProcedureBundle,
  useCodeNames,
  useFeeScheduleItems,
  useFeeSchedules,
  useInsurancePlans,
  useProcedureBundles,
  useSaveProcedureBundle,
  type InsurancePlan,
} from '@/hooks/useFeeSchedules';
import { useOrgContext } from '@/hooks/useOrgContext';
import { revertsToOfficeFeesOnMax } from '@/lib/fof/schedule-defaults';
import { computeFof } from '@/lib/fof/compute';
import { prepareFofPrint } from '@/lib/fof/print';
import { useFofOfficeGuidance } from '@/hooks/useFofOfficeGuidance';
import { useFofNaming, type NamingResult } from '@/hooks/useFofNaming';
import type { CurrentFofContext } from '@/lib/fof/current-form-assistant';
import { parseTreatmentText, readLocalTreatment, type LocalTreatmentImport, type LocalTreatmentRow } from '@/lib/fof/local-treatment-import';
import { useFofPolicySettings, usePaymentClassifications } from '@/hooks/useFofPolicySettings';
import { PaymentScheduleEditor, classTitle, usePaymentScheduleEditor } from '@/components/fof/PaymentScheduleEditor';
import { suggestPaymentClass } from '@/lib/fof/suggest-class';
import { isRestorationProcedure, isRestorationSurgery, toothTokens } from '@/lib/fof/restoration-surgery';
import { allocateAcrossLines } from '@/lib/fof/adjustments';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import { resolveImportedFee } from '@/lib/fof/import-fee';
import {
  estimateInsurance,
  type FeeCategory,
  type FofLine,
  type LineEstimate,
  type PlanRules,
} from '@/lib/fof/insurance';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import { resolvePatientName } from '@/lib/fof/cdt-names';
import { computeFofDiscounts } from '@/lib/fof/discounts';
import { buildNameVisitsPayload, isVettedProcedureCode, safeProcedureLabel } from '@/lib/fof/ai';
import { downgradeDefault, GENERIC_PLAN_DEFAULTS, parsePercentInput, planDefaults, plansForSchedule, type PlanDefaults } from '@/lib/fof/plan-hydration';
import { feeSourceFor, SOURCE_SHORT, type ValueSource } from '@/lib/fof/provenance';
import {
  buildVisitSchedule,
  decideVisitPlan,
  planForCount,
  suggestVisitStage,
  VISIT_PLANS,
  visitSegmentsForCode,
} from '@/lib/fof/visits';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import type { Cents, FofAmounts, FofOfficeLine, FofOverrides, FofTemplate } from '@/lib/fof/types';

const NO_SCHEDULE = '__none__';
// OON carriers the office has no fee schedule for: the full insurance
// estimate still runs, with allowable fees defaulting to office fees and
// every amount typed/overridable per line.
const MANUAL_SCHEDULE = '__manual__';
const NO_PLAN = '__no_plan__';

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

// Doctors the treatment wording can be attributed to. In production the
// list comes from fof_settings.doctor_names; the literal fallback is used
// only when settings have not yet been configured.
const FOF_NO_DOCTOR = 'No specific doctor';

// Procedures the office membership plan includes at no charge. Per-line
// toggle covers used-up yearly allowances. In production the plan name is
// read from fof_settings.membership_plan_name.
const MEMBERSHIP_INCLUDED = new Set([
  'D0120', 'D0140', 'D0150', // exams + emergency exam
  'D0210', 'D0220', 'D0230', 'D0272', 'D0274', 'D0330', // X-rays (no CBCT)
  'D1110', 'D1120', 'D4910', // cleanings incl. perio maintenance
  'D1206', 'D1208', 'D1351', // fluoride + sealant (child plan)
]);

/** Printed beside a $0 office-schedule row so nobody mistakes a no-charge line for a missing fee. */
const NO_CHARGE_FLAG = 'No charge — $0.00 on the office fee schedule.';

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

const normalizeCode = (raw: string) => raw.trim().toUpperCase();

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
  /** 'yes' = the office knowingly lets the override exceed the payable basis. */
  insPayException: string;
  /** '' = membership-included codes are free, 'off' = charge (allowance used). */
  membershipFree: string;
  /** 'yes' = work-up procedure: billed at its visit, never prepaid. */
  workupFlag: string;
  /** PMS entry date from an imported screenshot; office-copy page only. */
  entryDate: string;
  /** Warning when an imported fee differs from the fees on file. */
  feeFlag: string;
  /**
   * '' = plan pays composite rates, 'yes' = alternate-benefit downgrade
   * applies. Defaulted from the selected plan (or the office setting).
   */
  downgrade: string;
  /**
   * Where the office fee came from: 'office' (schedule), 'manual',
   * 'import', 'missing' (no fee on file), 'pending' (typed while the
   * schedule was still loading — resolved as soon as it arrives).
   */
  feeSource: string;
  /**
   * Overrides cleared by a code or carrier change, kept (as JSON) so staff
   * can restore them deliberately. '' when there is nothing to restore.
   */
  restore: string;
  /** Review notes for this line (cleared overrides, missing fees…), newline-joined. */
  notes: string;
}

interface ClearedOverrides {
  /** What changed: the previous code, or the previous carrier name. */
  reason: string;
  feeInput?: string;
  allowedInput?: string;
  insPayInput?: string;
  insPayException?: string;
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
  insPayException: '',
  membershipFree: '',
  workupFlag: '',
  entryDate: '',
  feeFlag: '',
  downgrade: '',
  feeSource: '',
  restore: '',
  notes: '',
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
  /** 'plan' = filled from a saved plan (unverified), 'default' = generic, 'patient' = staff typed/confirmed. */
  benefitsSource: string;
  benefitsConfirmed: string; // '' or 'yes' — staff confirmed the deductible/max for this patient
  planId: string; // selected saved plan for the carrier, or NO_PLAN
  deductibleWaived: string; // '' or 'no' — preventive care is NOT deductible-waived on this plan
  spans2Years: string; // '' or 'yes' — treatment crosses a benefit-year renewal
  nextMaxInput: string;
  nextDedInput: string;
  renewalVisitInput: string; // visit # where the new benefit year starts
  afterMaxState: string; // '' or 'yes' — reverts to office fees once maxed out
  prevExemptState: string; // '' or 'yes' — preventive doesn't count toward the max
  paymentCountOverride: string;
  importUsed: string; // 'yes' when rows came from a screenshot/text import (office copy notes it)
  prepayOptionState: string; // '' = follow template, 'on'/'off' = per-form override
  installmentOptionState: string;
  isSenior: string; // '' or 'yes' — patient is 65+; memory only
  stackPrepayApproved: string; // '' or 'yes' — manager allowed the prepay courtesy on top of an office discount
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
  | { type: 'setMany'; values: Partial<Pick<BuilderState, ScalarField>> }
  | { type: 'setLine'; index: number; patch: Partial<BuilderLine> }
  | { type: 'mapLines'; map: (line: BuilderLine) => BuilderLine }
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
  benefitsSource: '',
  benefitsConfirmed: '',
  planId: NO_PLAN,
  deductibleWaived: '',
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
  stackPrepayApproved: '',
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
    case 'setMany':
      return { ...state, ...action.values };
    case 'setLine': {
      const lines = [...state.lines];
      lines[action.index] = { ...lines[action.index], ...action.patch };
      return { ...state, lines };
    }
    case 'mapLines':
      return { ...state, lines: state.lines.map(action.map) };
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

/** A money field that has text in it but not a valid dollar amount. */
const invalidMoney = (input: string) => input.trim() !== '' && parseCurrencyInput(input) === null;

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
  /** Where the computed figure came from. */
  source?: string;
}

function OverrideRow({ label, computedCents, value, overridden, onChange, source }: OverrideRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      {invalidMoney(value) && <Badge variant="destructive">not an amount</Badge>}
      <SourceChip source={overridden ? 'manual' : source} />
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

/** A small provenance chip: where an amount came from. */
function SourceChip({ source, title }: { source?: string; title?: string }) {
  if (!source) return null;
  const short = SOURCE_SHORT[source as ValueSource] ?? source;
  const variant = source === 'manual' ? 'secondary' : source === 'missing' ? 'destructive' : 'outline';
  return (
    <Badge variant={variant} className="h-5 px-1.5 text-[10px] font-normal" title={title} data-source={source}>
      {short}
    </Badge>
  );
}

export default function FofBuilder() {
  const policyQuery = useFofPolicySettings();
  const classificationQuery = usePaymentClassifications();
  const paymentPolicy = policyQuery.data?.payment_policy;
  const { data: templates, isLoading: templatesLoading } = useFofTemplates();
  const practiceQuery = useFofSettings();
  const practice = practiceQuery.data;
  const { data: branding } = useOrgBranding();
  const schedulesQuery = useFeeSchedules();
  const schedules = schedulesQuery.data;
  // Office wording for what patients see. Display and print only —
  // the AI payload stays code-derived (see safeProcedureLabel).
  const { data: codeNames } = useCodeNames();
  // Saved plan configurations: coverage percentages, deductible, annual
  // maximum and plan rules that fill in (as unverified estimates) when a
  // carrier schedule is picked.
  const plansQuery = useInsurancePlans();
  const insurancePlans = plansQuery.data;

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  // Includes uncommitted money inputs; automatic defaults do not mark a form dirty.
  const [edited, setEdited] = useState(false);
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
  const amountsRef = useRef<HTMLDivElement>(null);
  const openAmounts = () => {
    setCollapsed(c => ({ ...c, amounts: false }));
    setTimeout(() => amountsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };
  // Table-of-allowance plans: a second schedule holding the set dollar
  // amounts the plan pays per code (patient owes the difference).
  const [payScheduleId, setPayScheduleId] = useState<string>(NO_SCHEDULE);
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [bundleName, setBundleName] = useState('');
  const officeGuidance = useFofOfficeGuidance();
  const [doctorName, setDoctorName] = useState(FOF_NO_DOCTOR);
  useEffect(() => {
    const doctors = practice?.doctorNames ?? [];
    const defaultDoctor = practice?.doctorName && doctors.includes(practice.doctorName)
      ? practice.doctorName
      : doctors[0] ?? FOF_NO_DOCTOR;
    setDoctorName(defaultDoctor);
  }, [practice?.doctorName, practice?.doctorNames?.join('|')]);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  // Local review of an imported plan (screenshot read on this device, or
  // pasted text). Memory only; the object URL is revoked on close.
  const [importReview, setImportReview] = useState<null | { source: 'screenshot' | 'text'; result: LocalTreatmentImport; previewUrl?: string; scope: number }>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  // Which sheet the preview shows and which pages the printer gets.
  const [previewPage, setPreviewPage] = useState<'patient' | 'office'>('patient');
  const [printMode, setPrintMode] = useState<FofPrintMode>('both');
  // Memory-only session facts: when the form was last printed, and the
  // non-identifying finish checklist. Nothing here is stored anywhere.
  const [printedAt, setPrintedAt] = useState<string>('');
  const [finish, setFinish] = useState({ printed: false, contactConfirmed: false });
  // In-app confirm dialog (native confirm() shows ugly browser chrome).
  const [confirmState, setConfirmState] = useState<null | {
    title: string;
    body: string;
    action: string;
    onConfirm: () => void;
  }>(null);
  // Bumped by Clear/Start Over so async work for the old form is dropped.
  const [resetKey, setResetKey] = useState(0);

  const { data: bundles } = useProcedureBundles();
  const saveBundle = useSaveProcedureBundle();
  const deleteBundle = useDeleteProcedureBundle();
  const { data: orgCtx } = useOrgContext();
  const importScope = useRef(0);
  const closeImportReview = useCallback(() => {
    setImportReview(previous => {
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return null;
    });
  }, []);
  useEffect(() => {
    importScope.current += 1;
    setImporting(false);
    closeImportReview();
  }, [orgCtx?.org_id, state.patientName, closeImportReview]);
  useEffect(() => () => { importScope.current += 1; }, []);
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';
  // Who's signed in — printed on the office copy's created-by line.
  const { user } = useAuth();
  const { data: myProfile } = useMyProfile();
  const createdBy = myProfile?.fullName || myProfile?.email || user?.email || '';

  const activeTemplates = useMemo(
    () => (templates ?? []).filter(t => t.isActive),
    [templates]
  );
  const template: FofTemplate | undefined =
    activeTemplates.find(t => t.id === templateId) ?? activeTemplates[0];

  // Only the ACTIVE office schedule feeds the form; an inactive one is
  // office history and never prices a line.
  const officeSchedule = (schedules ?? []).find(s => s.kind === 'office' && s.isActive);
  const officeItemsQuery = useFeeScheduleItems(officeSchedule?.id ?? null);
  const officeItems = officeItemsQuery.data;

  const insuranceEnabled = !!template?.showInsuranceEstimate;
  const insuranceActive = insuranceEnabled && feeScheduleId !== NO_SCHEDULE;
  const carrierItemsQuery = useFeeScheduleItems(
    insuranceActive && feeScheduleId !== MANUAL_SCHEDULE ? feeScheduleId : null
  );
  const carrierItems = carrierItemsQuery.data;
  const payActive = insuranceActive && payScheduleId !== NO_SCHEDULE;
  const payItemsQuery = useFeeScheduleItems(payActive ? payScheduleId : null);
  const payItems = payItemsQuery.data;

  // ---- Readiness: the calculation only runs on loaded, current data. A
  // failed query is a visible blocker with a retry, never an empty map.
  const feesLoading = !!schedulesQuery.isLoading || !!officeItemsQuery.isLoading || (insuranceActive && feeScheduleId !== MANUAL_SCHEDULE && !!carrierItemsQuery.isLoading) || (payActive && !!payItemsQuery.isLoading);
  const feesError = schedulesQuery.error ?? officeItemsQuery.error ?? carrierItemsQuery.error ?? payItemsQuery.error ?? null;
  const plansLoading = insuranceActive && !!plansQuery.isLoading;
  const practiceLoading = !!practiceQuery.isLoading;
  const practiceError = practiceQuery.error ?? null;
  const practiceMissing = !practiceLoading && !practiceError && !(practice?.practiceName ?? '').trim();
  const policyLoading = !!policyQuery.isLoading || (!!paymentPolicy && !!classificationQuery.isLoading);
  const policyError = policyQuery.error ?? (paymentPolicy ? classificationQuery.error : null) ?? null;
  const dataReady = !feesLoading && !feesError && !plansLoading && !practiceLoading && !practiceError && !policyLoading && !policyError;
  const retryData = () => {
    if (schedulesQuery.error) void schedulesQuery.refetch();
    if (officeItemsQuery.error) void officeItemsQuery.refetch();
    if (carrierItemsQuery.error) void carrierItemsQuery.refetch();
    if (payItemsQuery.error) void payItemsQuery.refetch();
    if (plansQuery.error) void plansQuery.refetch();
    if (practiceQuery.error) void practiceQuery.refetch();
    if (policyQuery.error) void policyQuery.refetch();
    if (classificationQuery.error) void classificationQuery.refetch();
  };
  // Blocking: nothing can be trusted until these load. Warnings: the form
  // works, with every fee typed by hand, and says so.
  const readinessIssues: string[] = [];
  const readinessWarnings: string[] = [];
  if (feesError) readinessIssues.push(`The fee schedules could not be loaded (${feesError.message}). Fees, allowables and estimates are on hold until they load.`);
  if (practiceError) readinessIssues.push(`The practice settings could not be loaded (${practiceError.message}). The form cannot print without the practice header.`);
  if (practiceMissing) readinessIssues.push('The practice identity (name, address, phone) is not set up, so the form header would print blank. An owner or manager sets it in Office Settings → Branding.');
  if (policyError) readinessIssues.push(`The office payment policy could not be loaded (${policyError.message}). Reload the page or ask a manager to check FOF Settings.`);
  if (!schedulesQuery.isLoading && !schedulesQuery.error && schedules && !officeSchedule) {
    readinessWarnings.push(isManager
      ? 'This office has no active fee schedule. Create the office fee schedule and import the office fees on Fees & Plans; until then every fee on this form is typed by hand.'
      : 'This office has no active fee schedule, so no fee can be looked up. Ask a manager to set it up on Fees & Plans; until then every fee on this form is typed by hand.');
  }

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
  /** Codes the office bills: what the AI request may name. */
  const vettedCodes = useMemo(() => new Set(officeByCode.keys()), [officeByCode]);

  // Contracted rates by code. A row marked as the office fee is not a rate
  // the carrier agreed to, and a $0 rate is a missing rate, not a free
  // procedure: both are left out so the estimate falls back to the CURRENT
  // office fee (allowedCents ?? officeFee in lib/fof/insurance.ts) and the
  // line says so, instead of inventing a full write-off.
  const { allowedByCode, allowableMissing } = useMemo(() => {
    const map = new Map<string, Cents>();
    const missing = new Set<string>();
    for (const item of carrierItems ?? []) {
      const key = item.code.toUpperCase();
      if (item.isOfficeFee || item.feeCents <= 0) { missing.add(key); continue; }
      map.set(key, item.feeCents);
    }
    return { allowedByCode: map, allowableMissing: missing };
  }, [carrierItems]);

  const payByCode = useMemo(() => {
    const map = new Map<string, Cents>();
    // Unlike the allowable map, a missing entry here means a benefit basis
    // of 0, not the office fee — so office-fee rows keep their number.
    for (const item of payItems ?? []) map.set(item.code.toUpperCase(), item.feeCents);
    return map;
  }, [payItems]);

  const selectedSchedule = (schedules ?? []).find(s => s.id === feeScheduleId);
  const carrierPlans = useMemo(
    () => (insuranceActive && feeScheduleId !== MANUAL_SCHEDULE ? plansForSchedule(feeScheduleId, insurancePlans) : []),
    [insuranceActive, feeScheduleId, insurancePlans]
  );
  const selectedPlan: InsurancePlan | null = carrierPlans.find(p => p.id === state.planId) ?? null;
  const selectedPlanDefaults: PlanDefaults | null = selectedPlan ? planDefaults(selectedPlan) : null;
  const downgradeOn = downgradeDefault(policyQuery.data?.downgrade_default_on ?? false, selectedPlanDefaults);

  /** Fields a matched (or unmatched) code fills on a line. Code-derived only. */
  const resolveCodeFields = useCallback((rawCode: string): Partial<BuilderLine> => {
    const key = normalizeCode(rawCode);
    const match = key ? officeByCode.get(key) : undefined;
    const eligible = insuranceActive && !!DOWNGRADE_MAP[key];
    const downgrade = eligible && downgradeOn ? 'yes' : '';
    if (match) {
      // A $0 row on the office schedule is a real office decision (post-ops,
      // inserts, adjustments): the line is a no-charge line, says so, and
      // never blocks the print. Only a code the schedule does not carry is
      // "no fee on file".
      const noCharge = match.feeCents <= 0;
      return {
        code: match.code,
        // Auto-fill with the patient-friendly wording that prints on
        // the form (schedule description as fallback).
        description: resolvePatientName(match.code, codeNames) || match.description,
        feeInput: formatCents(Math.max(0, match.feeCents)),
        feeSource: 'office',
        feeFlag: noCharge ? NO_CHARGE_FLAG : '',
        downgrade,
        ...resolveCategory(categorizeCdtCode(match.code) === 'workup' ? 'workup' : match.category),
      };
    }
    return {
      code: rawCode,
      description: key ? resolvePatientName(key, codeNames) || '' : '',
      feeInput: '',
      // Typed while the schedule is still loading: resolved once it arrives.
      feeSource: key ? (officeItemsQuery.isLoading ? 'pending' : officeSchedule ? 'missing' : 'manual') : '',
      downgrade,
      ...resolveCategory(categorizeCdtCode(key)),
    };
  }, [officeByCode, codeNames, insuranceActive, downgradeOn, officeItemsQuery.isLoading, officeSchedule]);

  /** Record cleared overrides on a line so staff can put them back on purpose. */
  const clearedOverrideNote = (line: BuilderLine, reason: string): Pick<BuilderLine, 'restore' | 'notes'> | null => {
    const cleared: ClearedOverrides = { reason };
    if (line.feeSource === 'manual' && line.feeInput.trim()) cleared.feeInput = line.feeInput;
    if (line.allowedInput.trim()) cleared.allowedInput = line.allowedInput;
    if (line.insPayInput.trim()) cleared.insPayInput = line.insPayInput;
    if (line.insPayException) cleared.insPayException = line.insPayException;
    const parts: string[] = [];
    if (cleared.feeInput) parts.push(`manual fee ${cleared.feeInput}`);
    if (cleared.allowedInput) parts.push(`allowable ${cleared.allowedInput}`);
    if (cleared.insPayInput) parts.push(`insurance payment ${cleared.insPayInput}`);
    if (parts.length === 0) return null;
    return {
      restore: JSON.stringify(cleared),
      notes: `${reason}: cleared ${parts.join(', ')}. Restore only if it still applies.`,
    };
  };

  const handleCodeChange = (index: number, rawCode: string) => {
    const line = state.lines[index];
    const previous = normalizeCode(line.code);
    const next = normalizeCode(rawCode);
    // Same procedure, different capitalisation/spacing: nothing else moves.
    if (previous === next) {
      dispatch({ type: 'setLine', index, patch: { code: rawCode } });
      return;
    }
    // A different code: every code-derived value is re-evaluated and every
    // override that belonged to the old code is cleared (kept for restore).
    const fields = resolveCodeFields(rawCode);
    const cleared = previous ? clearedOverrideNote(line, `Code changed from ${previous}`) : null;
    const dentureNow = /^D5[0-8]\d{2}$/.test(next);
    dispatch({
      type: 'setLine',
      index,
      patch: {
        ...fields,
        allowedInput: '',
        insPayInput: '',
        insPayException: '',
        feeFlag: fields.feeFlag ?? '',
        entryDate: '',
        membershipFree: '',
        // Dentures carry the arch in their name; a tooth number is noise.
        tooth: dentureNow ? '' : line.tooth,
        restore: cleared?.restore ?? '',
        notes: cleared?.notes ?? '',
      },
    });
  };

  const restoreOverrides = (index: number) => {
    const line = state.lines[index];
    if (!line.restore) return;
    let cleared: ClearedOverrides;
    try { cleared = JSON.parse(line.restore) as ClearedOverrides; } catch { return; }
    dispatch({
      type: 'setLine',
      index,
      patch: {
        ...(cleared.feeInput ? { feeInput: cleared.feeInput, feeSource: 'manual' } : {}),
        ...(cleared.allowedInput ? { allowedInput: cleared.allowedInput } : {}),
        ...(cleared.insPayInput ? { insPayInput: cleared.insPayInput } : {}),
        ...(cleared.insPayException ? { insPayException: cleared.insPayException } : {}),
        restore: '',
        notes: `Restored overrides from ${cleared.reason.replace(/^Code changed from |^Carrier changed from /, '')} on purpose.`,
      },
    });
  };

  // Codes typed while the office schedule was still loading resolve the
  // moment it arrives, so a line never keeps a blank fee it was owed.
  useEffect(() => {
    if (officeItemsQuery.isLoading || !officeItems) return;
    if (!state.lines.some(l => l.feeSource === 'pending')) return;
    dispatch({
      type: 'mapLines',
      map: line => (line.feeSource === 'pending' ? { ...line, ...resolveCodeFields(line.code) } : line),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeItemsQuery.isLoading, officeItems]);

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
      (resolvePatientName(it.code, codeNames) || '').toLowerCase().includes(q);
    const byCode = items.filter(it => it.code.toLowerCase().startsWith(q));
    const byDesc = items.filter(it => !it.code.toLowerCase().startsWith(q) && matchesText(it));
    return [...byCode, ...byDesc].slice(0, 6);
  };

  // Template choice drives the agreement toggles: switching templates
  // clears any per-form override so e.g. Out-of-Network and Self-Pay
  // always come up with Prepay in Full on, In-Network with it off.
  const handleTemplateChange = (nextTemplateId: string) => {
    setEdited(true);
    setTemplateId(nextTemplateId);
    dispatch({ type: 'setMany', values: { prepayOptionState: '', installmentOptionState: '', paymentCountOverride: '', stackPrepayApproved: '' } });
  };

  const lineFromCode = (rawCode: string): BuilderLine => ({
    ...newLine(),
    ...resolveCodeFields(rawCode),
  });

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

  /**
   * Fill the plan section from a saved plan (an UNVERIFIED estimate the
   * patient's benefits still need to confirm) or from generic defaults.
   */
  const applyPlanDefaults = (plan: PlanDefaults | null, nextScheduleId: string, scheduleName: string | undefined) => {
    const defaults = plan ?? GENERIC_PLAN_DEFAULTS;
    const afterMax = plan ? plan.officeFeesAfterMax : revertsToOfficeFeesOnMax(nextScheduleId, scheduleName, insurancePlans);
    dispatch({
      type: 'setMany',
      values: {
        planId: plan?.planId ?? NO_PLAN,
        pctPrev: String(defaults.pctPrev),
        pctBasic: String(defaults.pctBasic),
        pctMajor: String(defaults.pctMajor),
        deductibleInput: formatCents(defaults.deductibleCents),
        annualMaxInput: formatCents(defaults.annualMaxCents),
        deductibleWaived: defaults.deductibleWaivedPreventive ? '' : 'no',
        benefitsSource: plan ? 'plan' : 'default',
        benefitsConfirmed: '',
        afterMaxState: afterMax ? 'yes' : '',
        prevExemptState: '',
        spans2Years: '',
      },
    });
    const on = downgradeDefault(policyQuery.data?.downgrade_default_on ?? false, plan);
    dispatch({
      type: 'mapLines',
      map: line => (DOWNGRADE_MAP[normalizeCode(line.code)] ? { ...line, downgrade: on ? 'yes' : '' } : line),
    });
  };

  const handleScheduleChange = (nextId: string) => {
    setEdited(true);
    const previousName = selectedSchedule?.name ?? (feeScheduleId === MANUAL_SCHEDULE ? 'manual plan' : '');
    setFeeScheduleId(nextId);
    setPayScheduleId(NO_SCHEDULE);
    // Every carrier-derived estimate on the form belongs to the previous
    // carrier: per-line allowable/insurance overrides and the global
    // insurance/write-off overrides are cleared (kept for restore) so a
    // stale number never survives the change.
    dispatch({
      type: 'mapLines',
      map: line => {
        const cleared = previousName ? clearedOverrideNote({ ...line, feeSource: line.feeSource === 'manual' ? 'office' : line.feeSource }, `Carrier changed from ${previousName}`) : null;
        return { ...line, allowedInput: '', insPayInput: '', insPayException: '', restore: cleared?.restore ?? line.restore, notes: cleared?.notes ?? (cleared ? '' : line.notes) };
      },
    });
    dispatch({ type: 'setMany', values: { insuranceOverride: '', writeOffOverride: '' } });
    if (nextId === NO_SCHEDULE) {
      dispatch({ type: 'setMany', values: { planId: NO_PLAN, benefitsSource: '', benefitsConfirmed: '', afterMaxState: '', prevExemptState: '', spans2Years: '', deductibleWaived: '' } });
      return;
    }
    const picked = (schedules ?? []).find(s => s.id === nextId);
    const plans = nextId === MANUAL_SCHEDULE ? [] : plansForSchedule(nextId, insurancePlans);
    // One saved plan applies itself; several offer a choice (the first
    // starts selected); none falls back to generic defaults, labelled so.
    applyPlanDefaults(plans[0] ? planDefaults(plans[0]) : null, nextId, picked?.name);
  };

  const handlePlanChange = (planId: string) => {
    setEdited(true);
    const plan = carrierPlans.find(p => p.id === planId) ?? null;
    applyPlanDefaults(plan ? planDefaults(plan) : null, feeScheduleId, selectedSchedule?.name);
  };

  // Typing a patient-specific benefit replaces the plan default; the
  // typed value counts as reviewed for that field.
  const setBenefit = (field: 'deductibleInput' | 'annualMaxInput') =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: 'setMany', values: { [field]: e.target.value, benefitsSource: 'patient' } });
  const confirmBenefits = () => dispatch({ type: 'setMany', values: { benefitsConfirmed: 'yes' } });

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
    MEMBERSHIP_INCLUDED.has(l.code.trim().toUpperCase()) &&
    l.membershipFree !== 'off';

  const feeLineEntries = useMemo(
    () =>
      state.lines
        .filter(l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '')
        .map(l => {
          const code = l.code.trim().toUpperCase();
          // Downgrades are decided per line (default from the plan or office setting).
          const downgradeCode = l.downgrade === 'yes' ? DOWNGRADE_MAP[code] : undefined;
          const manualAllowed = l.allowedInput.trim() !== '';
          return {
            key: l.key,
            visit: effectiveVisit(l),
            line: {
              code,
              description: l.description.trim(),
              category: l.workupFlag === 'yes' || categorizeCdtCode(code) === 'workup' ? 'workup' : l.category,
              // Membership-included fees stay in the total (the patient
              // sees the value); they come off as their own covered row.
              officeFeeCents: parseCurrencyInput(l.feeInput) ?? 0,
              allowedCents: manualAllowed
                ? parseCurrencyInput(l.allowedInput)
                : allowedByCode.get(code) ?? null,
              allowedSource: manualAllowed ? 'manual' : allowedByCode.has(code) ? 'carrier' : null,
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
              insurancePaysOverrideException: l.insPayException === 'yes',
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

  // Malformed money or percentage input is a visible review error, never a
  // number quietly read as zero.
  const inputErrors: string[] = [];
  const pctFields = [['pctPrev', 'Preventive %'], ['pctBasic', 'Basic %'], ['pctMajor', 'Major %']] as const;
  if (insuranceActive && !payActive) {
    for (const [field, label] of pctFields) {
      if (parsePercentInput(state[field]) === null) inputErrors.push(`${label} must be a whole number from 0 to 100 (currently "${state[field]}").`);
    }
  }
  if (insuranceActive) {
    if (invalidMoney(state.deductibleInput)) inputErrors.push('The remaining deductible is not a dollar amount.');
    if (invalidMoney(state.annualMaxInput)) inputErrors.push('The remaining annual maximum is not a dollar amount.');
    if (state.spans2Years === 'yes' && (invalidMoney(state.nextMaxInput) || invalidMoney(state.nextDedInput))) inputErrors.push("Next year's maximum or deductible is not a dollar amount.");
  }
  for (const field of ['officeDiscountInput', 'patientCreditInput', 'insuranceOverride', 'writeOffOverride', 'portionOverride', 'discountOverride', 'prepayOverride'] as const) {
    if (invalidMoney(state[field])) inputErrors.push(`An amount in Amounts & Payment Plan or Discounts & Credits is not a dollar amount ("${state[field]}").`);
  }
  for (const l of state.lines) {
    const active = l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '';
    if (!active) continue;
    const label = l.code.trim().toUpperCase() || 'a procedure line';
    if (invalidMoney(l.feeInput)) inputErrors.push(`The office fee for ${label} is not a dollar amount.`);
    else if (l.feeInput.trim() === '') inputErrors.push(`${label} has no office fee: ${l.feeSource === 'missing' ? 'the office schedule has no fee on file for it' : 'enter the fee'} (a blank fee is not $0).`);
    if (invalidMoney(l.allowedInput)) inputErrors.push(`The allowable for ${label} is not a dollar amount.`);
    if (invalidMoney(l.insPayInput)) inputErrors.push(`The insurance payment for ${label} is not a dollar amount.`);
    if (l.feeSource === 'pending') inputErrors.push(`${label} is still being looked up on the office schedule.`);
  }

  // Per-form insurance settings: coverage %s and benefits come from the
  // saved plan (unverified) or were typed for this patient. Write-offs are
  // automatic — they apply when the selected carrier schedule is marked in
  // network (Fees & Plans) or the template itself is the In-Network one,
  // and never when the saved plan says the plan takes no write-offs.
  const writeoffsApplied =
    insuranceActive &&
    ((selectedSchedule?.isInNetwork ?? false) || (template?.showWriteOff ?? false)) &&
    (selectedPlanDefaults?.writeoffApplies ?? true);
  const planRules = useMemo<PlanRules | null>(() => insuranceActive
    ? {
        preventivePct: parsePercentInput(state.pctPrev) ?? 0,
        basicPct: parsePercentInput(state.pctBasic) ?? 0,
        majorPct: parsePercentInput(state.pctMajor) ?? 0,
        deductibleWaivedPreventive: state.deductibleWaived !== 'no',
        writeoffApplies: writeoffsApplied,
        officeFeesAfterMax: state.afterMaxState === 'yes',
        preventiveExemptFromMax: state.prevExemptState === 'yes',
      }
    : null, [insuranceActive, state.pctPrev, state.pctBasic, state.pctMajor, state.deductibleWaived, writeoffsApplied, state.afterMaxState, state.prevExemptState]);

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
    [feeLines, planRules, state.deductibleInput, state.annualMaxInput, state.spans2Years, state.nextMaxInput, state.nextDedInput]
  );

  // Per-row estimates keyed back to builder lines (entries are visit-sorted
  // in the same order estimateInsurance processed them).
  const perLineByKey = useMemo(() => {
    const map = new Map<string, LineEstimate>();
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
  const officeDiscountCents = parseCurrencyInput(state.officeDiscountInput) ?? 0;
  const manualAdjustmentsCents = officeDiscountCents + (parseCurrencyInput(state.patientCreditInput) ?? 0);

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
  // One courtesy at a time: an office (family/courtesy) discount typed on
  // the form suppresses the prepay courtesy unless a manager explicitly
  // stacks them for this case.
  const prepayCourtesyAvailable = (discounts?.prepayDiscountPercent ?? 0) > 0;
  const prepaySuppressed = prepayCourtesyAvailable && officeDiscountCents > 0 && state.stackPrepayApproved !== 'yes';
  const prepayDiscountPercent = prepaySuppressed ? 0 : discounts?.prepayDiscountPercent ?? template?.discountPercent ?? 0;
  const prepayDiscountLabel = prepaySuppressed ? '' : discounts?.prepayDiscountLabel ?? template?.discountLabel ?? '';

  // Portions under the office threshold default to a single "Due at Time
  // of Service" payment — no installment schedule needed. The payment-count
  // selector overrides for patients who need a real schedule anyway.
  const dayOfServiceThresholdCents = policyQuery.data?.day_of_service_threshold_cents ?? 100_000;
  const minStandalonePaymentCents = policyQuery.data?.min_standalone_payment_cents ?? 10_000;
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
      const base = resolvePatientName(l.code, codeNames) || l.description.trim();
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
  const scheduleOptions = { dayOfServiceThresholdCents: dayOfServiceThresholdCents, minStandalonePaymentCents: minStandalonePaymentCents };
  const scheduleFromVisits = visitWork ? buildVisitSchedule(schedulePortion, visitWork, scheduleOptions) : null;

  const autoVisitPlan =
    projectedPortion > 0 && projectedPortion < dayOfServiceThresholdCents
      ? VISIT_PLANS.dayOfService
      : scheduleFromVisits ?? treatmentVisitPlan;
  const forcedPlan =
    overrideCount >= 1 && overrideCount <= 4 ? planForCount(overrideCount) : null;
  // Office policy holds in EVERY plan shape: under the threshold nothing is
  // due before the first visit — a forced payment count (or generic plan)
  // that opens with "Upon Scheduling" collects that payment at the first
  // visit instead. (The visit-schedule builder already handles this.)
  const basePlan = forcedPlan ?? autoVisitPlan;
  const rawVisitPlan =
    basePlan &&
    basePlan.key !== 'visitSchedule' &&
    projectedPortion > 0 &&
    projectedPortion < dayOfServiceThresholdCents &&
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
      `Included at no charge with your ${practice?.membershipPlanName || 'membership'}: ${membershipFreeLabels.join(', ')}.`
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
        // senior-suppressed, membership +5%, or suppressed by an office discount).
        discountPercent: prepayDiscountPercent,
        discountLabel: prepayDiscountLabel,
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
        !prepaySuppressed && discounts?.prepayDiscountBase === 'preDiscountTotal' ? portionBeforeAutoDiscount : null,
    }),
    [estimate, state.insuranceOverride, state.writeOffOverride, state.officeDiscountInput, state.officeDiscountReason, state.patientCreditInput, discounts, portionBeforeAutoDiscount, membershipCoveredCents, prepaySuppressed]
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

  const baselineComputation = effectiveTemplate ? computeFof(effectiveTemplate, amounts, overrides, visitPlan) : null;
  // Saved office classification first; otherwise the code-bank guidance for
  // the code; otherwise a standard D code classifies itself from its CDT
  // range. Only custom office codes still wait for a staff decision.
  const baseClassification = (entry: (typeof feeLineEntries)[number]) => {
    const recipe = officeGuidance.data?.recipes.find(recipe => recipe.code === entry.line.code.toUpperCase() && recipe.scheduleId === officeSchedule?.id);
    return classificationQuery.data?.[entry.line.code]
      ?? (recipe && recipe.classification !== 'review' ? recipe.classification : undefined)
      ?? (/^D\d{4}$/i.test(entry.line.code) ? suggestPaymentClass(entry.line.code) : 'review' as const);
  };
  // Crown lengthening (or a gingivectomy) on the same tooth as a crown, post
  // and core, or bridge is the first appointment of that restoration, not a
  // separate phase: it joins the restoration course and is collected at.
  const surgicalPrerequisite = (entry: (typeof feeLineEntries)[number]) => {
    if (!isRestorationSurgery(entry.line.code)) return false;
    const teeth = toothTokens(state.lines.find(l => l.key === entry.key)?.tooth);
    if (!teeth.length) return false;
    return feeLineEntries.some(other => other.key !== entry.key && isRestorationProcedure(other.line.code) && baseClassification(other) === 'restoration' &&
      toothTokens(state.lines.find(l => l.key === other.key)?.tooth).some(tooth => teeth.includes(tooth)));
  };
  const policyLinesBase = feeLineEntries.map(entry => {
    const estimateLine = perLineByKey.get(entry.key);
    const builderLine = state.lines.find(l => l.key === entry.key)!;
    const recipe = officeGuidance.data?.recipes.find(recipe => recipe.code === entry.line.code.toUpperCase() && recipe.scheduleId === officeSchedule?.id);
    const surgical = surgicalPrerequisite(entry);
    return {
      // The payment groups must see the same appointment number the office
      // copy prints: the typed Visit #, else the stage suggested from the
      // code. Feeding only the typed text left every untyped line in its
      // own group, which fragmented the schedule into one phase per code.
      id: entry.key, code: entry.line.code, visit: String(entry.visit),
      groupingHint: recipe?.grouping, guidance: recipe ? { title: recipe.title, summary: recipe.summary, sourceId: recipe.sourceId, classification: recipe.classification } : undefined,
      // Patients read the friendly name, never the PMS shorthand ("CrnLngH&S").
      tooth: builderLine.tooth, procedureLabel: resolvePatientName(entry.line.code, codeNames) || builderLine.description.trim() || safeProcedureLabel(entry.line.code) || undefined,
      classification: surgical ? 'restoration' as const : baseClassification(entry),
      surgical,
      responsibilityCents: builderLine.feeInput.trim() && parseCurrencyInput(builderLine.feeInput) === null ? NaN : freeUnderMembership(builderLine) ? 0 : entry.line.officeFeeCents -
        (effectiveTemplate?.showInsuranceEstimate ? estimateLine?.insurancePaysCents ?? 0 : 0) -
        (effectiveTemplate?.showWriteOff ? estimateLine?.writeOffCents ?? 0 : 0),
    };
  });
  // Form-level discounts and credits (office discount, patient credit,
  // membership or senior discount) come off the patient portion as a whole.
  // Spread them across the paid lines in proportion so the schedule
  // reconciles on its own; staff can still allocate any line by hand.
  const expectedPortionCents = baselineComputation?.effective.patientPortionCents ?? 0;
  const lineResponsibilityCents = policyLinesBase.reduce((sum, line) => sum + (Number.isFinite(line.responsibilityCents) ? line.responsibilityCents : 0), 0);
  const formAdjustments = allocateAcrossLines(lineResponsibilityCents - expectedPortionCents,
    policyLinesBase.map(line => (Number.isFinite(line.responsibilityCents) ? line.responsibilityCents : 0)));
  const policyLines = policyLinesBase.map((line, i) => ({ ...line, defaultAdjustmentCents: formAdjustments[i] }));
  const paymentEditor = usePaymentScheduleEditor(orgCtx?.org_id, paymentPolicy, policyLines, expectedPortionCents);
  const computation = effectiveTemplate ? computeFof(effectiveTemplate, amounts, overrides, visitPlan, paymentEditor.model?.schedule) : null;
  const legacyOverrideReview = !!paymentPolicy && (state.installmentOverrides.some(Boolean) || state.installmentLabelOverrides.some(Boolean) || !!state.paymentCountOverride);
  const policyIssues = paymentEditor.model?.schedule.issues ?? [];
  const policyBlocked = policyLoading || !!policyError || (!!paymentPolicy && (legacyOverrideReview || policyIssues.length > 0));
  // The office's payment policy is required configuration for this office.
  // Without it the legacy visit-based schedule is in use, and the form says
  // so on screen and on the office copy rather than pretending otherwise.
  const legacyPolicy = !policyLoading && !policyError && !paymentPolicy;
  // An insurance form needs the patient's remaining benefits confirmed:
  // plan defaults are estimates, never the patient's verified eligibility.
  const benefitsUnconfirmed = insuranceActive && state.benefitsConfirmed !== 'yes';
  const imbalanceCents = computation?.imbalanceCents ?? 0;
  // Everything that pauses the preview and the printer, in one list.
  const reviewReasons: string[] = policyLoading
    ? ['Loading the office payment policy…']
    : [
        ...readinessIssues,
        ...inputErrors,
        ...(benefitsUnconfirmed ? [`Confirm the patient's remaining deductible and annual maximum in the Insurance section (${state.benefitsSource === 'plan' ? 'the saved plan defaults are unverified estimates' : state.benefitsSource === 'default' ? 'the generic defaults are unverified estimates' : 'the entered values need confirming'}).`] : []),
        ...(imbalanceCents > 0 ? [`Discounts, credits and insurance exceed the total by ${formatCents(imbalanceCents)}. Reduce the credit or discount; the patient portion is not silently set to $0.`] : []),
        ...(legacyOverrideReview ? ['Previous payment overrides are still on this form. Open Amounts & Payment Plan and use Reset all to clear them.'] : []),
        ...new Set(policyIssues),
      ];
  const printBlocked = !template || !computation || !dataReady || policyBlocked || reviewReasons.length > 0;
  // Paid lines the office registry has not classified yet: offer the CDT-range
  // suggestion as a one-click, form-only decision (staff can change it in the
  // editor; a manager saves office-wide classifications in the registry).
  const unclassifiedLines = paymentPolicy && !policyLoading
    ? paymentEditor.source.filter(line => {
        const edit = paymentEditor.state.lines[line.id];
        const chosen = edit && (edit.code === undefined || edit.code === line.code) ? edit.classification : undefined;
        return line.responsibilityCents > 0 && (chosen ?? line.classification ?? 'review') === 'review';
      })
    : [];
  // A form-only decision is pinned to the code it was made for, so retyping
  // the row as another procedure never carries it along.
  const classifyForForm = (id: string, code: string, classification: ReturnType<typeof suggestPaymentClass>) =>
    paymentEditor.update(s => ({ ...s, lines: { ...s.lines, [id]: { classification, code } } }));

  // ---- AI pass over the payment names and treatment wording. HIPAA: the
  // request is built ONLY from vetted procedure codes, code-derived labels,
  // and strictly-validated tooth numbers (src/lib/fof/ai.ts) — staff-typed
  // descriptions, edited labels, patient fields, and dollar amounts never
  // leave the browser. The doctor name comes from the org's fof_settings
  // dropdown, never free text. Codes must be shaped like procedure codes
  // AND (for non-CDT codes) exist on the office schedule.
  const codeMayLeave = (code: string) => {
    const key = normalizeCode(code);
    if (!isVettedProcedureCode(key)) return false;
    return /^D\d{4}(?:[A-Z.]{1,3})?$/.test(key) || vettedCodes.has(key);
  };
  const namingSignature = useMemo(
    () =>
      JSON.stringify([
        orgCtx?.org_id ?? '',
        doctorName,
        !!paymentPolicy,
        feeScheduleId,
        state.lines.filter(l => l.code.trim()).map(l => [normalizeCode(l.code), l.tooth, effectiveVisit(l), l.feeInput]),
        computation?.installmentLabels.length ?? 0,
      ]),
    [state.lines, doctorName, paymentPolicy, feeScheduleId, orgCtx?.org_id, computation?.installmentLabels.length]
  );
  const [aiText, setAiText] = useState<{ signature: string; treatment: string } | null>(null);
  const buildNamingRequest = () => {
    if (!computation || !orgCtx?.org_id) return null;
    const byVisit = new Map<number, { code: string; tooth: string }[]>();
    for (const l of state.lines) {
      if (!l.code.trim() || !codeMayLeave(l.code)) continue;
      byVisit.set(effectiveVisit(l), [
        ...(byVisit.get(effectiveVisit(l)) ?? []),
        { code: normalizeCode(l.code), tooth: l.tooth },
      ]);
    }
    const visitEntries = [...byVisit.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, entries]) => entries);
    if (visitEntries.length === 0) return null;
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
            })),
            scheduleOptions
          )
        : null;
    // The policy already supplies exact collection milestones. Request only
    // the treatment summary on this path; generated names must never relabel
    // booking, prep or surgery as delivery. Keep the endpoint's slot contract.
    const autoSlots = paymentPolicy
      ? ['Treatment summary']
      : safeSchedule?.labels ?? rawVisitPlan?.labels ?? computation.installmentLabels;
    if (autoSlots.length === 0) return null;
    return {
      body: {
        ...buildNameVisitsPayload(visitEntries, autoSlots),
        wantTreatment: true,
        // "No specific doctor" → empty name; the AI writes as "we".
        doctorName: doctorName === FOF_NO_DOCTOR ? '' : doctorName,
        orgId: orgCtx.org_id,
      },
      slotCount: autoSlots.length,
    };
  };
  const applyNaming = (result: NamingResult, signature: string, manual: boolean) => {
    if (result.treatment) setAiText({ signature, treatment: result.treatment });
    // Policy payment labels come from the same events as the amounts. Remote
    // wording is limited to the summary; staff can still edit labels locally.
    if (paymentPolicy) {
      if (manual && result.treatment) toast.success('Treatment summary updated');
      return;
    }
    result.names.forEach((name, i) => {
      if ((state.installmentLabelOverrides[i] ?? '').trim() === '' || manual) {
        dispatch({ type: 'setInstallmentLabel', index: i, value: name });
      }
    });
    if (manual) toast.success('Payment names updated — edit any of them freely');
  };
  const naming = useFofNaming({
    ready: dataReady && !importing && !!computation && feeLines.length > 0 && !inputErrors.length,
    signature: namingSignature,
    orgId: orgCtx?.org_id,
    buildRequest: buildNamingRequest,
    onApply: applyNaming,
    resetKey,
  });
  const aiNaming = naming.state.status === 'working' || naming.state.status === 'retrying';

  // Refresh office-wide code-bank guidance only. No part of this form
  // enters that request.
  const refreshGuidance = async () => {
    const result = await officeGuidance.refetch();
    if (result.error) toast.error('Code-bank guidance could not be refreshed. Existing rules remain in use.');
    else toast.success('Code-bank guidance refreshed. Staff corrections on this form are preserved.');
  };

  // ---- Importing a treatment plan. Every path is local: the screenshot is
  // read on this device (same-origin OCR, no upload, no AI, no fallback),
  // pasted text is parsed here, and staff review every row before it lands.
  const askNoPatientInfo = (onConfirm: () => void) =>
    setConfirmState({
      title: 'Before you import',
      body:
        "Crop the patient's name and any other personal information out of the screenshot first. " +
        'The image is read on this device only — it is never uploaded, sent to an AI service or stored — ' +
        'and you will review every row before anything enters the form.',
      action: 'Choose screenshot',
      onConfirm,
    });

  const commitImportedRows = (rows: LocalTreatmentRow[]) => {
    // Renumber the screenshot's visit groups to start at Visit 1 (a
    // case that begins at "Visit 5" in the PMS becomes Visit 1 here).
    const visitNumbers = rows
      .map(r => r.visit)
      .filter((v): v is number => typeof v === 'number' && isFinite(v));
    const minVisit = visitNumbers.length > 0 ? Math.min(...visitNumbers) : null;
    let differed = 0;
    let unpriced = 0;
    let unmatched = 0;
    const lines = rows.map(r => {
      const base = lineFromCode(r.code);
      const code = r.code.trim().toUpperCase();
      const onFile = officeByCode.get(code);
      if (!onFile) unmatched++;
      // OFFICE column → our own fee schedule → the plain "Fee" column,
      // which may be a carrier's contracted rate. See resolveImportedFee.
      const resolved = resolveImportedFee({
        code,
        pmsOfficeFeeCents: r.officeFee !== null ? Math.round(r.officeFee * 100) : null,
        // A $0 row on our schedule is a no-charge fee, not a missing one.
        onFileFeeCents: onFile ? Math.max(0, onFile.feeCents) : null,
        contractedFeeCents: r.fee !== null ? Math.round(r.fee * 100) : null,
      });
      if (resolved.unpriced) unpriced++;
      else if (resolved.flag) differed++;
      const feeCents = resolved.feeCents;
      return {
        ...base,
        tooth: r.tooth,
        description: base.description || r.description,
        feeInput: feeCents !== null ? formatCents(feeCents) : base.feeInput,
        feeSource: feeCents !== null ? feeSourceFor(feeCents, onFile?.feeCents ?? null, true) : base.feeSource,
        entryDate: r.entryDate,
        visit:
          r.visit !== null && minVisit !== null ? String(r.visit - minVisit + 1) : base.visit,
        feeFlag: [resolved.flag, onFile && onFile.feeCents <= 0 && feeCents === 0 ? NO_CHARGE_FLAG : ''].filter(Boolean).join(' '),
        notes: r.issues.length ? `Imported with review notes: ${r.issues.join(' ')}` : '',
      };
    });
    dispatch({ type: 'addLines', lines });
    dispatch({ type: 'set', field: 'importUsed', value: 'yes' });
    const notes: string[] = [];
    if (differed > 0) notes.push(`${differed} fee difference${differed === 1 ? '' : 's'} flagged`);
    if (unpriced > 0) notes.push(`${unpriced} priced from the plan (no office fee on file)`);
    if (unmatched > 0) notes.push(`${unmatched} code${unmatched === 1 ? '' : 's'} not on the office schedule`);
    const summary = `Imported ${lines.length} procedure${lines.length === 1 ? '' : 's'}${
      notes.length ? ` — ${notes.join(', ')}` : ''
    }. Estimates come from your fee schedules, not the plan.`;
    if (unpriced > 0 || unmatched > 0) toast.warning(summary);
    else toast.success(summary);
  };

  const importScreenshot = async (file: File) => {
    const scope = ++importScope.current;
    setImporting(true);
    let previewUrl: string | undefined;
    try {
      const result = await readLocalTreatment(
        file,
        Object.fromEntries([...officeByCode].map(([code, item]) => [code, resolvePatientName(code, codeNames) || item.description])),
        // On-file fees in dollars, so a low-confidence read that matches the schedule is not flagged.
        Object.fromEntries([...officeByCode].map(([code, item]) => [code, Math.max(0, item.feeCents) / 100])),
      );
      if (scope !== importScope.current) return;
      previewUrl = URL.createObjectURL(file);
      setImportReview({ source: 'screenshot', result, previewUrl, scope });
    } catch (error) {
      if (scope === importScope.current) toast.error(error instanceof Error ? error.message : 'The screenshot could not be read on this device. Nothing was imported.');
    } finally {
      if (scope === importScope.current) setImporting(false);
    }
  };

  const importPastedText = () => {
    const scope = ++importScope.current;
    try {
      const result = parseTreatmentText(pasteText, Object.fromEntries([...officeByCode].map(([code, item]) => [code, resolvePatientName(code, codeNames) || item.description])));
      setPasteOpen(false);
      setPasteText('');
      setImportReview({ source: 'text', result, scope });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The pasted text could not be read. Nothing was imported.');
    }
  };

  // Paste-to-import: Ctrl/Cmd+V with a screenshot on the clipboard runs
  // the same local import (text pastes into inputs are untouched).
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
  const guidedGroups = paymentEditor.model?.groups ?? [];
  const guidedTreatment = policyLines.some(line => line.guidance) && guidedGroups.length
    ? 'Your treatment includes ' + guidedGroups.map(group => group.label).join(', ') + '.'
    : '';
  const aiTreatment = (aiText && aiText.signature === namingSignature ? aiText.treatment : '') || guidedTreatment;
  const printedTreatment = noteEdited ? state.note : aiTreatment || autoTreatment;

  // Current form facts never leave this component tree or enter AI requests.
  const assistantContext: CurrentFofContext | null = computation ? {
    amounts, computation, treatment: printedTreatment, policy: paymentPolicy ?? null,
    issues: paymentEditor.model?.schedule.issues ?? [],
    lines: feeLineEntries.map(entry => {
      const line = state.lines.find(line => line.key === entry.key)!;
      const estimate = perLineByKey.get(entry.key);
      return { code: entry.line.code, tooth: line.tooth, description: line.description,
        feeCents: entry.line.officeFeeCents, insuranceCents: estimate?.insurancePaysCents ?? 0, writeOffCents: estimate?.writeOffCents ?? 0 };
    }),
    insurance: { enabled: insuranceEnabled, scheduleId: insuranceActive ? feeScheduleId : null,
      paymentScheduleId: payActive ? payScheduleId : null,
      scheduleName: selectedSchedule?.name ?? (feeScheduleId === MANUAL_SCHEDULE ? 'Manually entered plan' : 'No carrier selected'),
      deductibleCents: parseCurrencyInput(state.deductibleInput) ?? 0,
      annualMaximumCents: parseCurrencyInput(state.annualMaxInput) ?? 0,
      manuallyOverridden: !!state.insuranceOverride.trim() || !!state.writeOffOverride.trim(),
      settings: (planRules ? `Entered coverage: preventive ${planRules.preventivePct}%, basic ${planRules.basicPct}%, major ${planRules.majorPct}% (${state.benefitsSource === 'plan' ? `from the saved plan ${selectedPlan?.name ?? ''}, unverified` : state.benefitsSource === 'patient' ? 'entered for this patient' : 'generic defaults, unverified'}). Contracted write-offs ${planRules.writeoffApplies ? 'apply' : 'do not apply'}. Preventive care ${planRules.preventiveExemptFromMax ? 'does not use' : 'uses'} the annual maximum. ` : '') + (state.spans2Years === 'yes' ? `This estimate spans two benefit years; next-year maximum ${formatCents(parseCurrencyInput(state.nextMaxInput) ?? 0)} and deductible ${formatCents(parseCurrencyInput(state.nextDedInput) ?? 0)} also apply.` : 'This estimate uses the entered benefits for one benefit year.'),
    },
  } : null;

  const isDirty = importing || !!importReview || edited || paymentEditor.isDirty ||
    !!state.prepayOptionState || !!state.installmentOptionState || !!state.isSenior ||
    !!state.paymentCountOverride ||
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

  const blocker = useBlocker(isDirty);

  const setField = (field: ScalarField) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      dispatch({ type: 'set', field, value: e.target.value });

  const basisLabel = (basis: LineEstimate['allowedBasis'] | undefined): string => {
    switch (basis) {
      case 'carrier': return 'carrier rate';
      case 'manual': return 'typed allowable';
      case 'office': return 'no carrier rate on file — office fee';
      case 'downgrade': return 'alternate benefit — office fee';
      case 'after-max': return 'after annual max — office fee';
      case 'uncovered': return 'not covered — office fee';
      default: return '';
    }
  };

  // Office-copy detail lines for the auto-printed second page: the exact
  // codes and amounts behind the patient-facing summary, with the allowed
  // fee the calculation ACTUALLY used and where each figure came from.
  // Memory-only.
  const officeLines: FofOfficeLine[] = state.lines
    .filter(l => l.code.trim() !== '' || l.description.trim() !== '' || l.feeInput.trim() !== '')
    .map(l => {
      const code = l.code.trim().toUpperCase();
      const per = perLineByKey.get(l.key);
      // Fillings never show surface detail — office copy included. A raw
      // PMS description ("Composite - 2 srf, ant") collapses to the
      // friendly name; other codes keep whatever staff typed.
      const fillMatch = /^D2(1[4-6]\d|3[0-9]\d)$/.exec(code);
      const description = fillMatch
        ? resolvePatientName(code, codeNames) || l.description.trim()
        : l.description.trim();
      const notes: string[] = [];
      if (l.notes.trim()) notes.push(l.notes.trim());
      if (l.feeFlag.trim()) notes.push(l.feeFlag.trim());
      if (per?.overrideBounded) {
        notes.push(`Typed insurance payment ${formatCents(per.overrideBounded.typedCents)} limited to ${formatCents(per.insurancePaysCents)} (${per.overrideBounded.reason === 'max' ? 'remaining annual maximum' : per.overrideBounded.reason === 'workup' ? 'work-up is never covered' : 'payable basis'}).`);
      }
      if (insuranceActive && l.insPayInput.trim() && l.insPayException === 'yes') notes.push('Insurance payment override exception approved on this form.');
      if (insuranceActive && allowableMissing.has(code) && !l.allowedInput.trim() && l.category !== 'other') notes.push(`${selectedSchedule?.name ?? 'The carrier'} has no contracted rate for ${code}; the office fee stood in.`);
      return {
        code,
        tooth: l.tooth.trim(),
        visit: String(effectiveVisit(l)),
        category:
          CATEGORY_SHORT[l.category] + (!paymentPolicy && l.workupFlag === 'yes' ? ' · Work Up' : ''),
        description,
        officeFeeCents: parseCurrencyInput(l.feeInput) ?? 0,
        allowableCents: insuranceActive ? per?.allowedCents ?? null : null,
        allowableBasis: insuranceActive ? basisLabel(per?.allowedBasis) : undefined,
        entryDate: l.entryDate,
        insPaysCents: per?.insurancePaysCents ?? 0,
        writeOffCents: per?.writeOffCents ?? 0,
        feeSource: l.feeSource || undefined,
        notes: notes.length ? notes : undefined,
      };
    });

  // Global manual insurance/write-off overrides are reconciled against the
  // line totals on the office copy, so a hand-typed total never hides a
  // difference from the line math.
  const reconciliation = insuranceActive
    ? {
        lineInsuranceCents: estimate.insurancePaysCents,
        printedInsuranceCents: amounts.insuranceEstimateCents ?? 0,
        lineWriteOffCents: estimate.writeOffCents,
        printedWriteOffCents: template?.showWriteOff ? amounts.writeOffCents ?? 0 : 0,
      }
    : undefined;

  const sheetProps = effectiveTemplate && computation && practice && !printBlocked
    ? {
        practice,
        template: effectiveTemplate,
        patient: { patientName: state.patientName, dateISO: state.dateISO, treatment: printedTreatment },
        amounts,
        computation,
        officeLines,
        createdBy,
        doctorName: doctorName === FOF_NO_DOCTOR ? '' : doctorName,
        importedFromScreenshot: state.importUsed === 'yes',
        legacyPolicy,
        reconciliation,
        benefitsNote: insuranceActive
          ? `Benefits confirmed by staff for this form (source: ${state.benefitsSource === 'plan' ? `saved plan ${selectedPlan?.name ?? ''} defaults, reviewed` : state.benefitsSource === 'patient' ? 'entered for this patient' : 'generic defaults, reviewed'}). Estimate only.`
          : undefined,
      }
    : null;
  const previewSheet = sheetProps && <FofPrintSheet {...sheetProps} printMode={previewPage} />;
  const printSheet = sheetProps && <FofPrintSheet {...sheetProps} printMode={printMode} />;

  const handlePrint = () => {
    if (printBlocked) {
      toast.error('Resolve the review items before printing.');
      return;
    }
    const layoutIssue = prepareFofPrint(document.querySelector<HTMLElement>('.fof-print-root'));
    if (layoutIssue) { toast.error(layoutIssue); return; }
    window.print();
    // Printing never erases the form: the same form can be corrected and
    // reprinted until staff finish it on purpose.
    setPrintedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    setFinish(f => ({ ...f, printed: true }));
  };

  const clearForm = () => {
    importScope.current += 1;
    setConfirmState(null);
    setImporting(false);
    closeImportReview();
    dispatch({ type: 'clearAll' });
    paymentEditor.reset();
    setFeeScheduleId(NO_SCHEDULE);
    setPayScheduleId(NO_SCHEDULE);
    setAiText(null);
    setPrintedAt('');
    setFinish({ printed: false, contactConfirmed: false });
    setPreviewPage('patient');
    setEdited(false);
    setResetKey(k => k + 1);
  };

  const namingStatusText = (() => {
    switch (naming.state.status) {
      case 'working': return paymentPolicy ? 'Writing the treatment summary…' : 'Writing the treatment summary and payment names…';
      case 'retrying': return `The wording service did not answer (attempt ${naming.state.attempt} of 3). Retrying…`;
      case 'error': return naming.state.message;
      case 'unavailable': return naming.state.message;
      case 'done': return paymentPolicy ? 'Treatment summary is current.' : 'Treatment summary and payment names are current.';
      case 'waiting': return dataReady ? 'Waiting for the treatment to settle before writing the summary…' : 'Waiting for fees and settings to load…';
      default: return '';
    }
  })();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto" onChangeCapture={() => setEdited(true)}>
      <FofAssistantWidget context={assistantContext} patientName={state.patientName} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Financial Options Form</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && <Button variant="outline" asChild><Link to="/fof/settings">FOF Settings</Link></Button>}
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
          <Select value={printMode} onValueChange={v => setPrintMode(v as FofPrintMode)}>
            <SelectTrigger className="w-56" aria-label="What to print">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Patient form + office copy</SelectItem>
              <SelectItem value="patient">Patient form only</SelectItem>
              <SelectItem value="office">Office copy only (internal)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handlePrint} disabled={printBlocked}>
            <Printer className="h-4 w-4 mr-2" />
            {printedAt ? 'Reprint' : 'Print'}
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Print-only — nothing is saved</AlertTitle>
        <AlertDescription>
          Patient information on this page stays on this device and is never stored, uploaded or sent to any
          service. Print the form before leaving this page; file the signed copy per office policy.
          {printedAt ? ` Last printed at ${printedAt}; the form stays here until you clear it.` : ''}
        </AlertDescription>
      </Alert>

      {readinessIssues.length > 0 && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Some office data is not ready</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {readinessIssues.map(issue => <li key={issue}>{issue}</li>)}
            </ul>
            {(feesError || practiceError || policyError || plansQuery.error) && (
              <Button variant="outline" size="sm" className="mt-2" onClick={retryData}>Try loading again</Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {readinessWarnings.length > 0 && (
        <Alert role="status">
          <AlertTitle>No office fee schedule</AlertTitle>
          <AlertDescription>{readinessWarnings.join(' ')}</AlertDescription>
        </Alert>
      )}
      {(feesLoading || practiceLoading || policyLoading) && readinessIssues.length === 0 && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading fee schedules and office settings… codes typed now resolve as soon as they arrive.
        </p>
      )}
      {legacyPolicy && (
        <Alert role="alert">
          <AlertTitle>No office payment policy is configured</AlertTitle>
          <AlertDescription>
            This office has not saved a payment policy, so the older visit-based payment schedule is in use and the
            office copy says so. {isManager ? <Link className="underline" to="/fof/settings">Configure the office payment policy</Link> : 'Ask an owner or manager to configure it in FOF Settings'} so
            collection events follow the office's rules.
          </AlertDescription>
        </Alert>
      )}

      {templatesLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !orgCtx ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You're not part of an office yet. Ask your office manager to resend your
            invite, then open the invite link to join — the office's forms appear here
            automatically once you're in.
          </CardContent>
        </Card>
      ) : !template ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {isManager ? (
              <>No active templates. <Link className="underline" to="/fof/templates">Create one</Link> to get started.</>
            ) : (
              <>No active forms yet. Your office manager sets these up on the Templates page.</>
            )}
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
                    <Select value={doctorName} onValueChange={value => { setEdited(true); setDoctorName(value); }}>
                      <SelectTrigger aria-label="Doctor">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(practice?.doctorNames?.length ? practice.doctorNames : []).map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                        <SelectItem value={FOF_NO_DOCTOR}>{FOF_NO_DOCTOR}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Select value={template.id} onValueChange={handleTemplateChange}>
                  <SelectTrigger aria-label="Form template">
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
                        : `${selectedSchedule?.name ?? ''}${selectedPlan ? ` · ${selectedPlan.name}` : ''}${benefitsUnconfirmed ? ' · benefits unconfirmed' : ''}`
                  }
                />
                <CardContent className={collapsed.insurance ? 'hidden' : 'space-y-3'}>
                  <div className="space-y-1.5">
                    <Label>Carrier Fee Schedule</Label>
                    <Select value={feeScheduleId} onValueChange={handleScheduleChange}>
                      <SelectTrigger aria-label="Carrier Fee Schedule">
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
                      {feeScheduleId !== MANUAL_SCHEDULE && (
                        <div className="space-y-1.5">
                          <Label>Saved plan (estimate defaults)</Label>
                          {carrierPlans.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No saved plan for {selectedSchedule?.name ?? 'this carrier'} — generic defaults (100/80/50, $50 deductible, $1,500 maximum) are filled in below as unverified estimates.
                              {isManager ? <> Save a plan on <Link className="underline" to="/fof/fees">Fees &amp; Plans</Link>.</> : ''}
                            </p>
                          ) : (
                            <Select value={state.planId} onValueChange={handlePlanChange}>
                              <SelectTrigger aria-label="Saved plan">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {carrierPlans.map(plan => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                                <SelectItem value={NO_PLAN}>No saved plan — generic defaults</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                      {(schedules ?? []).some(sch => sch.kind === 'payment' && sch.isActive) && (
                        <div className="space-y-1.5">
                          <Label>Plan Payment Table (fee-schedule plans — optional)</Label>
                          <Select value={payScheduleId} onValueChange={value => { setEdited(true); setPayScheduleId(value); }}>
                            <SelectTrigger aria-label="Plan Payment Table">
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
                          {pctFields.map(([field, label]) => (
                            <div key={field} className="space-y-1.5">
                              <Label htmlFor={`fof-${field}`} className="flex items-center gap-1.5">{label}<SourceChip source={state.benefitsSource || undefined} /></Label>
                              <Input
                                id={`fof-${field}`}
                                inputMode="numeric"
                                autoComplete="off"
                                aria-invalid={parsePercentInput(state[field]) === null}
                                value={state[field]}
                                onChange={setField(field)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="fof-ded" className="flex items-center gap-1.5">Patient's Remaining Deductible<SourceChip source={state.benefitsSource || undefined} /></Label>
                          <Input
                            id="fof-ded"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-invalid={invalidMoney(state.deductibleInput)}
                            value={state.deductibleInput}
                            onChange={setBenefit('deductibleInput')}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="fof-max" className="flex items-center gap-1.5">Patient's Remaining Annual Max<SourceChip source={state.benefitsSource || undefined} /></Label>
                          <Input
                            id="fof-max"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-invalid={invalidMoney(state.annualMaxInput)}
                            value={state.annualMaxInput}
                            onChange={setBenefit('annualMaxInput')}
                          />
                        </div>
                      </div>
                      <div className={`flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs ${benefitsUnconfirmed ? 'border-amber-400 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`} role="status">
                        {benefitsUnconfirmed ? (
                          <>
                            <span className="flex-1">
                              {state.benefitsSource === 'plan'
                                ? `These are ${selectedPlan?.name ?? 'the saved plan'}'s defaults — an unverified estimate, not this patient's eligibility.`
                                : state.benefitsSource === 'default'
                                  ? 'These are generic defaults — an unverified estimate, not this patient\'s eligibility.'
                                  : 'Confirm the remaining deductible and annual maximum for this patient.'}
                              {' '}Check the patient's benefits, correct the numbers, then confirm.
                            </span>
                            <Button type="button" size="sm" variant="outline" onClick={confirmBenefits}>Confirm benefits as entered</Button>
                          </>
                        ) : (
                          <span className="flex-1">Benefits confirmed for this patient by staff (still an estimate on the printed form).</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="fof-ded-waived"
                          checked={state.deductibleWaived !== 'no'}
                          onCheckedChange={v => dispatch({ type: 'set', field: 'deductibleWaived', value: v ? '' : 'no' })}
                        />
                        <Label htmlFor="fof-ded-waived">Deductible waived for preventive care</Label>
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
                      {state.annualMaxInput.trim() !== '' && !invalidMoney(state.annualMaxInput) && (
                        <p className="text-xs font-medium">
                          {estimate.maxedOut
                            ? 'This treatment uses up the patient’s annual max — the form will say so.'
                            : `${formatCents(estimate.remainingMaxCents)} of the patient’s annual max is left after this treatment.`}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Write-offs {writeoffsApplied ? 'apply on this form' : "don't apply on this form"} —
                        they follow the carrier's "In network" marker and the saved plan on Fees &amp; Plans.
                        Allowed fees auto-fill from the selected schedule; a code the carrier has no contracted
                        rate for uses the office fee and says so. Type in the Allowed column to override a
                        line. If this treatment maxes the patient out, the form explains that later visits
                        (including hygiene) are out of pocket. None of these patient numbers are saved.
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
                  const per = perLineByKey.get(line.key);
                  const microLabel = 'text-[10px] uppercase tracking-wide text-muted-foreground';
                  const feeSource = line.feeInput.trim() === ''
                    ? (line.feeSource === 'pending' ? 'pending' : lineCode ? 'missing' : '')
                    : line.feeSource === 'import'
                      ? 'import'
                      : feeSourceFor(parseCurrencyInput(line.feeInput), officeByCode.get(lineCode)?.feeCents ?? null, false);
                  const allowedSource = !insuranceActive || !lineCode
                    ? ''
                    : line.allowedInput.trim()
                      ? 'manual'
                      : autoAllowed !== undefined
                        ? 'carrier'
                        : allowableMissing.has(lineCode)
                          ? 'missing'
                          : 'office';
                  const unmatched = lineCode !== '' && !officeByCode.has(lineCode) && !officeItemsQuery.isLoading && !!officeSchedule;
                  return (
                    <div key={line.key} className="rounded-md border p-2 space-y-1.5" data-line-code={lineCode}>
                      <div className="flex gap-1.5 items-center">
                        <Input
                          placeholder="D2740 / crown"
                            aria-label={`Procedure code, line ${i + 1}`}
                          autoComplete="off"
                          className="font-mono w-28 shrink-0"
                          value={line.code}
                          onChange={e => handleCodeChange(i, e.target.value)}
                        />
                        <Input
                          placeholder="Description"
                            aria-label={`Description for ${lineCode || `line ${i + 1}`}`}
                          autoComplete="off"
                          className="flex-1 min-w-0"
                          value={line.description}
                          onChange={e => dispatch({ type: 'setLine', index: i, patch: { description: e.target.value } })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          aria-label="Remove procedure"
                          onClick={() => dispatch({ type: 'removeLine', index: i })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {unmatched && (
                        <p className="text-xs text-amber-700" role="status">
                          {lineCode} is not on the office fee schedule
                          {line.feeInput.trim() ? ' — the typed fee is a manual entry' : ' — enter the fee by hand or pick a matching code below'}.
                        </p>
                      )}
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
                            aria-label={`Tooth for ${lineCode || `line ${i + 1}`}`}
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
                            <SelectTrigger className="h-10" aria-label="Category">
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
                          <span className={`${microLabel} flex items-center gap-1`}>Office Fee<SourceChip source={feeSource || undefined} /></span>
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="$0.00"
                            aria-label={`Office fee for ${lineCode || `line ${i + 1}`}`}
                            className="text-right"
                            aria-invalid={invalidMoney(line.feeInput) || (line.feeInput.trim() === '' && lineCode !== '')}
                            value={line.feeInput}
                            onChange={e => dispatch({ type: 'setLine', index: i, patch: { feeInput: e.target.value, feeSource: e.target.value.trim() ? 'manual' : line.feeSource === 'pending' ? 'pending' : 'missing' } })}
                          />
                        </div>
                        {insuranceEnabled && (
                          <>
                            <div className="space-y-0.5">
                              <span className={`${microLabel} flex items-center gap-1`}>Allowable<SourceChip source={allowedSource || undefined} title={allowedSource === 'missing' ? 'The carrier has no contracted rate on file for this code; the office fee stands in.' : undefined} /></span>
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
                                aria-label={`Allowable for ${lineCode || `line ${i + 1}`}`}
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
                              <span className={`${microLabel} flex items-center gap-1`}>Ins Pays<SourceChip source={line.insPayInput.trim() ? 'manual' : insuranceActive && lineCode ? (state.benefitsSource === 'plan' ? 'plan' : 'carrier') : undefined} /></span>
                              <Input
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="$0.00"
                                aria-label={`Insurance payment for ${lineCode || `line ${i + 1}`}`}
                                className="text-right"
                                aria-invalid={invalidMoney(line.insPayInput)}
                                value={
                                  line.insPayInput !== ''
                                    ? line.insPayInput
                                    : insuranceActive
                                      ? formatCents(per?.insurancePaysCents ?? 0)
                                      : ''
                                }
                                onChange={e => dispatch({ type: 'setLine', index: i, patch: { insPayInput: e.target.value } })}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {insuranceActive && per?.overrideBounded && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700" role="status">
                          <span>
                            Typed {formatCents(per.overrideBounded.typedCents)}; the plan can pay at most {formatCents(per.insurancePaysCents)} on this line
                            ({per.overrideBounded.reason === 'max' ? 'remaining annual maximum' : per.overrideBounded.reason === 'workup' ? 'work-up is never covered' : `payable basis ${formatCents(per.allowedCents)}`}).
                          </span>
                          {per.overrideBounded.reason === 'basis' && (
                            <label className="flex items-center gap-1.5">
                              <Checkbox checked={line.insPayException === 'yes'} onCheckedChange={v => dispatch({ type: 'setLine', index: i, patch: { insPayException: v === true ? 'yes' : '' } })} aria-label={`Allow the insurance payment for ${lineCode} to exceed its payable basis`} />
                              Office exception: this plan pays more than the basis (recorded on the office copy)
                            </label>
                          )}
                        </div>
                      )}
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
                            Plan downgrades to the amalgam benefit ({downgradeTo}) — default {downgradeOn ? 'on' : 'off'} per {selectedPlanDefaults?.alternateBenefitDowngrade !== null && selectedPlanDefaults ? `the ${selectedPlan?.name} plan` : 'the office FOF setting'}
                          </Label>
                        </div>
                      )}
                      {membershipActive && MEMBERSHIP_INCLUDED.has(lineCode) && (
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
                            Included with {practice?.membershipPlanName || 'membership'} — no charge (turn off if this year's
                            allowance is used up)
                          </Label>
                        </div>
                      )}
                      {!paymentPolicy && (line.workupFlag === 'yes' ||
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
                      {(line.feeFlag !== '' || line.entryDate !== '' || line.notes !== '') && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
                          {line.feeFlag !== '' && (
                            <span className="text-amber-600 font-medium">⚠ {line.feeFlag}</span>
                          )}
                          {line.notes !== '' && (
                            <span className="text-amber-700" role="status">{line.notes}</span>
                          )}
                          {line.restore !== '' && (
                            <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => restoreOverrides(i)}>
                              Restore cleared overrides
                            </Button>
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
                    title="Upload or paste (Ctrl+V) a treatment-plan screenshot — crop out the patient's name first. It is read on this device and never uploaded; estimates still come from your fee schedules."
                    onClick={() => askNoPatientInfo(() => importInputRef.current?.click())}
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Import Screenshot (on this device)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={importing}
                    title="Paste the treatment plan as text (one procedure per line) and review it before it enters the form."
                    onClick={() => setPasteOpen(true)}
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                    Paste plan text
                  </Button>
                  {(bundles ?? []).length > 0 && (
                    <Select value="" onValueChange={insertBundle}>
                      <SelectTrigger className="h-9 w-44" aria-label="Insert bundle">
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
                  {feeLines.length > 0 && namingStatusText && (
                    <div className={`flex flex-wrap items-center gap-2 text-xs ${naming.state.status === 'error' || naming.state.status === 'unavailable' ? 'text-destructive' : 'text-muted-foreground'}`} role="status" data-naming-status={naming.state.status}>
                      {aiNaming && <Loader2 className="h-3 w-3 animate-spin" />}
                      <span>{namingStatusText}</span>
                      {(naming.state.status === 'error' || naming.state.status === 'unavailable' || naming.state.status === 'done') && (
                        <Button type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={naming.retry} disabled={aiNaming || !dataReady}>
                          <Sparkles className="h-3 w-3 mr-1" />
                          {naming.state.status === 'done' ? 'Rewrite' : 'Retry'}
                        </Button>
                      )}
                    </div>
                  )}
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
                      aria-invalid={invalidMoney(state.officeDiscountInput)}
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
                      aria-invalid={invalidMoney(state.patientCreditInput)}
                      value={state.patientCreditInput}
                      onChange={setField('patientCreditInput')}
                    />
                  </div>
                </div>
                {officeDiscountCents > 0 && (
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
                {officeDiscountCents > 0 && prepayCourtesyAvailable && (
                  <div className="flex items-start gap-2 rounded-md border p-2 text-xs">
                    <Switch
                      id="fof-stack-prepay"
                      checked={state.stackPrepayApproved === 'yes'}
                      onCheckedChange={v => {
                        if (!v) { dispatch({ type: 'set', field: 'stackPrepayApproved', value: '' }); return; }
                        setConfirmState({
                          title: 'Stack two courtesies?',
                          body: 'Office policy applies one discount at a time: an office (family/courtesy) discount replaces the prepay courtesy. Turn this on only for a case a manager has approved.',
                          action: 'Approved — stack them',
                          onConfirm: () => dispatch({ type: 'set', field: 'stackPrepayApproved', value: 'yes' }),
                        });
                      }}
                    />
                    <Label htmlFor="fof-stack-prepay" className="font-normal leading-snug">
                      {prepaySuppressed
                        ? `The prepay courtesy (${discounts?.prepayDiscountLabel || 'prepay discount'}) is off because an office discount is on this form. Turn on only with manager approval to stack both.`
                        : 'Manager-approved: the prepay courtesy is stacked on top of the office discount for this case.'}
                    </Label>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  These print under the Total only when an amount is entered, and reduce
                  the Patient's Portion. Courtesy discounts (senior, membership, prepay)
                  apply automatically per the template, one at a time.
                </p>
              </CardContent>
            </Card>

            {computation && (
              <Card ref={amountsRef}>
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
                  {imbalanceCents > 0 && (
                    <p role="alert" className="text-sm text-destructive">
                      Discounts, credits and insurance exceed the total by {formatCents(imbalanceCents)}. The patient portion is shown as $0.00 but this form will not print until the credit or discount is corrected.
                    </p>
                  )}
                  {insuranceEnabled && (
                    <>
                      <OverrideRow
                        label="Estimated Insurance Payment"
                        computedCents={estimate.insurancePaysCents}
                        value={state.insuranceOverride}
                        overridden={state.insuranceOverride.trim() !== ''}
                        source={insuranceActive ? (state.benefitsSource === 'plan' ? 'plan' : 'carrier') : undefined}
                        onChange={v => dispatch({ type: 'set', field: 'insuranceOverride', value: v })}
                      />
                      {template.showWriteOff && (
                        <OverrideRow
                          label="Estimated Insurance Write-Off"
                          computedCents={estimate.writeOffCents}
                          value={state.writeOffOverride}
                          overridden={state.writeOffOverride.trim() !== ''}
                          source={insuranceActive ? 'carrier' : undefined}
                          onChange={v => dispatch({ type: 'set', field: 'writeOffOverride', value: v })}
                        />
                      )}
                      {(state.insuranceOverride.trim() !== '' || state.writeOffOverride.trim() !== '') && (
                        <p className="text-xs text-amber-700" role="status">
                          Line estimates total {formatCents(estimate.insurancePaysCents)} insurance and {formatCents(estimate.writeOffCents)} write-off; the manual totals print instead and the difference is reconciled on the office copy.
                        </p>
                      )}
                    </>
                  )}
                  <OverrideRow
                    label="Patient's Portion"
                    computedCents={computation.computed.patientPortionCents}
                    value={state.portionOverride}
                    overridden={computation.overridden.patientPortion}
                    source="policy"
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
                          source="policy"
                          onChange={v => dispatch({ type: 'set', field: 'discountOverride', value: v })}
                        />
                      )}
                      <OverrideRow
                        label="Total Due with Prepay"
                        computedCents={computation.computed.prepayTotalCents}
                        value={state.prepayOverride}
                        overridden={computation.overridden.prepayTotal}
                        source="policy"
                        onChange={v => dispatch({ type: 'set', field: 'prepayOverride', value: v })}
                      />
                    </>
                  )}
                  {paymentPolicy && <><p className="text-sm text-muted-foreground" role="status">{officeGuidance.isFetching ? 'Reading office code-bank guidance…' : officeGuidance.error ? 'Code-bank guidance is unavailable. Existing office payment rules remain in use; you can refresh and review again.' : officeGuidance.data?.recipes.length ? 'Treatment wording and grouping are drafted from office code-bank notes. Review the draft and correct this form as needed.' : 'No office code-bank guidance is available yet. The saved payment classifications and office payment rules are in use.'}</p>{officeGuidance.data?.warnings.map((warning, i) => <p key={i} className="text-sm text-amber-700">{warning}</p>)}<PaymentScheduleEditor editor={paymentEditor} /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={aiNaming || feeLines.length === 0 || policyBlocked || !dataReady} onClick={naming.retry}>Refresh treatment summary</Button><Button variant="outline" disabled={officeGuidance.isFetching || feeLines.length === 0} onClick={refreshGuidance}>Refresh code-bank guidance</Button></div></>}
                  {policyBlocked && <p role="alert" className="text-destructive">Payment policy review is required before printing. Check policy loading, classifications, adjustments, and saved overrides.</p>}
                  {(effectiveTemplate!.showInstallmentOption || legacyOverrideReview) && (
                    <>
                      {legacyOverrideReview && <div role="alert">Previous payment overrides are retained below. Review and transfer them to the event-based editor, then use Reset all to clear the previous schedule overrides.</div>}
                      <div hidden={!!paymentPolicy && !legacyOverrideReview}>
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
                          <SelectTrigger className="w-56" aria-label="Payment plan">
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
                          disabled={aiNaming || feeLines.length === 0 || !dataReady}
                          onClick={naming.retry}
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
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="flex-1 space-y-1">
                  <p className="font-medium">Finish this form</p>
                  <p className="text-xs text-muted-foreground">A memory-only checklist for the person handing off the form. Nothing here is stored; Clear erases every patient detail on this page.</p>
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={finish.printed} onCheckedChange={v => setFinish(f => ({ ...f, printed: v === true }))} aria-label="FOF printed" />FOF printed{printedAt ? ` (last at ${printedAt})` : ''}</label>
                  <label className="flex items-center gap-2 text-xs"><Checkbox checked={finish.contactConfirmed} onCheckedChange={v => setFinish(f => ({ ...f, contactConfirmed: v === true }))} aria-label="Patient contact confirmed" />Patient contact confirmed</label>
                </div>
                <Button variant="outline" onClick={clearForm}>
                  Clear form
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="lg:sticky lg:top-4 self-start">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Print Preview</CardTitle>
                <div className="flex gap-1" role="tablist" aria-label="Preview page">
                  <Button type="button" size="sm" variant={previewPage === 'patient' ? 'default' : 'outline'} role="tab" aria-selected={previewPage === 'patient'} onClick={() => setPreviewPage('patient')}>Patient form</Button>
                  <Button type="button" size="sm" variant={previewPage === 'office' ? 'default' : 'outline'} role="tab" aria-selected={previewPage === 'office'} onClick={() => setPreviewPage('office')}>Office copy</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {printBlocked && effectiveTemplate ? (
                <div role="alert" className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
                  <p className="font-semibold">Preview paused: this form needs a decision before it can print.</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {reviewReasons.map(reason => <li key={reason}>{reason}</li>)}
                  </ul>
                  {unclassifiedLines.map(line => {
                    const suggested = suggestPaymentClass(line.code);
                    return (
                      <div key={line.id} className="flex flex-wrap items-center gap-2">
                        <span>{line.code || 'This procedure'} has no saved payment classification (a manager can add one for the whole office in FOF Settings).</span>
                        <Button type="button" size="sm" onClick={() => classifyForForm(line.id, line.code, suggested)}>
                          Use {classTitle[suggested]} for this form
                        </Button>
                      </div>
                    );
                  })}
                  {benefitsUnconfirmed && !inputErrors.length && (
                    <Button type="button" size="sm" onClick={confirmBenefits}>Confirm benefits as entered</Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={openAmounts}>
                    Open Amounts &amp; Payment Plan
                  </Button>
                </div>
              ) : (
                <ScaledPrintPreview>{previewSheet}</ScaledPrintPreview>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog open={!!confirmState} onOpenChange={open => !open && setConfirmState(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription className="max-h-[35vh] overflow-y-auto whitespace-pre-line">{confirmState?.body}</AlertDialogDescription>
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

      <TreatmentImportReview
        open={!!importReview}
        source={importReview?.source ?? 'screenshot'}
        result={importReview?.result ?? null}
        previewUrl={importReview?.previewUrl}
        officeFeeFor={code => { const item = officeByCode.get(normalizeCode(code)); return item ? Math.max(0, item.feeCents) : null; }}
        onCancel={closeImportReview}
        onImport={rows => {
          const scope = importReview?.scope;
          closeImportReview();
          if (scope === importScope.current) commitImportedRows(rows);
        }}
      />

      <Dialog open={pasteOpen} onOpenChange={open => { if (!open) { setPasteOpen(false); setPasteText(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste the treatment plan</DialogTitle>
            <DialogDescription>
              One procedure per line: code, then tooth, fee and visit in any order (for example <span className="font-mono">D2740 #3 1569.00 Visit 2</span>). Leave the patient's name out. The text is read on this device only and you review every row before it enters the form.
            </DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Treatment plan text" rows={8} value={pasteText} onChange={e => setPasteText(e.target.value)} autoComplete="off" spellCheck={false} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasteOpen(false); setPasteText(''); }}>Cancel</Button>
            <Button onClick={importPastedText} disabled={!pasteText.trim()}>Review rows</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <AlertDialog open={blocker.state === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave and erase this form?</AlertDialogTitle>
            <AlertDialogDescription>This unfinished form and its payment edits exist only on this page. Leaving will erase them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Leave and erase</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Brand accent for the preview and printed sheets (org rows). */}
      {branding && <BrandPrintStyle branding={branding} />}

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the sheet. Same props as the preview — cannot diverge. */}
      {printSheet && createPortal(<div className="fof-print-root">{printSheet}</div>, document.body)}
    </div>
  );
}
