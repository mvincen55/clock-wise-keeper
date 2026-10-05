import type { Ledger } from '@/lib/fill-the-schedule';
import { Panel, type Writer } from './ui';

export function ScanSettings({ d, writer }: { d: Ledger; writer: Writer }) {
  const validated = !!d.campaign.scan_validation;
  return <Panel title="Front-desk sheet reader" subtitle="Images are read on this device. Only structured form fields are saved; no image or handwritten text is uploaded.">
    <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={!!d.campaign.auto_import_enabled} disabled={writer.busy || !validated} onChange={e => void writer.write('fts_set_auto_import', { p_campaign_id: d.campaign.id, p_enabled: e.target.checked }, 'Automatic sheet entry setting updated.')} /><span>Automatically enter clear, verified rows</span></label>
    <p className="mt-3 text-sm text-muted-foreground">{validated ? 'The handwriting validation is recorded. You can turn automatic entry off at any time. Unclear rows always require your decision.' : 'Automatic entry is off until the real-form test passes: at least 30 rows from 3 staff members, 95% field accuracy, zero wrong-person matches, and zero false verification marks. Scans currently go to Review for your confirmation.'}</p>
  </Panel>;
}
