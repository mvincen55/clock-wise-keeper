import { useState } from 'react';
import { useTimeEntries, TimeEntryRow } from '@/hooks/useTimeEntries';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

function EntryRow({ entry }: { entry: TimeEntryRow }) {
  const [expanded, setExpanded] = useState(false);
  const punches = entry.punches || [];
  const firstIn = punches.find(p => p.punch_type === 'in');
  const lastOut = [...punches].reverse().find(p => p.punch_type === 'out');

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </td>
        <td className="px-4 py-3 font-medium">{formatDate(entry.entry_date)}</td>
        <td className="px-4 py-3 time-display text-sm">{firstIn ? formatTime(firstIn.punch_time) : '—'}</td>
        <td className="px-4 py-3 time-display text-sm">{lastOut ? formatTime(lastOut.punch_time) : '—'}</td>
        <td className="px-4 py-3 time-display text-sm font-semibold">
          {entry.total_minutes != null ? minutesToHHMM(entry.total_minutes) : '—'}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded ${entry.source === 'import' ? 'bg-accent/20 text-accent' : 'bg-muted text-muted-foreground'}`}>
            {entry.source}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/30 px-8 py-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Punch Details</p>
              {punches.length === 0 && <p className="text-sm text-muted-foreground">No punches recorded</p>}
              {punches.map(p => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className={`text-xs font-semibold uppercase w-8 ${p.punch_type === 'in' ? 'text-success' : 'text-destructive'}`}>
                    {p.punch_type}
                  </span>
                  <span className="time-display">{formatTime(p.punch_time)}</span>
                </div>
              ))}
              {entry.notes && (
                <p className="text-sm text-muted-foreground mt-2 italic">{entry.notes}</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Timesheet() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { data: entries, isLoading } = useTimeEntries(startDate || undefined, endDate || undefined);

  const totalMinutes = entries?.reduce((sum, e) => sum + (e.total_minutes || 0), 0) || 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Timesheet</h1>
        <p className="text-muted-foreground">View and manage your time entries</p>
      </div>

      {/* Filters */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-end">
              <div className="px-3 py-2 bg-primary/10 rounded-lg">
                <span className="text-xs text-muted-foreground">Total: </span>
                <span className="time-display font-semibold text-primary">{minutesToHHMM(totalMinutes)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">First In</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Out</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : !entries?.length ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">No entries found</td>
                </tr>
              ) : (
                entries.map(entry => <EntryRow key={entry.id} entry={entry} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
