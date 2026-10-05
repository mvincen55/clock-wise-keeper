import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Ledger, ScheduleSheet } from '@/lib/fill-the-schedule';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EntryCard from './EntryCard';
import RecordTab from './RecordTab';
import SheetUpload from './SheetUpload';
import SheetRowCard from './SheetRowCard';
import { Panel, button, secondary, type Writer } from './ui';

export default function ReviewTab({ d, employeeId, week, writer, onSettings }: { d: Ledger; employeeId: string; week: string; writer: Writer; onSettings: () => void }) {
  const [record, setRecord] = useState(false); const [upload, setUpload] = useState(false); const navigate = useNavigate();
  const missing = d.participants.filter(p => p.active && !p.scoring_role).length;
  const flags = (d.sheetRows ?? []).filter(r => r.handoff_state === 'flagged' || r.prepay_state === 'flagged');
  const pending = d.activities.filter(a => a.status === 'pending').sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const approved = d.activities.filter(a => a.status === 'approved' && !a.parent_id && (a.tally_week === week || (['unscheduled_booking', 'operative_handoff'].includes(a.activity_type) && !d.activities.some(b => b.parent_id === a.id && b.activity_type === 'prepay_bonus' && b.status === 'approved')) || (a.activity_type === 'unscheduled_booking' && !d.activities.some(b => b.parent_id === a.id && b.activity_type === 'attend_bonus' && b.status === 'approved')))).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return <div className="space-y-5">
    {(missing > 0 || d.campaign.pts_chairside_card == null) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-4"><div><p className="font-semibold text-red-700 dark:text-red-300">Setup needed</p><p className="mt-1 text-sm">{missing > 0 ? `${missing} scoring groups need confirmation. ` : ''}{d.campaign.pts_chairside_card == null ? 'Chairside point value is not set.' : ''}</p></div><button className={secondary} onClick={onSettings}>Open Settings</button></div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">{pending.length + flags.length} items to review</h2><p className="mt-1 text-sm text-muted-foreground">Check the office records, then approve. Bonuses stay attached to their original action.</p></div><div className="flex flex-wrap gap-2">
      <button className={button} disabled={writer.busy} onClick={() => setUpload(v => !v)}>Upload a sheet</button>
      <button className={secondary} disabled={writer.busy} onClick={async () => { if (await writer.write('fts_print_sheet', { p_campaign_id: d.campaign.id, p_week_key: week }, 'Blank sheet registered. Opening the printable page.', true)) { const sheet = writer.resultRef?.current as ScheduleSheet | null; if (sheet?.id) navigate(`/fill-the-schedule/sheet/${sheet.id}`); } }}>Print blank sheet</button>
      <button className={secondary} disabled={writer.busy} onClick={() => setRecord(true)}>Record for a team member</button>
    </div></div>
    {upload && <SheetUpload d={d} writer={writer} />}
    {!!d.sheets?.length && <details className="rounded-xl border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Registered front-desk sheets</summary><ul className="mt-3 max-h-60 space-y-2 overflow-y-auto">{d.sheets.filter(s => s.status === 'open').map(s => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{s.sheet_code} · tally {s.week_key}</span><Link className={secondary} to={`/fill-the-schedule/sheet/${s.id}`}>Open / reprint</Link></li>)}</ul></details>}
    {!!flags.length && <Panel title="Sheet rows that need your decision" subtitle="Nothing uncertain is awarded automatically. Review each component independently."><div className="space-y-4">{flags.map(row => <SheetRowCard key={row.id} d={d} row={row} writer={writer} />)}</div></Panel>}
    <Panel title="Awaiting your verification" subtitle="Reports awaiting verification earn no points yet.">{pending.length ? <div className="space-y-3">{pending.map(a => <EntryCard key={a.id} d={d} entry={a} writer={writer} />)}</div> : <p className="text-sm text-muted-foreground">No reports awaiting verification.</p>}</Panel>
    {!!approved.length && <Panel title="Verified this tally and actions with available bonuses" subtitle="Add attendance or actual prepayment directly to the action you verified. Earlier actions remain available until their bonuses are recorded."><div className="space-y-3">{approved.map(a => <EntryCard key={a.id} d={d} entry={a} writer={writer} />)}</div></Panel>}
    <Dialog open={record} onOpenChange={setRecord}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Record for a team member</DialogTitle></DialogHeader><RecordTab d={d} employeeId={employeeId} week={week} writer={writer} manager /></DialogContent></Dialog>
  </div>;
}
