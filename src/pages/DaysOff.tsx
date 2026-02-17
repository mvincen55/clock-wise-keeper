import { useState } from 'react';
import { useDaysOff, useAddDayOff, useDeleteDayOff, DayOffRow } from '@/hooks/useDaysOff';
import { formatDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarDays, Plus, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const typeLabels: Record<string, string> = {
  pto: 'PTO',
  sick: 'Sick',
  holiday: 'Holiday',
  unpaid: 'Unpaid',
  other: 'Other',
};

const typeColors: Record<string, string> = {
  pto: 'bg-primary/20 text-primary',
  sick: 'bg-destructive/20 text-destructive',
  holiday: 'bg-success/20 text-success',
  unpaid: 'bg-muted text-muted-foreground',
  other: 'bg-accent/20 text-accent',
};

export default function DaysOff() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { data: daysOff, isLoading } = useDaysOff(year);
  const addDayOff = useAddDayOff();
  const deleteDayOff = useDeleteDayOff();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    date_start: '',
    date_end: '',
    type: 'pto' as 'pto' | 'sick' | 'holiday' | 'unpaid' | 'other',
    hours: '',
    notes: '',
  });

  const handleAdd = async () => {
    if (!form.date_start || !form.date_end) return;
    try {
      await addDayOff.mutateAsync({
        date_start: form.date_start,
        date_end: form.date_end,
        type: form.type,
        hours: form.hours ? parseFloat(form.hours) : undefined,
        notes: form.notes || undefined,
      });
      setOpen(false);
      setForm({ date_start: '', date_end: '', type: 'pto', hours: '', notes: '' });
      toast({ title: 'Day off added' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDayOff.mutateAsync(id);
      toast({ title: 'Day off removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Count by type
  const countByType = (daysOff || []).reduce((acc, d) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Days Off</h1>
          <p className="text-muted-foreground">Track PTO, sick days, and holidays</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Day Off
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Day Off</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Start Date</Label>
                  <Input type="date" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value, date_end: form.date_end || e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>End Date</Label>
                  <Input type="date" value={form.date_end} onChange={e => setForm({ ...form, date_end: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Hours (optional)</Label>
                <Input type="number" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="8" />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Vacation, doctor appointment, etc." />
              </div>
              <Button onClick={handleAdd} disabled={addDayOff.isPending} className="w-full">
                {addDayOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(typeLabels).map(([key, label]) => (
          <Card key={key} className="card-elevated">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{countByType[key] || 0}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Year selector */}
      <div className="flex gap-2 items-center">
        <Button variant="outline" size="sm" onClick={() => setYear(y => y - 1)}>← {year - 1}</Button>
        <span className="font-semibold">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</Button>
      </div>

      {/* List */}
      <Card className="card-elevated">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !daysOff?.length ? (
            <p className="text-center text-muted-foreground py-12">No days off recorded for {year}</p>
          ) : (
            <div className="divide-y">
              {daysOff.map(d => (
                <div key={d.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {formatDate(d.date_start)}
                        {d.date_start !== d.date_end && ` — ${formatDate(d.date_end)}`}
                      </p>
                      {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[d.type]}`}>
                      {typeLabels[d.type]}
                    </span>
                    {d.hours && <span className="text-xs text-muted-foreground">{d.hours}h</span>}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
