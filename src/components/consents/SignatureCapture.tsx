import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Canvas signature pad for the Complete Forms workflow — finger, stylus, or
 * mouse via pointer events, no external libraries.
 *
 * PRIVACY: the drawing lives on this canvas and in a stroke buffer in this
 * component's memory. The only output is `onChange(dataUrl | null)` — the
 * caller keeps it in the memory-only PacketFill; nothing here (or downstream)
 * ever persists it.
 */

export interface SignatureCaptureProps {
  /** e.g. "Patient" / "Parent or Guardian" — shown above the pad. */
  roleLabel: string;
  /** Extra qualifier after the label, e.g. "(optional per office rule)". */
  qualifier?: string;
  /** PNG data URL after each completed stroke; null when cleared. */
  onChange: (dataUrl: string | null) => void;
  /** A signature captured earlier in this packet (memory-only), redrawn on
   *  mount so leaving and re-entering the step keeps the visible ink. */
  defaultValue?: string | null;
}

type Point = { x: number; y: number };
type Stroke = Point[];
/** What Clear removes and Redo restores: strokes plus any restored image. */
type InkState = { strokes: Stroke[]; base: HTMLImageElement | null };

const INK = '#1a1a2e'; // dark ink on white — matches the printed sheet

export default function SignatureCapture({ roleLabel, qualifier, onChange, defaultValue }: SignatureCaptureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  /** Restored prior signature, painted under any new strokes. */
  const baseRef = useRef<HTMLImageElement | null>(null);
  /** Last cleared ink — Redo restores it (undo-the-clear, not per-stroke). */
  const clearedRef = useRef<InkState | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const ctx2d = () => canvasRef.current?.getContext('2d') ?? null;

  /** CSS-pixel coordinates relative to the canvas box. */
  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const paintStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
    if (stroke.length === 0) return;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y); // a tap still leaves a dot
    for (const p of stroke.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  /** Clears the bitmap to white and repaints the base image + every stroke. */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctx2d();
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (baseRef.current) {
      try { ctx.drawImage(baseRef.current, 0, 0, canvas.width, canvas.height); } catch { /* decode race */ }
    }
    // Draw in CSS pixels; the transform maps onto the device-pixel bitmap.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const stroke of strokesRef.current) paintStroke(ctx, stroke);
  }, []);

  // Mount-only restore of a signature captured earlier in this packet.
  useEffect(() => {
    if (!defaultValue) return;
    const img = new Image();
    img.onload = () => {
      baseRef.current = img;
      setHasInk(true);
      repaint();
    };
    img.src = defaultValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Size the bitmap for the device pixel ratio so ink stays crisp on tablets.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // jsdom and display:none report 0 — keep a sane fallback bitmap.
      canvas.width = Math.max(1, Math.round((rect.width || 480) * dpr));
      canvas.height = Math.max(1, Math.round((rect.height || 128) * dpr));
      repaint();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [repaint]);

  const emit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      onChange(canvas.toDataURL('image/png'));
    } catch {
      // toDataURL can throw in non-browser environments; a signature that
      // cannot be exported is treated as absent rather than crashing.
      onChange(null);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    // Keep receiving moves even when the finger drifts off the pad.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    strokesRef.current.push([pointFrom(e)]);
    repaint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke) return;
    stroke.push(pointFrom(e));
    const ctx = ctx2d();
    if (ctx) paintStroke(ctx, stroke.slice(-2));
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    clearedRef.current = null; // new ink invalidates the redo buffer
    setCanRedo(false);
    setHasInk(true);
    emit();
  };

  const clear = () => {
    if (strokesRef.current.length === 0 && !baseRef.current) return;
    clearedRef.current = { strokes: strokesRef.current, base: baseRef.current };
    strokesRef.current = [];
    baseRef.current = null;
    setCanRedo(true);
    setHasInk(false);
    repaint();
    onChange(null);
  };

  const redo = () => {
    if (!clearedRef.current) return;
    strokesRef.current = clearedRef.current.strokes;
    baseRef.current = clearedRef.current.base;
    clearedRef.current = null;
    setCanRedo(false);
    setHasInk(true);
    repaint();
    emit();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {roleLabel} signature
          {qualifier && <span className="ml-1 text-xs font-normal text-muted-foreground">{qualifier}</span>}
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clear} disabled={!hasInk}>
            <Eraser className="mr-1 h-3 w-3" />Clear
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={redo} disabled={!canRedo}>
            <RotateCcw className="mr-1 h-3 w-3" />Redo
          </Button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${roleLabel} signature pad`}
        className="h-32 w-full touch-none rounded-lg border bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
      <p className="text-xs text-muted-foreground">
        Sign with a finger, stylus, or mouse — or leave blank to sign the printed page.
      </p>
    </div>
  );
}
