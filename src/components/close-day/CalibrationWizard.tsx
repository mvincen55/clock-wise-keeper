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
import { useProviders } from '@/hooks/useProviders';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { useProviderWorkingHours } from '@/hooks/useProviderWorkingHours';
import { PMS_LABELS } from '@/lib/pms';
import { describeWorkingHours, workingScheduleText, workingTime, type WorkingPeriod } from '@/lib/provider-working-schedule';
import { providerColumn, suggestColumnProvider } from '@/lib/schedule-provider-mapping';
import { useSaveLayoutProfile, useLayoutProfiles } from '@/hooks/useScheduleIntelligence';
import { formatClockRange, hhmmToMinutes } from '@/lib/time-utils';
import ProviderWorkingSchedule from '@/components/close-day/ProviderWorkingSchedule';
import { wipeOcrWords } from '@/lib/schedule-reader/destroy-capture';
import { columnsFromRegions, isNotesOnlyColumn, isEmptyBlueGridColumn } from '@/lib/schedule-reader/appointment-regions';
import { readProviderCodes } from '@/lib/schedule-reader/provider-codes';

const PMS_OPTIONS = [
  'Dentrix',
  'Eaglesoft',
  'Open Dental',
  'Curve',
  'Denticon',
  'Fuse',
  'Other',
];

type DraftColumn = LayoutColumn & { pxStart: number; pxEnd: number };

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
 * practice-management system comes from Practice settings, the grid from the
 * screenshot's own time rail (else the last calibration, else the providers'
 * hours), and each provider's weekly hours from the work schedule saved in
 * Team for the team member they are linked to. The last step is a summary of
 * what was read with one Save; the fields behind it open only on request.
 * The block-style setting is carried over from the last layout, never asked —
 * nothing in the reader consumes it.
 */
