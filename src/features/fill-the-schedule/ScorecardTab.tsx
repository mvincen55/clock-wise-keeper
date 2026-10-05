import { useState } from 'react';
import { activityRate, localDateTime, officeTimestamp, tallyClosed } from '@/lib/fill-the-schedule';
import type { Ledger } from '@/lib/fill-the-schedule';
import { WeeklyTable } from './WeeklyTable';
import { Huddles, OpenHours, VerifiedCalls } from './WeeklyForms';
import { Panel, Field, TeamSelect, TimeField, button, secondary, type Writer } from './ui';

export default function ScorecardTab({ d, week, writer, onReview }: { d: Ledger; week: string; writer: Writer; onReview: () => void }) {
  const [selected, setSelected] = useState(d.participants.find(p => p.active)?.employee_id ?? '');
  const [action, setAction] = useState<'calls' | 'huddles' | 'reviews' | 'hours' | null>(null);
  const clerical = d.participants.filter(p => p.active && p.scoring_role === 'clerical');
  const entered = clerical.filter(p => d.calls.some(c => c.week_key === week && c.employee_id === p.employee_id)).length;
  const flags = (d.sheetRows ?? []).filter(r => r.handoff_state === 'flagged' || r.prepay_state === 'flagged');
  const pending = flags.length + d.activities.filter(a => a.status === 'pending' && !flags.some(r => r.handoff_activity_id === a.id || r.prepay_activity_id === a.id)).length;
  const huddles = new Set(d.huddles.filter(h => h.week_key === week).map(h => h.huddle_date));
  const reviews = d.activities.filter(a => a.status === 'approved' && a.activity_type === 'google_review' && a.tally_week === week).length;
  const hours = d.metrics.find(m => m.week_key === week)?.doctor_open_hours;
  const checked = (key: 'huddles' | 'reviews') => !!d.checks?.find(c => c.week_key === week && c.check_key === key)?.checked;
  const checks = [
    { label: 'Reports and sheet flags', text: pending ? `${pending} need review` : 'Review is clear', done: pending === 0, action: onReview },
    { label: 'Documented calls', text: `${entered} of ${clerical.length} clerical totals entered`, done: entered === clerical.length, action: () => setAction('calls') },
    { label: 'Huddles', text: `${huddles.size} dates recorded${checked('huddles') ? ' · reviewed' : ' · review the dates'}`, done: checked('huddles'), action: () => setAction('huddles') },
    { label: 'Posted Google reviews', text: `${reviews} recorded${checked('reviews') ? ' · checked' : ' · check for any remaining reviews'}`, done: checked('reviews'), action: () => setAction('reviews') },
    { label: 'Doctor open time', text: hours == null ? 'Not recorded' : `${hours} hours`, done: hours != null, action: () => setAction('hours') },
  ];
  return <div className="space-y-5">
    <Panel title={tallyClosed(week, d.campaign) ? 'Tally closed · final checks' : week === d.campaign.ends_on ? 'Before the final tally closes' : 'Before Friday noon'} subtitle={`${checks.filter(c => !c.done).length} checks remain. Zero reviews or huddles does not automatically mean they were checked.`}>
      <ul className="divide-y">{checks.map(c => <li key={c.label} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-start gap-3"><span aria-label={c.done ? 'Complete' : 'Needs action'} className={c.done ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}>{c.done ? '✓' : '□'}</span><div><p className="text-sm font-medium">{c.label}</p><p className="mt-1 text-xs text-muted-foreground">{c.text}</p></div></div><button className={secondary} onClick={c.action}>{c.done ? 'Edit / review' : 'Review'}</button></li>)}</ul>
      <p className="mt-3 text-xs text-muted-foreground">Prize picks received are recorded in the table below after the tally closes. Each pick is one item from the prize bin.</p>
    </Panel>
    {action && <div className="space-y-3"><button className={secondary} onClick={() => setAction(null)}>Close these controls</button>
      {action === 'calls' && <><TeamSelect d={d} value={selected} set={setSelected} /><VerifiedCalls d={d} week={week} selected={selected} writer={writer} /></>}
      {action === 'huddles' && <><Huddles d={d} writer={writer} /><CheckReviewed d={d} week={week} writer={writer} kind="huddles" /></>}
      {action === 'reviews' && <><AwardReview d={d} writer={writer} /><CheckReviewed d={d} week={week} writer={writer} kind="reviews" /></>}
      {action === 'hours' && <OpenHours d={d} week={week} writer={writer} />}
    </div>}
    <WeeklyTable d={d} week={week} writer={writer} select={setSelected} selected={selected} />
  </div>;
}
function CheckReviewed({ d, week, writer, kind }: { d: Ledger; week: string; writer: Writer; kind: 'reviews' | 'huddles' }) {
  const checked = !!d.checks?.find(c => c.week_key === week && c.check_key === kind)?.checked;
  return <label className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4 text-sm"><input type="checkbox" checked={checked} disabled={writer.busy} onChange={e => void writer.write('fts_set_weekly_check', { p_campaign_id: d.campaign.id, p_week_key: week, p_key: kind, p_checked: e.target.checked }, 'Weekly check updated.')} />{kind === 'reviews' ? 'I checked for posted Google reviews and entered any that qualify, including when there were none.' : 'I checked the huddle dates for this tally and recorded attendance for each huddle held.'}</label>;
}
function AwardReview({ d, writer }: { d: Ledger; writer: Writer }) {
  const [person, setPerson] = useState(''); const [when, setWhen] = useState(() => localDateTime(new Date(), d.campaign.timezone));
  const [verified, setVerified] = useState(false); const [error, setError] = useState('');
  const role = d.participants.find(p => p.employee_id === person)?.scoring_role ?? null; const rate = activityRate('google_review', d.campaign, role);
  return <Panel title="Posted Google review" subtitle="Check the posted review outside Purple Envelope. Do not enter reviewer names or review text."><form className="space-y-4" onSubmit={async e => { e.preventDefault(); setError(''); try { if (await writer.write('fts_award_review', { p_campaign_id: d.campaign.id, p_employee_id: person, p_occurred_at: officeTimestamp(when, d.campaign.timezone) }, 'Named review points awarded.', true)) setVerified(false); } catch (e) { setError(e instanceof Error ? e.message : 'Check the time.'); } }}>
    <TeamSelect d={d} value={person} set={setPerson} /><p className="text-sm">{rate == null ? 'Setup: confirm this employee’s scoring group before awarding review points.' : `${rate} points for a posted review naming this team member.`}</p><TimeField value={when} set={setWhen} campaign={d.campaign} />
    <label className="flex gap-3 text-sm"><input type="checkbox" checked={verified} required onChange={e => setVerified(e.target.checked)} /><span>I verified the posted review names this employee and it has not already been counted.</span></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button className={button} disabled={writer.busy || !person || rate == null}>Award verified review points</button>
  </form></Panel>;
}
