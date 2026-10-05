import { useState } from 'react';
import { labels, localDateTime, officeTimestamp, reasons } from '@/lib/fill-the-schedule';
import type { Ledger, ScheduleSheetRow } from '@/lib/fill-the-schedule';
import { Field, TeamSelect, input, button, secondary, nameOf, type Writer } from './ui';

export const sheetFlags: Record<string, string> = {
  auto_import_off: 'Automatic entry is off. Confirm this reading before entering it.',
  name_needed: 'The employee name could not be matched confidently.', unreadable: 'One or more required fields need confirmation.',
  not_confirmed_by_staff: 'The staff scheduling confirmation was not clear.', outside_campaign: 'The event time is outside the campaign or in the future.',
  wrong_sheet_week: 'The action belongs to a different tally than the printed sheet.', crossed_out: 'This row appears crossed out.',
  possible_duplicate: 'An action for this employee on this day is already recorded.', code_not_found: 'The app reference could not be matched.',
  code_time_mismatch: 'The app reference and sheet have different event times.', already_linked_elsewhere: 'The app entry is already linked to another paper row.',
  row_changed: 'Row changed since entered. The original points are preserved until you decide.',
  prepay_changed: 'Prepayment reading changed. The existing bonus is preserved until reviewed.',
  prepay_unclear: 'The prepayment date or time is unclear. The approved handoff keeps its points.',
  prepay_unreadable: 'The actual-prepayment marks are unclear. The handoff is separate.',
  prepay_invalid_time: 'The prepayment time is invalid or earlier than the handoff.',
};
export default function SheetRowCard({ d, row, writer }: { d: Ledger; row: ScheduleSheetRow; writer: Writer }) {
  const [person, setPerson] = useState(row.reading.credit_employee_id ?? row.credit_employee_id ?? '');
  const [when, setWhen] = useState(row.reading.occurred_at ? localDateTime(row.reading.occurred_at, d.campaign.timezone) : '');
  const [prepayAt, setPrepayAt] = useState(row.reading.prepay_at ? localDateTime(row.reading.prepay_at, d.campaign.timezone) : '');
  const [verifyHandoff, setVerifyHandoff] = useState(false); const [verifyPrepay, setVerifyPrepay] = useState(false);
  const [link, setLink] = useState(''); const [reason, setReason] = useState('recorded_in_error'); const [error, setError] = useState('');
  const sheet = d.sheets?.find(s => s.id === row.sheet_id); const changed = row.flags.includes('row_changed') || row.flags.includes('prepay_changed');
  const handoff = d.activities.find(a => a.id === row.handoff_activity_id); const approved = handoff?.status === 'approved';
  const candidates = d.activities.filter(a => a.employee_id === person && a.activity_type === 'operative_handoff' && ['pending', 'approved'].includes(a.status) && (!a.sheet_id || (a.sheet_id === row.sheet_id && a.sheet_row === row.row_no)) && a.id !== row.handoff_activity_id);
  const matches = row.flags.some(f => ['possible_duplicate', 'code_not_found', 'code_time_mismatch'].includes(f));
  async function resolve(action: string) {
    setError('');
    try {
      const needsFields = ['enter', 'enter_both', 'link', 'replace', 'verify_prepay'].includes(action);
      if (needsFields && !person) throw new Error('Choose the employee earning the credit.');
      if (needsFields && !approved && !when) throw new Error('Confirm the handoff date and time.');
      if (verifyPrepay && !prepayAt) throw new Error('Actual prepayment needs its own date and time.');
      await writer.write('fts_resolve_sheet_row', { p_row_id: row.id, p_action: action,
        ...(needsFields ? { p_employee_id: person, p_occurred_at: when ? officeTimestamp(when, d.campaign.timezone) : null, p_prepay_at: prepayAt ? officeTimestamp(prepayAt, d.campaign.timezone) : null,
          p_verify_handoff: approved || verifyHandoff, p_verify_prepay: verifyPrepay, p_link_activity_id: action === 'link' ? link : null } : {}),
        ...(action === 'replace' ? { p_reason: reason } : {}),
      }, 'Sheet row resolved. Approved and awaiting points have been updated.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Check this row.'); }
  }
  const field = (title: string, value: string, set: (s: string) => void) => <Field title={title}><input className={input} type="datetime-local" value={value} min={`${d.campaign.starts_on}T00:00`} max={localDateTime(new Date(), d.campaign.timezone)} onChange={e => set(e.target.value)} /></Field>;
  return <article className="space-y-4 rounded-xl border bg-background p-4"><div><h3 className="font-semibold">{sheet?.sheet_code ?? 'Sheet'} · row {row.row_no}</h3>{row.flags.map(flag => <p key={flag} className="mt-2 text-sm text-amber-800 dark:text-amber-300">{sheetFlags[flag] ?? 'This component needs review.'}</p>)}</div>
    {changed && row.previous_reading && <div className="rounded-lg border bg-muted/40 p-3 text-sm"><p className="font-medium">Previous reading</p><p className="mt-1">{row.previous_reading.credit_employee_id ? nameOf(d, row.previous_reading.credit_employee_id) : 'Employee unclear'} · {row.previous_reading.occurred_at ? localDateTime(row.previous_reading.occurred_at, d.campaign.timezone).replace('T', ' ') : 'Time unclear'}</p><p className="mt-1">Prepayment: {row.previous_reading.prepay_at ? localDateTime(row.previous_reading.prepay_at, d.campaign.timezone).replace('T', ' ') : 'Not recorded'}</p></div>}
    <TeamSelect d={d} value={person} set={setPerson} />
    <div className="grid gap-4 sm:grid-cols-2">{field('Handoff date and time · Eastern', when, setWhen)}{field('Actual prepayment date and time · Eastern', prepayAt, setPrepayAt)}</div>
    {!approved && <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={verifyHandoff} onChange={e => setVerifyHandoff(e.target.checked)} /><span>I verified the operative treatment was scheduled before the patient left, including the walk-up. Award {d.campaign.pts_operative_handoff} handoff points.</span></label>}
    {approved && <p className="text-sm">The handoff is approved. Its {handoff.awarded_points} points remain while you review prepayment.</p>}
    <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={verifyPrepay} disabled={!approved && !verifyHandoff} onChange={e => setVerifyPrepay(e.target.checked)} /><span>I separately verified actual prepayment in the office records. Award +{d.campaign.pts_prepay_bonus}. Card on file alone does not qualify.</span></label>
    {matches && !!candidates.length && <Field title="Existing app action, if this is the same action"><select className={input} value={link} onChange={e => setLink(e.target.value)}><option value="">Choose the original action</option>{candidates.map(a => <option key={a.id} value={a.id}>{nameOf(d, a.employee_id)} · {localDateTime(a.occurred_at, d.campaign.timezone).replace('T', ' ')} · {a.status}</option>)}</select></Field>}
    {changed && <Field title="Reason if replacing the original"><select className={input} value={reason} onChange={e => setReason(e.target.value)}>{Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {changed ? <><button className={secondary} disabled={writer.busy} onClick={() => void resolve('keep_original')}>Keep original</button><button className={button} disabled={writer.busy || (!verifyHandoff && !approved)} onClick={() => void resolve('replace')}>Replace with verified correction</button></>
        : approved ? <><button className={button} disabled={writer.busy || !verifyPrepay} onClick={() => void resolve('verify_prepay')}>Verify prepayment · +{d.campaign.pts_prepay_bonus}</button><button className={secondary} disabled={writer.busy} onClick={() => void resolve('no_prepay')}>No prepayment</button></>
          : <><button className={button} disabled={writer.busy || !person || !when} onClick={() => void resolve(matches ? 'enter_both' : 'enter')}>{verifyHandoff ? `Enter verified handoff${verifyPrepay ? ' + prepayment' : ''}` : matches ? 'Separate action · save awaiting report' : 'Save awaiting report'}</button>{matches && <button className={secondary} disabled={writer.busy || !link} onClick={() => void resolve('link')}>Same action · link app entry</button>}</>}
      <button className={secondary} disabled={writer.busy} onClick={() => void resolve('skip')}>Skip this reading</button>
    </div>
  </article>;
}
