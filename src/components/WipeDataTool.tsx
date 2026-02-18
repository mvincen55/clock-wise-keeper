import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle, Download, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function WipeDataTool() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmNoUndo, setConfirmNoUndo] = useState(false);
  const [typeConfirm, setTypeConfirm] = useState('');
  const [backupDone, setBackupDone] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeSummary, setWipeSummary] = useState<{ punches: number; entries: number; tardies: number; exceptions: number; daysOff: number; audits: number } | null>(null);

  const canWipe = startDate && endDate && confirmDelete && confirmNoUndo && typeConfirm === 'DELETE' && backupDone && !wiping;

  const handleExportBackup = async () => {
    if (!user || !startDate || !endDate) return;
    setExporting(true);
    try {
      // Fetch all data in range
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);

      const entryIds = (entries || []).map(e => e.id);

      const { data: punches } = entryIds.length
        ? await supabase.from('punches').select('*').in('time_entry_id', entryIds)
        : { data: [] };

      const { data: audits } = entryIds.length
        ? await supabase.from('audit_events').select('*').in('related_entry_id', entryIds)
        : { data: [] };

      const { data: tardies } = await supabase
        .from('tardies')
        .select('*')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);

      const { data: exceptions } = await supabase
        .from('attendance_exceptions')
        .select('*')
        .gte('exception_date', startDate)
        .lte('exception_date', endDate);

      const { data: daysOff } = await supabase
        .from('days_off')
        .select('*')
        .gte('date_start', startDate)
        .lte('date_start', endDate);

      const backup = {
        exported_at: new Date().toISOString(),
        range: { start: startDate, end: endDate },
        time_entries: entries || [],
        punches: punches || [],
        audit_events: audits || [],
        tardies: tardies || [],
        attendance_exceptions: exceptions || [],
        days_off: daysOff || [],
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timevault-backup-${startDate}-to-${endDate}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setBackupDone(true);
      toast({ title: 'Backup exported successfully' });
    } catch (err: any) {
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleWipe = async () => {
    if (!user || !canWipe) return;
    setWiping(true);
    try {
      // 1. Get entry IDs
      const { data: entries } = await supabase
        .from('time_entries')
        .select('id')
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);

      const entryIds = (entries || []).map(e => e.id);
      let punchCount = 0;

      // 2. Delete punches for those entries
      if (entryIds.length > 0) {
        const { data: deletedPunches } = await supabase
          .from('punches')
          .delete()
          .in('time_entry_id', entryIds)
          .select('id');
        punchCount = deletedPunches?.length || 0;

        // 3. Delete audit events linked to entries
        const { data: deletedAudits } = await supabase
          .from('audit_events')
          .delete()
          .in('related_entry_id', entryIds)
          .select('id');

        // 4. Delete time entries
        await supabase
          .from('time_entries')
          .delete()
          .gte('entry_date', startDate)
          .lte('entry_date', endDate);
      }

      // 5. Delete tardies in range
      const { data: deletedTardies } = await supabase
        .from('tardies')
        .delete()
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .select('id');

      // 6. Delete exceptions in range
      const { data: deletedExceptions } = await supabase
        .from('attendance_exceptions')
        .delete()
        .gte('exception_date', startDate)
        .lte('exception_date', endDate)
        .select('id');

      // 7. Delete days off in range
      const { data: deletedDaysOff } = await supabase
        .from('days_off')
        .delete()
        .gte('date_start', startDate)
        .lte('date_start', endDate)
        .select('id');

      setWipeSummary({
        punches: punchCount,
        entries: entryIds.length,
        tardies: deletedTardies?.length || 0,
        exceptions: deletedExceptions?.length || 0,
        daysOff: deletedDaysOff?.length || 0,
        audits: 0,
      });

      // Invalidate all queries
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['time-entry'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['attendance-exceptions'] });

      toast({ title: 'Data wiped successfully' });
    } catch (err: any) {
      toast({ title: 'Wipe failed', description: err.message, variant: 'destructive' });
    } finally {
      setWiping(false);
    }
  };

  const resetForm = () => {
    setStartDate('');
    setEndDate('');
    setConfirmDelete(false);
    setConfirmNoUndo(false);
    setTypeConfirm('');
    setBackupDone(false);
    setWipeSummary(null);
  };

  if (wipeSummary) {
    return (
      <Card className="border-destructive/30">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <CheckCircle className="h-5 w-5" />
            Wipe Complete
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Time entries deleted:</span>
            <span className="font-semibold">{wipeSummary.entries}</span>
            <span className="text-muted-foreground">Punches deleted:</span>
            <span className="font-semibold">{wipeSummary.punches}</span>
            <span className="text-muted-foreground">Tardies deleted:</span>
            <span className="font-semibold">{wipeSummary.tardies}</span>
            <span className="text-muted-foreground">Exceptions deleted:</span>
            <span className="font-semibold">{wipeSummary.exceptions}</span>
            <span className="text-muted-foreground">Days off deleted:</span>
            <span className="font-semibold">{wipeSummary.daysOff}</span>
          </div>
          <Button variant="outline" onClick={resetForm} className="w-full">Done</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Trash2 className="h-5 w-5" />
          Wipe Data by Date Range
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> DANGEROUS OPERATION
          </p>
          <p>This permanently deletes all time tracking data in the selected range. Export a backup first.</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setBackupDone(false); }} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setBackupDone(false); }} className="w-44" />
          </div>
        </div>

        {startDate && endDate && endDate < startDate && (
          <p className="text-xs text-destructive">End date must be after start date.</p>
        )}

        {/* Step 1: Export backup */}
        <div className="space-y-2">
          <Button
            variant="outline"
            onClick={handleExportBackup}
            disabled={!startDate || !endDate || endDate < startDate || exporting}
            className="w-full"
          >
            {exporting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...</>
            ) : backupDone ? (
              <><CheckCircle className="mr-2 h-4 w-4 text-success" /> Backup Exported</>
            ) : (
              <><Download className="mr-2 h-4 w-4" /> Export Backup (Required)</>
            )}
          </Button>
        </div>

        {/* Step 2: Confirmations */}
        {backupDone && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="confirm-delete"
                checked={confirmDelete}
                onCheckedChange={v => setConfirmDelete(v === true)}
              />
              <label htmlFor="confirm-delete" className="text-xs leading-tight cursor-pointer">
                This will delete ALL punches, time entries, tardies, missing shift exceptions, and related attendance events in this range.
              </label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="confirm-noundo"
                checked={confirmNoUndo}
                onCheckedChange={v => setConfirmNoUndo(v === true)}
              />
              <label htmlFor="confirm-noundo" className="text-xs leading-tight cursor-pointer">
                This cannot be undone unless I export a backup first.
              </label>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type <span className="font-mono font-bold">DELETE</span> to confirm</Label>
              <Input
                value={typeConfirm}
                onChange={e => setTypeConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-40 font-mono text-sm"
              />
            </div>
            <Button
              variant="destructive"
              onClick={handleWipe}
              disabled={!canWipe}
              className="w-full"
            >
              {wiping ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wiping...</>
              ) : (
                <><Trash2 className="mr-2 h-4 w-4" /> Confirm Wipe</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
