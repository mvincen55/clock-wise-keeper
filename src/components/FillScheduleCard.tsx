import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { useFillSchedule } from '@/hooks/useFillSchedule';
import { score, weekKey } from '@/lib/fill-the-schedule';

export default function FillScheduleCard() {
  const { data, ctx, manager } = useFillSchedule();
  if (!data) return null;
  const week = weekKey(new Date(), data.campaign);
  const own = data.participants.find(p => p.employee_id === ctx?.employee_id);
  const s = own ? score(data, own, week) : null;
  const hours = data.metrics.find(m => m.week_key === week)?.doctor_open_hours;
  const pending = data.activities.filter(a => a.status === 'pending').length;
  return <Link to="/fill-the-schedule" className="block rounded-2xl border border-primary/20 bg-primary/5 p-5 transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
    <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><CalendarCheck className="h-6 w-6 text-primary" /><div><h2 className="font-semibold">Q4 · Fill the Schedule</h2><p className="text-sm text-muted-foreground">{manager ? `${pending} reports awaiting your verification` : `${s?.points ?? 0} approved points · ${s?.pending ?? 0} pending reports`}</p></div></div><ArrowRight className="h-5 w-5 shrink-0" /></div>
    <p className="mt-3 text-sm">Doctor open time: {hours == null ? 'Not recorded' : `${hours} hours`} · Goal: under {data.campaign.open_hours_goal} hours/week</p>
  </Link>;
}
