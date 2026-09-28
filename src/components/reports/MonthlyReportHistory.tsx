import { useMemo, useState } from 'react';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { reportMonthsFrom, type ReportImportRow, type ReportMonth } from '@/lib/report-history';

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const coverage = (row: ReportMonth) => row.coverage === 'full_calendar_month' ? 'Full month' : 'Partial month';
const difference = (current: number, previous: number) => {
  const delta = current - previous;
  return `${delta > 0 ? '+' : ''}${dollars(delta)}${previous === 0 ? '' : ` (${delta > 0 ? '+' : ''}${(100 * delta / Math.abs(previous)).toFixed(1)}%)`}`;
};

export function MonthlyReportHistory({ imports }: { imports: ReportImportRow[] }) {
  const months = useMemo(() => reportMonthsFrom(imports), [imports]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [selected, setSelected] = useState('');
  const [compared, setCompared] = useState('');
  if (!months.length) return null;
  const first = start || months[Math.max(0, months.length - 12)].month;
  const last = end || months[months.length - 1].month;
  const visible = months.filter(m => m.month >= first && m.month <= last);
  const current = months.find(m => m.month === selected) ?? [...months].reverse().find(m => m.coverage === 'full_calendar_month') ?? months[months.length - 1];
  const previousDate = new Date(`${current.month}-01T12:00:00Z`);
  previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);
  const previousMonth = compared || previousDate.toISOString().slice(0, 7);
  const previous = months.find(m => m.month === previousMonth);
  const options = [...months].reverse().map(m => <option key={m.month} value={m.month}>{monthLabel(m.month)} · {coverage(m)}</option>);

  return <Card>
    <CardHeader><CardTitle>Monthly production &amp; collections</CardTitle><p className="text-sm text-muted-foreground">{monthLabel(months[0].month)} through {monthLabel(months[months.length - 1].month)} · {months.length} recorded months. Each month uses one selected source; monthly totals are separate from daily detail.</p></CardHeader>
    <CardContent className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">From month<Input type="month" aria-label="History from month" value={first} onChange={e=>setStart(e.target.value)} /></label>
        <label className="space-y-1 text-sm">Through month<Input type="month" aria-label="History through month" value={last} onChange={e=>setEnd(e.target.value)} /></label>
        <Button variant="outline" onClick={()=>{setStart(months[0].month);setEnd(months[months.length-1].month);}}>Show all history</Button>
      </div>
      {first > last ? <p role="alert">Choose an end month on or after the start month.</p> : !visible.length ? <p>No monthly totals recorded in this range.</p> : <>
        <div className="h-72 w-full" aria-label="Monthly production and collections trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={visible} margin={{top:10,right:20,left:5,bottom:5}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthLabel} minTickGap={35} />
              <YAxis tickFormatter={v=>`$${(Number(v)/100000).toFixed(0)}k`} width={65} />
              <Tooltip labelFormatter={v=>monthLabel(String(v))} formatter={v=>dollars(Number(v))} />
              <Legend />
              <Line type="linear" dataKey="production_cents" name="Production" stroke="hsl(var(--primary))" strokeWidth={2} dot={{r:3}} />
              <Line type="linear" dataKey="collections_cents" name="Collections" stroke="#168477" strokeWidth={2} strokeDasharray="5 3" dot={{r:3}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground">Partial months show only the recorded portion. Source labels and definitions are listed below.</p>
      </>}
      <section className="space-y-3" aria-label="Compare two months">
        <h2 className="text-lg font-semibold">Compare months</h2>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1 text-sm">Month<select aria-label="Comparison month" className="block rounded-md border bg-background p-2" value={current.month} onChange={e=>{setSelected(e.target.value);setCompared('');}}>{options}</select></label>
          <label className="space-y-1 text-sm">Compare with<select aria-label="Compare with month" className="block rounded-md border bg-background p-2" value={previousMonth} onChange={e=>setCompared(e.target.value)}>{!previous&&<option value={previousMonth}>{monthLabel(previousMonth)} · Not recorded</option>}{options}</select></label>
        </div>
        {previous ? <>
          <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Monthly comparison</caption><thead><tr><th className="p-2 text-left">Measure</th><th className="p-2 text-right">{monthLabel(current.month)}</th><th className="p-2 text-right">{monthLabel(previous.month)}</th><th className="p-2 text-right">Change</th></tr></thead><tbody>
            {(['production_cents','collections_cents'] as const).map(key=><tr key={key} className="border-t"><th className="p-2 text-left font-medium">{key==='production_cents'?'Production':'Collections'}</th><td className="p-2 text-right tabular-nums">{dollars(current[key])}</td><td className="p-2 text-right tabular-nums">{dollars(previous[key])}</td><td className="p-2 text-right tabular-nums">{difference(current[key],previous[key])}</td></tr>)}
          </tbody></table></div>
          {(current.coverage !== 'full_calendar_month' || previous.coverage !== 'full_calendar_month') && <p className="text-sm text-muted-foreground">This comparison includes a partial month. The change uses reported totals without projecting missing days.</p>}
          <p className="text-xs text-muted-foreground">{monthLabel(current.month)}: {current.source_label} ({coverage(current)}). {monthLabel(previous.month)}: {previous.source_label} ({coverage(previous)}). Production and collection definitions can differ between source reports.</p>
        </> : <p className="text-sm text-muted-foreground">No total is recorded for the previous month. Choose another month to compare.</p>}
      </section>
      <div className="max-h-[32rem] overflow-auto rounded-md border"><table className="w-full text-sm"><caption className="sr-only">Monthly history with source definitions</caption><thead className="sticky top-0 bg-muted"><tr>{['Month','Production','Collections','Coverage','Source'].map(h=><th key={h} className="p-3 text-left">{h}</th>)}</tr></thead><tbody>{[...visible].reverse().map(m=><tr key={m.month} className="border-t"><th className="whitespace-nowrap p-3 text-left font-medium">{monthLabel(m.month)}</th><td className="p-3 tabular-nums">{dollars(m.production_cents)}</td><td className="p-3 tabular-nums">{dollars(m.collections_cents)}</td><td className="whitespace-nowrap p-3">{coverage(m)}{m.source_kind==='monthly_sheet'&&<div className="text-xs text-muted-foreground">Monthly total only</div>}</td><td className="min-w-60 p-3"><div>{m.source_label}</div><details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Source details</summary><p>{m.source_reference}</p><p>Production: {m.production_basis}</p><p>Collections: {m.collections_basis}</p></details></td></tr>)}</tbody></table></div>
    </CardContent>
  </Card>;
}
