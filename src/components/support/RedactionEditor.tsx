import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Square, Undo2, Trash2, Loader2 } from 'lucide-react';
import {
  composeRedaction,
  normalizeBox,
  MASK_FILL,
  type BoxTool,
  type RedactionBox,
} from '@/lib/manual-redaction';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The untouched screenshot — used to uncover areas again. */
  original: File;
  /** The automatically scrubbed version, when there is one. */
  autoRedacted: File | null;
  boxes: RedactionBox[];
  onSave: (boxes: RedactionBox[], composed: File) => void;
}

/**
 * Draw-your-own-mask editor. Drag across the screenshot to cover something the
 * automatic pass missed, or switch to Uncover to bring an over-eager block
 * back so the help desk can read it.
 */
export default function RedactionEditor({
  open,
  onOpenChange,
  original,
  autoRedacted,
  boxes,
  onSave,
}: Props) {
  const [tool, setTool] = useState<BoxTool>('mask');
  const [draft, setDraft] = useState<RedactionBox[]>(boxes);
  const [drawing, setDrawing] = useState<RedactionBox | null>(null);
  const [saving, setSaving] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(boxes);
      setDrawing(null);
      setTool('mask');
    }
  }, [open, boxes]);

  // The picture underneath is the auto-scrubbed one, so what you see here is
  // exactly what would be sent right now.
  const baseUrl = useMemo(
    () => URL.createObjectURL(autoRedacted ?? original),
    [autoRedacted, original],
  );
  const rawUrl = useMemo(() => URL.createObjectURL(original), [original]);
  useEffect(
    () => () => {
      URL.revokeObjectURL(baseUrl);
      URL.revokeObjectURL(rawUrl);
    },
    [baseUrl, rawUrl],
  );

  const pointFrom = (e: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = pointFrom(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing({ id: crypto.randomUUID(), tool, x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = pointFrom(e);
    if (!p) return;
    setDrawing({ ...drawing, w: p.x - drawing.x, h: p.y - drawing.y });
  };

  const onPointerUp = () => {
    if (!drawing) return;
    const box = normalizeBox(drawing);
    setDrawing(null);
    // Ignore accidental taps — a box needs to actually cover something.
    if (box.w < 0.005 || box.h < 0.005) return;
    setDraft(prev => [...prev, box]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { file } = await composeRedaction(original, autoRedacted, draft);
      onSave(draft, file);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const shown = drawing ? [...draft, normalizeBox(drawing)] : draft;
  const maskCount = draft.filter(b => b.tool === 'mask').length;
  const revealCount = draft.filter(b => b.tool === 'reveal').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[70] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Cover it yourself</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={tool === 'mask' ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setTool('mask')}
          >
            <Square className="mr-1 h-3 w-3" /> Cover
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === 'reveal' ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => setTool('reveal')}
            disabled={!autoRedacted}
            title={autoRedacted ? undefined : 'Nothing was auto-covered on this image'}
          >
            <Eye className="mr-1 h-3 w-3" /> Uncover
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setDraft(prev => prev.slice(0, -1))}
              disabled={draft.length === 0}
            >
              <Undo2 className="mr-1 h-3 w-3" /> Undo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Clear
            </Button>
          </div>
        </div>

        <div
          ref={surfaceRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative max-h-[60vh] cursor-crosshair touch-none select-none overflow-hidden rounded border bg-muted"
        >
          <img
            src={baseUrl}
            alt="Screenshot being redacted"
            draggable={false}
            className="pointer-events-none block max-h-[60vh] w-full object-contain"
          />
          {shown.map(b => (
            <div
              key={b.id}
              className={
                b.tool === 'mask'
                  ? 'pointer-events-none absolute'
                  : 'pointer-events-none absolute overflow-hidden border-2 border-primary'
              }
              style={{
                left: `${b.x * 100}%`,
                top: `${b.y * 100}%`,
                width: `${b.w * 100}%`,
                height: `${b.h * 100}%`,
                background: b.tool === 'mask' ? MASK_FILL : undefined,
              }}
            >
              {b.tool === 'reveal' && (
                <img
                  src={rawUrl}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute max-w-none"
                  style={{
                    width: `${(1 / Math.max(b.w, 0.0001)) * 100}%`,
                    height: `${(1 / Math.max(b.h, 0.0001)) * 100}%`,
                    left: `${(-b.x / Math.max(b.w, 0.0001)) * 100}%`,
                    top: `${(-b.y / Math.max(b.h, 0.0001)) * 100}%`,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <p className="flex-1 text-[11px] leading-tight text-muted-foreground">
            Drag across the image to {tool === 'mask' ? 'cover' : 'uncover'} an area.
            {draft.length > 0 && (
              <>
                {' '}
                {maskCount} covered
                {revealCount > 0 ? `, ${revealCount} uncovered` : ''} by hand.
              </>
            )}
          </p>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Use this version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