export default function CalibrationWizard({ open, onClose }: Props) {
  const save = useSaveLayoutProfile();
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
  const [pendingHours, setPendingHours] = useState<Record<string, boolean>>({});
  const onPendingHours = useCallback((id: string, pending: boolean) => setPendingHours(prev => prev[id] === pending ? prev : { ...prev, [id]: pending }), []);
  /** The review step shows a summary; the editable fields open only when asked for. */
  const [adjust, setAdjust] = useState(false);
  useEffect(() => { if (step !== 3) { setPendingHours({}); setAdjust(false); } }, [step]);
  const [dayStart, setDayStart] = useState('08:00');
  const [dayEnd, setDayEnd] = useState('17:00');
  const [minutesPerRow, setMinutesPerRow] = useState('10');
  const [blockStyle, setBlockStyle] = useState<'solid' | 'labeled' | 'mixed'>('mixed');
  const [gridSource, setGridSource] = useState<string | null>(null);
  const [rowSource, setRowSource] = useState<string | null>(null);
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
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setStep(0);
    setConfirmed(false);
    setColumns([]);
    setGridSource(null);
    setRowSource(null);
    setPmsTouched(false);
    setAdjust(false);
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

  // Paint the in-memory frame into the preview whenever it should be visible.
  useEffect(() => {
    const frame = frameRef.current;
    const preview = previewRef.current;
    if (!frame || !preview || step < 1 || step > 2) return;
    const scale = Math.min(1, 900 / frame.width);
    preview.width = Math.round(frame.width * scale);
    preview.height = Math.round(frame.height * scale);
    const ctx = preview.getContext('2d');
    if (ctx) ctx.drawImage(frame.canvas, 0, 0, preview.width, preview.height);
  }, [step, columns.length]);

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
      // The minute marks between hour labels (":10", ":20") give the row size.
      if (rail.rowMinutes) {
        setMinutesPerRow(String(rail.rowMinutes));
        setRowSource('read from the minute marks in this screenshot');
      }
    }
    const detected = columnsFromRegions(regions, frame.width);
    const drafts = detected.length >= 1 && readProviderCodes(words).length
      ? detected : draftColumnsFromFrame(words, frame.width, frame.height);
    const pixels=frame.canvas.getContext('2d')?.getImageData?.(0,0,frame.width,frame.height);
    setColumns(
      drafts.filter(d => !pixels || !isEmptyBlueGridColumn(pixels,d)).map(d => {
        const suggestion = suggestColumnProvider(words, d, frame.width, frame.height, providers, previousColumns, true);
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

  const finish = async () => {
    if (Object.values(pendingHours).some(Boolean)) return;
    const startMin = hhmmToMinutes(dayStart);
    const endMin = hhmmToMinutes(dayEnd);
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
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
          columns: columns.map(({ pxStart: _s, pxEnd: _e, ...col }) => col),
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
      toast.success('Schedule layout saved — the screenshot was destroyed, not stored.');
      await teardown();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the layout');
    }
  };

  /** One entry per provider for the review step, however many columns they occupy. */
  const reviewed = [...new Map(columns.filter(c => c.kind !== 'non_clinical' && c.providerId).map(c => [c.providerId!, c])).values()];

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calibrate Schedule Intelligence</DialogTitle>
          <DialogDescription>The reader fills in what it can from the screenshot and from what the office has already set up. Check it and save.</DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4">
            {configuredPms ? (
              <p className="text-sm">
                Practice software: <span className="font-medium">{configuredPms}</span>
                <span className="text-muted-foreground"> — from Practice settings (Settings → Office).</span>
              </p>
            ) : (
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
              </div>
            )}
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
              Review the suggested providers. Empty columns are omitted and notes-only columns are collapsed. Keep early-arrival and hold columns that reserve provider time; assign related columns to the correct provider. Each daily capture confirms its own assignments. The preview never leaves this device.
            </p>
            {providersPending ? <p role="status">Loading office providers…</p> : providersError ? <p role="alert">Could not load providers. Close and retry calibration.</p> : providers.length === 0 ? <p>Add providers in Settings → Office before mapping schedule columns.</p> : null}
            <canvas ref={previewRef} className="w-full rounded border" />
            <div className="space-y-3">
              {columns.map((col, i) => col.kind !== 'non_clinical' && (
                <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Column {i + 1}</Label>
                    <Select
                      value={col.kind}
                      onValueChange={v => setColumn(i, { kind: v as ColumnKind })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="provider">Provider column</SelectItem>
                        <SelectItem value="overflow">Overflow column</SelectItem>
                        <SelectItem value="non_clinical">Notes only / non-clinical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Provider</Label>
                        <Select value={col.providerId ?? ''} onValueChange={id => {
                          const provider = providers.find(p => p.id === id);
                          if (provider) {
                            const existing = columns.find(c => c.providerId === id && c.workingHours);
                            setColumn(i, { ...providerColumn(provider), workingHours: existing?.workingHours ?? knownHours(id) });
                          }
                        }}>
                          <SelectTrigger className="h-8 text-xs" aria-label={`Provider for column ${i + 1}`}><SelectValue placeholder="Select provider" /></SelectTrigger>
                          <SelectContent>{providers.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}</SelectContent>
                        </Select>
                        {col.providerCode && <p className="text-xs text-muted-foreground">Schedule ID: {col.providerCode}</p>}
                        {col.providerCode && !col.providerId && <p className="text-xs text-muted-foreground">Code read from appointments. Select its provider once; saving the layout remembers this match.</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Provider type</Label>
                        <p className="text-xs py-2">{col.providerRole ? ROLE_LABELS[col.providerRole] : 'Select provider'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Department</Label>
                        <p className="text-xs py-2">{col.department === 'doctor' ? 'Doctor' : col.department === 'hygiene' ? 'Hygiene' : col.department ? 'Other' : 'Select provider'}</p>
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-4"><Button type="button" variant="ghost" size="sm" aria-label={`Exclude column ${i+1}`} onClick={() => { setColumn(i,{kind:'non_clinical'}); requestAnimationFrame(()=>document.getElementById('calibration-column-actions')?.focus()); }}>Exclude column — no appointments</Button></div>
                </div>
              ))}
            </div>
            {columns.some(c=>c.kind==='non_clinical') && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">{columns.filter(c=>c.kind==='non_clinical').length} excluded columns (empty or notes only)</summary><div className="flex flex-wrap gap-2 pt-2">{columns.map((col,i)=>col.kind==='non_clinical' && <Button key={i} variant="outline" size="sm" onClick={()=>setColumn(i,{kind:'provider'})}>Restore column {i+1}</Button>)}</div></details>}
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
              }}>Next: review and save</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Here is what will be saved. Off-duty hours are never counted as openings. Save it, or adjust anything that looks wrong.
            </p>
            <ul className="space-y-2 text-sm">
              <li className="rounded-md border p-3">
                <p className="font-medium">Working day {formatClockRange(dayStart, dayEnd)}</p>
                <p className="text-xs text-muted-foreground">
                  {gridSource ? `Day start and end ${gridSource}.` : 'A default working day — adjust it if the screenshot shows a different range.'} Rows of {minutesPerRow} minutes{rowSource ? `, ${rowSource}` : ''}.
                </p>
              </li>
              {reviewed.map(col => {
                const source = hoursSource(col);
                return (
                  <li key={col.providerId} className="rounded-md border p-3">
                    <p className="font-medium">{col.providerLabel}</p>
                    {col.workingHours ? (
                      <>
                        <p>{describeWorkingHours(col.workingHours)}</p>
                        {source && <p className="text-xs text-muted-foreground">{source}</p>}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No saved hours, so off-duty time will read as open. Link {col.providerLabel} to a team member with a work schedule (Settings → Office → Providers) so they fill in next time, or add them {adjust ? 'below' : 'under Adjust'}.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {adjust ? (
              <div className="space-y-4 rounded-md border p-3">
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
                <p className="text-xs text-muted-foreground">The time grid describes the visible screenshot: the first and last time labels, and how many minutes one row covers.</p>
                {reviewed.map(col => (
                  <ProviderWorkingSchedule key={col.providerId} providerId={col.providerId!} name={col.providerLabel!} value={col.workingHours}
                    sourceNote={hoursSource(col)}
                    emptyHint={teamHours[col.providerId!] ? undefined : `No saved schedule for ${col.providerLabel} yet — link them to a team member with a work schedule (Settings → Office → Providers) and these hours fill in automatically next time.`}
                    onPendingChange={onPendingHours}
                    onChange={workingHours => setColumns(previous => previous.map(c => c.providerId === col.providerId ? { ...c, workingHours } : c))} />
                ))}
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setAdjust(true)}>
                Adjust the working day or hours
              </Button>
            )}
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
              Only the column map and time grid are saved. The screenshot is destroyed, never stored.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

