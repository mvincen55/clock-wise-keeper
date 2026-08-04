import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowRight, CalendarX, Check, ChevronDown, Copy,
  Loader2, OctagonX, Plus, Printer, RotateCcw, ShieldCheck, Trash2,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import BaLetterSheet from '@/components/broken-appts/BaLetterSheet';
import BaCutoffCalculator, {
  type BaCutoffValue,
} from '@/components/broken-appts/BaCutoffCalculator';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useBrokenApptSettings } from '@/hooks/useBrokenApptSettings';
import { useBrokenApptTemplates } from '@/hooks/useBrokenApptTemplates';
import { useFofSettings } from '@/hooks/useFofTemplates';
import {
  businessHoursCutoff, isOnTime, parseLocalDateTime,
} from '@/lib/broken-appts/business-hours';
import { computeRung } from '@/lib/broken-appts/engine';
import { DEFAULT_BA_SETTINGS, RUNG_BEHAVIOR, todayEventCode } from '@/lib/broken-appts/defaults';
import {
  buildApptNote, buildLedgerChecklist, buildPopUp, buildTransactionLine, cardSentenceCode,
  feeClauseShort, formatCutoff, formatDateMDY, formatMoney, mergeFields, resolveBehaviorText,
  transactionSnippetCode,
} from '@/lib/broken-appts/outputs';
import type {
  BaCanceledAppt, BaCardState, BaLetterCode, BaPatientFields, BrokenApptType,
} from '@/lib/broken-appts/types';

/**
 * Broken Appointments — the front-desk workflow for no-shows and late
 * cancellations. Staff answers a short wizard and the page produces the
 * correct patient letter (printable), a copy-paste text reply, and the
 * Dentrix Pop-Up / appointment-note / ledger blocks. The ladder is driven
 * by the letter codes already on the ledger (the paper trail is the
 * progression driver); the business-hours calculator is an assist — never
 * a required entry step.
 *
 * HIPAA boundary (FOF precedent, src/lib/broken-appts/types.ts): every
 * patient-entered value on this page lives in React state only and dies on
 * navigation. Nothing here may write patient data to Supabase, storage,
 * URLs, analytics, or logs — outputs are copy-paste and print only, and
 * this module never sends texts or emails.
 */

type Mode = 'A' | 'B';
type Happened = 'LC' | 'NS' | 'LATE';
type Step = 'entry' | 'what' | 'paste' | 'notice' | 'ontime' | 'history' | 'card' | 'patient' | 'outputs';

const EMPTY_PATIENT: BaPatientFields = {
  firstName: '',
  lastName: '',
  addressLine1: '',
  city: '',
  state: '',
  zip: '',
  apptDateISO: '',
};

const EMPTY_APPT_ROW: BaCanceledAppt = { date: '', time: '', provider: '', visitType: '' };

