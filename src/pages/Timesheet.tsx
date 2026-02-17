import { useState } from 'react';
import { useTimeEntries, useUpdateEntry, TimeEntryRow } from '@/hooks/useTimeEntries';
import { minutesToHHMM, formatTime, formatDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Table2, ChevronDown, ChevronRight, Loader2, MapPin, Save } from 'lucide-react';
import { EditAuditDialog } from '@/components/EditAuditDialog';
import { useToast } from '@/hooks/use-toast';

function EntryRow({ entry }: { entry: TimeEntryRow }) {
  const [expanded, setExpanded] = useState(false);
  const updateEntry = useUpdateEntry();
  const { toast } = useToast();
  const [comment, setComment] = useState(entry.entry_comment || '');
  const [commentDirty, setCommentDirty] = useState(false);
  const [auditDialog, setAuditDialog] = useState<{
    field: string; old: string; new: string; pendingUpdate: any;
  } | null>(null);

  const punches = entry.punches || [];
  const firstIn = punches.find(p => p.punch_type === 'in');
  const lastOut = [...punches].reverse().find(p => p.punch_type === 'out');

  const handleRemoteToggle = () => {
    setAuditDialog({
      field: 'is_remote',
      old: entry.is_remote ? 'Remote' : 'On-site',
      new: entry.is_remote ? 'On-site' : 'Remote',
      pendingUpdate: { is_remote: !entry.is_remote },
    });
  };

  const handleAuditConfirm = async (reason: string) => {
    if (!auditDialog) return;
    try {
      await updateEntry.mutateAsync({
        entryId: entry.id,
        updates: auditDialog.pendingUpdate,
        audit: {
          field_changed: auditDialog.field,
          old_value: auditDialog.old,
          new_value: auditDialog.new,
          reason_comment: reason,
        },
      });
      toast({ title: 'Updated with audit' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setAuditDialog(null);
  };

  const handleSaveComment = async () => {
    try {
      await updateEntry.mutateAsync({
        entryId: entry.id,
        updates: { entry_comment: comment || null },
      });
      setCommentDirty(false);
      toast({ title: 'Comment saved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

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
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded ${
              entry.source === 'import' ? 'bg-accent/20 text-accent' :
              entry.source === 'auto_location' ? 'bg-success/20 text-success' :
              'bg-muted text-muted-foreground'
            }`}>
              {entry.source === 'auto_location' ? 'GPS' : entry.source}
            </span>
            {entry.is_remote && (
              <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Remote
              </span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/30 px-8 py-3">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Punch Details</p>
              {punches.length === 0 && <p className="text-sm text-muted-foreground">No punches recorded</p>}
              {punches.map(p => (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className={`text-xs font-semibold uppercase w-8 ${p.punch_type === 'in' ? 'text-success' : 'text-destructive'}`}>
                    {p.punch_type}
                  </span>
                  <span className="time-display">{formatTime(p.punch_time)}</span>
                  {p.source !== 'manual' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-accent/20 text-accent">
                      {p.source === 'auto_location' ? 'GPS' : p.source}
                    </span>
                  )}
                  {p.low_confidence && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning">low GPS</span>
                  )}
                </div>
              ))}

              {/* Remote toggle */}
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Label className="text-xs">Remote</Label>
                <Switch
                  checked={entry.is_remote}
                  onCheckedChange={handleRemoteToggle}
                />
              </div>

              {/* Daily comment */}
              <div className="space-y-1 pt-2 border-t border-border">
                <Label className="text-xs">Daily Comment</Label>
                <div className="flex gap-2">
                  <Textarea
                    value={comment}
                    onChange={e => { setComment(e.target.value); setCommentDirty(true); }}
                    rows={2}
                    placeholder="Optional comment for this day..."
                    className="text-sm"
                  />
                  {commentDirty && (
                    <Button size="sm" onClick={handleSaveComment} className="self-end">
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {entry.notes && (
                <p className="text-sm text-muted-foreground mt-2 italic">{entry.notes}</p>
              )}
            </div>
          </td>
        </tr>
      )}

      {auditDialog && (
        <EditAuditDialog
          open
          onClose={() => setAuditDialog(null)}
          onConfirm={handleAuditConfirm}
          fieldChanged={auditDialog.field}
          oldValue={auditDialog.old}
          newValue={auditDialog.new}
        />
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source / Status</th>
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
