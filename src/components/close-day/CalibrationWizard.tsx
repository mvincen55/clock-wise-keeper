import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { ImageUp, Loader2, MonitorUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  captureDisplayFrame,
  captureSupported,
  destroyCapture,
  detectTimeRail,
  draftColumnsFromFrame,
  frameFromFile,
  ScheduleReaderError,
  type CaptureFrame,
  type ColumnKind,
  type LayoutColumn,
} from '@/lib/schedule-reader';
import type { LayoutSignature } from '@/lib/schedule-reader/types';
import { recognizeFrame } from '@/lib/schedule-reader/ocr';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import { useProviders, useUpdateProvider } from '@/hooks/useProviders';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { useProviderWorkingHours } from '@/hooks/useProviderWorkingHours';
import { PMS_LABELS } from '@/lib/pms';
import type { Provider } from '@/lib/providers';
import { workingScheduleText, workingTime, type WorkingPeriod } from '@/lib/provider-working-schedule';
import {
  knownProviderCodes,
  providerColumn,
  suggestColumnProvider,
  summarizeSuggestion,
  unplacedProviders,
  type ColumnSuggestionSummary,
} from '@/lib/schedule-provider-mapping';
import { useSaveLayoutProfile, useLayoutProfiles } from '@/hooks/useScheduleIntelligence';
import { hhmmToMinutes } from '@/lib/time-utils';
import ProviderWorkingSchedule from '@/components/close-day/ProviderWorkingSchedule';
import ColumnPreview from '@/components/close-day/ColumnPreview';
import { QuickPicks } from '@/components/close-day/column-suggestions';
import { columnEvidence } from '@/lib/schedule-column-evidence';
import { wipeOcrWords } from '@/lib/schedule-reader/destroy-capture';
import { columnsFromRegions, isNotesOnlyColumn, isEmptyBlueGridColumn } from '@/lib/schedule-reader/appointment-regions';
import { providerTypeForCode, readProviderCodes } from '@/lib/schedule-reader/provider-codes';

const PMS_OPTIONS = [
  'Dentrix',
  'Eaglesoft',
  'Open Dental',
  'Curve',
  'Denticon',
  'Fuse',
  'Other',
];

/** Mirrors the org_providers.schedule_code check constraint — only codes the registry accepts are recorded there. */
const REGISTRY_CODE = /^(DR|HYG|HY)[0-9]{1,4}$/;

type DraftColumn = LayoutColumn & {
  pxStart: number;
  pxEnd: number;
  /** Evidence behind the suggestion; shown to the closer, never saved. */
  suggestion?: ColumnSuggestionSummary;
  /** The provider the reader prefilled, so the card can say "suggested" until the closer changes it. */
  suggestedProviderId?: string;
};

const toLayoutColumn = ({ pxStart: _s, pxEnd: _e, suggestion: _v, suggestedProviderId: _p, ...col }: DraftColumn): LayoutColumn => col;

/** Share of the narrower lane two columns have in common, 0–1. */
const laneOverlap = (a: Pick<LayoutColumn, 'xStart' | 'xEnd'>, b: Pick<LayoutColumn, 'xStart' | 'xEnd'>) =>
  Math.max(0, Math.min(a.xEnd, b.xEnd) - Math.max(a.xStart, b.xStart)) / Math.max(1e-6, Math.min(a.xEnd - a.xStart, b.xEnd - b.xStart));

