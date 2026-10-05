import { useState } from 'react';
import { activityRate, labels, localDateTime, officeTimestamp, reasons } from '@/lib/fill-the-schedule';
import type { Activity, Ledger } from '@/lib/fill-the-schedule';
import { sourceLabel } from './MyPointsTab';
import { Panel, Field, TimeField, Status, nameOf, input, button, secondary, type Writer } from './ui';

export default function EntryCard({ d, entry: a, writer }: { d: Ledger; entry: Activity; writer: Writer }) {
  const [mode, setMode] = useState<'attend_bonus' | 'prepay_bonus' | 'reverse' | 'reject' | null>(null);
  const [when, setWhen] = useState(() => localDateTime(new Date(), d.campaign.timezone));
  const [verified, setVerified] = useState(false); const [reason, setReason] = useState('not_verified_in_record'); const [error, setError] = useState('');
  const bonuses = d.activities.filter(b => b.parent_id === a.id && b.status === 'approved');
  const rate = activityRate(a.activity_type, d.campaign, d.participants.find(p => p.employee_id === a.employee_id)?.scoring_role ?? null);
  async function submit() {
    setError(''); if (!mode) return;
    try {
      const ok = mode === 'reject' ? await writer.write('fts_verify', { p_activity_id: a.id, p_approve: false, p_reason: reason }, 'Report rejected. No points awarded.')
        : mode === 'reverse' ? await writer.write('fts_reverse', { p_activity_id: a.id, p_reason: reason }, 'Entry reversed. Totals have been updated.')
        : await writer.write('fts_award_bonus', { p_parent_id: a.id, p_type: mode, p_occurred_at: officeTimestamp(when, d.campaign.timezone) }, 'Verified bonus added to the original entry.', true);
      if (ok) { setMode(null); setVerified(false); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Choose a valid date and time.'); }
  }
  function open(next: typeof mode) { setMode(next); setVerified(false); setError(''); setWhen(localDateTime(new Date(), d.campaign.timezone)); }
  return <article className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="font-semibold">{nameOf(d, a.employee_id)}</h3><p className="mt-1 text-sm">{labels[a.activity_type]}</p><p className="mt-2 text-xs text-muted-foreground">{localDateTime(a.occurred_at, d.campaign.timezone).replace('T', ' ')} Eastern · Tally {a.tally_week}</p><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(a)} · Entry {a.entry_code}{a.booked_by_employee_id ? ` · Booked by ${nameOf(d, a.booked_by_employee_id)}` : ''}</p></div><Status row={a} /></div>
    <div className="mt-4 flex flex-wrap gap-2">{a.status === 'pending' ? <>
      <button className={button} disabled={writer.busy || rate == null} onClick={() => void writer.write('fts_verify', { p_activity_id: a.id, p_approve: true }, 'Report verified. Its points now count.')}>{rate == null ? 'Setup: point value needed' : `Verify ${a.activity_type === 'chairside_card' ? 'chairside presentation' : a.activity_type === 'operative_handoff' ? 'operative handoff' : 'booking'} · ${rate * a.quantity} ${rate * a.quantity === 1 ? "point" : "points"}`}</button><button className={secondary} disabled={writer.busy} onClick={() => open('reject')}>Reject…</button>
    </> : a.status === 'approved' && <>
      {a.activity_type === 'unscheduled_booking' && !bonuses.some(b => b.activity_type === 'attend_bonus') && <button className={secondary} disabled={writer.busy} onClick={() => open('attend_bonus')}>Verify attendance · +{d.campaign.pts_attend_bonus}</button>}
      {['unscheduled_booking', 'operative_handoff'].includes(a.activity_type) && !bonuses.some(b => b.activity_type === 'prepay_bonus') && <button className={secondary} disabled={writer.busy} onClick={() => open('prepay_bonus')}>Verify prepayment · +{d.campaign.pts_prepay_bonus}</button>}
      <button className={secondary} disabled={writer.busy || bonuses.length > 0} title={bonuses.length ? 'Reverse the linked bonuses first.' : undefined} onClick={() => open('reverse')}>{bonuses.length ? 'Reverse bonuses first' : 'Reverse…'}</button>
    </>}</div>
    {bonuses.map(b => <div key={b.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-primary/25 pl-4"><div><p className="text-sm font-medium">{labels[b.activity_type]} · +{b.awarded_points}</p><p className="mt-1 text-xs text-muted-foreground">{localDateTime(b.occurred_at, d.campaign.timezone).replace('T', ' ')} Eastern · Tally {b.tally_week}</p></div><BonusReverse entry={b} writer={writer} /></div>)}
    {mode && <form className="mt-5 space-y-4 rounded-xl bg-muted/40 p-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <h4 className="text-sm font-semibold">{mode === 'prepay_bonus' ? 'Verify actual prepayment' : mode === 'attend_bonus' ? 'Verify attendance' : mode === 'reject' ? 'Reject this report' : 'Reverse this award'}</h4>
      {mode === 'reject' || mode === 'reverse' ? <Field title="Reason"><select className={input} value={reason} onChange={e => setReason(e.target.value)}>{Object.entries(reasons).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field> : <>
        <TimeField value={when} set={setWhen} campaign={d.campaign} /><p className="text-xs text-muted-foreground">The bonus counts when it happened, even if the original action was in an earlier tally.</p>
        <label className="flex gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={verified} required onChange={e => setVerified(e.target.checked)} /><span>{mode === 'prepay_bonus' ? 'I verified actual prepayment in the office records for this action. Card on file alone is not prepayment.' : 'I verified the patient attended this appointment booked from the unscheduled list.'}</span></label>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><button className={button} disabled={writer.busy}>Confirm {mode === 'reject' ? 'rejection' : mode === 'reverse' ? 'reversal' : 'verified bonus'}</button><button type="button" className={secondary} onClick={() => setMode(null)}>Cancel</button></div>
    </form>}
  </article>;
}
function BonusReverse({ entry, writer }: { entry: Activity; writer: Writer }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('recorded_in_error');
  return open ? <form className="flex flex-wrap gap-2" onSubmit={async e => { e.preventDefault(); if (await writer.write('fts_reverse', { p_activity_id: entry.id, p_reason: reason }, 'Bonus reversed. The original entry is unchanged.')) setOpen(false); }}><label><span className="sr-only">Reason for reversing bonus {entry.entry_code}</span><select className={input} value={reason} onChange={e => setReason(e.target.value)}>{Object.entries(reasons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><button className={secondary} disabled={writer.busy}>Confirm reversal</button><button className={secondary} type="button" onClick={() => setOpen(false)}>Cancel</button></form> : <button className={secondary} disabled={writer.busy} onClick={() => setOpen(true)}>Reverse bonus…</button>;
}
