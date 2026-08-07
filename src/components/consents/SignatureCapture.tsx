import { useRef, useState } from 'react';
import { Eraser, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SignaturePadCanvas, {
  type SignaturePadHandle,
} from '@/components/signature/SignaturePadCanvas';

/**
 * Canvas signature pad for the Complete Forms workflow. The drawing itself
 * comes from the shared SignaturePadCanvas primitive; this wrapper owns the
 * patient-workflow framing (role label, Clear/Redo, guidance) and — above
 * all — the privacy contract:
 *
 * PRIVACY: the drawing lives on the canvas and in a stroke buffer in
 * component memory. The only output is `onChange(dataUrl | null)` — the
 * caller keeps it in the memory-only PacketFill; nothing here (or
 * downstream) ever persists it. Staff profile signatures are a different
 * feature with different rules (MySignatureCard) — do not merge them.
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

export default function SignatureCapture({ roleLabel, qualifier, onChange, defaultValue }: SignatureCaptureProps) {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {roleLabel} signature
          {qualifier && <span className="ml-1 text-xs font-normal text-muted-foreground">{qualifier}</span>}
        </p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="touch-target h-7 px-2 text-xs"
            onClick={() => padRef.current?.clear()}
            disabled={!hasInk}
          >
            <Eraser className="mr-1 h-3 w-3" />Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="touch-target h-7 px-2 text-xs"
            onClick={() => padRef.current?.redo()}
            disabled={!canRedo}
          >
            <RotateCcw className="mr-1 h-3 w-3" />Redo
          </Button>
        </div>
      </div>
      <SignaturePadCanvas
        ref={padRef}
        ariaLabel={`${roleLabel} signature pad`}
        onChange={onChange}
        onInkChange={({ hasInk: ink, canRedo: redo }) => {
          setHasInk(ink);
          setCanRedo(redo);
        }}
        defaultValue={defaultValue}
        background="white"
      />
      <p className="text-xs text-muted-foreground">
        Sign with a finger, stylus, or mouse — or leave blank to sign the printed page.
      </p>
    </div>
  );
}
