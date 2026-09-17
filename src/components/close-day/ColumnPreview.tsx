import { useEffect, useRef } from 'react';
import type { CaptureFrame, LayoutColumn } from '@/lib/schedule-reader';

type PreviewColumn = Pick<LayoutColumn, 'xStart' | 'xEnd' | 'kind'>;

/**
 * The in-memory capture with every detected column outlined and numbered, so
 * "Column 3" on the form is visibly the third lane in the picture. The lane
 * whose card the closer is hovering or focusing is shaded.
 *
 * This canvas is a display copy of the frame and nothing more: it is blanked
 * whenever it leaves the screen and is never serialized or uploaded.
 */
export default function ColumnPreview({ frame, columns, active = null, maxWidth, label = 'Current schedule with numbered column boundaries' }: {
  frame: CaptureFrame;
  columns: PreviewColumn[];
  /** Index of the column to shade, when a card is hovered or focused. */
  active?: number | null;
  /** Downscale wide captures to this many CSS pixels; full size by default. */
  maxWidth?: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const scale = maxWidth ? Math.min(1, maxWidth / frame.width) : 1;
    canvas.width = Math.round(frame.width * scale);
    canvas.height = Math.round(frame.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(frame.canvas, 0, 0, canvas.width, canvas.height);
    columns.forEach((col, i) => {
      const x = col.xStart * canvas.width;
      const w = (col.xEnd - col.xStart) * canvas.width;
      const excluded = col.kind === 'non_clinical';
      if (i === active) {
        ctx.fillStyle = 'rgba(114, 84, 155, 0.22)';
        ctx.fillRect(x, 0, w, canvas.height);
      }
      ctx.strokeStyle = excluded ? '#9ca3af' : '#72549b';
      ctx.lineWidth = i === active ? 3 : 2;
      ctx.strokeRect(x, 0, w, canvas.height);
      ctx.fillStyle = excluded ? '#e5e7eb' : '#fff';
      ctx.fillRect(x + 2, 2, 28, 25);
      ctx.fillStyle = excluded ? '#6b7280' : '#452b69';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(String(i + 1), x + 7, 21);
    });
    return () => { canvas.width = 0; canvas.height = 0; };
  }, [frame, columns, active, maxWidth]);
  return <canvas ref={ref} className="w-full rounded border" aria-label={label} />;
}
