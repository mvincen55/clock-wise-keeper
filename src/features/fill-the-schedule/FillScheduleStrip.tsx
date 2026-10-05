import { Link } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { useFillSchedule } from '@/hooks/useFillSchedule';
import { score, weekKey } from '@/lib/fill-the-schedule';

export default function FillScheduleStrip() {
  const { data: d, ctx, manager } = useFillSchedule(); if (!d) return null;
  const week = weekKey(new Date(), d.campaign); const own = d.participants.find(p => p.employee_id === ctx?.employee_id);
  const s = own ? score(d, own, week) : null; const hours = d.metrics.find(m => m.week_key === week)?.doctor_open_hours;
  const flags = (d.sheetRows ?? []).filter(r => r.handoff_state === 'flagged' || r.prepay_state === 'flagged');
  const pending = d.activities.filter(a => a.status === 'pending' && !flags.some(r => r.handoff_activity_id === a.id || r.prepay_activity_id === a.id)).length;
  return <section aria-label="Fill the Schedule campaign" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
    <div className="flex min-w-0 items-start gap-3"><CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Fill the Schedule</h2><p className="mt-1 text-sm text-muted-foreground">{manager ? `${pending + flags.length} to review · Doctor open time: ${hours == null ? 'not recorded' : `${hours} hours`}` : `${s?.points ?? 0} approved · ${s?.pending ?? 0} awaiting verification`}</p><p className="mt-1 text-xs text-muted-foreground">{week === d.campaign.ends_on ? 'Final tally closes after December 31' : `Tally closes ${new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, Friday noon Eastern`}</p></div></div>
    <div className="flex flex-wrap gap-2">{(manager ? [['Review', 'review'], ['Weekly scorecard', 'scorecard']] : [['Record', 'record'], ['My points', 'points']]).map(([label, hash], i) => <Link key={hash} to={`/fill-the-schedule#${hash}`} className={`inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'border bg-background'}`}>{label}</Link>)}</div>
  </section>;
}
