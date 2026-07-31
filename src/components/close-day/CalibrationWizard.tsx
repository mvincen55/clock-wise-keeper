import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Loader2, MonitorUp, Pipette } from 'lucide-react';
import { toast } from 'sonner';
import {
  captureDisplayFrame,
  captureSupported,
  destroyCapture,
  draftColumnsFromFrame,
  ScheduleReaderError,
  type CaptureFrame,
  type ColumnKind,
  type Department,
  type LayoutColumn,
  type OperationalRole,
  type ScheduleStatus,
  type StatusLegendEntry,
} from '@/lib/schedule-reader';
import { recognizeFrame } from '@/lib/schedule-reader/ocr';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import { useSaveLayoutProfile } from '@/hooks/useScheduleIntelligence';
import { hhmmToMinutes } from '@/lib/time-utils';

const PMS_OPTIONS = [
  'Dentrix',
  'Eaglesoft',
  'Open Dental',
  'Curve',
  'Denticon',
  'Fuse',
  'Other',
];

const STATUSES: { status: ScheduleStatus; label: string }[] = [
  { status: 'scheduled', label: 'Scheduled' },
  { status: 'completed', label: 'Completed' },
  { status: 'cancelled', label: 'Cancelled' },
  { status: 'no_show', label: 'No-show' },
  { status: 'moved', label: 'Moved' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'open', label: 'Open' },
];

type DraftColumn = LayoutColumn & { pxStart: number; pxEnd: number };

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * One-time PMS layout calibration.
 *
 * The office captures a privacy-view schedule, names each column, teaches the
 * status colors by clicking them, and confirms the working-day grid. Only the
 * sanitized layout profile (relative geometry + colors) is stored — the
 * calibration screenshot itself is destroyed on save or cancel and is never
 * uploaded anywhere.
 */
