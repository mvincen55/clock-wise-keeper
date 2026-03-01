import { useState } from 'react';
import { useOfficeClosures, useGenerateClosures, useAddClosure, useDeleteClosure } from '@/hooks/useOfficeClosures';
import { usePayrollSettings, useUpsertPayrollSettings } from '@/hooks/usePayrollSettings';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Shield, Timer, CalendarDays, Plus, Trash2, DollarSign, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import ScheduleManager from '@/components/ScheduleManager';
import WipeDataTool from '@/components/WipeDataTool';

import BulkRepairTool from '@/components/BulkRepairTool';

const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export default function Settings() {
  const { toast } = useToast();
  const { sessionTimeoutMinutes, setSessionTimeoutMinutes } = useAuth();

  // Closures
  const currentYear = new Date().getFullYear();
  const [closureYear, setClosureYear] = useState(currentYear);
  const { data: closures, isLoading: closuresLoading } = useOfficeClosures(closureYear);
  const generateClosures = useGenerateClosures();
  const addClosure = useAddClosure();
  const deleteClosure = useDeleteClosure();
  const [addClosureOpen, setAddClosureOpen] = useState(false);
  const [newClosure, setNewClosure] = useState({ date: '', name: '' });

  // Payroll settings
  const { data: payrollSettings } = usePayrollSettings();
  const upsertPayroll = useUpsertPayrollSettings();

  const handleGenerate = async () => {
    try {
      await generateClosures.mutateAsync(closureYear);
      toast({ title: `Generated closures for ${closureYear}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleAddClosure = async () => {
    if (!newClosure.date || !newClosure.name) return;
    try {
      await addClosure.mutateAsync({ closure_date: newClosure.date, name: newClosure.name });
      setAddClosureOpen(false);
      setNewClosure({ date: '', name: '' });
      toast({ title: 'Closure added' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your work schedule, closures, and payroll</p>
      </div>

      {/* Payroll Settings */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payroll Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Pay Period</Label>
              <Select
                value={payrollSettings?.pay_period_type || 'weekly'}
                onValueChange={v => upsertPayroll.mutate({ pay_period_type: v })}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Week Starts</Label>
              <Select
                value={String(payrollSettings?.week_start_day ?? 1)}
                onValueChange={v => upsertPayroll.mutate({ week_start_day: parseInt(v) })}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Missing Shift Buffer (min)</Label>
              <Input
                type="number"
                min={0}
                value={payrollSettings?.missing_shift_buffer_minutes ?? 60}
                onChange={e => upsertPayroll.mutate({ missing_shift_buffer_minutes: parseInt(e.target.value) || 60 })}
                className="w-24 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Timezone</Label>
              <p className="text-sm font-medium px-3 py-2 rounded-md border bg-muted">Eastern (ET)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Schedule (Versioned) */}
      <div id="work-schedule">
        <ScheduleManager />
      </div>

      {/* Office Closures */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Office Closures
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setClosureYear(y => y - 1)}>←</Button>
              <span className="font-semibold text-sm">{closureYear}</span>
              <Button variant="outline" size="sm" onClick={() => setClosureYear(y => y + 1)}>→</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={generateClosures.isPending} variant="secondary">
              {generateClosures.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Generate for {closureYear}
            </Button>
            <Dialog open={addClosureOpen} onOpenChange={setAddClosureOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Custom
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Custom Closure</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Date</Label>
                    <Input type="date" value={newClosure.date} onChange={e => setNewClosure({ ...newClosure, date: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={newClosure.name} onChange={e => setNewClosure({ ...newClosure, name: e.target.value })} placeholder="Office event, snow day..." />
                  </div>
                  <Button onClick={handleAddClosure} disabled={addClosure.isPending} className="w-full">Save</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {closuresLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !closures?.length ? (
            <p className="text-center text-muted-foreground py-8">No closures for {closureYear}. Click "Generate" to add standard holidays.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {closures.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Closed</span>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.closure_date)}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteClosure.mutate(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security & Privacy */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security &amp; Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <Timer className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <Label className="text-sm font-medium">Auto-Logout Timeout</Label>
              <p className="text-xs text-muted-foreground">Minutes of inactivity before automatic sign out (0 = disabled)</p>
            </div>
            <Input
              type="number"
              min={0}
              max={480}
              value={sessionTimeoutMinutes}
              onChange={e => setSessionTimeoutMinutes(parseInt(e.target.value) || 0)}
              className="w-24 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk Auto-Repair Tool */}
      <BulkRepairTool />


      {/* Wipe Data Tool */}
      <WipeDataTool />
    </div>
  );
}
