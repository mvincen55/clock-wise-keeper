import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Provider } from '@/lib/providers';
import type { CaptureFrame, LayoutColumn } from '@/lib/schedule-reader';
import { providerColumn } from '@/lib/schedule-provider-mapping';

export default function DailyColumnReview({ initial, providers, frame, date, onConfirm, onCancel }: {
  initial: LayoutColumn[]; providers: Provider[]; frame: CaptureFrame; date: string;
  onConfirm: (columns: LayoutColumn[]) => void; onCancel: () => void;
}) {
  const [columns, setColumns] = useState(initial);
  const preview = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas) return;
    canvas.width = frame.width; canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(frame.canvas, 0, 0);
    columns.forEach((col, i) => {
      if (!ctx) return;
      ctx.strokeStyle = '#72549b'; ctx.lineWidth = 2;
      ctx.strokeRect(col.xStart * frame.width, 0, (col.xEnd - col.xStart) * frame.width, frame.height);
      ctx.fillStyle = '#fff'; ctx.fillRect(col.xStart * frame.width + 2, 2, 28, 25);
      ctx.fillStyle = '#452b69'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(String(i + 1), col.xStart * frame.width + 7, 21);
    });
    return () => { canvas.width = 0; canvas.height = 0; };
  }, [frame, columns]);
  const update = (i: number, col: LayoutColumn) => setColumns(prev => prev.map((c, n) => n === i ? col : c));
  return <div className="space-y-4">
    <h3 ref={heading} tabIndex={-1} className="font-semibold">Review columns for {date}</h3>
    <p className="text-sm text-muted-foreground">These assignments apply only to this capture. Check today’s provider names and notes-only columns. A provider can use more than one column; tomorrow’s assignments are read again.</p>
    <canvas ref={preview} className="w-full rounded border" aria-label="Current schedule with numbered column boundaries" />
    {columns.map((col, i) => <div key={i} className="space-y-1 rounded border p-3">
      <Label htmlFor={`daily-column-${i}`}>Column {i + 1}{col.providerCode ? ` · ${col.providerCode}` : ''}</Label>
      <Select value={col.kind === 'non_clinical' ? 'notes' : col.providerId ?? ''} onValueChange={id => {
        const provider = providers.find(p => p.id === id);
        update(i, id === 'notes' ? { ...col, kind: 'non_clinical', providerId: undefined, providerLabel: null, providerRole: null, department: null, employeeId: null, workingHours: undefined } : provider ? { ...col, kind: 'provider', ...providerColumn(provider), workingHours: initial.find(c => c.providerId === id)?.workingHours } : col);
      }}>
        <SelectTrigger id={`daily-column-${i}`}><SelectValue placeholder="Select today’s provider or notes only" /></SelectTrigger>
        <SelectContent><SelectItem value="notes">Notes only / non-clinical</SelectItem>{providers.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}</SelectContent>
      </Select>
    </div>)}
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => onConfirm(columns)} disabled={!columns.some(c => c.kind !== 'non_clinical') || columns.some(c => c.kind !== 'non_clinical' && !c.providerId)}>Use these assignments</Button>
      <Button variant="outline" onClick={onCancel}>Cancel capture</Button>
    </div>
  </div>;
}
