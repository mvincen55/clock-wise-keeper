import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Camera, CheckCircle2, Loader2, MonitorUp, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  captureDisplayFrame,
  captureSupported,
  destroyCapture,
  frameFromFile,
  processScheduleFrame,
  buildProviderMetrics,
  ScheduleReaderError,
  type BlockCode,
  type CaptureFrame,
  type ScheduleAnalysis,
} from '@/lib/schedule-reader';
import { computeRollup, refereeMetrics } from '@/lib/schedule-reader/metrics-referee';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import {
  toClassifierRules,
  toLayoutProfile,
  useLayoutProfiles,
  usePhraseRules,
  useSaveScheduleMetrics,
} from '@/hooks/useScheduleIntelligence';

const ERROR_COPY: Record<string, string> = {
  CAPTURE_PERMISSION_DENIED: 'Screen capture was declined. Nothing was captured.',
  CAPTURE_UNSUPPORTED:
    'This browser cannot capture a window. Use a desktop browser, or ask a manager about the phone-photo option.',
  CAPTURE_FAILED: 'Could not read a frame from the selected window. Try again.',
  OCR_ASSETS_MISSING:
    'The on-device reader is not installed in this build. Nothing was uploaded — there is no cloud fallback.',
  OCR_FAILED: 'The on-device reader could not read the image. Nothing was uploaded. Try a sharper capture.',
  PRIVACY_CHECK_FAILED:
    'The capture looks like it may contain patient-identifying details — the privacy view may not be fully enabled. Nothing was processed or saved. Turn the privacy view on and retry.',
  LAYOUT_NOT_RECOGNIZED:
    'The schedule layout did not match this office\'s saved calibration. Re-run calibration or retry the capture.',
  LOW_CONFIDENCE: 'The reader was not confident enough to use this capture. Try again.',
  METRIC_VALIDATION_FAILED:
    'The extracted numbers failed validation and were discarded. Nothing was saved.',
  PROCESSING_CANCELLED: 'Capture cancelled. The image was destroyed.',
};

const BLOCK_LABELS: Record<BlockCode, string> = {
  PROVIDER_OUT_EARLY: 'Provider out early',
  PROVIDER_STARTS_LATE: 'Provider starts late',
  PROVIDER_OFF: 'Provider off',
  LUNCH_BLOCK: 'Lunch',
  MEETING_BLOCK: 'Meeting',
  TRAINING_BLOCK: 'Training / CE',
  ADMIN_BLOCK: 'Admin time',
  EMERGENCY_RESERVE: 'Emergency reserve',
  EQUIPMENT_UNAVAILABLE: 'Equipment / operatory down',
  STAFFING_LIMITATION: 'Staffing limitation',
  OFFICE_CLOSED: 'Office closed',
  OTHER_OPERATIONAL_BLOCK: 'Other operational block',
  UNCLASSIFIED: 'Unclassified',
};

function fmtMin(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
}

type Phase = 'idle' | 'confirm' | 'processing' | 'review' | 'done';

type Props = {
  /** deposit_logs.id — the closeout identity. Null until the day is saved. */
  closeoutId: string | null;
  date: string;
  /** Called with confirmed department counts so Practice Vitals can prefill. */
  onVitalsFromSchedule?: (counts: {
    hygieneCancellations: number;
    hygieneNoShows: number;
    doctorCancellations: number;
    doctorNoShows: number;
  }) => void;
};

/**
 * Step 3 — Privacy View Capture.
 *
 * The screenshot is processed on this device and never saved or uploaded.
 * The flow: instructions → privacy confirmations → pick the PMS window →
 * one frame is grabbed and the stream stops → local OCR + analysis → the
 * closer reviews sanitized metrics → the frame is destroyed either way.
 */
