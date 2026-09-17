import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Provider } from '@/lib/providers';
import type { CaptureFrame, LayoutColumn } from '@/lib/schedule-reader';
import { providerColumn, stripSuggestion, unplacedProviders, type ReviewColumn } from '@/lib/schedule-provider-mapping';
import ColumnPreview from './ColumnPreview';
import { QuickPicks } from './column-suggestions';
import { columnEvidence } from '@/lib/schedule-column-evidence';

export default function DailyColumnReview({ initial, providers, frame, date, onConfirm, onCancel }: {
  initial: ReviewColumn[]; providers: Provider[]; frame: CaptureFrame; date: string;
  onConfirm: (columns: LayoutColumn[]) => void; onCancel: () => void;
}) {
  const [columns, setColumns] = useState<ReviewColumn[]>(initial);
  const [active, setActive] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const update = (i: number, col: ReviewColumn) => setColumns(prev => prev.map((c, n) => n === i ? col : c));
  const assign = (i: number, provider: Provider) =>
    update(i, { ...columns[i], kind: 'provider', ...providerColumn(provider), workingHours: initial.find(c => c.providerId === provider.id)?.workingHours });
  const clinical = columns.filter(c => c.kind !== 'non_clinical');
  const assigned = clinical.filter(c => c.providerId).length;
  const unplaced = unplacedProviders(providers, columns);
  return <div className="space-y-4">
    <h3 ref={heading} tabIndex={-1} className="font-semibold">Review columns for {date}</h3>
    <p className="text-sm text-muted-foreground">These assignments apply only to this capture. Keep early-arrival and hold columns that reserve provider time. Assign a related hold to the same provider as the appointment. A hold without a readable provider code needs your confirmation. A provider can use more than one column; tomorrow’s assignments are read again.</p>
    <ColumnPreview frame={frame} columns={columns} active={active} />
    <div className="rounded-md bg-muted/50 p-3 text-sm">
      <p><strong>{assigned} of {clinical.length} columns</strong> {clinical.length === 1 ? 'has' : 'have'} a provider{assigned < clinical.length ? ` · ${clinical.length - assigned} still need${clinical.length - assigned === 1 ? 's' : ''} your pick` : ''}.</p>
      {unplaced.length > 0 && <p className="text-xs text-muted-foreground">Not placed in any column yet: {unplaced.map(p => p.displayName + (p.scheduleCode ? ` (${p.scheduleCode})` : '')).join(', ')}. Anyone who was off today can stay unplaced.</p>}
    </div>
    {columns.map((col, i) => col.kind !== 'non_clinical' && <div key={i} className={`space-y-2 rounded border p-3 ${active === i ? 'border-primary/60 bg-primary/5' : ''}`}
      onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(current => current === i ? null : current)}
      onFocusCapture={() => setActive(i)} onBlurCapture={() => setActive(current => current === i ? null : current)}>
      <Label htmlFor={`daily-column-${i}`}>Column {i + 1}{col.providerCode ? ` · ${col.providerCode}` : ''}</Label>
      <Select value={col.providerId ?? ''} onValueChange={id => {
        const provider = providers.find(p => p.id === id);
        if (id === 'notes') update(i, { ...col, kind: 'non_clinical', providerId: undefined, providerLabel: null, providerRole: null, department: null, employeeId: null, workingHours: undefined });
        else if (provider) assign(i, provider);
      }}>
        <SelectTrigger id={`daily-column-${i}`}><SelectValue placeholder="Select today’s provider or notes only" /></SelectTrigger>
        <SelectContent><SelectItem value="notes">Notes only / non-clinical</SelectItem>{providers.map(p => <SelectItem key={p.id} value={p.id}>{p.displayName}</SelectItem>)}</SelectContent>
      </Select>
      {col.suggestion && <p className="text-xs text-muted-foreground">{columnEvidence(col, initial[i]?.providerId)}</p>}
      {!col.providerId && <QuickPicks column={col} index={i} providers={providers} unplaced={unplaced} onPick={p => assign(i, p)} />}
      <Button type="button" variant="ghost" size="sm" aria-label={`Exclude column ${i+1}`} onClick={()=>{ update(i,{...col,kind:'non_clinical'}); heading.current?.focus(); }}>Exclude column — no appointments</Button>
    </div>)}
    {columns.some(c=>c.kind==='non_clinical') && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">{columns.filter(c=>c.kind==='non_clinical').length} excluded columns (empty or notes only)</summary><div className="flex flex-wrap gap-2 pt-2">{columns.map((col,i)=>col.kind==='non_clinical' && <Button key={i} variant="outline" size="sm" onClick={()=>update(i,{...col,kind:'provider'})}>Restore column {i+1}</Button>)}</div></details>}
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => onConfirm(columns.map(stripSuggestion))} disabled={!columns.some(c => c.kind !== 'non_clinical') || columns.some(c => c.kind !== 'non_clinical' && !c.providerId)}>Use these assignments</Button>
      <Button variant="outline" onClick={onCancel}>Cancel capture</Button>
    </div>
  </div>;
}