const CAPTURE_ERROR_COPY: Record<string, string> = {
  CAPTURE_PERMISSION_DENIED:
    'Screen capture was declined or blocked by this browser. Use a screenshot instead — it is still read only on this device.',
  CAPTURE_UNSUPPORTED: "This browser can't capture a window. Use a screenshot instead.",
  CAPTURE_FAILED:
    'Could not read the schedule image. Try again, or use a screenshot of the privacy-view schedule.',
  OCR_ASSETS_MISSING: 'The on-device reader is not installed in this build.',
  OCR_FAILED:
    'The on-device reader could not make out the image. Try a sharper, full-window screenshot.',
};

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * One-time PMS layout calibration.
 *
 * The office captures a privacy-view schedule, reviews each provider and
 * confirms the working-day grid. Only the
 * sanitized layout profile (relative geometry and posted capture mode) is stored — the
 * calibration screenshot itself is destroyed on save or cancel and is never
 * uploaded anywhere.
 *
 * Nothing the office has already told the app is asked for twice: the
 * practice-management system comes from Practice settings, the grid and block
 * style from the last calibration (or the screenshot's own time rail), and
 * each provider's weekly hours from the work schedule saved in Team for the
 * team member they are linked to. Every prefilled value stays editable.
 *
 * Column suggestions show their evidence — which provider code was read in
 * the lane, how often, and why that points at a provider. A code the reader
 * is sure of fills the column in for confirmation; anything less is offered
 * as a one-click pick with its reason, never chosen for the closer. Codes the
 * closer confirms for a provider are recorded on the provider registry, so
 * the next capture knows them on sight.
 */
export default function CalibrationWizard({ open, onClose }: Props) {
  const save = useSaveLayoutProfile();
  const updateProvider = useUpdateProvider();
  const { data: registry = [], isPending: providersPending, isError: providersError } = useProviders();
  const providers = registry.filter(p => p.active);
  const { data: profiles = [], isPending: profilesPending } = useLayoutProfiles();
  const { data: practice } = usePracticeSettings();
  const { data: teamHours = {} } = useProviderWorkingHours(providers);
  const defaultProfile = profiles.find(p => p.is_default) ?? profiles[0];
  const previousColumns = profiles.flatMap(p => (p.layout_signature as unknown as { columns?: LayoutColumn[] }).columns ?? []);
  const configuredPms =
    practice?.pms_system && practice.pms_system !== 'not_configured' && PMS_OPTIONS.includes(PMS_LABELS[practice.pms_system])
      ? PMS_LABELS[practice.pms_system]
      : null;

  /** Hours the office already has for a provider: the last calibration first, then the team member's saved work schedule. */
  const knownHours = (providerId: string): WorkingPeriod[] | undefined =>
    previousColumns.find(c => c.providerId === providerId && c.workingHours)?.workingHours
    ?? teamHours[providerId]?.periods;

  /** Where a provider's current hours came from, when they match a known source. */
  const hoursSource = (col: LayoutColumn): string | undefined => {
    if (!col.workingHours || !col.providerId) return undefined;
    const text = workingScheduleText(col.workingHours);
    const team = teamHours[col.providerId];
    if (team && workingScheduleText(team.periods) === text) return `Filled from ${team.source}. Adjust only if the clinic schedule differs.`;
    const prior = previousColumns.find(c => c.providerId === col.providerId && c.workingHours);
    if (prior?.workingHours && workingScheduleText(prior.workingHours) === text) return 'Kept from the last calibration.';
    return undefined;
  };

  const [step, setStep] = useState(0);
  const [pms, setPms] = useState<string>('Other');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'window' | 'screenshot' | null>(null);
  const [columns, setColumns] = useState<DraftColumn[]>([]);
  const [activeColumn, setActiveColumn] = useState<number | null>(null);
  const [pendingHours, setPendingHours] = useState<Record<string, boolean>>({});
  const onPendingHours = useCallback((id: string, pending: boolean) => setPendingHours(prev => prev[id] === pending ? prev : { ...prev, [id]: pending }), []);
  useEffect(() => { if (step !== 3) setPendingHours({}); }, [step]);
  const [dayStart, setDayStart] = useState('08:00');
  const [dayEnd, setDayEnd] = useState('17:00');
  const [minutesPerRow, setMinutesPerRow] = useState('10');
  const [blockStyle, setBlockStyle] = useState<'solid' | 'labeled' | 'mixed'>('mixed');
  const [gridSource, setGridSource] = useState<string | null>(null);
  const [pmsTouched, setPmsTouched] = useState(false);
  const prefilled = useRef(false);

  // Start from the last calibration: its grid, block style, and PMS name.
  // Once per opening — a background refetch of the profiles (every window
  // focus, i.e. every trip to the practice software) must never overwrite
  // what the closer has already edited.
  useEffect(() => {
    if (!open) {
      prefilled.current = false;
      return;
    }
    if (prefilled.current || profilesPending) return;
    prefilled.current = true;
    const signature = defaultProfile?.layout_signature as unknown as Partial<LayoutSignature> | undefined;
    const remembered = defaultProfile?.pms_name && PMS_OPTIONS.includes(defaultProfile.pms_name) ? defaultProfile.pms_name : null;
    if (remembered && !pmsTouched) setPms(remembered);
    if (signature?.timeGrid) {
      setDayStart(workingTime(signature.timeGrid.dayStartMinutes));
      setDayEnd(workingTime(signature.timeGrid.dayEndMinutes));
      setMinutesPerRow(String(signature.timeGrid.minutesPerRow));
      setGridSource('kept from the last calibration');
    }
    if (signature?.blockStyle) setBlockStyle(signature.blockStyle);
  }, [open, defaultProfile, profilesPending, pmsTouched]);

  // The PMS is canonical in Practice settings; it wins over a remembered
  // profile name until the closer picks something else here.
  useEffect(() => {
    if (open && configuredPms && !pmsTouched) setPms(configuredPms);
  }, [open, configuredPms, pmsTouched]);

  const frameRef = useRef<CaptureFrame | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStep(0);
    setConfirmed(false);
    setColumns([]);
    setActiveColumn(null);
    setGridSource(null);
    setPmsTouched(false);
  };

  const teardown = async () => {
    await destroyCapture(frameRef.current);
    frameRef.current = null;
  };

  useEffect(() => {
    if (!open) {
      void teardown();
      reset();
    }
    return () => {
      void teardown();
    };
  }, [open]);

  /** Same pipeline whichever way the image arrived: OCR, draft columns, step 1. */
  const runCalibration = async (frame: CaptureFrame) => {
    await teardown(); // a retry never leaks the previous frame
    frameRef.current = frame;
    const { words, regions = [] } = await recognizeFrame(frame.canvas);
    try {
    // The screenshot's own time rail (the labels down its left edge) says
    // when the visible day starts and ends — read it rather than asking.
    const rail = detectTimeRail(words, frame.width, hhmmToMinutes(dayStart));
    if (rail) {
      const top = Math.round(rail.minutesAt(rail.yTop) / 5) * 5;
      const bottom = Math.round(rail.minutesAt(rail.yBottom) / 5) * 5;
      if (top >= 0 && bottom <= 24 * 60 && bottom > top) {
        setDayStart(workingTime(top));
        setDayEnd(workingTime(bottom));
        setGridSource('read from the time labels in this screenshot');
      }
    }
    // The office's own codes — from the registry and earlier calibrations —
    // are the vocabulary the reader matches against, OCR slips included.
    const known = knownProviderCodes(registry, previousColumns);
    const detected = columnsFromRegions(regions, frame.width);
    const drafts = detected.length >= 1 && readProviderCodes(words, known).length
      ? detected : draftColumnsFromFrame(words, frame.width, frame.height);
    const pixels=frame.canvas.getContext('2d')?.getImageData?.(0,0,frame.width,frame.height);
    setColumns(
      drafts.filter(d => !pixels || !isEmptyBlueGridColumn(pixels,d)).map(d => {
        const suggestion = suggestColumnProvider(words, d, frame.width, frame.height, registry, previousColumns, true);
        const summary = summarizeSuggestion(suggestion);
        // Where a provider sat last time is a pick to offer, never a prefill:
        // lanes change hands between days.
        const remembered = previousColumns.find(c => c.kind !== 'non_clinical' && c.providerId && laneOverlap(c, d) >= 0.5);
        const rememberedProvider = remembered ? providers.find(p => p.id === remembered.providerId) : undefined;
        if (!suggestion.provider && rememberedProvider && !summary.candidates.some(c => c.providerId === rememberedProvider.id)) {
          summary.candidates = [...summary.candidates, { providerId: rememberedProvider.id, strength: 'possible', reason: 'was in this position in the last calibration' }];
        }
        return ({
        xStart: d.xStart,
        xEnd: d.xEnd,
        pxStart: d.xStart * frame.width,
        pxEnd: d.xEnd * frame.width,
        kind: suggestion.notesOnly || isNotesOnlyColumn(words,regions,d,frame.width) ? 'non_clinical' as ColumnKind : 'provider' as ColumnKind,
        providerLabel: null,
        providerRole: null,
        department: null,
        employeeId: null,
        providerCode: suggestion.providerCode,
        suggestion: summary,
        suggestedProviderId: suggestion.provider?.id,
        ...(suggestion.provider ? {
          ...providerColumn(suggestion.provider),
          workingHours: knownHours(suggestion.provider.id),
        } : {}),
      }); })
    );
    setStep(1);
    } finally { wipeOcrWords(words); }
  };

  const fail = async (err: unknown) => {
    const code = err instanceof ScheduleReaderError ? err.code : 'CAPTURE_FAILED';
    toast.error(CAPTURE_ERROR_COPY[code] ?? 'Something went wrong. Nothing was uploaded.');
    await teardown();
  };

  const capture = async () => {
    setBusy('window');
    try {
      await runCalibration(await captureDisplayFrame());
    } catch (err) {
      await fail(err);
    } finally {
      setBusy(null);
    }
  };

  const onScreenshotPicked = async (file: File | undefined) => {
    if (!file) return;
    setBusy('screenshot');
    try {
      await runCalibration(await frameFromFile(file));
    } catch (err) {
      await fail(err);
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setColumn = (i: number, patch: Partial<DraftColumn>) =>
    setColumns(cols => cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  /** Give a column to a provider, carrying over hours the office already knows for them. */
  const assign = (i: number, provider: Provider) => {
    const existing = columns.find(c => c.providerId === provider.id && c.workingHours);
    setColumn(i, { ...providerColumn(provider), workingHours: existing?.workingHours ?? knownHours(provider.id) });
  };

  const clinical = columns.filter(c => c.kind !== 'non_clinical');
  const assignedCount = clinical.filter(c => c.providerId).length;
  const unplaced = unplacedProviders(providers, columns);

  // Codes the closer has just tied to a provider who has none on the registry
  // yet. They are recorded on save so the daily capture knows them without a
  // saved layout. A code claimed by two providers, or a provider read under
  // two codes, is left for Settings to sort out.
  const codeUpdates = (() => {
    const byProvider = new Map<string, { provider: Provider; code: string } | null>();
    const providersByCode = new Map<string, Set<string>>();
    for (const c of clinical) {
      if (!c.providerId || !c.providerCode || !REGISTRY_CODE.test(c.providerCode)) continue;
      providersByCode.set(c.providerCode, new Set([...(providersByCode.get(c.providerCode) ?? []), c.providerId]));
      const provider = registry.find(p => p.id === c.providerId);
      if (!provider || provider.scheduleCode || registry.some(p => p.scheduleCode === c.providerCode)) continue;
      const existing = byProvider.get(provider.id);
      if (existing === undefined) byProvider.set(provider.id, { provider, code: c.providerCode });
      else if (existing && existing.code !== c.providerCode) byProvider.set(provider.id, null);
    }
    return [...byProvider.values()].filter((u): u is { provider: Provider; code: string } => !!u && (providersByCode.get(u.code)?.size ?? 0) === 1);
  })();
  const codeUpdateText = (u: { provider: Provider; code: string }) => {
    const implied = providerTypeForCode(u.code);
    const caution = implied && implied !== u.provider.providerType ? ` (${u.code.replace(/\d+$/, '')} codes usually belong to a ${implied} — double-check this pick)` : '';
    return `${u.code} as ${u.provider.displayName}'s schedule code${caution}`;
  };

  const finish = async () => {
    if (Object.values(pendingHours).some(Boolean)) return;
    const startMin = hhmmToMinutes(dayStart);
    const endMin = hhmmToMinutes(dayEnd);
    if (endMin <= startMin) {
      toast.error('The working day must end after it starts.');
      return;
    }
    const providerCols = columns.filter(c => c.kind !== 'non_clinical');
    if (providerCols.length === 0 || providerCols.some(c => !c.providerId || !c.providerRole || !c.department)) {
      toast.error('Select an office provider for every clinical column.');
      return;
    }
    try {
      await save.mutateAsync({
        id: (profiles.find(p => p.is_default) ?? profiles[0])?.id,
        name: pms === 'Other' ? 'Office schedule' : pms,
        pmsName: pms,
        isDefault: true,
        signature: {
          columns: columns.map(toLayoutColumn),
          timeGrid: {
            minutesPerRow: Number(minutesPerRow),
            yStart: 0.12,
            yEnd: 0.98,
            dayStartMinutes: startMin,
            dayEndMinutes: endMin,
          },
          captureMode: 'posted',
          cancelledRemainVisible: false,
          blockStyle,
        },
        statusLegend: [],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the layout');
      return;
    }
    const recorded: string[] = [];
    for (const u of codeUpdates) {
      try {
        await updateProvider.mutateAsync({ id: u.provider.id, scheduleCode: u.code });
        recorded.push(`${u.code} → ${u.provider.displayName}`);
      } catch {
        toast.error(`Layout saved, but ${u.code} could not be recorded as ${u.provider.displayName}'s schedule code. Add it in Settings → Office → Providers.`);
      }
    }
    toast.success(recorded.length
      ? `Schedule layout saved and ${recorded.join(', ')} recorded on the provider registry — the screenshot was destroyed, not stored.`
      : 'Schedule layout saved — the screenshot was destroyed, not stored.');
    await teardown();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calibrate Schedule Intelligence</DialogTitle>
          <DialogDescription>Confirm the providers and working day for your posted end-of-day screenshot. What the office has already set up — its practice software, provider list, and team schedules — is filled in for you. No status-color setup is needed.</DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Practice management system</Label>
              <Select value={pms} onValueChange={v => { setPmsTouched(true); setPms(v); }}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PMS_OPTIONS.map(o => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {configuredPms && (
                <p className="text-xs text-muted-foreground">
                  From Practice settings (Settings → Office). Change it there to keep every capture assistant in sync.
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Turn on your practice software's privacy view before capturing. Purple Envelope
              processes the image on this device and does not save or upload it.
            </p>
            <div className="flex items-start gap-2">
              <Checkbox
                id="cal-confirm"
                checked={confirmed}
                onCheckedChange={v => setConfirmed(v === true)}
              />
              <Label htmlFor="cal-confirm" className="text-sm font-normal leading-snug">
                Confirm that patient names, initials, phone numbers, birth dates, account
                numbers, insurance details, and identifying notes are hidden.
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              {captureSupported() && (
                <Button disabled={!confirmed || !!busy} onClick={capture}>
                  {busy === 'window' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MonitorUp className="mr-2 h-4 w-4" />
                  )}
                  Capture a privacy-view schedule
                </Button>
              )}
              <Button
                variant={captureSupported() ? 'outline' : 'default'}
                disabled={!confirmed || !!busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy === 'screenshot' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ImageUp className="mr-2 h-4 w-4" />
                )}
                Use a screenshot from this device
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                aria-label="Privacy-view schedule screenshot"
                className="hidden"
                onChange={e => onScreenshotPicked(e.target.files?.[0])}
              />
            </div>
            {busy && (
              <p className="text-xs text-muted-foreground">
                Reading the schedule on this device — nothing leaves this computer.
              </p>
            )}
            {!captureSupported() && (
              <p className="text-xs text-muted-foreground">
                This browser can't capture a window directly — take a screenshot of the
                privacy-view schedule and use it here instead.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Either way the image is read on this device, then destroyed — never stored or
              uploaded. If you use a screenshot file, delete the original afterward; Purple
              Envelope can't do that for you.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Each numbered lane in the picture is a column below; hover a column to light up its lane. Suggestions come from the provider codes read inside the appointments, and each one says why. Empty lanes are omitted and notes-only lanes are collapsed; keep early-arrival and hold lanes that reserve provider time. Each daily capture confirms its own assignments. The preview never leaves this device.
            </p>
            {providersPending ? <p role="status">Loading office providers…</p> : providersError ? <p role="alert">Could not load providers. Close and retry calibration.</p> : providers.length === 0 ? <p>Add providers in Settings → Office before mapping schedule columns.</p> : null}
            {frameRef.current && <ColumnPreview frame={frameRef.current} columns={columns} active={activeColumn} maxWidth={900} label="Calibration screenshot with numbered column boundaries" />}
            <div className="rounded-md bg-muted/50 p-3 text-sm" aria-live="polite">
              <p>
                <strong>{assignedCount} of {clinical.length} columns</strong> {clinical.length === 1 ? 'has' : 'have'} a provider
                {assignedCount < clinical.length ? ` · ${clinical.length - assignedCount} still need${clinical.length - assignedCount === 1 ? 's' : ''} your pick` : ''}.
              </p>
              {unplaced.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Not placed in any column yet: {unplaced.map(p => p.displayName + (p.scheduleCode ? ` (${p.scheduleCode})` : '')).join(', ')}. Anyone who was off on the captured day can stay unplaced.
                </p>
              )}
            </div>
            <div className="space-y-3">
              {columns.map((col, i) => col.kind !== 'non_clinical' && (
                <div key={i} className={`space-y-2 rounded-md border p-3 ${activeColumn === i ? 'border-primary/60 bg-primary/5' : ''}`}
                  onMouseEnter={() => setActiveColumn(i)} onMouseLeave={() => setActiveColumn(current => current === i ? null : current)}
                  onFocusCapture={() => setActiveColumn(i)} onBlurCapture={() => setActiveColumn(current => current === i ? null : current)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded bg-primary/10 px-1.5 text-xs font-semibold text-primary">{i + 1}</span>
                      <Label className="text-sm font-medium">Column {i + 1}</Label>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${col.providerId ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
                        {col.providerId ? (col.suggestedProviderId === col.providerId ? 'Suggested — confirm' : 'Picked') : 'Needs a pick'}
                      </span>
                    </div>
                    <Select
                      value={col.kind}
                      onValueChange={v => setColumn(i, { kind: v as ColumnKind })}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs" aria-label={`Kind of column ${i + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="provider">Provider column</SelectItem>
                        <SelectItem value="overflow">Overflow column</SelectItem>
                        <SelectItem value="non_clinical">Notes only / non-clinical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="space-y-1">
                      <Label className="text-xs">Provider</Label>
                      <Select value={col.providerId ?? ''} onValueChange={id => {
                        const provider = providers.find(p => p.id === id);
                        if (provider) assign(i, provider);
                      }}>
                        <SelectTrigger className="h-8 text-xs" aria-label={`Provider for column ${i + 1}`}><SelectValue placeholder="Select provider" /></SelectTrigger>
                        <SelectContent>{providers.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}{p.scheduleCode ? ` · ${p.scheduleCode}` : ''}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground sm:pt-5">
                      {col.providerRole && col.department ? (
                        <>
                          <span>{ROLE_LABELS[col.providerRole]}</span>
                          {' · '}
                          <span>{col.department === 'doctor' ? 'Doctor' : col.department === 'hygiene' ? 'Hygiene' : 'Other'}</span>
                        </>
                      ) : 'Type and department follow the provider'}
                    </p>
                  </div>
                  {col.suggestion && <p className="text-xs text-muted-foreground">{columnEvidence(col, col.suggestedProviderId, { remembers: true })}</p>}
                  {!col.providerId && <QuickPicks column={col} index={i} providers={providers} unplaced={unplaced} onPick={p => assign(i, p)} />}
                  <div><Button type="button" variant="ghost" size="sm" aria-label={`Exclude column ${i+1}`} onClick={() => { setColumn(i,{kind:'non_clinical'}); requestAnimationFrame(()=>document.getElementById('calibration-column-actions')?.focus()); }}>Exclude column — no appointments</Button></div>
                </div>
              ))}
            </div>
            {columns.some(c=>c.kind==='non_clinical') && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">{columns.filter(c=>c.kind==='non_clinical').length} excluded columns (empty or notes only)</summary><div className="flex flex-wrap gap-2 pt-2">{columns.map((col,i)=>col.kind==='non_clinical' && <Button key={i} variant="outline" size="sm" onClick={()=>setColumn(i,{kind:'provider'})}>Restore column {i+1}</Button>)}</div></details>}
            {codeUpdates.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Saving also records {codeUpdates.map(codeUpdateText).join(' and ')} in Settings → Office → Providers, so every future capture knows the code on sight.
              </p>
            )}
            <div id="calibration-column-actions" tabIndex={-1} className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={providersPending || providersError || !columns.some(c => c.kind !== 'non_clinical') || columns.some(c => c.kind !== 'non_clinical' && !c.providerId)} onClick={() => {
                // Fill any provider whose hours the office already knows, then
                // let those hours suggest the grid when nothing else has.
                const filled = columns.map(c => c.workingHours || !c.providerId ? c : { ...c, workingHours: knownHours(c.providerId) });
                setColumns(filled);
                if (!gridSource) {
                  const periods = filled.flatMap(c => c.workingHours ?? []).filter(p => p.endMinutes > p.startMinutes);
                  if (periods.length) {
                    setDayStart(workingTime(Math.min(...periods.map(p => p.startMinutes))));
                    setDayEnd(workingTime(Math.max(...periods.map(p => p.endMinutes))));
                    setGridSource("taken from the earliest start and latest end of the providers' hours");
                  }
                }
                setStep(3);
              }}>Next: working day</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The time grid describes the visible screenshot. Each provider’s weekly hours come from the work schedule saved in Team when the provider is linked to a team member; adjust them or attach a file only if the clinic schedule differs. Off-duty time is never counted as an opening.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cal-start">Day starts</Label>
                <Input
                  id="cal-start"
                  type="time"
                  value={dayStart}
                  onChange={e => setDayStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cal-end">Day ends</Label>
                <Input
                  id="cal-end"
                  type="time"
                  value={dayEnd}
                  onChange={e => setDayEnd(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Minutes per grid row</Label>
                <Select value={minutesPerRow} onValueChange={setMinutesPerRow}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['5', '10', '15'].map(m => (
                      <SelectItem key={m} value={m}>
                        {m} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {gridSource && (
              <p className="text-xs text-muted-foreground">Day start and end {gridSource}. Adjust them if the screenshot shows more of the day.</p>
            )}
            {[...new Map(columns.filter(c => c.kind !== 'non_clinical' && c.providerId).map(c => [c.providerId!, c])).values()].map(col => (
              <ProviderWorkingSchedule key={col.providerId} providerId={col.providerId!} name={col.providerLabel!} value={col.workingHours}
                sourceNote={hoursSource(col)}
                emptyHint={teamHours[col.providerId!] ? undefined : `No saved schedule for ${col.providerLabel} yet — link them to a team member with a work schedule (Settings → Office → Providers) and these hours fill in automatically next time.`}
                onPendingChange={onPendingHours}
                onChange={workingHours => setColumns(previous => previous.map(c => c.providerId === col.providerId ? { ...c, workingHours } : c))} />
            ))}
            <div className="space-y-1.5">
              <Label>How do lunch and admin blocks appear?</Label>
              <Select value={blockStyle} onValueChange={v => setBlockStyle(v as typeof blockStyle)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid blocks</SelectItem>
                  <SelectItem value="labeled">Text labels (e.g. "Lunch")</SelectItem>
                  <SelectItem value="mixed">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">Posted screenshots no longer show the original appointment statuses. The reader checks appointment blocks and provider codes; unclear blocks need review. Cancellation and no-show answers stay as entered in Close the Day.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={finish} disabled={save.isPending || Object.values(pendingHours).some(Boolean)}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save layout profile
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only the column map, posted capture mode, and time grid are saved. The calibration
              screenshot is destroyed and never stored.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
