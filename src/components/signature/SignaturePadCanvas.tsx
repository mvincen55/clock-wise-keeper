import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * The shared signature DRAWING primitive — finger, stylus, or mouse via
 * pointer events, no external libraries. Extracted from the Forms &
 * Consents pad so every signature surface draws identically.
 *
 * This component is persistence-agnostic BY DESIGN: its only output is
 * `onChange(dataUrl | null)`, and what the caller does with that decides
 * the privacy behavior —
 *
 *   - SignatureCapture (Complete Forms) keeps it in memory-only patient
 *     packet state; nothing is ever persisted. Do not change that contract.
 *   - MySignatureCard (staff profile) explicitly saves the STAFF MEMBER'S
 *     OWN ink as org-scoped business configuration.
 *
 * `background: 'white'` matches the printed consent sheet; 'transparent'
 * produces the transparent PNG a letterhead signature needs.
 */

export interface SignaturePadHandle {
  clear: () => void;
  redo: () => void;
}

export interface SignaturePadCanvasProps {
  ariaLabel: string;
  /** PNG data URL after each completed stroke; null when cleared. */
  onChange: (dataUrl: string | null) => void;
  /** Ink-state notifications so the caller can enable its own Clear/Redo. */
  onInkChange?: (state: { hasInk: boolean; canRedo: boolean }) => void;
  /** Prior signature redrawn on mount (kept in the CALLER'S memory). */
  defaultValue?: string | null;
  background?: 'white' | 'transparent';
  /** Classes for the <canvas> box (size, border, background). */
  className?: string;
}

type Point = { x: number; y: number };
type Stroke = Point[];
/** What Clear removes and Redo restores: strokes plus any restored image. */
type InkState = { strokes: Stroke[]; base: HTMLImageElement | null };

const INK = '#1a1a2e'; // dark ink — matches the printed sheet

const SignaturePadCanvas = forwardRef<SignaturePadHandle, SignaturePadCanvasProps>(
  function SignaturePadCanvas(
    { ariaLabel, onChange, onInkChange, defaultValue, background = 'white', className },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<Stroke[]>([]);
    /** Restored prior signature, painted under any new strokes. */
    const baseRef = useRef<HTMLImageElement | null>(null);
    /** Last cleared ink — Redo restores it (undo-the-clear, not per-stroke). */
    const clearedRef = useRef<InkState | null>(null);
    const drawingRef = useRef(false);

    const ctx2d = () => canvasRef.current?.getContext('2d') ?? null;

    const notify = useCallback(
      (hasInk: boolean, canRedo: boolean) => onInkChange?.({ hasInk, canRedo }),
      [onInkChange],
    );

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

    /** Clears the bitmap and repaints the base image + every stroke. */
    const repaint = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = ctx2d();
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (background === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      if (baseRef.current) {
        try { ctx.drawImage(baseRef.current, 0, 0, canvas.width, canvas.height); } catch { /* decode race */ }
      }
      // Draw in CSS pixels; the transform maps onto the device-pixel bitmap.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const stroke of strokesRef.current) paintStroke(ctx, stroke);
    }, [background]);

    // Mount-only restore of a signature captured earlier by the caller.
    useEffect(() => {
      if (!defaultValue) return;
      const img = new Image();
      img.onload = () => {
        baseRef.current = img;
        notify(true, false);
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
      notify(true, false);
      emit();
    };

    const clear = () => {
      if (strokesRef.current.length === 0 && !baseRef.current) return;
      clearedRef.current = { strokes: strokesRef.current, base: baseRef.current };
      strokesRef.current = [];
      baseRef.current = null;
      notify(false, true);
      repaint();
      onChange(null);
    };

    const redo = () => {
      if (!clearedRef.current) return;
      strokesRef.current = clearedRef.current.strokes;
      baseRef.current = clearedRef.current.base;
      clearedRef.current = null;
      notify(true, false);
      repaint();
      emit();
    };

    useImperativeHandle(ref, () => ({ clear, redo }));

    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        className={className ?? 'h-32 w-full touch-none rounded-lg border bg-white sm:h-40'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
    );
  },
);

export default SignaturePadCanvas;