export default function PrivacyViewCapture({ closeoutId, date, onVitalsFromSchedule }: Props) {
  const { data: profiles } = useLayoutProfiles();
  const { data: phraseRows } = usePhraseRules();
  const { data: employees } = useOrgEmployees();
  const { data: settings } = usePracticeSettings();
  const saveMetrics = useSaveScheduleMetrics();

  const [phase, setPhase] = useState<Phase>('idle');
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const [analysis, setAnalysis] = useState<ScheduleAnalysis | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const frameRef = useRef<CaptureFrame | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const profileRow = profiles?.find(p => p.is_default) ?? profiles?.[0];

  // Whatever happens — navigation, unmount, cancel — the frame dies.
  useEffect(() => {
    return () => {
      void destroyCapture(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  const teardown = async () => {
    await destroyCapture(frameRef.current);
    frameRef.current = null;
  };

  const runPipeline = async (frame: CaptureFrame) => {
    frameRef.current = frame;
    setPhase('processing');
    setErrorCode(null);
    try {
      const result = await processScheduleFrame(frame, {
        profile: toLayoutProfile(profileRow!),
        businessDate: date,
        knownStaffNames: (employees ?? []).map(e => e.display_name),
        phraseRules: toClassifierRules(phraseRows),
      });
      setAnalysis(result);
      setPhase('review');
    } catch (err) {
      const code = err instanceof ScheduleReaderError ? err.code : 'OCR_FAILED';
      setErrorCode(code);
      setPhase('idle');
      setPrivacyConfirmed(false);
      setDetailsConfirmed(false);
    } finally {
      // The image has done its one job. Destroy it — review works from the
      // sanitized analysis only.
      await teardown();
    }
  };

  const startCapture = async () => {
    try {
      const frame = await captureDisplayFrame();
      await runPipeline(frame);
    } catch (err) {
      const code = err instanceof ScheduleReaderError ? err.code : 'CAPTURE_FAILED';
      setErrorCode(code);
      setPhase('idle');
    }
  };

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    try {
      const frame = await frameFromFile(file);
      await runPipeline(frame);
    } catch (err) {
      const code = err instanceof ScheduleReaderError ? err.code : 'CAPTURE_FAILED';
      setErrorCode(code);
      setPhase('idle');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Resolve one unclassified block to a code, then rebuild that provider. */
  const resolveBlock = (blockIndex: number, code: BlockCode) => {
    setAnalysis(prev => {
      if (!prev) return prev;
      const blocks = prev.blocks.map((b, i) =>
        i === blockIndex ? { ...b, code, confidence: 1, userConfirmed: true } : b
      );
      const providers = prev.providers.map(p => {
        const rows = prev.providerRows[p.providerLabel];
        if (!rows) return p;
        const mine = blocks.filter(b => b.providerLabel === p.providerLabel);
        const rebuilt = buildProviderMetrics({
          providerLabel: p.providerLabel,
          providerRole: p.providerRole,
          department: p.department,
          employeeId: p.employeeId,
          businessDate: p.businessDate,
          rows,
          minutesPerRow: prev.minutesPerRow,
          activeColumns: p.activeColumns,
          blocks: mine,
          supportStaffAssigned: p.supportStaffAssigned,
          ocrConfidence: 1,
          layoutConfidence: prev.layoutConfidence,
        });
        return { ...rebuilt, confidence: p.confidence, reviewStatus: p.reviewStatus };
      });
      return { ...prev, blocks, providers, rollup: computeRollup(providers) };
    });
  };

  const confirmAndSave = async () => {
    if (!analysis || !closeoutId) return;
    // The closer's confirmation upgrades low-confidence rows.
    const providers = analysis.providers.map(p => ({
      ...p,
      reviewStatus:
        p.reviewStatus === 'needs_review' ? ('user_confirmed' as const) : p.reviewStatus,
    }));
    const verdict = refereeMetrics({
      providers,
      blocks: analysis.blocks,
      rollup: computeRollup(providers),
    });
    if (verdict.ok === false) {
      toast.error('The corrected numbers no longer add up — re-capture instead of forcing it.');
      return;
    }
    try {
      await saveMetrics.mutateAsync({
        closeoutId,
        businessDate: date,
        providers,
        blocks: analysis.blocks,
        captureConfidence: analysis.layoutConfidence,
        needsReview: analysis.blocks.some(b => b.code === 'UNCLASSIFIED' && !b.userConfirmed),
      });
      const r = analysis.rollup.byDepartment;
      onVitalsFromSchedule?.({
        hygieneCancellations: r.hygiene.cancellationCount,
        hygieneNoShows: r.hygiene.noShowCount,
        doctorCancellations: r.doctor.cancellationCount,
        doctorNoShows: r.doctor.noShowCount,
      });
      setPhase('done');
      toast.success('Schedule metrics saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save metrics');
    }
  };

  const discard = async () => {
    await teardown();
    setAnalysis(null);
    setPhase('idle');
    setPrivacyConfirmed(false);
    setDetailsConfirmed(false);
    setErrorCode('PROCESSING_CANCELLED');
  };

  if (!profileRow) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-primary" />
            Privacy View Capture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Schedule Intelligence isn't calibrated for this office yet. An owner or manager sets
            it up once from the Schedule Intelligence section below — after that, closing the day
            can read the privacy-view schedule right here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4 text-primary" />
          Privacy View Capture
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorCode && phase === 'idle' && (
          <p className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
            {ERROR_COPY[errorCode] ?? 'Something went wrong. Nothing was saved.'}
          </p>
        )}

        {phase === 'idle' && (
          <>
            <p className="text-sm text-muted-foreground">
              Turn on your practice software's privacy view before capturing. Purple Envelope
              processes the image on this device and does not save or upload it.
            </p>
            {!closeoutId ? (
              <p className="text-sm text-muted-foreground">
                Save the deposit log first — the schedule metrics attach to today's record.
              </p>
            ) : (
              <Button onClick={() => setPhase('confirm')}>
                <Camera className="mr-2 h-4 w-4" />
                Capture Today's Schedule
              </Button>
            )}
          </>
        )}

        {phase === 'confirm' && (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>In your practice software, turn on the privacy view.</li>
              <li>Keep the full-day schedule visible on screen.</li>
              <li>
                When the browser asks, choose the practice-software window. (Browsers can't
                switch windows for you — pick it from the list.)
              </li>
            </ol>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="cap-privacy"
                  checked={privacyConfirmed}
                  onCheckedChange={v => setPrivacyConfirmed(v === true)}
                />
                <Label htmlFor="cap-privacy" className="text-sm font-normal leading-snug">
                  The privacy view is on.
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="cap-details"
                  checked={detailsConfirmed}
                  onCheckedChange={v => setDetailsConfirmed(v === true)}
                />
                <Label htmlFor="cap-details" className="text-sm font-normal leading-snug">
                  Confirm that patient names, initials, phone numbers, birth dates, account
                  numbers, insurance details, and identifying notes are hidden.
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {captureSupported() && (
                <Button disabled={!privacyConfirmed || !detailsConfirmed} onClick={startCapture}>
                  <MonitorUp className="mr-2 h-4 w-4" />
                  Select the schedule window
                </Button>
              )}
              {settings?.mobile_capture_enabled && (
                <>
                  <Button
                    variant="outline"
                    disabled={!privacyConfirmed || !detailsConfirmed}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Use a photo from this device
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => onFilePicked(e.target.files?.[0])}
                  />
                </>
              )}
              <Button variant="ghost" onClick={() => setPhase('idle')}>
                Cancel
              </Button>
            </div>
            {settings?.mobile_capture_enabled && (
              <p className="text-xs text-muted-foreground">
                Photo fallback: the image is processed here and never uploaded — but Purple
                Envelope cannot delete the original from your phone's gallery. Remove it yourself
                afterward.
              </p>
            )}
          </div>
        )}

        {phase === 'processing' && (
          <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Reading the schedule on this device — nothing leaves this computer.
          </div>
        )}

        {phase === 'review' && analysis && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-success" />
              <span>Schedule processed on this device. The image was not saved or uploaded.</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">
                Layout confidence {(analysis.layoutConfidence * 100).toFixed(0)}%
              </Badge>
              <Badge variant="outline" className="border-success/40 text-success">
                Privacy check passed
              </Badge>
              {analysis.needsReview && (
                <Badge variant="outline" className="border-warning/40 text-warning">
                  Review before saving
                </Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Provider</th>
                    <th className="py-1.5 pr-2 font-medium">Dept</th>
                    <th className="py-1.5 pr-2 font-medium">Bookable</th>
                    <th className="py-1.5 pr-2 font-medium">Scheduled</th>
                    <th className="py-1.5 pr-2 font-medium">True open</th>
                    <th className="py-1.5 pr-2 font-medium">Cancels</th>
                    <th className="py-1.5 pr-2 font-medium">No-shows</th>
                    <th className="py-1.5 pr-2 font-medium">Unclassified</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.providers.map(p => (
                    <tr key={p.providerLabel} className="border-b last:border-0">
                      <td className="py-1.5 pr-2 font-medium">{p.providerLabel}</td>
                      <td className="py-1.5 pr-2">{p.department}</td>
                      <td className="py-1.5 pr-2">{fmtMin(p.netBookableMinutes)}</td>
                      <td className="py-1.5 pr-2">{fmtMin(p.scheduledMinutes)}</td>
                      <td className="py-1.5 pr-2">{fmtMin(p.trueOpenMinutes)}</td>
                      <td className="py-1.5 pr-2">
                        {p.cancellationCount} ({fmtMin(p.cancellationOpenMinutes)})
                      </td>
                      <td className="py-1.5 pr-2">
                        {p.noShowCount} ({fmtMin(p.noShowOpenMinutes)})
                      </td>
                      <td className="py-1.5 pr-2">
                        {p.unclassifiedMinutes > 0 ? (
                          <span className="text-warning">{fmtMin(p.unclassifiedMinutes)}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analysis.blocks.some(b => b.code === 'UNCLASSIFIED' || !b.userConfirmed) && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Blocked time found on the schedule</p>
                {analysis.blocks.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {b.providerLabel ?? 'Office'} · {fmtMin(b.minutes)}
                    </span>
                    {b.code === 'UNCLASSIFIED' ? (
                      <Select onValueChange={v => resolveBlock(i, v as BlockCode)}>
                        <SelectTrigger className="h-7 w-56 text-xs">
                          <SelectValue placeholder="What was this time?" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(BLOCK_LABELS) as BlockCode[])
                            .filter(c => c !== 'UNCLASSIFIED')
                            .map(c => (
                              <SelectItem key={c} value={c} className="text-xs">
                                {BLOCK_LABELS[c]}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={b.userConfirmed ? 'secondary' : 'outline'} className="text-[10px]">
                        {BLOCK_LABELS[b.code]}
                        {b.userConfirmed ? ' ✓' : ''}
                      </Badge>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Unclassified time is never counted as open time until you say what it was.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={confirmAndSave} disabled={saveMetrics.isPending}>
                {saveMetrics.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                These numbers are right — save them
              </Button>
              <Button variant="outline" onClick={discard}>
                <Trash2 className="mr-2 h-4 w-4" />
                Discard
              </Button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              <p>Schedule metrics saved for {date}.</p>
              <p className="text-xs text-muted-foreground">
                The captured image was destroyed after processing — it was never saved or
                uploaded. Practice Vitals were prefilled from the confirmed numbers; correct them
                in Step 2 if the schedule missed something.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
