import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Camera, Check, ClipboardPaste, ImageUp, Loader2, MonitorUp,
  RefreshCcw, ShieldCheck, Snowflake,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { captureSupported } from '@/lib/schedule-reader/capture';
import { recognizeFrame, terminateOcr } from '@/lib/schedule-reader/ocr';
import { wipeCanvas, wipeOcrWords } from '@/lib/schedule-reader/destroy-capture';
import { parseLedgerWords } from '@/lib/account-balance/parser';
import type { ParsedLedgerCapture } from '@/lib/account-balance/types';

/**
 * Ledger capture for the Account Balance Explainer — the PmsCaptureDialog
 * single-monitor flow pointed at the Dentrix ledger:
 *
 *   Start Capture → switch to Dentrix, position the ledger → return here →
 *   the newest frame freezes automatically (no timer) → crop the ledger →
 *   local OCR → parsed rows go to the page, the image dies immediately.
 *
 * Paste / choose-file fallbacks feed the same crop + OCR flow, and a long
 * ledger is captured in several passes ("Add another screenshot" reopens
 * this dialog; the page splices captures with sequence-overlap dedupe).
 *
 * HIPAA boundary (src/lib/account-balance/types.ts): frames, crops, and OCR
 * words exist ONLY in browser memory — OCR runs on-device against
 * same-origin tesseract assets, and every canvas is wiped on apply, cancel,
 * retake, close, and unmount. Nothing is uploaded, persisted, or logged.
 */

interface LedgerCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ordinal of this capture within the session (1-based, for the title). */
  captureNumber: number;
  onApply: (parsed: ParsedLedgerCapture) => void;
}

type Phase = 'instructions' | 'armed' | 'crop';

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let captureCounter = 0;

export default function LedgerCaptureDialog({
  open,
  onOpenChange,
  captureNumber,
  onApply,
}: LedgerCaptureDialogProps) {
  const [phase, setPhase] = useState<Phase>('instructions');
  const [error, setError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  // Live share + frozen frame — refs, never state: no snapshot may linger
  // in React devtools serializations or stale closures.
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveHostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null);
  const leftSinceArmRef = useRef(false);

  const [drag, setDrag] = useState<CropRect | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
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
    setDrag(null);
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
  // actually left — no countdown, no race.
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

    try {
      captureCounter += 1;
      const captureId = `abx-cap-${captureCounter}`;
      const { words } = await recognizeFrame(crop);
      const parsed = parseLedgerWords(words, captureId);
      wipeOcrWords(words);

      // Successful extraction: the images are done — destroy them now.
      wipeCanvas(crop);
      if (frameRef.current) {
        wipeCanvas(frameRef.current);
        frameRef.current = null;
      }

      if (!parsed.headerFound || parsed.rows.length === 0) {
        setError(
          parsed.headerFound
            ? 'No ledger rows could be read in that area — drag a box around the transaction list, or retake.'
            : "Couldn't find the ledger columns (DATE, DESCRIPTION, CHARGE…). Include the column headers in the crop, then try again."
        );
        retake();
        return;
      }

      onApply(parsed);
      destroyAll();
      onOpenChange(false);
    } catch {
      setError("Couldn't read that area — drag a tighter box around the ledger, or retake.");
      wipeCanvas(crop);
    } finally {
      setOcrBusy(false);
    }
  };

  /** Restart the already-authorized capture without touching session state. */
  const retake = () => {
    if (frameRef.current) {
      wipeCanvas(frameRef.current);
      frameRef.current = null;
    }
    setDrag(null);
    if (streamRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
      leftSinceArmRef.current = false;
      setPhase('armed');
    } else {
      stopStream();
      setPhase('instructions');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onPaste={onPaste}>
        <DialogHeader>
          <DialogTitle>
            {captureNumber > 1
              ? `Add ledger screenshot ${captureNumber}`
              : 'Capture the Dentrix ledger'}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Read on this device only. The screenshot is destroyed right after it's read.
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
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Open the patient's ledger in Dentrix.</li>
              <li>Make sure the column headers (Date, Description, Charge, Payment, Balance) are visible.</li>
              {captureNumber > 1 && (
                <li className="font-medium">
                  Scroll so the next part of the ledger is visible — repeating a few rows
                  from the last screenshot is fine, Purple Envelope stitches them together.
                </li>
              )}
            </ol>
            <p className="text-sm text-muted-foreground">
              After you start, switch to Dentrix and take as long as you need — when you
              come back to this window, the view freezes automatically. No timer.
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
              Sharing is on. Switch to Dentrix now and bring the ledger into view. When
              you switch back here, the latest view freezes by itself.
            </p>
            <div ref={liveHostRef} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={freezeFrame}>
                <Snowflake className="h-4 w-4 mr-1.5" />
                Freeze current view
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
              Drag a rectangle around <strong>the ledger table, including its column
              headers</strong> — the tighter the box, the better the read.
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
      </DialogContent>
    </Dialog>
  );
}
