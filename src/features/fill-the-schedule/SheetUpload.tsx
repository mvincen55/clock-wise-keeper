import { useRef, useState } from 'react';
import type { Ledger, SheetReading } from '@/lib/fill-the-schedule';
import { readLocalSheet } from './sheet-reader';
import { Panel, Field, input, button, type Writer } from './ui';

export default function SheetUpload({ d, writer }: { d: Ledger; writer: Writer }) {
  const [sheetId, setSheetId] = useState(''); const [file, setFile] = useState<File | null>(null); const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0); const [error, setError] = useState(''); const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const retry = useRef<{ sheet_code: string; rows: SheetReading[]; releasedAt: string } | null>(null);
  const sheet = d.sheets?.find(s => s.id === sheetId && s.status === 'open');
  async function submit() {
    setError(''); setSummary(null);
    try {
      if (!retry.current) { if (!file || !sheet) return; setReading(true); setProgress(0); const result = await readLocalSheet(file, d, sheet, setProgress); retry.current = { sheet_code: sheet.sheet_code, ...result }; setFile(null); if (fileInput.current) fileInput.current.value = ''; }
      setReading(false); const payload = retry.current;
      if (await writer.write('fts_apply_sheet_scan', { p_campaign_id: d.campaign.id, p_sheet_code: payload.sheet_code, p_reader: 'local:tesseract-7', p_rows: payload.rows, p_released_at: payload.releasedAt }, 'Sheet read. Clear reports and rows needing your decision are now in Review.', true)) { setSummary(writer.resultRef?.current as Record<string, unknown>); retry.current = null; }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this sheet. Try a clearer scan.'); } finally { setReading(false); setFile(null); if (fileInput.current) fileInput.current.value = ''; }
  }
  return <Panel title="Read a front-desk sheet" subtitle="JPEG, PNG, or one-page PDF, up to 8 MB. Use an upright full-page scan with all four corner squares visible.">
    <div className="space-y-4"><Field title="Registered sheet"><select className={input} value={sheetId} disabled={reading || writer.busy || !!retry.current} onChange={e => setSheetId(e.target.value)}><option value="">Choose the printed sheet code</option>{d.sheets?.filter(s => s.status === 'open').map(s => <option key={s.id} value={s.id}>{s.sheet_code} · tally {s.week_key}</option>)}</select></Field>
      <Field title="Scan file"><input ref={fileInput} className={input} type="file" accept="image/jpeg,image/png,application/pdf" disabled={reading || writer.busy} onChange={e => { setFile(e.target.files?.[0] ?? null); retry.current = null; }} /></Field>
      <p className="rounded-lg bg-muted/50 p-3 text-sm">{d.campaign.auto_import_enabled ? 'Clear rows with verified manager marks may enter automatically. Unclear rows still need your decision.' : 'Automatic entry is off. Rows go to Review, where you confirm the handoff and prepayment separately.'}</p>
      <p className="text-xs text-muted-foreground">The image stays on this device and the working copy is released after reading. Your original scan file stays on your computer. Only roster IDs, dates, marks, and app references are saved.</p>
      {reading && <p role="status" className="text-sm">Reading on this device · row {progress} of 12…</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {summary && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm">{String(summary.entered ?? 0)} entered · {String(summary.awaiting ?? 0)} awaiting verification · {String(summary.needs_review ?? 0)} need review · {String(summary.already_in ?? 0)} already recorded. Rescans do not add duplicate points.</p>}
      <button className={button} disabled={reading || writer.busy || (!retry.current && (!file || !sheet))} onClick={() => void submit()}>{retry.current ? 'Retry saving the reading' : 'Read sheet and send to Review'}</button>
    </div>
  </Panel>;
}