export default function CalibrationWizard({ open, onClose }: Props) {
  const save = useSaveLayoutProfile();

  const [step, setStep] = useState(0);
  const [pms, setPms] = useState<string>('Other');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [columns, setColumns] = useState<DraftColumn[]>([]);
  const [legend, setLegend] = useState<Partial<Record<ScheduleStatus, StatusLegendEntry>>>({});
  const [sampling, setSampling] = useState<ScheduleStatus | null>(null);
  const [dayStart, setDayStart] = useState('08:00');
  const [dayEnd, setDayEnd] = useState('17:00');
  const [minutesPerRow, setMinutesPerRow] = useState('10');
  const [cancelledVisible, setCancelledVisible] = useState(true);
  const [blockStyle, setBlockStyle] = useState<'solid' | 'labeled' | 'mixed'>('mixed');

  const frameRef = useRef<CaptureFrame | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const reset = () => {
    setStep(0);
    setConfirmed(false);
    setColumns([]);
    setLegend({});
    setSampling(null);
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

  const capture = async () => {
    setBusy(true);
    try {
      const frame = await captureDisplayFrame();
      frameRef.current = frame;
      const { words } = await recognizeFrame(frame.canvas);
      const drafts = draftColumnsFromFrame(words, frame.width, frame.height);
      setColumns(
        drafts.map(d => ({
          xStart: d.xStart,
          xEnd: d.xEnd,
          pxStart: d.xStart * frame.width,
          pxEnd: d.xEnd * frame.width,
          kind: 'provider' as ColumnKind,
          providerLabel: null,
          providerRole: null,
          department: null,
          employeeId: null,
        }))
      );
      setStep(1);
    } catch (err) {
      const code = err instanceof ScheduleReaderError ? err.code : 'CAPTURE_FAILED';
      toast.error(
        code === 'OCR_ASSETS_MISSING'
          ? 'The on-device reader is not installed in this build.'
          : 'Could not capture the schedule window. Nothing was uploaded.'
      );
      await teardown();
    } finally {
      setBusy(false);
    }
  };

  const onPreviewClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const frame = frameRef.current;
    const preview = previewRef.current;
    if (!frame || !preview || !sampling) return;
    const rect = preview.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * frame.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * frame.height);
    const ctx = frame.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    setLegend(prev => ({
      ...prev,
      [sampling]: { status: sampling, r, g, b, tolerance: 40 },
    }));
    setSampling(null);
  };

  const setColumn = (i: number, patch: Partial<DraftColumn>) =>
    setColumns(cols => cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const legendComplete = useMemo(
    () => !!legend.scheduled && !!legend.open,
    [legend]
  );

  const finish = async () => {
    const startMin = hhmmToMinutes(dayStart);
    const endMin = hhmmToMinutes(dayEnd);
    if (endMin <= startMin) {
      toast.error('The working day must end after it starts.');
      return;
    }
    const providerCols = columns.filter(c => c.kind !== 'non_clinical');
    if (providerCols.some(c => !c.providerLabel || !c.department)) {
      toast.error('Give every clinical column a provider name and department.');
      return;
    }
    try {
      await save.mutateAsync({
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
          cancelledRemainVisible: cancelledVisible,
          blockStyle,
        },
        statusLegend: Object.values(legend).filter(
          (l): l is StatusLegendEntry => !!l && (l.status !== 'cancelled' || cancelledVisible)
        ),
      });
      toast.success('Schedule layout saved — the screenshot was destroyed, not stored.');
      await teardown();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the layout');
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Calibrate Schedule Intelligence</DialogTitle>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Practice management system</Label>
              <Select value={pms} onValueChange={setPms}>
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
            <Button disabled={!confirmed || busy || !captureSupported()} onClick={capture}>
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MonitorUp className="mr-2 h-4 w-4" />
              )}
              Capture a privacy-view schedule
            </Button>
            {!captureSupported() && (
              <p className="text-xs text-muted-foreground">
                This browser can't capture a window — run calibration from a desktop browser.
              </p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Name each schedule column. The preview below never leaves this device.
            </p>
            <canvas ref={previewRef} className="w-full rounded border" />
            <div className="space-y-3">
              {columns.map((col, i) => (
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
                        <SelectItem value="non_clinical">Non-clinical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {col.kind !== 'non_clinical' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Provider</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Dr. A / Hyg 1"
                          value={col.providerLabel ?? ''}
                          onChange={e => setColumn(i, { providerLabel: e.target.value || null })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Provider type</Label>
                        <Select
                          value={col.providerRole ?? ''}
                          onValueChange={v =>
                            setColumn(i, { providerRole: v as OperationalRole })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Pick one" />
                          </SelectTrigger>
                          <SelectContent>
                            {(['dentist', 'hygienist', 'other'] as OperationalRole[]).map(r => (
                              <SelectItem key={r} value={r} className="text-xs">
                                {ROLE_LABELS[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Department</Label>
                        <Select
                          value={col.department ?? ''}
                          onValueChange={v => setColumn(i, { department: v as Department })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Pick one" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hygiene" className="text-xs">Hygiene</SelectItem>
                            <SelectItem value="doctor" className="text-xs">Doctor</SelectItem>
                            <SelectItem value="other" className="text-xs">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)}>Next: status colors</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Teach the reader your status colors: pick a status, then click an appointment of
              that kind in the preview. Scheduled and Open are required; skip statuses your
              system doesn't show.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(({ status, label }) => {
                const entry = legend[status];
                return (
                  <Button
                    key={status}
                    size="sm"
                    variant={sampling === status ? 'default' : entry ? 'secondary' : 'outline'}
                    onClick={() => setSampling(status)}
                  >
                    <Pipette className="mr-1.5 h-3 w-3" />
                    {label}
                    {entry && (
                      <span
                        className="ml-1.5 inline-block h-3 w-3 rounded-sm border"
                        style={{ backgroundColor: `rgb(${entry.r},${entry.g},${entry.b})` }}
                      />
                    )}
                  </Button>
                );
              })}
            </div>
            {sampling && (
              <Badge variant="outline" className="text-xs">
                Click a "{STATUSES.find(s => s.status === sampling)?.label}" block in the preview
              </Badge>
            )}
            <canvas
              ref={previewRef}
              className="w-full cursor-crosshair rounded border"
              onClick={onPreviewClick}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!legendComplete} onClick={() => setStep(3)}>
                Next: working day
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
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
            <div className="space-y-1.5">
              <Label>How do lunch and admin blocks appear?</Label>
              <Select value={blockStyle} onValueChange={v => setBlockStyle(v as typeof blockStyle)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid colored blocks</SelectItem>
                  <SelectItem value="labeled">Text labels (e.g. "Lunch")</SelectItem>
                  <SelectItem value="mixed">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="cal-cancelled"
                checked={cancelledVisible}
                onCheckedChange={v => setCancelledVisible(v === true)}
              />
              <Label htmlFor="cal-cancelled" className="text-sm font-normal">
                Cancelled appointments stay visible on the schedule
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={finish} disabled={save.isPending}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save layout profile
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only the column map, status colors, and time grid are saved. The calibration
              screenshot is destroyed and never stored.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
