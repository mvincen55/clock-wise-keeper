import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { destroyCapture, frameFromFile, type CaptureFrame } from '@/lib/schedule-reader';
import { recognizeFrame } from '@/lib/schedule-reader/ocr';
import { groupWordsIntoLines } from '@/lib/schedule-reader/privacy-detector';
import { parseWorkingSchedule, workingScheduleText, type WorkingPeriod } from '@/lib/provider-working-schedule';

export default function ProviderWorkingSchedule({ providerId, name, value, onChange, onPendingChange }: {
  providerId: string; name: string; value?: WorkingPeriod[]; onChange: (periods: WorkingPeriod[] | undefined) => void;
  onPendingChange: (providerId: string, pending: boolean) => void;
}) {
  const [draft, setDraft] = useState(value ? workingScheduleText(value) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = busy || draft.trim() !== (value ? workingScheduleText(value) : '');
  useEffect(() => { onPendingChange(providerId, pending); }, [providerId, pending, onPendingChange]);
  const read = async (file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Choose a file smaller than 10 MB.'); return; }
    setBusy(true); setError('');
    let frame: CaptureFrame | null = null;
    try {
      let text: string;
      if (file.type.startsWith('image/')) {
        frame = await frameFromFile(file);
        const { words } = await recognizeFrame(frame.canvas);
        text = groupWordsIntoLines(words).map(line => line.text).join('\n');
        for (const word of words) word.text = '';
      } else text = await file.text();
      const periods = parseWorkingSchedule(text);
      setDraft(workingScheduleText(periods));
    } catch (err) { setError(err instanceof Error && !file.type.startsWith('image/') ? err.message : 'Could not read clear weekday/time rows. Enter the hours below or try a clearer image.'); }
    finally { await destroyCapture(frame); setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  };
  return <div className="rounded-md border p-3 space-y-2">
    <p className="font-medium text-sm">{name}</p>
    <p className="text-xs text-muted-foreground">Attach a weekly working schedule (CSV, text, or image). It is read on this device. Only reviewed weekdays and hours are saved with the provider’s layout; the file is not stored.</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? 'Reading schedule…' : 'Attach working schedule'}</Button>
    <input ref={fileInput} type="file" accept=".csv,.txt,image/*" className="hidden" aria-label={`Working schedule file for ${name}`} onChange={e => void read(e.target.files?.[0])} />
    <Label htmlFor={`working-${providerId}`}>Review weekly hours</Label>
    <Textarea id={`working-${providerId}`} value={draft} onChange={e => setDraft(e.target.value)} placeholder={'Monday,08:00,17:00\nTuesday,off'} />
    <p className="text-xs text-muted-foreground">One weekday per row; use 24-hour times or AM/PM. Add separate rows for split shifts. Unlisted days stay unknown.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {pending && <p className="text-xs text-muted-foreground">Confirm these working hours before saving the layout.</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy || !draft.trim()} onClick={() => { try { const periods = parseWorkingSchedule(draft); setDraft(workingScheduleText(periods)); onChange(periods); setError(''); } catch (e) { setError((e as Error).message); } }}>Confirm working hours</Button>
      {value && <Button type="button" variant="ghost" onClick={() => { onChange(undefined); setDraft(''); }}>Remove working hours</Button>}
    </div>
    {value && <p className="text-xs text-muted-foreground">Confirmed for this layout. Save the layout to keep these hours.</p>}
  </div>;
}
