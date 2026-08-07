import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, Check, ClipboardPaste, ImageUp, Loader2, MonitorUp,
  Plus, RefreshCcw, ShieldCheck, Snowflake, Trash2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { captureSupported } from '@/lib/schedule-reader/capture';
import { recognizeFrame, terminateOcr } from '@/lib/schedule-reader/ocr';
import { groupWordsIntoLines } from '@/lib/schedule-reader/privacy-detector';
import { wipeCanvas, wipeOcrWords } from '@/lib/schedule-reader/destroy-capture';
import {
  parseDentrixAddress,
  parseDentrixAppointments,
  type ParsedAddress,
  type ParsedAppt,
} from '@/lib/broken-appts/dentrix-parse';
import type { PmsCaptureProfile } from '@/lib/pms';

/**
 * Capture assistant for Broken Appointments — reads ONE small PMS panel
 * (the Address panel or the Appointments table) from a screenshot so staff
 * don't retype it. Built for a single-monitor front desk:
 *
 *   share the PMS window → leave Purple Envelope for as long as needed →
 *   come back → the latest frame freezes automatically (no timer, no race)
 *   → drag a rectangle around the panel → local OCR → review → apply.
 *
 * A clipboard-paste / choose-file fallback feeds the same crop + OCR flow.
 *
 * HIPAA boundary (src/lib/broken-appts/types.ts): the shared frame, frozen
 * frame, crop, OCR words, and parsed values exist ONLY in browser memory —
 * OCR runs on-device against same-origin tesseract assets (schedule-reader
 * infrastructure), and every canvas is wiped on apply, cancel, retake,
 * close, and unmount. Nothing is uploaded, persisted, or logged.
 */

export type CaptureTarget = 'address' | 'appointments';

interface PmsCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: CaptureTarget;
  /** PMS layout knowledge; null = generic capture with no PMS-specific help. */
  profile: PmsCaptureProfile | null;
  onApplyAddress?: (address: ParsedAddress) => void;
  onApplyAppointments?: (rows: ParsedAppt[]) => void;
}

type Phase = 'instructions' | 'armed' | 'crop' | 'review';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TARGET_TITLES: Record<CaptureTarget, string> = {
  address: 'Capture the patient address',
  appointments: 'Capture future appointments',
};

