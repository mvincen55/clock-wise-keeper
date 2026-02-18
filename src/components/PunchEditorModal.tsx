import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus, ArrowDownUp, Zap, AlertTriangle, Pencil, MapPin, RefreshCw } from 'lucide-react';
import { PunchRow } from '@/hooks/useTimeEntries';
import { EditablePunch, useSavePunchEdits } from '@/hooks/usePunchEditor';
import { useWorkSchedule, getScheduleForWeekday } from '@/hooks/useWorkSchedule';
import { useToast } from '@/hooks/use-toast';
import { formatTime } from '@/lib/time-utils';

type Props = {
  open: boolean;
  onClose: () => void;
  entryId: string;
  entryDate: string;
  punches: PunchRow[];
};

function punchToEditable(p: PunchRow): EditablePunch {
  return {
    id: p.id,
    punch_type: p.punch_type,
    punch_time: p.punch_time,
    original_punch_time: p.punch_time,
    is_deleted: false,
    is_new: false,
    is_edited: false,
    source: p.source,
    location_lat: p.location_lat,
    location_lng: p.location_lng,
  };
}

function toLocalTimeInput(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function fromLocalTimeInput(dateStr: string, timeStr: string): string {
  const base = new Date(dateStr + 'T00:00:00');
  const [h, m] = timeStr.split(':').map(Number);
  base.setHours(h, m, 0, 0);
  return base.toISOString();
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_location: 'GPS',
  import: 'Import',
  system_adjustment: 'System',
};

export function PunchEditorModal({ open, onClose, entryId, entryDate, punches }: Props) {
  const originalPunches = useMemo(() => punches.map(punchToEditable), [punches]);
  const [editedPunches, setEditedPunches] = useState<EditablePunch[]>([]);
  const [reason, setReason] = useState('');
  const [quickFixUsed, setQuickFixUsed] = useState(false);
  const saveMutation = useSavePunchEdits();
  const { data: schedule } = useWorkSchedule();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setEditedPunches(punches.map(punchToEditable));
      setReason('');
      setQuickFixUsed(false);
    }
  }, [open, punches]);

  const hasChanges = useMemo(() => {
    if (quickFixUsed) return true;
    if (editedPunches.length !== originalPunches.length) return true;
    const active = editedPunches.filter(p => !p.is_deleted);
    const origActive = originalPunches.filter(p => !p.is_deleted);
    if (active.length !== origActive.length) return true;
    return editedPunches.some((ep) => {
      if (ep.is_new || ep.is_deleted || ep.is_edited) return true;
      const orig = originalPunches.find(o => o.id === ep.id);
      if (!orig) return false;
      return ep.source !== orig.source;
    });
  }, [editedPunches, originalPunches, quickFixUsed]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    const active = editedPunches.filter(p => !p.is_deleted);
    const times = active.map(p => new Date(p.punch_time).getTime());
    const uniqueTimes = new Set(times);
    if (uniqueTimes.size < times.length) w.push('Duplicate timestamps detected');
    if (active.length > 0) {
      const last = active[active.length - 1];
      if (last.punch_type === 'in') w.push('Last punch is IN — missing clock out');
    }
    return w;
  }, [editedPunches]);

  const updatePunch = (index: number, field: keyof EditablePunch, value: any) => {
    setEditedPunches(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const updated = { ...p, [field]: value };
      if (!p.is_new) updated.is_edited = true;
      return updated;
    }));
  };

  const updatePunchTime = (index: number, timeStr: string) => {
    const newIso = fromLocalTimeInput(entryDate, timeStr);
    setEditedPunches(prev => prev.map((p, i) => {
      if (i !== index) return p;
      return { ...p, punch_time: newIso, is_edited: !p.is_new ? true : p.is_edited };
    }));
  };

  const deletePunch = (index: number) => {
    setEditedPunches(prev => prev.map((p, i) => {
      if (i !== index) return p;
      return { ...p, is_deleted: true };
    }));
  };

  const addPunch = () => {
    const now = new Date();
    setEditedPunches(prev => [
      ...prev,
      {
        id: null,
        punch_type: 'in' as const,
        punch_time: now.toISOString(),
        original_punch_time: null,
        is_deleted: false,
        is_new: true,
        is_edited: false,
        source: 'manual',
        location_lat: null,
        location_lng: null,
      },
    ]);
  };

  const autoSort = () => {
    setEditedPunches(prev => {
      const active = prev.filter(p => !p.is_deleted);
      const deleted = prev.filter(p => p.is_deleted);
      active.sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());
      return [...active, ...deleted];
    });
  };

  const convertAllGpsToManual = () => {
    setEditedPunches(prev => prev.map(p => {
      if (p.source === 'auto_location' && !p.is_deleted) {
        return { ...p, source: 'manual', is_edited: !p.is_new ? true : p.is_edited };
      }
      return p;
    }));
    setQuickFixUsed(true);
  };

  const hasGpsPunches = editedPunches.some(p => p.source === 'auto_location' && !p.is_deleted);

  // Quick fixes
  const setClockOutToScheduledEnd = () => {
    const sched = schedule ? getScheduleForWeekday(schedule, entryDate) : null;
    if (!sched) {
      toast({ title: 'No schedule found for this day', variant: 'destructive' });
      return;
    }
    const endIso = fromLocalTimeInput(entryDate, sched.end_time);
    const active = editedPunches.filter(p => !p.is_deleted);
    const lastIn = [...active].reverse().find(p => p.punch_type === 'in');
    if (!lastIn) {
      toast({ title: 'No clock-in found to pair with', variant: 'destructive' });
      return;
    }
    const lastOutIdx = editedPunches.findIndex(
      (p, i) => !p.is_deleted && p.punch_type === 'out' && i === editedPunches.length - 1
    );
    if (lastOutIdx >= 0) {
      updatePunch(lastOutIdx, 'punch_time', endIso);
      if (!editedPunches[lastOutIdx].is_new) {
        setEditedPunches(prev => prev.map((p, i) => i === lastOutIdx ? { ...p, is_edited: true } : p));
      }
    } else {
      setEditedPunches(prev => [
        ...prev,
        {
          id: null, punch_type: 'out' as const, punch_time: endIso,
          original_punch_time: null, is_deleted: false, is_new: true, is_edited: false,
          source: 'manual', location_lat: null, location_lng: null,
        },
      ]);
    }
    setQuickFixUsed(true);
  };

  const setClockOutToNow = () => {
    const nowIso = new Date().toISOString();
    setEditedPunches(prev => [
      ...prev,
      {
        id: null, punch_type: 'out' as const, punch_time: nowIso,
        original_punch_time: null, is_deleted: false, is_new: true, is_edited: false,
        source: 'manual', location_lat: null, location_lng: null,
      },
    ]);
    setQuickFixUsed(true);
  };

  const fillMissingPunches = () => {
    const sched = schedule ? getScheduleForWeekday(schedule, entryDate) : null;
    if (!sched) {
      toast({ title: 'No schedule found', variant: 'destructive' });
      return;
    }
    const active = editedPunches.filter(p => !p.is_deleted);
    if (active.length === 0) {
      const startIso = fromLocalTimeInput(entryDate, sched.start_time);
      const endIso = fromLocalTimeInput(entryDate, sched.end_time);
      setEditedPunches(prev => [
        ...prev,
        { id: null, punch_type: 'in' as const, punch_time: startIso, original_punch_time: null, is_deleted: false, is_new: true, is_edited: false, source: 'manual', location_lat: null, location_lng: null },
        { id: null, punch_type: 'out' as const, punch_time: endIso, original_punch_time: null, is_deleted: false, is_new: true, is_edited: false, source: 'manual', location_lat: null, location_lng: null },
      ]);
    } else {
      const last = active[active.length - 1];
      if (last.punch_type === 'in') {
        const endIso = fromLocalTimeInput(entryDate, sched.end_time);
        setEditedPunches(prev => [
          ...prev,
          { id: null, punch_type: 'out' as const, punch_time: endIso, original_punch_time: null, is_deleted: false, is_new: true, is_edited: false, source: 'manual', location_lat: null, location_lng: null },
        ]);
      }
    }
    setQuickFixUsed(true);
  };

  const handleSave = async () => {
    if (!reason.trim()) return;
    try {
      await saveMutation.mutateAsync({
        entryId,
        entryDate,
        original: originalPunches,
        edited: editedPunches,
        reason: reason.trim(),
      });
      toast({ title: 'Punches saved with audit trail' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error saving', description: err.message, variant: 'destructive' });
    }
  };

  const activePunches = editedPunches.filter(p => !p.is_deleted);

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Punches
          </DialogTitle>
          <DialogDescription>
            {entryDate} — Edit, add, or remove punches. All changes are audited.
          </DialogDescription>
        </DialogHeader>

        {/* Punch rows */}
        <div className="space-y-2">
          {editedPunches.map((p, i) => {
            if (p.is_deleted) return null;
            const orig = originalPunches.find(o => o.id === p.id);
            const sourceChanged = orig && p.source !== orig.source;
            const wasEdited = p.is_edited || p.is_new || sourceChanged;
            const hasGps = p.location_lat != null && p.location_lng != null;
            return (
              <div key={p.id || `new-${i}`} className="rounded-lg bg-muted/50 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Select
                    value={p.punch_type}
                    onValueChange={v => updatePunch(i, 'punch_type', v)}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">IN</SelectItem>
                      <SelectItem value="out">OUT</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="time"
                    value={toLocalTimeInput(p.punch_time)}
                    onChange={e => updatePunchTime(i, e.target.value)}
                    className={`w-32 h-8 text-sm time-display ${wasEdited ? 'text-destructive font-semibold' : ''}`}
                  />
                  {wasEdited && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                      {p.is_new ? 'new' : 'edited'}
                    </span>
                  )}
                  {p.original_punch_time && p.is_edited && !p.is_new && (
                    <span className="text-[10px] text-muted-foreground">
                      was {formatTime(p.original_punch_time)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive"
                    onClick={() => deletePunch(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Source selector + GPS indicator row */}
                <div className="flex items-center gap-2 pl-1">
                  <Label className="text-[10px] text-muted-foreground">Source:</Label>
                  <Select
                    value={p.source}
                    onValueChange={v => updatePunch(i, 'source', v)}
                  >
                    <SelectTrigger className="w-24 h-6 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="auto_location">GPS</SelectItem>
                      <SelectItem value="import">Import</SelectItem>
                      <SelectItem value="system_adjustment">System</SelectItem>
                    </SelectContent>
                  </Select>
                  {sourceChanged && (
                    <span className="text-[10px] text-muted-foreground">
                      was {SOURCE_LABELS[orig!.source] || orig!.source}
                    </span>
                  )}
                  {hasGps && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex items-center gap-0.5 ml-auto">
                      <MapPin className="h-2.5 w-2.5" /> GPS recorded
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {activePunches.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No punches</p>
          )}
        </div>

        {/* Editor controls */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={addPunch}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Punch
          </Button>
          <Button variant="outline" size="sm" onClick={autoSort}>
            <ArrowDownUp className="h-3.5 w-3.5 mr-1" /> Auto Sort
          </Button>
          {hasGpsPunches && (
            <Button variant="outline" size="sm" onClick={convertAllGpsToManual}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Convert All GPS → Manual
            </Button>
          )}
        </div>

        {/* Quick Fix section */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" /> Quick Fix Corrections
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={setClockOutToScheduledEnd}>
              Set Out → Scheduled End
            </Button>
            <Button variant="secondary" size="sm" onClick={setClockOutToNow}>
              Set Out → Now
            </Button>
            <Button variant="secondary" size="sm" onClick={fillMissingPunches}>
              Fill Missing Punches
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Quick fixes populate fields but don't save. You must still press Save.
          </p>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1 p-2 rounded-lg bg-warning/10 border border-warning/30">
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {w}
              </p>
            ))}
          </div>
        )}

        {/* Reason */}
        {hasChanges && (
          <div className="space-y-1 border-t pt-3">
            <Label className="text-xs font-semibold">
              Edit Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why these changes are being made..."
              rows={2}
              className="text-sm"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!hasChanges || !reason.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