const LETTER_CODE_INFO: { code: BaLetterCode; label: string }[] = [
  { code: '0001', label: 'First late cancellation (fee credited)' },
  { code: '0002', label: 'Late cancellation with prior history' },
  { code: '0003', label: 'First no-show' },
  { code: '0004', label: 'Additional broken appointment' },
  { code: '0005', label: 'VIP scheduling — terminal, now or ever' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDateOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeOf(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Copies exactly the string it renders — never a re-serialization. */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** A copy-paste output block: monospace body + one copy button. */
function OutputBlock({ title, text, hint }: { title: string; text: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <CopyButton text={text} />
      </CardHeader>
      <CardContent className="space-y-2">
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-sm">{text}</pre>
      </CardContent>
    </Card>
  );
}

function StepShell({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <CardTitle className="text-lg">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export default function BrokenAppointments() {
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const { data: settings } = useBrokenApptSettings();
  const { data: templates, isLoading: templatesLoading } = useBrokenApptTemplates();
  // Doctor options for the canceled-appointment rows come from the FOF
  // builder's list (fof_settings.doctor_names) — org config, not patient
  // data, so reading it stays inside the HIPAA boundary above.
  const { data: fofPractice } = useFofSettings();
  const fofDoctors = fofPractice?.doctorNames ?? [];

  const s = settings ?? DEFAULT_BA_SETTINGS;
  const brand = branding ?? GENERIC_BRANDING;
  const effectivePhone = s.officePhone.trim() || brand.phone.trim();
  const practiceName = brand.legalName.trim() || brand.displayName.trim();

  // ------- wizard state (patient values: browser memory only) -------
  const [step, setStep] = useState<Step>('entry');
  const [mode, setMode] = useState<Mode>('A');
  const [happened, setHappened] = useState<Happened | null>(null);
  const [pastedText, setPastedText] = useState('');

  // Step 2 — the notice question. The calculator is an optional assist
  // (the expander) whose verdict auto-selects the answer; entering dates
  // is never required.
  const [noticeAnswer, setNoticeAnswer] = useState<'yes' | 'no' | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const [apptDateISO, setApptDateISO] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [noticeDateISO, setNoticeDateISO] = useState(() => isoDateOf(new Date()));
  const [noticeTime, setNoticeTime] = useState(() => timeOf(new Date()));

  // Step 3 — history: the letter codes already on the ledger, plus the
  // transition (pre-policy) follow-up.
  const [selectedCodes, setSelectedCodes] = useState<BaLetterCode[]>([]);
  const [noneChecked, setNoneChecked] = useState(false);
  const [prePolicyPriors, setPrePolicyPriors] = useState(false);

  // Step 3½ — card state (rungs 2–5 only).
  const [cardAnswer, setCardAnswer] = useState<'yes' | 'no' | null>(null);
  const [chargeAnswer, setChargeAnswer] = useState<'yes' | 'no' | null>(null);

  // Patient info + Rung 4 canceled-appointment rows.
  const [patient, setPatient] = useState<BaPatientFields>(EMPTY_PATIENT);
  const [canceledAppts, setCanceledAppts] = useState<BaCanceledAppt[]>([{ ...EMPTY_APPT_ROW }]);
  const [wantLetter, setWantLetter] = useState(true);

  // One initials field feeds every dateline and the Pop-Up.
  const [initials, setInitials] = useState('');
  const [personalLine, setPersonalLine] = useState('');
  const [includeReplyA, setIncludeReplyA] = useState(false);
  const [followUp, setFollowUp] = useState<'reply' | 'call' | null>(null);

  // The standalone cutoff tool (side panel) — usable outside the wizard,
  // e.g. a patient calls asking their last day to cancel without a fee.
  const [toolOpen, setToolOpen] = useState(false);
  const [toolValue, setToolValue] = useState<BaCutoffValue>(() => ({
    apptDate: '',
    apptTime: '',
    noticeDate: isoDateOf(new Date()),
    noticeTime: timeOf(new Date()),
  }));

  const reset = () => {
    setStep('entry');
    setHappened(null);
    setPastedText('');
    setNoticeAnswer(null);
    setCalcOpen(false);
    setApptDateISO('');
    setApptTime('');
    const n = new Date();
    setNoticeDateISO(isoDateOf(n));
    setNoticeTime(timeOf(n));
    setSelectedCodes([]);
    setNoneChecked(false);
    setPrePolicyPriors(false);
    setCardAnswer(null);
    setChargeAnswer(null);
    setPatient(EMPTY_PATIENT);
    setCanceledAppts([{ ...EMPTY_APPT_ROW }]);
    setWantLetter(true);
    setPersonalLine('');
    setIncludeReplyA(false);
    setFollowUp(null);
  };

  // ------- derived values -------
  const todayType: BrokenApptType = mode === 'B' ? 'LC' : happened === 'LC' ? 'LC' : 'NS';
  const apptAt = parseLocalDateTime(apptDateISO, apptTime);
  const noticeAt = parseLocalDateTime(noticeDateISO, noticeTime);
  const cutoff = apptAt ? businessHoursCutoff(apptAt, s.noticeBusinessHours, s.officeClosedDates) : null;
  const calcVerdict =
    apptAt && noticeAt
      ? isOnTime(noticeAt, apptAt, s.noticeBusinessHours, s.officeClosedDates)
      : null;

  // The expander's verdict auto-selects the Yes/No (staff can override).
  useEffect(() => {
    if (calcVerdict !== null) setNoticeAnswer(calcVerdict ? 'yes' : 'no');
  }, [calcVerdict]);

  const highestLetterCode =
    LETTER_CODE_INFO.map(o => o.code)
      .filter(c => selectedCodes.includes(c))
      .pop() ?? null;
  const { rung, letterCode } = computeRung({
    todayType,
    highestLetterCode,
    hasPrePolicyPriors: noneChecked && prePolicyPriors,
  });
  const behavior = RUNG_BEHAVIOR[rung];

  const card: BaCardState = {
    cardOnFile: cardAnswer === null ? null : cardAnswer === 'yes',
    chargeSucceeded: cardAnswer === 'yes' && chargeAnswer !== null ? chargeAnswer === 'yes' : null,
  };

  const todayMDY = formatDateMDY(isoDateOf(now));
  const apptDateMDY = patient.apptDateISO
    ? formatDateMDY(patient.apptDateISO)
    : apptDateISO
      ? formatDateMDY(apptDateISO)
      : '—';
  const initialsText = initials.trim() || '__';
  const feeText = formatMoney(s.feeAmount);
  const policyDateLabel = s.policyEffectiveDate
    ? formatDateMDY(s.policyEffectiveDate)
    : 'the current policy took effect';

  const letterTemplate = letterCode
    ? templates?.find(t => t.kind === 'letter' && t.code === letterCode)
    : undefined;

  // Card-state snippets (org-editable rows) → letter merge fields.
  const snippetFields = { fee_amount: feeText };
  const snippetBody = (code: string) =>
    templates?.find(t => t.kind === 'snippet' && t.code === code)?.body ?? '';
  const letterExtraFields = {
    transaction_snippet: mergeFields(snippetBody(transactionSnippetCode(card)), snippetFields),
    card_sentence: mergeFields(snippetBody(cardSentenceCode(card)), snippetFields),
  };

  const replyFields = {
    first_name: patient.firstName.trim() || 'there',
    office_phone: effectivePhone,
    fee_amount: feeText,
    fee_clause: feeClauseShort(card, rung === 3),
    notice_hours: String(s.noticeBusinessHours),
    appt_date: apptDateMDY,
    doctor_name: practiceName || 'We',
    personal_line: personalLine.trim(),
  };

  const replyFor = (code: string): string | null => {
    const t = templates?.find(t => t.kind === 'reply' && t.code === code);
    return t ? mergeFields(t.body, replyFields) : null;
  };

  // Mode B is always LC (Rule 3); mode A no-shows reuse the outreach text.
  // Rung 5 always uses the holding reply — never outreach, never a promise.
  const replyCode =
    step === 'ontime'
      ? 'on_time'
      : rung === 5
        ? behavior.replyCode
        : mode === 'A' && todayType === 'NS'
          ? 'ns_outreach'
          : behavior.replyCode;
  const replyText = replyCode ? replyFor(replyCode) : null;

  const apptNote = buildApptNote({
    todayMDY,
    apptDateMDY,
    todayType,
    onTime: step === 'ontime',
    rung,
    pastedText: mode === 'B' ? pastedText : undefined,
    replySent: (followUp ?? (mode === 'B' ? 'reply' : 'call')) === 'reply',
    initials: initialsText,
  });

  const popUpText = buildPopUp({
    rung,
    todayType,
    card,
    settings: s,
    todayMDY,
    initials: initialsText,
  });

  // Late arrival the provider couldn't seat: 9104b posts alongside the
  // no-show code (the "dual-post" reminder from step 1).
  const baseLedgerSteps = buildLedgerChecklist({ rung, todayType, letterCode, card, settings: s });
  const ledgerSteps =
    mode === 'A' && happened === 'LATE'
      ? ['Post 9104b (late arrival)', ...baseLedgerSteps]
      : baseLedgerSteps;

  const letterSheet =
    letterTemplate && (mode === 'A' || wantLetter) && step === 'outputs' && rung !== 5 ? (
      <BaLetterSheet
        branding={brand}
        settings={s}
        body={letterTemplate.body}
        patient={patient}
        canceledAppts={rung === 4 ? canceledAppts.filter(r => r.date || r.provider || r.visitType) : []}
        todayMDY={todayMDY}
        extraFields={letterExtraFields}
      />
    ) : null;

  // ------- step transitions -------
  const startMode = (m: Mode) => {
    setMode(m);
    setHappened(m === 'B' ? 'LC' : null);
    setStep(m === 'B' ? 'paste' : 'what');
  };

  const goPatient = () => {
    setPatient(p => ({ ...p, apptDateISO: p.apptDateISO || apptDateISO }));
    setStep('patient');
  };

  // Rung 1 never asks the card question; Rung 5 collects no letter details.
  const continueFromHistory = () => {
    if (rung === 1) goPatient();
    else setStep('card');
  };
  const continueFromCard = () => {
    if (rung === 5) setStep('outputs');
    else goPatient();
  };

  const historyAnswered = selectedCodes.length > 0 || noneChecked;
  const cardAnswered =
    cardAnswer !== null && (rung < 3 || cardAnswer === 'no' || chargeAnswer !== null);

  const applyCalcPatch = (patch: Partial<BaCutoffValue>) => {
    if (patch.apptDate !== undefined) setApptDateISO(patch.apptDate);
    if (patch.apptTime !== undefined) setApptTime(patch.apptTime);
    if (patch.noticeDate !== undefined) setNoticeDateISO(patch.noticeDate);
    if (patch.noticeTime !== undefined) setNoticeTime(patch.noticeTime);
  };

  const toggleCode = (code: BaLetterCode, checked: boolean) => {
    setNoneChecked(false);
    setSelectedCodes(prev =>
      checked ? [...prev.filter(c => c !== code), code] : prev.filter(c => c !== code)
    );
  };

  // ------- screens -------
  const trustLine = (
    <Alert>
      <ShieldCheck className="h-4 w-4" />
      <AlertTitle>Print & copy only — nothing is saved</AlertTitle>
      <AlertDescription>
        Nothing entered here is saved or sent anywhere. It exists only on this screen and
        on paper.
      </AlertDescription>
    </Alert>
  );

  const referencePanel = (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ChevronDown className="h-4 w-4 mr-1.5" />
          Policy reference — the governing rules
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="pt-4 text-sm space-y-2">
            <p>
              <strong>1.</strong> Broken appointments (no-shows + late cancels) count
              cumulatively within a rolling {s.historyWindowYears}-year window. When more
              than one rung could apply, the highest rung wins — and the ladder is driven
              by the letter codes already on the ledger, so the paper trail is the
              progression driver.
            </p>
            <p>
              <strong>2.</strong> Notice window = {s.noticeBusinessHours} business hours,
              excluding weekends{s.officeClosedDates.length > 0 ? ' and office closed dates' : ''}.
            </p>
            <p>
              <strong>3.</strong> A retrievable, timestamped message (voicemail to the
              office line, text to the office number, email to the office address)
              received before the appointment time = <strong>late cancellation</strong>,
              even if staff never responded. No retrievable record, personal-channel
              messages, or silence = <strong>no-show</strong>. A pasted text is therefore
              always the late-cancel type.
            </p>
            <p>
              <strong>4.</strong> Confirmation never waives the policy.
            </p>
            <p>
              <strong>5.</strong> Transition: broken appointments before {policyDateLabel}{' '}
              never count toward the ladder and get no retroactive letters — they only
              set the entry point. The first post-policy break is handled at Rung 2
              (0002 for a late cancel — no courtesy credit; 0003 for a no-show).
            </p>
            <div className="pt-1 text-xs text-muted-foreground space-y-1">
              <p>Rung 1 — first late cancel, clean history: {feeText} posted + courtesy credit (net $0), letter 0001, no Pop-Up.</p>
              <p>Rung 2 — first no-show (letter 0003) or first late cancel with pre-policy priors (letter 0002): {feeText} outstanding, Pop-Up, scheduling blocked. Never charged — the card promise starts here.</p>
              <p>Rung 3 — a 0001/0002 on the ledger (or 0003 + late cancel): letter 0004, card charged per the prior promise (else posted), card on file required.</p>
              <p>Rung 4 — 0003 + no-show (double no-show) or 0004 on the ledger: letter 0005, VIP-only scheduling.</p>
              <p>
                Rung 5 — 0005 on the ledger (now or ever): hard stop, Office Manager
                handles, no letter. Terminal — a return to regular scheduling never
                resets it.
              </p>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );

  const cutoffTool = (
    <Collapsible open={toolOpen} onOpenChange={setToolOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ChevronDown className="h-4 w-4 mr-1.5" />
          Cutoff calculator — a patient's last day to cancel without a fee
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="pt-4">
            <BaCutoffCalculator
              value={toolValue}
              onChange={patch => setToolValue(v => ({ ...v, ...patch }))}
              noticeBusinessHours={s.noticeBusinessHours}
              officeClosedDates={s.officeClosedDates}
              ariaPrefix="Tool "
            />
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );

  const entryScreen = (
    <div className="grid gap-3 sm:grid-cols-2">
      <button className="text-left group" onClick={() => startMode('A')}>
        <Card className="h-full transition-colors group-hover:border-primary/40">
          <CardContent className="pt-6 space-y-1.5">
            <CalendarX className="h-6 w-6 text-primary" />
            <p className="font-semibold">Broken appointment</p>
            <p className="text-sm text-muted-foreground">
              A no-show, late cancellation, or late arrival — walk through what happened
              and get the letter and Dentrix blocks.
            </p>
          </CardContent>
        </Card>
      </button>
      <button className="text-left group" onClick={() => startMode('B')}>
        <Card className="h-full transition-colors group-hover:border-primary/40">
          <CardContent className="pt-6 space-y-1.5">
            <Copy className="h-6 w-6 text-primary" />
            <p className="font-semibold">Respond to a cancellation text</p>
            <p className="text-sm text-muted-foreground">
              Paste the patient's text, check the window, and copy the right reply.
            </p>
          </CardContent>
        </Card>
      </button>
    </div>
  );

  const whatScreen = (
    <StepShell title="Step 1 — What happened?" onBack={() => setStep('entry')}>
      <RadioGroup value={happened ?? ''} onValueChange={v => setHappened(v as Happened)}>
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <RadioGroupItem value="LC" id="ba-lc" className="mt-0.5" />
          <Label htmlFor="ba-lc" className="font-normal cursor-pointer">
            <span className="font-medium">Late cancellation with a retrievable message</span>
            <br />
            <span className="text-sm text-muted-foreground">
              Voicemail to the office line, text to the office number, or email to the
              office address — received before the appointment time.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <RadioGroupItem value="NS" id="ba-ns" className="mt-0.5" />
          <Label htmlFor="ba-ns" className="font-normal cursor-pointer">
            <span className="font-medium">No-show, or no retrievable record</span>
            <br />
            <span className="text-sm text-muted-foreground">
              Silence, a personal-channel message, or nothing we can retrieve with a
              timestamp.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <RadioGroupItem value="LATE" id="ba-late" className="mt-0.5" />
          <Label htmlFor="ba-late" className="font-normal cursor-pointer">
            <span className="font-medium">
              Late arrival (10+ minutes) the provider couldn't accommodate
            </span>
            <br />
            <span className="text-sm text-muted-foreground">Treated as a no-show.</span>
            <Badge variant="outline" className="ml-2 align-middle">
              dual-post 9104b + 9100
            </Badge>
          </Label>
        </div>
      </RadioGroup>
      <div className="flex justify-end">
        <Button disabled={!happened} onClick={() => setStep('notice')}>
          Continue
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </StepShell>
  );

  const pasteScreen = (
    <StepShell title="Step 1 — Paste the patient's text" onBack={() => setStep('entry')}>
      <p className="text-sm text-muted-foreground">
        A pasted text is a retrievable, timestamped message — this counts as a{' '}
        <strong>late cancellation</strong> (Rule 3), never a no-show.
      </p>
      <Textarea
        value={pastedText}
        onChange={e => setPastedText(e.target.value)}
        placeholder="Paste the text message here…"
        rows={4}
      />
      <div className="flex justify-end">
        <Button disabled={pastedText.trim() === ''} onClick={() => setStep('notice')}>
          Continue
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </StepShell>
  );

  const noticeScreen = (
    <StepShell
      title="Step 2 — Was there enough notice?"
      onBack={() => setStep(mode === 'B' ? 'paste' : 'what')}
    >
      <p className="text-sm text-muted-foreground">
        Did the patient give at least {s.noticeBusinessHours} business hours' notice?
        Weekends{s.officeClosedDates.length > 0 ? ' and office closed dates' : ''} don't
        count toward the window.
      </p>
      <RadioGroup value={noticeAnswer ?? ''} onValueChange={v => setNoticeAnswer(v as 'yes' | 'no')}>
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <RadioGroupItem value="yes" id="ba-notice-yes" className="mt-0.5" />
          <Label htmlFor="ba-notice-yes" className="font-normal cursor-pointer">
            <span className="font-medium">
              Yes — at least {s.noticeBusinessHours} business hours before the appointment
            </span>
            <br />
            <span className="text-sm text-muted-foreground">
              No fee — post 9102 and reschedule normally.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <RadioGroupItem value="no" id="ba-notice-no" className="mt-0.5" />
          <Label htmlFor="ba-notice-no" className="font-normal cursor-pointer">
            <span className="font-medium">No — inside the window, or no notice at all</span>
            <br />
            <span className="text-sm text-muted-foreground">The policy applies.</span>
          </Label>
        </div>
      </RadioGroup>
      {cutoff && (
        <p className="text-xs text-muted-foreground">
          Cutoff was {formatCutoff(cutoff)}
          {calcVerdict !== null && (calcVerdict ? ' — the notice made it in time.' : ' — this notice is late.')}
        </p>
      )}
      <Collapsible open={calcOpen} onOpenChange={setCalcOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ChevronDown className="h-4 w-4 mr-1.5" />
            Not sure? Check the cutoff
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <BaCutoffCalculator
            value={{ apptDate: apptDateISO, apptTime, noticeDate: noticeDateISO, noticeTime }}
            onChange={applyCalcPatch}
            noticeBusinessHours={s.noticeBusinessHours}
            officeClosedDates={s.officeClosedDates}
          />
        </CollapsibleContent>
      </Collapsible>
      <div className="flex justify-end">
        <Button
          disabled={noticeAnswer === null}
          onClick={() => setStep(noticeAnswer === 'yes' ? 'ontime' : 'history')}
        >
          Continue
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </StepShell>
  );

  const onTimeScreen = (
    <StepShell title="On time — no fee" onBack={() => setStep('notice')}>
      <Alert>
        <Check className="h-4 w-4" />
        <AlertTitle>No fee — post 9102, reschedule normally</AlertTitle>
        <AlertDescription>
          The notice arrived with enough time. Post event code 9102 and offer a new
          appointment; no letter and no Pop-Up.
        </AlertDescription>
      </Alert>
      {mode === 'B' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ba-ontime-first">Patient first name (for the reply)</Label>
              <Input
                id="ba-ontime-first"
                value={patient.firstName}
                onChange={e => setPatient(p => ({ ...p, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ba-ontime-personal">Personal line (optional)</Label>
              <Input
                id="ba-ontime-personal"
                value={personalLine}
                onChange={e => setPersonalLine(e.target.value)}
                placeholder='e.g. "Hope the little one feels better soon!"'
              />
            </div>
          </div>
          {replyText && <OutputBlock title="Reply to copy-paste" text={replyText} />}
          <OutputBlock
            title="Appointment note (Dentrix)"
            text={apptNote}
            hint="Paste into the appointment note."
          />
        </>
      )}
    </StepShell>
  );

  const historyScreen = (
    <StepShell title="Step 3 — Patient history" onBack={() => setStep('notice')}>
      <p className="text-sm text-muted-foreground">
        Check the patient's ledger. Which of these letter codes appear within the last{' '}
        {s.historyWindowYears} years? The highest code drives today's rung.
      </p>
      <div className="space-y-2">
        {LETTER_CODE_INFO.map(({ code, label }) => (
          <div key={code} className="flex items-start gap-2 rounded-lg border p-3">
            <Checkbox
              id={`ba-code-${code}`}
              checked={selectedCodes.includes(code)}
              onCheckedChange={v => toggleCode(code, v === true)}
              className="mt-0.5"
            />
            <Label htmlFor={`ba-code-${code}`} className="font-normal cursor-pointer">
              <span className="font-medium">{code}</span>
              <span className="text-muted-foreground"> — {label}</span>
            </Label>
          </div>
        ))}
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <Checkbox
            id="ba-code-none"
            checked={noneChecked}
            onCheckedChange={v => {
              setNoneChecked(v === true);
              if (v === true) setSelectedCodes([]);
            }}
            className="mt-0.5"
          />
          <Label htmlFor="ba-code-none" className="font-normal cursor-pointer">
            <span className="font-medium">None of these letter codes appear</span>
          </Label>
        </div>
      </div>

      {noneChecked && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch id="ba-prepolicy" checked={prePolicyPriors} onCheckedChange={setPrePolicyPriors} />
          <Label htmlFor="ba-prepolicy" className="font-normal cursor-pointer">
            <span className="font-medium">
              Any broken appointments before {policyDateLabel}?
            </span>
            <br />
            <span className="text-sm text-muted-foreground">
              Pre-policy breaks get no retroactive letters and never climb the ladder —
              they only set the entry point (first post-policy break lands at Rung 2, no
              courtesy credit).
            </span>
          </Label>
        </div>
      )}

      {selectedCodes.includes('0005') && (
        <p className="text-sm text-muted-foreground rounded-lg border p-3">
          0005 is terminal: even after a return to regular scheduling, every broken
          appointment goes to the Office Manager.
        </p>
      )}

      <div className="flex justify-end">
        <Button disabled={!historyAnswered} onClick={continueFromHistory}>
          Continue
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </StepShell>
  );

  const cardScreen = (
    <StepShell title="Step 3½ — Is a credit card on file?" onBack={() => setStep('history')}>
      <RadioGroup value={cardAnswer ?? ''} onValueChange={v => setCardAnswer(v as 'yes' | 'no')}>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <RadioGroupItem value="yes" id="ba-card-yes" />
          <Label htmlFor="ba-card-yes" className="font-normal cursor-pointer">
            Yes — a credit card is on file
          </Label>
        </div>
        <div className="flex items-center gap-2 rounded-lg border p-3">
          <RadioGroupItem value="no" id="ba-card-no" />
          <Label htmlFor="ba-card-no" className="font-normal cursor-pointer">
            No card on file
          </Label>
        </div>
      </RadioGroup>

      {rung === 2 && (
        <p className="text-sm text-muted-foreground">
          Rung 2 is never charged — the card is only ever charged after a prior Pop-Up
          promised it, and that promise starts today. This answer only adjusts the letter
          wording and the checklist.
        </p>
      )}

      {rung >= 3 && cardAnswer === 'yes' && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="font-medium">Did the {feeText} charge go through?</Label>
          <RadioGroup
            value={chargeAnswer ?? ''}
            onValueChange={v => setChargeAnswer(v as 'yes' | 'no')}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="ba-charge-yes" />
              <Label htmlFor="ba-charge-yes" className="font-normal cursor-pointer">
                Yes — the charge went through
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="ba-charge-no" />
              <Label htmlFor="ba-charge-no" className="font-normal cursor-pointer">
                No — the card failed
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={!cardAnswered} onClick={continueFromCard}>
          Continue
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </StepShell>
  );

  const updateApptRow = (i: number, patch: Partial<BaCanceledAppt>) =>
    setCanceledAppts(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const patientScreen = (
    <StepShell
      title="Step 4 — Patient info"
      onBack={() => setStep(rung === 1 ? 'history' : 'card')}
    >
      {mode === 'B' && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch id="ba-want-letter" checked={wantLetter} onCheckedChange={setWantLetter} />
          <Label htmlFor="ba-want-letter" className="font-normal cursor-pointer">
            <span className="font-medium">Also print the letter now (recommended)</span>
            <br />
            <span className="text-sm text-muted-foreground">
              Off = reply only; only the first name is needed.
            </span>
          </Label>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ba-first">First name</Label>
          <Input
            id="ba-first"
            value={patient.firstName}
            onChange={e => setPatient(p => ({ ...p, firstName: e.target.value }))}
          />
        </div>
        {(mode === 'A' || wantLetter) && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ba-last">Last name</Label>
              <Input
                id="ba-last"
                value={patient.lastName}
                onChange={e => setPatient(p => ({ ...p, lastName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ba-addr">Street address</Label>
              <Input
                id="ba-addr"
                value={patient.addressLine1}
                onChange={e => setPatient(p => ({ ...p, addressLine1: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ba-city">City</Label>
              <Input
                id="ba-city"
                value={patient.city}
                onChange={e => setPatient(p => ({ ...p, city: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="space-y-1.5 w-24">
                <Label htmlFor="ba-state">State</Label>
                <Input
                  id="ba-state"
                  value={patient.state}
                  onChange={e => setPatient(p => ({ ...p, state: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="ba-zip">ZIP</Label>
                <Input
                  id="ba-zip"
                  value={patient.zip}
                  onChange={e => setPatient(p => ({ ...p, zip: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ba-appt-date">Appointment date (on the letter)</Label>
              <Input
                id="ba-appt-date"
                type="date"
                value={patient.apptDateISO}
                onChange={e => setPatient(p => ({ ...p, apptDateISO: e.target.value }))}
              />
            </div>
          </>
        )}
      </div>

      {rung === 4 && (mode === 'A' || wantLetter) && (
        <div className="space-y-2">
          <Label>Canceled future appointments (listed in the 0005 letter)</Label>
          {canceledAppts.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Input
                type="date"
                value={row.date}
                onChange={e => updateApptRow(i, { date: e.target.value })}
                className="w-40"
                aria-label={`Appointment ${i + 1} date`}
              />
              <Input
                type="time"
                value={row.time}
                onChange={e => updateApptRow(i, { time: e.target.value })}
                className="w-28"
                aria-label={`Appointment ${i + 1} time`}
              />
              {fofDoctors.length > 0 ? (
                <Select
                  value={row.provider}
                  onValueChange={v => updateApptRow(i, { provider: v })}
                >
                  <SelectTrigger className="w-36" aria-label={`Appointment ${i + 1} provider`}>
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {fofDoctors.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // Free text only until an admin fills in the FOF doctor list.
                <Input
                  placeholder="Provider"
                  value={row.provider}
                  onChange={e => updateApptRow(i, { provider: e.target.value })}
                  className="w-36"
                  aria-label={`Appointment ${i + 1} provider`}
                />
              )}
              <Input
                placeholder="Visit type"
                value={row.visitType}
                onChange={e => updateApptRow(i, { visitType: e.target.value })}
                className="w-40"
                aria-label={`Appointment ${i + 1} visit type`}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCanceledAppts(rows => rows.filter((_, j) => j !== i))}
                aria-label={`Remove appointment ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCanceledAppts(rows => [...rows, { ...EMPTY_APPT_ROW }])}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add appointment
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={patient.firstName.trim() === ''} onClick={() => setStep('outputs')}>
          Continue to outputs
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </StepShell>
  );

  const cardStateSummary =
    card.cardOnFile === null
      ? 'Not checked.'
      : card.cardOnFile === false
        ? 'No card on file.'
        : card.chargeSucceeded === true
          ? `Card on file — the ${feeText} charge went through.`
          : card.chargeSucceeded === false
            ? `Card on file, but the ${feeText} charge failed.`
            : 'Card on file.';

  // Rung 5 rulings (management, final): no letter is EVER sent at Rung 5
  // — not even a first-no-show letter — so the screen carries only the OM
  // instructions and the holding reply (offered in both modes; a Rung 5
  // no-show never gets the outreach text). 0005 is terminal: once it has
  // appeared on the ledger, every subsequent break lands here.
  const stopScreen = (
    <div className="space-y-4">
      <Alert variant="destructive">
        <OctagonX className="h-4 w-4" />
        <AlertTitle>HARD STOP — front desk does not handle</AlertTitle>
        <AlertDescription>
          0005 is on this patient's ledger — everything from here is the Office
          Manager's process: do not post fees, do not send any letter (no letter ever
          goes out at Rung 5), do not reschedule.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">For the Office Manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Card state: </span>
            {cardStateSummary}
          </p>
          <ul className="list-disc pl-5 space-y-1">
            {ledgerSteps.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {popUpText && (
        <OutputBlock
          title="Pop-Up update (Dentrix)"
          text={popUpText}
          hint="Update the existing VIP Pop-Up with today's event — do not create a new one."
        />
      )}

      <div className="space-y-1.5 max-w-sm">
        <Label htmlFor="ba-stop-first">Patient first name (for the holding reply)</Label>
        <Input
          id="ba-stop-first"
          value={patient.firstName}
          onChange={e => setPatient(p => ({ ...p, firstName: e.target.value }))}
        />
      </div>
      {replyText && (
        <OutputBlock
          title="Holding reply (the only reply for Rung 5)"
          text={replyText}
          hint="No scheduling promises — the Office Manager reaches out directly."
        />
      )}
    </div>
  );

  const outputsScreen =
    rung === 5 ? (
      stopScreen
    ) : (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{`Rung ${rung}`}</Badge>
              <Badge variant="outline">
                {todayType === 'LC' ? 'Late cancellation' : 'No-show'}
              </Badge>
              {letterCode && <Badge variant="outline">{`Letter ${letterCode}`}</Badge>}
              {mode === 'A' && happened === 'LATE' && (
                <Badge variant="outline">dual-post 9104b + 9100</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p>
              <span className="font-medium">Transaction: </span>
              {buildTransactionLine(rung, todayType, card, s)}
            </p>
            <p>
              <span className="font-medium">Scheduling: </span>
              {resolveBehaviorText(behavior.schedulingStatus, s)}
            </p>
          </CardContent>
        </Card>

        {(mode === 'A' || wantLetter) && letterCode && (
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                Letter {letterCode} — print &amp; mail with the account statement
              </CardTitle>
              <Button onClick={() => window.print()} disabled={!letterSheet}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </CardHeader>
            <CardContent>
              {letterSheet ? (
                <ScaledPrintPreview>{letterSheet}</ScaledPrintPreview>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Letter template {letterCode} isn't set up for this office yet —
                  an owner or manager can open this page once to seed the defaults.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {mode === 'A' && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Checkbox
              id="ba-include-reply"
              checked={includeReplyA}
              onCheckedChange={v => setIncludeReplyA(v === true)}
            />
            <Label htmlFor="ba-include-reply" className="font-normal cursor-pointer text-sm">
              {todayType === 'NS'
                ? 'Include a follow-up text (outreach — the patient never texted us)'
                : 'Patient canceled by text — include a reply to copy-paste'}
            </Label>
          </div>
        )}

        {(mode === 'B' || includeReplyA) && replyText && (
          <>
            <div className="space-y-1.5 max-w-lg">
              <Label htmlFor="ba-personal">Personal line (optional, inserted where marked)</Label>
              <Input
                id="ba-personal"
                value={personalLine}
                onChange={e => setPersonalLine(e.target.value)}
                placeholder='e.g. "Hope the little one feels better soon!"'
              />
            </div>
            <OutputBlock title="Reply to copy-paste" text={replyText} />
          </>
        )}

        <div className="flex items-center gap-4">
          <Label className="text-sm">Follow-up recorded in the note:</Label>
          <RadioGroup
            className="flex gap-4"
            value={followUp ?? (mode === 'B' ? 'reply' : 'call')}
            onValueChange={v => setFollowUp(v as 'reply' | 'call')}
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="reply" id="ba-fu-reply" />
              <Label htmlFor="ba-fu-reply" className="font-normal">Reply sent</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="call" id="ba-fu-call" />
              <Label htmlFor="ba-fu-call" className="font-normal">Call made</Label>
            </div>
          </RadioGroup>
        </div>

        <OutputBlock
          title="Appointment note (Dentrix)"
          text={apptNote}
          hint="Paste into the appointment note."
        />

        {popUpText ? (
          <OutputBlock
            title={`Pop-Up (Dentrix)${rung === 4 ? ' — VIP variant' : ''}`}
            text={popUpText}
            hint="Create or update the patient's Pop-Up alert."
          />
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Rung 1 gets <strong>no Pop-Up</strong> — the courtesy credit means there's
              nothing to block.
            </CardContent>
          </Card>
        )}

        <OutputBlock
          title="Ledger checklist"
          text={ledgerSteps.map(line => `☐ ${line}`).join('\n')}
          hint={`Today's event code: ${todayEventCode(todayType)}.`}
        />
      </div>
    );

  const stepScreens: Record<Step, React.ReactNode> = {
    entry: entryScreen,
    what: whatScreen,
    paste: pasteScreen,
    notice: noticeScreen,
    ontime: onTimeScreen,
    history: historyScreen,
    card: cardScreen,
    patient: patientScreen,
    outputs: outputsScreen,
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{s.moduleNavLabel}</h1>
        <div className="flex items-center gap-2">
          <Label htmlFor="ba-initials" className="text-sm text-muted-foreground">
            Your initials
          </Label>
          <Input
            id="ba-initials"
            value={initials}
            onChange={e => setInitials(e.target.value)}
            className="w-20"
            maxLength={4}
          />
          {step !== 'entry' && (
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Start over
            </Button>
          )}
        </div>
      </div>

      {trustLine}
      {referencePanel}
      {cutoffTool}

      {!ctx ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            You're not part of an office yet. Ask your office manager to resend your
            invite — this workflow appears automatically once you're in.
          </CardContent>
        </Card>
      ) : templatesLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        stepScreens[step]
      )}

      {/* Brand accent for the preview and printed letter (org rows). */}
      <BrandPrintStyle branding={brand} />

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the letter (FOF pattern). */}
      {letterSheet && createPortal(<div className="ba-print-root">{letterSheet}</div>, document.body)}
    </div>
  );
}
