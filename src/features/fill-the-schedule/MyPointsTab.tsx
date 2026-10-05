import { useState } from 'react';
import { labels, localDateTime, pendingPoints, score, tallyClosed } from '@/lib/fill-the-schedule';
import type { Activity, Ledger } from '@/lib/fill-the-schedule';
import { Panel, Status, secondary, type Writer } from './ui';

export function sourceLabel(a: Activity) {
  if (a.sheet_code) return `${a.source === 'web' ? 'App + front-desk sheet' : 'Front-desk sheet'} ${a.sheet_code}, row ${a.sheet_row}`;
  return a.source === 'manager' ? 'Recorded by manager' : 'Sent from the app';
}
export default function MyPointsTab({ d, employeeId, week, writer }: { d: Ledger; employeeId: string; week: string; writer: Writer }) {
  const [allWeeks, setAllWeeks] = useState(false);
  const p = d.participants.find(p => p.employee_id === employeeId);
  const s = p ? score(d, p, week) : null; const awaiting = pendingPoints(d, employeeId, week);
  const own = d.activities.filter(a => a.employee_id === employeeId);
  const visible = own.filter(a => allWeeks || a.tally_week === week).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const approved = visible.filter(a => a.status === 'approved'); const pending = visible.filter(a => a.status === 'pending');
  const others = visible.filter(a => !['approved', 'pending'].includes(a.status));
  const hours = d.metrics.find(m => m.week_key === week)?.doctor_open_hours;
  function list(rows: Activity[]) {
    const parents = rows.filter(a => !a.parent_id || !rows.some(b => b.id === a.parent_id));
    const row = (a: Activity, bonus = false) => <li key={a.id} className={`py-4 ${bonus ? 'ml-4 border-l-2 border-primary/20 pl-4' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{labels[a.activity_type]}{a.quantity > 1 ? ` × ${a.quantity}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{localDateTime(a.occurred_at, d.campaign.timezone).replace('T', ' ')} Eastern · Tally {a.tally_week}</p><p className="mt-1 text-xs text-muted-foreground">{sourceLabel(a)} · {a.entry_code}</p><div className="mt-2"><Status row={a} /></div></div>
        {(a.status === 'pending' || (a.status === 'approved' && a.activity_type === 'qr_card')) && <button className={secondary} disabled={writer.busy} onClick={() => void writer.write('fts_withdraw_own', { p_activity_id: a.id, p_reason: 'recorded_in_error' }, 'Entry withdrawn. Your totals have been updated.')}>Withdraw entry</button>}
      </div>
    </li>;
    return rows.length ? <ul className="divide-y">{parents.map(a => <li key={a.id}><ul>{row(a)}{rows.filter(b => b.parent_id === a.id).map(b => row(b, true))}</ul></li>)}</ul> : <p className="text-sm text-muted-foreground">No entries in this view.</p>;
  }
  const next = (s?.points ?? 0) < d.campaign.prize_tier1_points ? d.campaign.prize_tier1_points : d.campaign.prize_tier2_points;
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">{[
      ['Approved points', s?.points ?? 0, 'This tally. These points count.'],
      ['Reports awaiting verification', s?.pending ?? 0, `${awaiting.points} ${awaiting.points === 1 ? "point" : "points"} if approved${awaiting.unset ? `; ${awaiting.unset} report(s) have a rate not set` : ''}.`],
      ['Quarter total', s?.quarter ?? 0, 'Approved points only.'],
    ].map(([title, value, help]) => <div key={title} className="rounded-2xl border bg-card p-5"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p><p className="mt-2 text-xs text-muted-foreground">{help}</p></div>)}</div>
    <div className="grid gap-5 sm:grid-cols-2"><Panel title={`Your prize picks${tallyClosed(week, d.campaign) ? '' : ' · provisional'}`}>
      <p className="text-3xl font-semibold">{s?.earned ?? 0} <span className="text-base font-normal">earned</span></p><p className="mt-2 text-sm">{s?.received ?? 0} received · {s?.remaining ?? 0} remaining</p>
      {!p?.scoring_role ? <p className="mt-3 text-sm text-red-700 dark:text-red-300">Your manager must confirm your scoring group before review points or prize picks can be awarded.</p> : p.scoring_role === 'clerical' && !s?.eligible ? <p className="mt-3 text-sm">{s?.callCount ?? 0}/{d.campaign.clerical_min_calls} verified calls. The call minimum is required for prize picks.</p> : null}
      <progress className="mt-4 h-2 w-full accent-primary" value={Math.min(s?.points ?? 0, next)} max={next} aria-label={`Progress to ${next} points`} /><p className="mt-1 text-xs text-muted-foreground">{d.campaign.prize_tier1_points} points: one item from the prize bin. {d.campaign.prize_tier2_points}: two. Maximum two weekly.</p>
      {!!s?.overage && <p className="mt-3 text-sm text-destructive">Correction: {s.overage} extra pick(s) already received. Your manager will review this.</p>}
    </Panel><Panel title="Our office goal"><p className="text-3xl font-semibold">{hours == null ? 'Not recorded' : `${hours} hours`}</p><p className="mt-2 text-sm text-muted-foreground">Doctor open time this tally. Goal: under {d.campaign.open_hours_goal} hours a week.</p></Panel></div>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allWeeks} onChange={e => setAllWeeks(e.target.checked)} />Show the whole quarter</label>
    <Panel title="Approved">{list(approved)}<p className="mt-4 text-xs text-muted-foreground">Totals also include manager-verified calls and huddles: {s?.callCount ?? 0} calls and {s?.huddleCount ?? 0} on-time huddles this tally.</p></Panel>
    <Panel title="Awaiting verification" subtitle="These reports earn no points until your manager checks them.">{list(pending)}</Panel>
    {!!others.length && <details className="rounded-xl border p-4"><summary className="min-h-8 cursor-pointer text-sm font-medium">Corrections and rejected reports</summary>{list(others)}</details>}
  </div>;
}
