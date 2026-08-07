import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, CalendarX, Calculator, Camera, Check, ChevronDown, Copy, Info,
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
import BaOfficeCopySheet from '@/components/broken-appts/BaOfficeCopySheet';
import PmsCaptureDialog, { type CaptureTarget } from '@/components/broken-appts/PmsCaptureDialog';
import SignerSelect from '@/components/letterhead/SignerSelect';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useBrokenApptSettings } from '@/hooks/useBrokenApptSettings';
import { useBrokenApptTemplates } from '@/hooks/useBrokenApptTemplates';
import { useCorrespondenceSettings } from '@/hooks/useCorrespondenceSettings';
import { useFofSettings } from '@/hooks/useFofTemplates';
import { useMyStaffCode } from '@/hooks/useStaffCodes';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { useSignerOptions } from '@/hooks/useSignerOptions';
import { useSignatureImage } from '@/hooks/useStaffSignature';
import { businessHoursCutoff, isOnTime } from '@/lib/broken-appts/business-hours';
import { computeRung } from '@/lib/broken-appts/engine';
import { DEFAULT_BA_SETTINGS, RUNG_BEHAVIOR, todayEventCode } from '@/lib/broken-appts/defaults';
import {
  buildApptNote, buildLedgerChecklist, buildPopUp, formatDateMDY,
  formatDateTimeMDY, formatLedgerChecklist, formatMoney, mergeFields, resolveBehaviorText,
} from '@/lib/broken-appts/outputs';
import {
  completionLabel, pruneChecklistState, toggleChecklistItem, type ChecklistState,
} from '@/lib/broken-appts/checklist';
import type { ParsedAddress, ParsedAppt } from '@/lib/broken-appts/dentrix-parse';
import { DEFAULT_CORRESPONDENCE_SETTINGS } from '@/lib/letters/types';
import { pmsCaptureProfile } from '@/lib/pms';
import { staffCodeLabel } from '@/lib/staff-code';
import type {
  BaCanceledAppt, BaPatientFields, BrokenApptType, Rung,
} from '@/lib/broken-appts/types';

/**
 * Broken Appointments — the front-desk decision and documentation tool for
 * no-shows and late cancellations. Decision first: the page asks only what
 * the policy engine needs (what happened, was there enough notice, prior
 * history), shows the rung and its operational instructions immediately,
 * and everything else — mailing details, Dentrix copy blocks, the
 * interactive ledger checklist, the letter preview — lives further down ONE
 * continuous page (FOF philosophy, no wizard). Fast enough to use while the
 * patient is still on the phone.
 *
 * The business-hours calculator is OPTIONAL: staff who already know the
 * cancellation was late simply answer "No" and keep moving.
 *
 * HIPAA boundary (FOF precedent, src/lib/broken-appts/types.ts): every
 * patient-entered value — and every checklist timestamp for this patient's
 * workflow — lives in React state only and dies on navigation. Nothing here
 * may write patient data to Supabase, storage, URLs, analytics, or logs —
 * outputs are copy-paste and print only, and this module never sends texts
 * or emails. PMS screenshots are handled entirely by PmsCaptureDialog under
 * the same boundary.
 */

type Mode = 'A' | 'B';
type Happened = 'LC' | 'NS' | 'LATE';
type NoticeAnswer = 'yes' | 'no' | null;

const EMPTY_PATIENT: BaPatientFields = {
  firstName: '',
  lastName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  apptDateISO: '',
};

