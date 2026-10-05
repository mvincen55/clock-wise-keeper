import { useEffect, useState } from 'react';
import { activityRate, campaignWeeks, labels, localDateTime, officeTimestamp, roles, score, tallyClosed } from '@/lib/fill-the-schedule';
import type { ActivityType, Campaign, Ledger } from '@/lib/fill-the-schedule';
import { Panel, Field, TimeField, TeamSelect, input, button, secondary, nameOf, type Writer } from './ui';
export function VerifiedCalls({ d, week, selected, writer }: { d: Ledger; week: string; selected: string; writer: Writer }) {
  const existing = d.calls.find(c => c.employee_id === selected && c.week_key === week);
  const [count, setCount] = useState(existing?.verified_count?.toString() ?? '');
  useEffect(() => setCount(existing?.verified_count?.toString() ?? ''), [week, selected, existing?.verified_count]);
  return <Panel title="Documented unscheduled treatment calls" subtitle="Check same-day MaxAssist notes and phone codes. No note, no call point. Save the total for this tally week; an edit replaces the total.">
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void writer.write('fts_set_weekly_calls', { p_campaign_id: d.campaign.id, p_employee_id: selected, p_week_key: week, p_count: Number(count) }, 'Verified weekly call total saved.'); }}><p className="text-sm font-medium">{nameOf(d, selected)} · Tally {week}</p><Field title="Verified call total"><input className={input} type="number" min="0" max="500" step="1" value={count} onChange={e => setCount(e.target.value)} required /></Field><p className="text-sm text-muted-foreground">{d.campaign.pts_call} point per call. Clerical staff need {d.campaign.clerical_min_calls} verified calls to enter that week’s prize drawing.</p><button className={button} disabled={!selected || writer.busy}>Save verified call total</button></form>
  </Panel>;
}

export function Huddles({ d, writer }: { d: Ledger; writer: Writer }) {
  const today = localDateTime(new Date(), d.campaign.timezone).slice(0, 10);
  const [date, setDate] = useState(today); const [checked, setChecked] = useState<string[]>([]); const [dirty, setDirty] = useState(false);
  const existing = d.huddles.filter(h => h.huddle_date === date && h.on_time).map(h => h.employee_id).sort().join(',');
  useEffect(() => { if (!dirty) setChecked(existing ? existing.split(',') : []); }, [date, existing, dirty]);
  return <Panel title="On time for huddle" subtitle="You mark attendance here. Team members do not track it, and time-clock punches are not used to infer it.">
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await writer.write('fts_save_huddle', { p_campaign_id: d.campaign.id, p_date: date, p_on_time: checked }, 'Huddle attendance saved. Re-saving this date corrects it without adding duplicate points.')) setDirty(false); }}>
      <Field title="Huddle date · Eastern time"><input className={input} type="date" required min={d.campaign.starts_on} max={today < d.campaign.ends_on ? today : d.campaign.ends_on} value={date} onChange={e => { setDate(e.target.value); setDirty(false); }} /></Field>
      <p className="text-sm text-muted-foreground">Check everyone who was on time. Each earns {d.campaign.pts_huddle} point for this date. Unchecked people receive no point.</p>
      <div className="grid gap-2 sm:grid-cols-2">{d.participants.filter(p => p.active && d.names.some(n => n.id === p.employee_id && n.employment_status === 'active')).map(p => <label key={p.id} className="flex min-h-11 items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={checked.includes(p.employee_id)} onChange={e => { setDirty(true); setChecked(ids => e.target.checked ? [...ids, p.employee_id] : ids.filter(id => id !== p.employee_id)); }} />{nameOf(d, p.employee_id)}</label>)}</div>
      <button className={button} disabled={writer.busy}>Save huddle attendance</button>
    </form>
  </Panel>;
}

export function OpenHours({ d, week, writer }: { d: Ledger; week: string; writer: Writer }) {
  const saved = d.metrics.find(m => m.week_key === week)?.doctor_open_hours;
  const [hours, setHours] = useState(saved == null ? '' : String(saved));
  useEffect(() => setHours(saved == null ? '' : String(saved)), [week, saved]);
  return <Panel title="Office goal: fill doctor open time" subtitle={`Record actual open hours for this tally week. Goal: under ${d.campaign.open_hours_goal} hours. A blank value means not recorded, never zero.`}>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void writer.write('fts_set_open_hours', { p_campaign_id: d.campaign.id, p_week_key: week, p_hours: hours === '' ? null : Number(hours) }, 'Office open hours saved.'); }}><div className="flex-1"><Field title="Doctor open hours"><input className={input} type="number" min="0" max="200" step="0.01" value={hours} placeholder="Not recorded" onChange={e => setHours(e.target.value)} /></Field></div><button className={button} disabled={writer.busy}>Save open hours</button></form>
  </Panel>;
}