export default function PmsCaptureDialog({
  open,
  onOpenChange,
  target,
  profile,
  onApplyAddress,
  onApplyAppointments,
}: PmsCaptureDialogProps) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  // Live share + frozen frame — refs, never state: no snapshot may linger
  // in React devtools serializations or stale closures.
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveHostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const leftSinceArmRef = useRef(false);

  // Crop drag state (display coordinates).
  const [drag, setDrag] = useState<CropRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Review state — the employee edits these before anything applies.
  const [address, setAddress] = useState<ParsedAddress | null>(null);
  const [appts, setAppts] = useState<ParsedAppt[]>([]);
  const [pastSkipped, setPastSkipped] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }
  }, []);

  /** Destroy every screenshot-derived thing. Safe to call repeatedly. */
  const destroyAll = useCallback(() => {
    stopStream();
    if (frameRef.current) {
      wipeCanvas(frameRef.current);
      frameRef.current = null;
    }
    if (cropCanvasRef.current) {
      wipeCanvas(cropCanvasRef.current);
      cropCanvasRef.current = null;
    }
    setDrag(null);
    setAddress(null);
    setAppts([]);
    setPastSkipped(0);
    void terminateOcr();
  }, [stopStream]);

  // Route leave / unmount / refresh: the component disappears, the data dies.
  useEffect(() => destroyAll, [destroyAll]);

  // Reset to a clean slate whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setPhase('instructions');
      setError(null);
      setOcrBusy(false);
      leftSinceArmRef.current = false;
    } else {
      destroyAll();
    }
  }, [open, destroyAll]);

  const close = (next: boolean) => {
    if (!next) destroyAll();
    onOpenChange(next);
  };

  /** Freeze the latest frame from the live share into an offscreen canvas. */
  const freezeFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setError('The shared window is no longer available — start the capture again or paste a screenshot.');
      setPhase('instructions');
      stopStream();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    if (frameRef.current) wipeCanvas(frameRef.current);
    frameRef.current = canvas;
    setDrag(null);
    setError(null);
    setPhase('crop');
  }, [stopStream]);

  // The single-monitor trigger: while armed, returning to Purple Envelope
  // freezes the newest frame automatically. Only fires after the employee
  // actually left — arming itself never freezes a half-navigated screen.
  useEffect(() => {
    if (!open || phase !== 'armed') return;
    const onAway = () => {
      leftSinceArmRef.current = true;
    };
    const onReturn = () => {
      if (!leftSinceArmRef.current) return;
      // One tick so the browser has painted a current frame.
      requestAnimationFrame(() => freezeFrame());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onAway();
      else onReturn();
    };
    window.addEventListener('blur', onAway);
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onAway);
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [open, phase, freezeFrame]);

  const startCapture = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 2 },
        audio: false,
      });
      streamRef.current = stream;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      videoRef.current = video;
      leftSinceArmRef.current = false;
      // If the employee stops sharing from the browser chrome, fall back
      // cleanly instead of freezing a dead stream later.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (frameRef.current === null) {
          setError('Screen sharing ended. Start again, or paste a screenshot instead.');
          setPhase('instructions');
        }
        stopStream();
      });
      setPhase('armed');
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Screen sharing was declined. You can paste a screenshot instead.'
          : 'Screen capture is not available here. Paste or choose a screenshot instead.',
      );
    }
  };

  /** Paste / choose-file fallback → the same crop + OCR flow. */
  const frameFromImageFile = async (file: File) => {
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('unreadable'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx || canvas.width === 0) throw new Error('empty');
      ctx.drawImage(img, 0, 0);
      if (frameRef.current) wipeCanvas(frameRef.current);
      frameRef.current = canvas;
      setDrag(null);
      setPhase('crop');
    } catch {
      setError("That image couldn't be read — try again.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void frameFromImageFile(file);
    }
  };

  // ------- crop interaction -------
  const cropHostRef = useRef<HTMLDivElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Paint the frozen frame into the visible crop canvas.
  useEffect(() => {
    if (phase !== 'crop') return;
    const frame = frameRef.current;
    const display = displayCanvasRef.current;
    if (!frame || !display) return;
    display.width = frame.width;
    display.height = frame.height;
    display.getContext('2d')?.drawImage(frame, 0, 0);
    return () => {
      if (display) wipeCanvas(display);
    };
  }, [phase]);

  // Mount the live preview video into the armed screen.
  useEffect(() => {
    if (phase !== 'armed') return;
    const host = liveHostRef.current;
    const video = videoRef.current;
    if (host && video) {
      video.className = 'h-28 w-full rounded-md border object-contain bg-black/80';
      host.appendChild(video);
    }
    return () => {
      video?.remove();
    };
  }, [phase]);

  const pointerPos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = cropHostRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    };
  };

  const onCropDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pointerPos(e);
    dragStart.current = p;
    setDrag({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onCropMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const p = pointerPos(e);
    const s = dragStart.current;
    setDrag({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  };

  const onCropUp = () => {
    dragStart.current = null;
  };

  const runOcrOnSelection = async () => {
    const frame = frameRef.current;
    const host = cropHostRef.current;
    if (!frame || !host || !drag || drag.w < 8 || drag.h < 8) return;
    setOcrBusy(true);
    setError(null);
    // Display → frame coordinates.
    const scaleX = frame.width / host.getBoundingClientRect().width;
    const scaleY = frame.height / host.getBoundingClientRect().height;
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(drag.w * scaleX));
    crop.height = Math.max(1, Math.round(drag.h * scaleY));
    const ctx = crop.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setOcrBusy(false);
      return;
    }
    ctx.drawImage(
      frame,
      Math.round(drag.x * scaleX),
      Math.round(drag.y * scaleY),
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    cropCanvasRef.current = crop;

    try {
      const { words } = await recognizeFrame(crop);
      const lines = groupWordsIntoLines(words).map(l => l.text);
      wipeOcrWords(words);

      if (target === 'address') {
        setAddress(parseDentrixAddress(lines));
      } else {
        const parsed = parseDentrixAppointments(lines, new Date());
        setAppts(parsed.rows);
        setPastSkipped(parsed.pastRowsSkipped);
      }
      // Successful extraction: the images are done — destroy them now.
      // The live share stays available so Retake never re-asks permission.
      wipeCanvas(crop);
      cropCanvasRef.current = null;
      if (frameRef.current) {
        wipeCanvas(frameRef.current);
        frameRef.current = null;
      }
      setPhase('review');
    } catch {
      setError("Couldn't read that area — drag a tighter box around the panel, or retake.");
      wipeCanvas(crop);
      cropCanvasRef.current = null;
    } finally {
      setOcrBusy(false);
    }
  };

  /** Restart the already-authorized capture without touching workflow state. */
  const retake = () => {
    if (frameRef.current) {
      wipeCanvas(frameRef.current);
      frameRef.current = null;
    }
    setDrag(null);
    setAddress(null);
    setAppts([]);
    setError(null);
    if (streamRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
      leftSinceArmRef.current = false;
      setPhase('armed');
    } else {
      stopStream();
      setPhase('instructions');
    }
  };

  const apply = () => {
    if (target === 'address' && address) onApplyAddress?.(address);
    if (target === 'appointments') onApplyAppointments?.(appts);
    destroyAll();
    onOpenChange(false);
  };

  const shortName = profile?.shortName;
  const hint = profile?.targetHints[target];

  const uncertain = (field: ParsedAddress['uncertain'][number]) =>
    address?.uncertain.includes(field) ? (
      <Badge variant="destructive" className="ml-2 text-[10px]">Please verify</Badge>
    ) : null;

  const updateAppt = (i: number, patch: Partial<ParsedAppt>) =>
    setAppts(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle>{TARGET_TITLES[target]}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Read on this device only. Screenshot is discarded after use.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <span>{error}</span>
          </div>
        )}

        {phase === 'instructions' && (
          <div className="space-y-4">
            {profile ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {profile.openSteps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
                {hint && <li className="font-medium">{hint}</li>}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Bring the screen with the information on it into view, then share it —
                or paste a screenshot below.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              After you start, switch to {shortName ?? 'your PMS'} and take as long as
              you need — when you come back to this window, the view freezes
              automatically. No timer.
            </p>
            <div className="flex flex-wrap gap-2">
              {captureSupported() && (
                <Button onClick={() => void startCapture()}>
                  <MonitorUp className="h-4 w-4 mr-1.5" />
                  Start Capture
                </Button>
              )}
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <ImageUp className="h-4 w-4 mr-1.5" />
                Choose screenshot
              </Button>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ClipboardPaste className="h-4 w-4" />
                or paste one (Ctrl+V)
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void frameFromImageFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {phase === 'armed' && (
          <div className="space-y-4">
            <p className="text-sm">
              Sharing is on. Switch to {shortName ?? 'your PMS'} now
              {hint ? ` — ${hint.charAt(0).toLowerCase()}${hint.slice(1)}` : ''}. When
              you switch back here, the latest view freezes by itself.
            </p>
            <div ref={liveHostRef} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={freezeFrame}>
                <Snowflake className="h-4 w-4 mr-1.5" />
                Freeze current {shortName ?? 'PMS'} view
              </Button>
              <Button variant="ghost" onClick={retake}>
                <RefreshCcw className="h-4 w-4 mr-1.5" />
                Restart
              </Button>
            </div>
          </div>
        )}

        {phase === 'crop' && (
          <div className="space-y-3">
            <p className="text-sm">
              Drag a rectangle around <strong>only</strong>{' '}
              {target === 'address' ? 'the Address panel' : 'the Appointments table'} —
              the smaller the box, the better the read.
            </p>
            <div
              ref={cropHostRef}
              className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-md border"
              onPointerDown={onCropDown}
              onPointerMove={onCropMove}
              onPointerUp={onCropUp}
            >
              <canvas ref={displayCanvasRef} className="block w-full" />
              {drag && drag.w > 2 && (
                <div
                  className="absolute border-2 border-primary bg-primary/10"
                  style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void runOcrOnSelection()}
                disabled={!drag || drag.w < 8 || drag.h < 8 || ocrBusy}
              >
                {ocrBusy ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1.5" />
                )}
                {ocrBusy ? 'Reading…' : 'Use Selection'}
              </Button>
              <Button variant="outline" onClick={retake} disabled={ocrBusy}>
                <Camera className="h-4 w-4 mr-1.5" />
                Retake
              </Button>
            </div>
          </div>
        )}

        {phase === 'review' && target === 'address' && address && (
          <div className="space-y-4">
            <p className="text-sm font-medium">I found</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cap-addr1">Street Address{uncertain('addressLine1')}</Label>
                <Input
                  id="cap-addr1"
                  value={address.addressLine1}
                  onChange={e => setAddress(a => a && { ...a, addressLine1: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cap-addr2">Address Line 2{uncertain('addressLine2')}</Label>
                <Input
                  id="cap-addr2"
                  value={address.addressLine2}
                  onChange={e => setAddress(a => a && { ...a, addressLine2: e.target.value })}
                  placeholder="Apt · Unit · Suite (blank if none)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cap-city">City{uncertain('city')}</Label>
                <Input
                  id="cap-city"
                  value={address.city}
                  onChange={e => setAddress(a => a && { ...a, city: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <div className="space-y-1.5 w-24">
                  <Label htmlFor="cap-state">State{uncertain('state')}</Label>
                  <Input
                    id="cap-state"
                    value={address.state}
                    onChange={e => setAddress(a => a && { ...a, state: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="cap-zip">ZIP{uncertain('zip')}</Label>
                  <Input
                    id="cap-zip"
                    value={address.zip}
                    onChange={e => setAddress(a => a && { ...a, zip: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={apply}>
                <Check className="h-4 w-4 mr-1.5" />
                Use these details
              </Button>
              <Button variant="outline" onClick={retake}>
                <Camera className="h-4 w-4 mr-1.5" />
                Retake
              </Button>
            </div>
          </div>
        )}

        {phase === 'review' && target === 'appointments' && (
          <div className="space-y-4">
            <p className="text-sm font-medium">
              {appts.length === 0
                ? 'No upcoming appointments were read — add rows below or retake.'
                : 'I found these upcoming appointments'}
            </p>
            {pastSkipped > 0 && (
              <p className="text-xs text-muted-foreground">
                {pastSkipped} past appointment{pastSkipped === 1 ? '' : 's'} in the
                capture {pastSkipped === 1 ? 'was' : 'were'} left out automatically.
              </p>
            )}
            <div className="space-y-2">
              {appts.map((row, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Input
                    type="date"
                    value={row.date}
                    onChange={e => updateAppt(i, { date: e.target.value })}
                    className="w-40"
                    aria-label={`Found appointment ${i + 1} date`}
                  />
                  <Input
                    value={row.time}
                    onChange={e => updateAppt(i, { time: e.target.value })}
                    className="w-28"
                    placeholder="8:40 AM"
                    aria-label={`Found appointment ${i + 1} time`}
                  />
                  <Input
                    value={row.provider}
                    onChange={e => updateAppt(i, { provider: e.target.value })}
                    className="w-28"
                    placeholder="Provider"
                    aria-label={`Found appointment ${i + 1} provider`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAppts(rows => rows.filter((_, j) => j !== i))}
                    aria-label={`Remove found appointment ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAppts(rows => [...rows, { date: '', time: '', provider: '' }])}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add a missed row
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={apply} disabled={appts.length === 0}>
                <Check className="h-4 w-4 mr-1.5" />
                Use these appointments
              </Button>
              <Button variant="outline" onClick={retake}>
                <Camera className="h-4 w-4 mr-1.5" />
                Retake
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