const EMPTY_APPT_ROW: BaCanceledAppt = { date: '', time: '', provider: '', visitType: '' };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDateOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function timeOf(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseLocal(dateISO: string, time: string): Date | null {
  if (!dateISO || !time) return null;
  const d = new Date(`${dateISO}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
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

export default function BrokenAppointments() {
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const { data: settings } = useBrokenApptSettings();
  const { data: templates, isLoading: templatesLoading } = useBrokenApptTemplates();
  const { data: practice } = usePracticeSettings();
  const { data: correspondence = DEFAULT_CORRESPONDENCE_SETTINGS } = useCorrespondenceSettings();
  const { options: signerOptions, defaultKey: signerDefaultKey } = useSignerOptions();
  // Attribution is the canonical office-assigned staff code — never typed
  // initials, never an email (src/lib/staff-code.ts).
  const { code: myStaffCode } = useMyStaffCode();
  // Doctor options for the 9107 rows come from the FOF builder's list
  // (fof_settings.doctor_names) — org config, not patient data, so reading
  // it stays inside the HIPAA boundary above.
  const { data: fofPractice } = useFofSettings();
  const fofDoctors = fofPractice?.doctorNames ?? [];

  const s = settings ?? DEFAULT_BA_SETTINGS;
  const brand = branding ?? GENERIC_BRANDING;
  const effectivePhone = s.officePhone.trim() || brand.phone.trim();
  const practiceName = brand.legalName.trim() || brand.displayName.trim();
  const captureProfile = pmsCaptureProfile(practice?.pms_system ?? 'not_configured');

  // ------- workflow state (patient values: browser memory only) -------
  const [mode, setMode] = useState<Mode>('A');
  const [happened, setHappened] = useState<Happened | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [noticeAnswer, setNoticeAnswer] = useState<NoticeAnswer>(null);

  // Optional calculator — notice defaults to "now" (open time).
  const [calcOpen, setCalcOpen] = useState(false);
  const [apptDateISO, setApptDateISO] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [noticeDateISO, setNoticeDateISO] = useState(() => isoDateOf(new Date()));
  const [noticeTime, setNoticeTime] = useState(() => timeOf(new Date()));

  // History within the rolling window.
  const [priorLCInput, setPriorLCInput] = useState('0');
  const [priorNSInput, setPriorNSInput] = useState('0');
  const [onVip, setOnVip] = useState(false);

  // Patient info + Rung 4 canceled-appointment rows.
  const [patient, setPatient] = useState<BaPatientFields>(EMPTY_PATIENT);
  const [canceledAppts, setCanceledAppts] = useState<BaCanceledAppt[]>([{ ...EMPTY_APPT_ROW }]);
  const [wantLetter, setWantLetter] = useState(true);

  const [personalLine, setPersonalLine] = useState('');
  const [includeReplyA, setIncludeReplyA] = useState(false);
  const [followUp, setFollowUp] = useState<'reply' | 'call' | null>(null);

  // Interactive checklist completions (memory-only; printed on OFFICE COPY).
  const [checklist, setChecklist] = useState<ChecklistState>({});

  // Shared-correspondence signer for the patient letter.
  const [signerKey, setSignerKey] = useState<string | null>(null);
  const [signerTitle, setSignerTitle] = useState<string | null>(null);

  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);

  const today = useMemo(() => new Date(), []);

  const reset = () => {
    setMode('A');
    setHappened(null);
    setPastedText('');
    setNoticeAnswer(null);
    setCalcOpen(false);
    setApptDateISO('');
    setApptTime('');
    const n = new Date();
    setNoticeDateISO(isoDateOf(n));
    setNoticeTime(timeOf(n));
    setPriorLCInput('0');
    setPriorNSInput('0');
    setOnVip(false);
    setPatient(EMPTY_PATIENT);
    setCanceledAppts([{ ...EMPTY_APPT_ROW }]);
    setWantLetter(true);
    setPersonalLine('');
    setIncludeReplyA(false);
    setFollowUp(null);
    setChecklist({});
    setSignerKey(null);
    setSignerTitle(null);
    setCaptureTarget(null);
  };

  // ------- derived values -------
  const todayType: BrokenApptType = mode === 'B' ? 'LC' : happened === 'LC' ? 'LC' : 'NS';
  const eventDescribed = mode === 'B' ? pastedText.trim() !== '' : happened !== null;
  const onTime = noticeAnswer === 'yes';
  // The rung is answerable once we know what happened and that notice was
  // insufficient — patient info is never a prerequisite.
  const decidedLate = eventDescribed && noticeAnswer === 'no';

  const apptAt = parseLocal(apptDateISO, apptTime);
  const noticeAt = parseLocal(noticeDateISO, noticeTime);
  const cutoff = apptAt ? businessHoursCutoff(apptAt, s.noticeBusinessHours, s.officeClosedDates) : null;
  const calcOnTime =
    apptAt && noticeAt
      ? isOnTime(noticeAt, apptAt, s.noticeBusinessHours, s.officeClosedDates)
      : null;

  const priorLC = Math.max(0, parseInt(priorLCInput, 10) || 0);
  const priorNS = Math.max(0, parseInt(priorNSInput, 10) || 0);
  const rung: Rung = computeRung({ todayType, priorLC, priorNS, onVip });
  const behavior = RUNG_BEHAVIOR[rung];

  const todayMDY = formatDateMDY(isoDateOf(today));
  const apptDateMDY = apptDateISO ? formatDateMDY(apptDateISO) : '—';
  const stampCode = myStaffCode ?? '';

  // Rung 3's late cancel gets its own letter (0002) when the org has it.
  const letterCode =
    todayType === 'LC' &&
    behavior.letterCodeLC &&
    templates?.some(t => t.kind === 'letter' && t.code === behavior.letterCodeLC)
      ? behavior.letterCodeLC
      : behavior.letterCode;
  const letterTemplate = letterCode
    ? templates?.find(t => t.kind === 'letter' && t.code === letterCode)
    : undefined;

  const replyFields = {
    first_name: patient.firstName.trim() || 'there',
    office_phone: effectivePhone,
    fee_amount: formatMoney(s.feeAmount),
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
  const replyCode = onTime
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
    onTime,
    rung,
    pastedText: mode === 'B' ? pastedText : undefined,
    replySent: (followUp ?? (mode === 'B' ? 'reply' : 'call')) === 'reply',
    initials: stampCode,
  });

  const popUpText = buildPopUp({
    rung,
    todayType,
    settings: s,
    todayMDY,
    initials: stampCode,
  });

  const ledgerSteps = useMemo(() => {
    const steps = buildLedgerChecklist(rung, todayType, s, letterCode ?? undefined);
    // Late arrival the provider couldn't seat: 9104b posts alongside the
    // no-show code (the "dual-post" reminder).
    if (mode === 'A' && happened === 'LATE') {
      return ['Post 9104b (late arrival)', ...steps];
    }
    return steps;
  }, [rung, todayType, s, mode, happened, letterCode]);

  // A rung change mid-workflow drops completions for actions that no longer
  // apply — the OFFICE COPY documents only the applicable checklist.
  useEffect(() => {
    setChecklist(prev => pruneChecklistState(prev, ledgerSteps));
  }, [ledgerSteps]);

  const checklistRows = ledgerSteps.map(label => ({
    label,
    completion: checklist[label] ?? null,
  }));

  // ------- shared-correspondence signer (letter closing block) -------
  const signer = signerOptions.find(o => o.key === (signerKey ?? signerDefaultKey));
  const { data: inkDataUrl } = useSignatureImage(signer?.signatureUserId ?? null);
  const resolvedSigner = {
    closing: correspondence.defaultClosing,
    name: signer?.name ?? (s.signatureName.trim() || practiceName),
    title: signerTitle ?? signer?.title ?? '',
    signatureDataUrl: inkDataUrl ?? null,
  };

  const patientFullName = [patient.firstName, patient.lastName]
    .map(p => p.trim())
    .filter(Boolean)
    .join(' ');

  // ------- print package -------
  const letterWanted = mode === 'A' || wantLetter;
  const letterApplicable = decidedLate && rung !== 5 && letterWanted && !!letterTemplate;

  const officeCopySheet = decidedLate ? (
    <BaOfficeCopySheet
      patientName={patientFullName}
      apptDateMDY={apptDateMDY}
      eventLabel={todayType === 'LC' ? 'Late cancellation' : 'No-show'}
      rung={rung}
      eventCode={todayEventCode(todayType)}
      workflowDateMDY={todayMDY}
      staffCode={staffCodeLabel(myStaffCode)}
      checklist={checklistRows}
      startOnNewPage={letterApplicable}
    />
  ) : null;

  const letterSheet = letterApplicable ? (
    <BaLetterSheet
      branding={brand}
      settings={s}
      body={letterTemplate!.body}
      patient={{ ...patient, apptDateISO }}
      canceledAppts={rung === 4 ? canceledAppts.filter(r => r.date || r.provider || r.visitType) : []}
      todayISO={isoDateOf(today)}
      signer={resolvedSigner}
      extraPages={officeCopySheet}
    />
  ) : null;

  // Print order: patient letter → attachment (when the rung needs it) →
  // OFFICE COPY documentation. With no letter (Rung 5, reply-only), the
  // office copy prints alone.
  const printContent = letterSheet ?? (officeCopySheet && (
    <div className="letter-sheet">{officeCopySheet}</div>
  ));

  const anythingEntered =
    eventDescribed || noticeAnswer !== null || patient.firstName.trim() !== '' ||
    Object.keys(checklist).length > 0;

  // ------- capture apply handlers -------
  const applyCapturedAddress = (a: ParsedAddress) => {
    setPatient(p => ({
      ...p,
      addressLine1: a.addressLine1.trim(),
      addressLine2: a.addressLine2.trim(),
      city: a.city.trim(),
      state: a.state.trim(),
      zip: a.zip.trim(),
    }));
  };

  const applyCapturedAppointments = (rows: ParsedAppt[]) => {
    const mapped: BaCanceledAppt[] = rows.map(r => ({
      date: r.date,
      time: r.time,
      provider: r.provider,
      visitType: '',
    }));
    setCanceledAppts(prev => {
      const kept = prev.filter(r => r.date || r.time || r.provider || r.visitType);
      return [...kept, ...mapped];
    });
  };

  // ------- small shared pieces -------
  const staffCodePrompt = (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>No staff code assigned yet</AlertTitle>
      <AlertDescription>
        The note, Pop-Up, and checklist are stamped with your office staff code.
        Ask a manager to assign yours under Team — codes are never guessed from
        names or emails.
      </AlertDescription>
    </Alert>
  );

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
              than one rung could apply, the highest rung wins.
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
            <div className="pt-1 text-xs text-muted-foreground space-y-1">
              <p>Rung 1 — first late cancel: {formatMoney(s.feeAmount)} posted + courtesy credit (net $0), letter 9101A.</p>
              <p>Rung 2 — first no-show: {formatMoney(s.feeAmount)} outstanding, letter 9100A, Pop-Up, scheduling blocked.</p>
              <p>Rung 3 — second break: {formatMoney(s.feeAmount)} outstanding, letter 9106, card on file required.</p>
              <p>Rung 4 — third break (or repeat no-show): card charged, letter 9107, VIP-only scheduling.</p>
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

  const dentrixHelp = (whereHint: string) =>
    captureProfile ? (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-2">
            <Info className="h-3.5 w-3.5 mr-1" />
            Where do I find this in {captureProfile.shortName}?
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            {captureProfile.openSteps.map((step, i) => (
              <p key={i}>{i + 1}. {step}</p>
            ))}
            <p className="font-medium">{whereHint}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    ) : null;

  const captureButton = (target: CaptureTarget) =>
    captureProfile ? (
      <Button variant="outline" size="sm" onClick={() => setCaptureTarget(target)}>
        <Camera className="h-4 w-4 mr-1.5" />
        Capture from {captureProfile.shortName}
      </Button>
    ) : null;

  // ------- Section A: decision -------
  const calculatorDialog = (
    <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Business-hour notice calculator</DialogTitle>
          <DialogDescription>
            Weekends{s.officeClosedDates.length > 0 ? ' and office closed dates' : ''} never
            count toward the {s.noticeBusinessHours} business hours.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Appointment date &amp; time</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                aria-label="Appointment date"
                value={apptDateISO}
                onChange={e => setApptDateISO(e.target.value)}
              />
              <Input
                type="time"
                aria-label="Appointment time"
                value={apptTime}
                onChange={e => setApptTime(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>When the notice arrived</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                aria-label="Notice date"
                value={noticeDateISO}
                onChange={e => setNoticeDateISO(e.target.value)}
              />
              <Input
                type="time"
                aria-label="Notice time"
                value={noticeTime}
                onChange={e => setNoticeTime(e.target.value)}
                className="w-32"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Defaults to now. Use the message's timestamp when it arrived earlier.
            </p>
          </div>
        </div>

        {cutoff && (
          <Alert variant={calcOnTime === false ? 'destructive' : 'default'}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              Cutoff for enough notice: {formatDateTimeMDY(cutoff)}
            </AlertTitle>
            <AlertDescription>
              {s.noticeBusinessHours} business hours before the appointment — weekends
              {s.officeClosedDates.length > 0 ? ' and office closed dates' : ''} don't count.
              {calcOnTime !== null &&
                (calcOnTime
                  ? ' This notice made it in time.'
                  : ' This notice is inside the window — the policy applies.')}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setCalcOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={calcOnTime === null}
            onClick={() => {
              setNoticeAnswer(calcOnTime ? 'yes' : 'no');
              setCalcOpen(false);
            }}
          >
            Apply Result
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const decisionCard = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">What happened?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="text-left"
            onClick={() => {
              setMode('A');
              setHappened(null);
            }}
          >
            <div
              className={`h-full rounded-lg border p-3 transition-colors ${
                mode === 'A' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <CalendarX className="h-4 w-4 text-primary" />
                Broken appointment
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                No-show, late cancellation, or late arrival.
              </p>
            </div>
          </button>
          <button
            className="text-left"
            onClick={() => {
              setMode('B');
              setHappened('LC');
            }}
          >
            <div
              className={`h-full rounded-lg border p-3 transition-colors ${
                mode === 'B' ? 'border-primary bg-primary/5' : 'hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                <Copy className="h-4 w-4 text-primary" />
                Respond to a cancellation text
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste the patient's text and copy the right reply.
              </p>
            </div>
          </button>
        </div>

        {mode === 'A' ? (
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
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              A pasted text is a retrievable, timestamped message — this counts as a{' '}
              <strong>late cancellation</strong> (Rule 3), never a no-show.
            </p>
            <Textarea
              value={pastedText}
              onChange={e => setPastedText(e.target.value)}
              placeholder="Paste the text message here…"
              rows={3}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-medium">Was enough notice given?</Label>
            <RadioGroup
              value={noticeAnswer ?? ''}
              onValueChange={v => setNoticeAnswer(v as NoticeAnswer)}
              className="flex flex-wrap items-center gap-4"
            >
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="yes" id="ba-notice-yes" />
                <Label htmlFor="ba-notice-yes" className="font-normal">Yes</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="no" id="ba-notice-no" />
                <Label htmlFor="ba-notice-no" className="font-normal">No</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCalcOpen(true)}
                type="button"
              >
                <Calculator className="h-4 w-4 mr-1.5" />
                Not sure? Calculate
              </Button>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {s.noticeBusinessHours} business hours, excluding weekends
              {s.officeClosedDates.length > 0 ? ' and office closed dates' : ''}. If you
              already know, just answer — the calculator is optional.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ba-appt-date">Appointment date (for the note &amp; letter)</Label>
            <Input
              id="ba-appt-date"
              type="date"
              value={apptDateISO}
              onChange={e => setApptDateISO(e.target.value)}
              className="w-44"
            />
          </div>
        </div>

        {noticeAnswer === 'no' && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Broken appointments (late cancels and no-shows) in the last{' '}
              {s.historyWindowYears} years — check the Office Journal and family file.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ba-prior-lc">Prior late cancellations</Label>
                <Input
                  id="ba-prior-lc"
                  type="number"
                  min={0}
                  value={priorLCInput}
                  onChange={e => setPriorLCInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ba-prior-ns">Prior no-shows</Label>
                <Input
                  id="ba-prior-ns"
                  type="number"
                  min={0}
                  value={priorNSInput}
                  onChange={e => setPriorNSInput(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch id="ba-vip" checked={onVip} onCheckedChange={setOnVip} />
              <Label htmlFor="ba-vip" className="font-normal cursor-pointer">
                <span className="font-medium">
                  0005 is on the patient's ledger (VIP-only scheduling — now or ever)
                </span>
                <br />
                <span className="text-sm text-muted-foreground">
                  0005 is terminal: even after a return to regular scheduling, every broken
                  appointment goes to the Office Manager.
                </span>
              </Label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ------- rung result -------
  const onTimeResult = (
    <div className="space-y-4">
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
          {stampCode === '' ? (
            staffCodePrompt
          ) : (
            <OutputBlock
              title="Appointment note (Dentrix)"
              text={apptNote}
              hint="Paste into the appointment note."
            />
          )}
        </>
      )}
    </div>
  );

  const rungBanner = (
    <Card className="border-primary/50">
      <CardContent className="pt-5 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-3xl font-bold">Rung {rung}</span>
          <Badge variant="outline" className="text-sm">
            {todayType === 'LC' ? 'Late Cancellation' : 'No-Show'}
          </Badge>
          <Badge className="text-sm">Today's code: {todayEventCode(todayType)}</Badge>
          {mode === 'A' && happened === 'LATE' && (
            <Badge variant="outline">dual-post 9104b + 9100</Badge>
          )}
        </div>
        <div className="text-sm space-y-1">
          <p>
            <span className="font-medium">Transaction: </span>
            {resolveBehaviorText(behavior.transactionLine, s)}
          </p>
          <p>
            <span className="font-medium">Scheduling: </span>
            {resolveBehaviorText(behavior.schedulingStatus, s)}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  // ------- interactive checklist (shared by rungs 1–4 and the Rung 5 stop) --
  const checklistCard = (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          {rung === 5 ? 'For the Office Manager' : 'Ledger / action checklist'}
        </CardTitle>
        {stampCode !== '' && (
          <CopyButton text={formatLedgerChecklist(ledgerSteps, stampCode)} label="Copy for Dentrix" />
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Today's event code: {todayEventCode(todayType)}. Check items off as you do
          them — completions are stamped and printed on the OFFICE COPY page, and
          never saved anywhere.
        </p>
        {stampCode === '' && staffCodePrompt}
        {ledgerSteps.map(label => {
          const completion = checklist[label] ?? null;
          return (
            <div key={label} className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id={`ba-check-${label}`}
                checked={completion !== null}
                disabled={stampCode === ''}
                onCheckedChange={v =>
                  setChecklist(prev => toggleChecklistItem(prev, label, v === true, stampCode))
                }
              />
              <Label
                htmlFor={`ba-check-${label}`}
                className="font-normal cursor-pointer flex-1"
              >
                <span className={completion ? 'line-through text-muted-foreground' : ''}>
                  {label}
                </span>
                {completion && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {completionLabel(completion)}
                  </span>
                )}
              </Label>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );

  // ------- Rung 5 hard stop -------
  const stopResult = (
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

      {checklistCard}

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

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Office documentation</CardTitle>
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print office copy
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Prints the OFFICE COPY page only — no patient letter ever goes out at
            Rung 5.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  // ------- sections B–F (rungs 1–4) -------
  const updateApptRow = (i: number, patch: Partial<BaCanceledAppt>) =>
    setCanceledAppts(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const patientCard = (
    <Card>
      <CardHeader className="pb-3 flex-row flex-wrap items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base">Patient information</CardTitle>
        <div className="flex items-center gap-2">{captureButton('address')}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {dentrixHelp(captureProfile?.targetHints.address ?? '')}
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
          {letterWanted && (
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
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ba-addr2">Address line 2 (optional)</Label>
                <Input
                  id="ba-addr2"
                  value={patient.addressLine2}
                  onChange={e => setPatient(p => ({ ...p, addressLine2: e.target.value }))}
                  placeholder="Apt 3B · Unit 4 · Suite 2"
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
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Shown ONLY when the policy outcome acts on future appointments
  // (behavior.futureAppts — the engine decides, not the screen).
  const futureApptsCard = behavior.futureAppts && letterWanted ? (
    <Card>
      <CardHeader className="pb-3 flex-row flex-wrap items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base">
          Future appointments (canceled — listed in the {letterCode} letter)
        </CardTitle>
        <div className="flex items-center gap-2">{captureButton('appointments')}</div>
      </CardHeader>
      <CardContent className="space-y-2">
        {dentrixHelp(captureProfile?.targetHints.appointments ?? '')}
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
              value={row.time}
              onChange={e => updateApptRow(i, { time: e.target.value })}
              className="w-28"
              placeholder="8:40 AM"
              aria-label={`Appointment ${i + 1} time`}
            />
            {fofDoctors.length > 0 && !row.provider.match(/^[A-Z]{2,4}\d{1,3}$/) ? (
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
              // Free text when no FOF doctor list exists, or when a captured
              // provider code (e.g. HY14) isn't in the registry.
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
      </CardContent>
    </Card>
  ) : null;

  const communicationCard = (
    <div className="space-y-4">
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
    </div>
  );

  const outputBlocks = stampCode === '' ? (
    staffCodePrompt
  ) : (
    <>
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
            No Pop-Up required for this rung — Rung 1's courtesy credit means
            there's nothing to block.
          </CardContent>
        </Card>
      )}
    </>
  );

  const letterCard = letterWanted && letterCode ? (
    <Card>
      <CardHeader className="pb-2 flex-row flex-wrap items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base">
          Letter {letterCode} — print &amp; mail with the account statement
        </CardTitle>
        <Button onClick={() => window.print()} disabled={!letterSheet}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {letterTemplate ? (
          <>
            <SignerSelect
              value={signer?.key ?? signerDefaultKey}
              onChange={(key, option) => {
                setSignerKey(key);
                setSignerTitle(option ? option.title || null : null);
              }}
              title={resolvedSigner.title}
              onTitleChange={setSignerTitle}
            />
            <p className="text-xs text-muted-foreground">
              Prints on the shared office letterhead. The OFFICE COPY documentation
              page prints last — keep it for the office, not the envelope.
            </p>
            <ScaledPrintPreview>{letterSheet}</ScaledPrintPreview>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Letter template {letterCode} isn't set up for this office yet —
            an owner or manager can open this page once to seed the defaults.
          </p>
        )}
      </CardContent>
    </Card>
  ) : (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Office documentation</CardTitle>
        <Button onClick={() => window.print()} variant="outline" disabled={!printContent}>
          <Printer className="h-4 w-4 mr-2" />
          Print office copy
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Reply-only workflow — no letter selected. The OFFICE COPY page documents
          what was completed.
        </p>
      </CardContent>
    </Card>
  );

  const lateWorkspace = (
    <div className="space-y-4">
      {rungBanner}
      {patientCard}
      {futureApptsCard}
      {communicationCard}
      {outputBlocks}
      {checklistCard}
      {letterCard}
    </div>
  );

  const workspace = !eventDescribed || noticeAnswer === null ? (
    <Card>
      <CardContent className="py-6 text-sm text-muted-foreground">
        {mode === 'B' && pastedText.trim() === ''
          ? 'Paste the patient\'s text and answer the notice question — the rung and every instruction appear right here.'
          : 'Answer what happened and whether enough notice was given — the rung and every instruction appear right here. No other details are needed first.'}
      </CardContent>
    </Card>
  ) : onTime ? (
    onTimeResult
  ) : rung === 5 ? (
    stopResult
  ) : (
    lateWorkspace
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{s.moduleNavLabel}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" title="Your office staff code — stamped on notes and the checklist">
            {staffCodeLabel(myStaffCode)}
          </Badge>
          {anythingEntered && (
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Start over
            </Button>
          )}
        </div>
      </div>

      {trustLine}
      {referencePanel}

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
        <>
          {decisionCard}
          {workspace}
        </>
      )}

      {calculatorDialog}

      <PmsCaptureDialog
        open={captureTarget !== null}
        onOpenChange={open => {
          if (!open) setCaptureTarget(null);
        }}
        target={captureTarget ?? 'address'}
        profile={captureProfile}
        onApplyAddress={applyCapturedAddress}
        onApplyAppointments={applyCapturedAppointments}
      />

      {/* Brand accent for the preview and printed letter (org rows). */}
      <BrandPrintStyle branding={brand} />

      {/* Hidden print copy, portaled outside #root so print CSS can show
          only the letter package (FOF pattern). */}
      {printContent && createPortal(<div className="letter-print-root">{printContent}</div>, document.body)}
    </div>
  );
}
