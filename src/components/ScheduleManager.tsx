import { useState } from 'react';
import { useScheduleVersions, useCreateScheduleVersion, useUpdateScheduleVersion, useDeleteScheduleVersion, useActiveScheduleVersion, summarizeWeekdays, DEFAULT_WEEKDAYS, WEEKDAY_NAMES, ScheduleVersionWithDays, ScheduleWeekdayRow } from '@/hooks/useScheduleVersions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Calendar, Clock, Pencil, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

type WeekdayDraft = Omit<ScheduleWeekdayRow, 'id' | 'schedule_version_id'>;

function WeekdayEditor({ weekdays, onChange }: { weekdays: WeekdayDraft[]; onChange: (weekdays: WeekdayDraft[]) => void }) {
  const update = (idx: number, patch: Partial<WeekdayDraft>) => {
    const next = [...weekdays];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="divide-y rounded-lg border">
      {weekdays
        .sort((a, b) => a.weekday - b.weekday)
        .map((w, idx) => (
          <div key={w.weekday} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 ${!w.enabled ? 'opacity-50' : ''}`}>
            <div className="w-24 flex items-center gap-2">
              <Switch checked={w.enabled} onCheckedChange={v => update(idx, { enabled: v })} />
              <span className="text-sm font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Start</Label>
              <Input type="time" value={w.start_time?.slice(0, 5)} onChange={e => update(idx, { start_time: e.target.value })} disabled={!w.enabled} className="w-[7rem] text-sm h-8" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input type="time" value={w.end_time?.slice(0, 5)} onChange={e => update(idx, { end_time: e.target.value })} disabled={!w.enabled} className="w-[7rem] text-sm h-8" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Grace</Label>
              <Input type="number" min={0} value={w.grace_minutes} onChange={e => update(idx, { grace_minutes: parseInt(e.target.value) || 0 })} disabled={!w.enabled} className="w-16 text-sm h-8" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground">Threshold</Label>
              <Input type="number" min={1} value={w.threshold_minutes} onChange={e => update(idx, { threshold_minutes: parseInt(e.target.value) || 1 })} disabled={!w.enabled} className="w-16 text-sm h-8" />
            </div>
          </div>
        ))}
    </div>
  );
}

export default function ScheduleManager() {
  const { data: versions, isLoading } = useScheduleVersions();
  const activeVersion = useActiveScheduleVersion();
  const createVersion = useCreateScheduleVersion();
  const updateVersion = useUpdateScheduleVersion();
  const deleteVersion = useDeleteScheduleVersion();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: orgCtx } = useOrgContext();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<ScheduleVersionWithDays | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Choice/confirm dialog state for in-place vs. versioned edits
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceMode, setChoiceMode] = useState<'versioned' | 'inplace'>('versioned');
  const [versionedStartDate, setVersionedStartDate] = useState<string>('');
  const [forceInPlaceOnly, setForceInPlaceOnly] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formRemote, setFormRemote] = useState(false);
  const [formCopyCurrent, setFormCopyCurrent] = useState(true);
  const [formWeekdays, setFormWeekdays] = useState<WeekdayDraft[]>(DEFAULT_WEEKDAYS);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);

  const openCreate = () => {
    setEditingVersion(null);
    setFormName('');
    setFormStart(new Date().toISOString().split('T')[0]);
    setFormEnd('');
    setFormRemote(activeVersion?.apply_to_remote ?? false);
    setFormCopyCurrent(true);

    if (activeVersion && activeVersion.weekdays.length > 0) {
      setFormWeekdays(activeVersion.weekdays.map(w => ({
        weekday: w.weekday,
        enabled: w.enabled,
        start_time: w.start_time,
        end_time: w.end_time,
        grace_minutes: w.grace_minutes,
        threshold_minutes: w.threshold_minutes,
      })));
    } else {
      setFormWeekdays([...DEFAULT_WEEKDAYS]);
    }

    setOverlapWarning(null);
    setModalOpen(true);
  };

  const openEdit = (v: ScheduleVersionWithDays) => {
    setEditingVersion(v);
    setFormName(v.name || '');
    setFormStart(v.effective_start_date);
    setFormEnd(v.effective_end_date || '');
    setFormRemote(v.apply_to_remote);
    setFormCopyCurrent(false);
    setFormWeekdays(v.weekdays.map(w => ({
      weekday: w.weekday,
      enabled: w.enabled,
      start_time: w.start_time,
      end_time: w.end_time,
      grace_minutes: w.grace_minutes,
      threshold_minutes: w.threshold_minutes,
    })));
    setOverlapWarning(null);
    setModalOpen(true);
  };

  const handleCopyToggle = (checked: boolean) => {
    setFormCopyCurrent(checked);
    if (checked && activeVersion && activeVersion.weekdays.length > 0) {
      setFormWeekdays(activeVersion.weekdays.map(w => ({
        weekday: w.weekday,
        enabled: w.enabled,
        start_time: w.start_time,
        end_time: w.end_time,
        grace_minutes: w.grace_minutes,
        threshold_minutes: w.threshold_minutes,
      })));
    }
  };

  const checkOverlaps = (startDate: string) => {
    if (!versions?.length || !startDate) {
      setOverlapWarning(null);
      return;
    }
    const overlapping = versions.filter(v => {
      if (editingVersion && v.id === editingVersion.id) return false;
      return v.effective_start_date < startDate && (v.effective_end_date === null || v.effective_end_date >= startDate);
    });
    if (overlapping.length > 0) {
      setOverlapWarning('Previous schedule will be shortened to prevent overlap.');
    } else {
      setOverlapWarning(null);
    }
  };


  // ---- Intercept logic helpers ----
  const todayStr = () => new Date().toISOString().split('T')[0];

  const weekdaysAttendanceChanged = (): boolean => {
    if (!editingVersion) return false;
    const byWd = new Map(editingVersion.weekdays.map(w => [w.weekday, w]));
    for (const fw of formWeekdays) {
      const orig = byWd.get(fw.weekday);
      if (!orig) return true;
      if (
        orig.enabled !== fw.enabled ||
        (orig.start_time || '').slice(0, 5) !== (fw.start_time || '').slice(0, 5) ||
        (orig.end_time || '').slice(0, 5) !== (fw.end_time || '').slice(0, 5) ||
        orig.grace_minutes !== fw.grace_minutes ||
        orig.threshold_minutes !== fw.threshold_minutes
      ) {
        return true;
      }
    }
    return false;
  };

  const attendanceAffectingChanged = (): boolean => {
    if (!editingVersion) return false;
    if (editingVersion.apply_to_remote !== formRemote) return true;
    if (editingVersion.effective_start_date !== formStart) return true;
    if ((editingVersion.effective_end_date || '') !== (formEnd || '')) return true;
    return weekdaysAttendanceChanged();
  };

  const isHistoricalVersion = (v: ScheduleVersionWithDays): boolean => {
    return !!v.effective_end_date && v.effective_end_date < todayStr();
  };

  const affectedRange = (): { start: string; end: string; days: number } => {
    const start = editingVersion?.effective_start_date || todayStr();
    const end = editingVersion?.effective_end_date || todayStr();
    const s = new Date(start + 'T00:00:00').getTime();
    const e = new Date(end + 'T00:00:00').getTime();
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    return { start, end, days };
  };

  const performInPlaceUpdate = async () => {
    if (!editingVersion) return;
    const oldValues = {
      name: editingVersion.name,
      effective_start_date: editingVersion.effective_start_date,
      effective_end_date: editingVersion.effective_end_date,
      apply_to_remote: editingVersion.apply_to_remote,
      weekdays: editingVersion.weekdays.map(w => ({
        weekday: w.weekday,
        enabled: w.enabled,
        start_time: w.start_time,
        end_time: w.end_time,
        grace_minutes: w.grace_minutes,
        threshold_minutes: w.threshold_minutes,
      })),
    };
    const newValues = {
      name: formName || null,
      effective_start_date: formStart,
      effective_end_date: formEnd || null,
      apply_to_remote: formRemote,
      weekdays: formWeekdays,
    };

    await updateVersion.mutateAsync({
      versionId: editingVersion.id,
      updates: {
        name: formName || null,
        effective_start_date: formStart,
        effective_end_date: formEnd || null,
        apply_to_remote: formRemote,
      },
      weekdays: editingVersion.weekdays.map((w, i) => ({
        id: w.id,
        updates: {
          enabled: formWeekdays[i]?.enabled ?? w.enabled,
          start_time: formWeekdays[i]?.start_time ?? w.start_time,
          end_time: formWeekdays[i]?.end_time ?? w.end_time,
          grace_minutes: formWeekdays[i]?.grace_minutes ?? w.grace_minutes,
          threshold_minutes: formWeekdays[i]?.threshold_minutes ?? w.threshold_minutes,
        },
      })),
    });

    // Audit row — best-effort; never block the save
    if (user) {
      const { error: logErr } = await supabase.from('schedule_correction_log').insert({
        version_id: editingVersion.id,
        org_id: orgCtx?.org_id || null,
        employee_id: orgCtx?.employee_id || null,
        edited_by: user.id,
        old_values: oldValues as any,
        new_values: newValues as any,
      });
      if (logErr) console.warn('schedule_correction_log insert failed:', logErr);
    }
  };

  const performVersionedCreate = async (startDate: string) => {
    await createVersion.mutateAsync({
      name: formName || undefined,
      effective_start_date: startDate,
      effective_end_date: formEnd || null,
      apply_to_remote: formRemote,
      weekdays: formWeekdays,
      auto_adjust_previous: true,
    });
  };

  const handleSave = async () => {
    if (!formStart) {
      toast({ title: 'Start date is required', variant: 'destructive' });
      return;
    }

    if (formEnd && formEnd < formStart) {
      toast({ title: 'End date must be after start date', variant: 'destructive' });
      return;
    }

    if (!formWeekdays.some(w => w.enabled)) {
      toast({ title: 'At least one weekday must be enabled', variant: 'destructive' });
      return;
    }

    try {
      if (editingVersion) {
        // Name-only / non-attendance change: save in place silently.
        if (!attendanceAffectingChanged()) {
          await updateVersion.mutateAsync({
            versionId: editingVersion.id,
            updates: { name: formName || null },
          });
          toast({ title: 'Schedule updated' });
          setModalOpen(false);
          return;
        }

        // Attendance-affecting edit — open choice dialog.
        const historical = isHistoricalVersion(editingVersion);
        setForceInPlaceOnly(historical);
        setChoiceMode(historical ? 'inplace' : 'versioned');
        setVersionedStartDate(todayStr());
        setChoiceOpen(true);
        return;
      }

      await performVersionedCreate(formStart);
      toast({ title: 'Schedule version created' });
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleConfirmChoice = async () => {
    if (!editingVersion) return;
    setSavingChoice(true);
    try {
      if (choiceMode === 'versioned') {
        if (!versionedStartDate) {
          toast({ title: 'Effective start date is required', variant: 'destructive' });
          setSavingChoice(false);
          return;
        }
        await performVersionedCreate(versionedStartDate);
        toast({ title: 'New schedule version created' });
      } else {
        await performInPlaceUpdate();
        toast({ title: 'Schedule corrected', description: 'Attendance is being recalculated for affected days.' });
      }
      setChoiceOpen(false);
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingChoice(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteVersion.mutateAsync(id);
      toast({ title: 'Schedule version deleted' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Schedule Card */}
      {activeVersion && (
        <Card className="card-elevated border-primary/20">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                Current Schedule
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                Since {formatDate(activeVersion.effective_start_date)}
              </Badge>
            </div>
            {activeVersion.name && (
              <p className="text-sm text-muted-foreground">{activeVersion.name}</p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {activeVersion.weekdays
                .sort((a, b) => a.weekday - b.weekday)
                .map(w => (
                  <div key={w.weekday} className={`flex items-center gap-3 px-4 py-2 text-sm ${!w.enabled ? 'opacity-40' : ''}`}>
                    <span className="w-12 font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
                    {w.enabled ? (
                      <>
                        <span className="time-display">{w.start_time?.slice(0, 5)} – {w.end_time?.slice(0, 5)}</span>
                        {w.grace_minutes > 0 && (
                          <span className="text-xs text-muted-foreground">({w.grace_minutes}m grace)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Off</span>
                    )}
                  </div>
                ))}
            </div>
            <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center gap-4">
              <span>Remote: {activeVersion.apply_to_remote ? 'Yes' : 'No'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Schedule Change Button */}
      <Button onClick={openCreate} className="w-full sm:w-auto">
        <Plus className="mr-2 h-4 w-4" />
        Add Schedule Change
      </Button>

      {/* Schedule History */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Schedule History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !versions?.length ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-muted-foreground">No schedule versions yet.</p>
              <Button onClick={openCreate}>Create First Schedule</Button>
            </div>
          ) : (
            <div className="divide-y">
              {versions.map(v => {
                const isActive = activeVersion?.id === v.id;
                const isExpanded = expandedId === v.id;
                return (
                  <div key={v.id} className={`${isActive ? 'bg-primary/5' : ''}`}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : v.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{v.name || 'Schedule'}</p>
                          {isActive && <Badge variant="default" className="text-xs">Active</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(v.effective_start_date)}
                          {v.effective_end_date ? ` → ${formatDate(v.effective_end_date)}` : ' → Present'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {summarizeWeekdays(v.weekdays)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(v); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={e => { e.stopPropagation(); handleDelete(v.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t bg-muted/30 px-4 py-2">
                        <div className="divide-y rounded border bg-background">
                          {v.weekdays
                            .sort((a, b) => a.weekday - b.weekday)
                            .map(w => (
                              <div key={w.weekday} className={`flex items-center gap-3 px-3 py-1.5 text-xs ${!w.enabled ? 'opacity-40' : ''}`}>
                                <span className="w-10 font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
                                {w.enabled ? (
                                  <span>{w.start_time?.slice(0, 5)} – {w.end_time?.slice(0, 5)}</span>
                                ) : (
                                  <span className="text-muted-foreground">Off</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVersion ? 'Edit Schedule Version' : 'Add Schedule Change'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm">Name (optional)</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Summer Hours" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Start Date *</Label>
                <Input
                  type="date"
                  value={formStart}
                  onChange={e => {
                    setFormStart(e.target.value);
                    checkOverlaps(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">End Date (optional)</Label>
                <Input type="date" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
              </div>
            </div>

            {overlapWarning && (
              <Alert variant="default" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-sm">{overlapWarning}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={formRemote} onCheckedChange={setFormRemote} />
              <Label className="text-sm">Apply to remote days</Label>
            </div>

            {!editingVersion && (
              <div className="flex items-center gap-3">
                <Switch checked={formCopyCurrent} onCheckedChange={handleCopyToggle} />
                <Label className="text-sm">Copy current schedule</Label>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-sm font-medium">Weekday Rules</Label>
              <WeekdayEditor weekdays={formWeekdays} onChange={setFormWeekdays} />
            </div>

            <Button
              onClick={handleSave}
              disabled={createVersion.isPending || updateVersion.isPending}
              className="w-full"
            >
              {(createVersion.isPending || updateVersion.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingVersion ? 'Save Changes' : 'Create Schedule Version'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </DialogContent>
      </Dialog>

      {/* Choice / Correction Confirmation Dialog */}
      <Dialog open={choiceOpen} onOpenChange={(open) => { if (!savingChoice) setChoiceOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {forceInPlaceOnly ? 'Correct historical schedule?' : 'How should this change apply?'}
            </DialogTitle>
            <DialogDescription>
              {forceInPlaceOnly
                ? 'This schedule version has already ended. Saving will overwrite it as a correction.'
                : 'Most schedule changes start on a date going forward. Pick what fits.'}
            </DialogDescription>
          </DialogHeader>

          {!forceInPlaceOnly && (
            <RadioGroup value={choiceMode} onValueChange={(v) => setChoiceMode(v as 'versioned' | 'inplace')} className="space-y-3">
              <label className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${choiceMode === 'versioned' ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem value="versioned" className="mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-sm">Schedule is changing</div>
                  <p className="text-xs text-muted-foreground">
                    Their hours are different starting on a new date. A new schedule version is created; past attendance is not touched.
                  </p>
                  {choiceMode === 'versioned' && (
                    <div className="pt-1">
                      <Label className="text-xs">Effective start date</Label>
                      <Input
                        type="date"
                        value={versionedStartDate}
                        onChange={(e) => setVersionedStartDate(e.target.value)}
                        className="h-8 mt-1"
                      />
                    </div>
                  )}
                </div>
              </label>

              <label className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${choiceMode === 'inplace' ? 'border-warning bg-warning/5' : ''}`}>
                <RadioGroupItem value="inplace" className="mt-1" />
                <div className="flex-1 space-y-1">
                  <div className="font-medium text-sm">Fixing an error in this schedule</div>
                  <p className="text-xs text-muted-foreground">
                    The schedule record was entered wrong and was always wrong. Edits the existing version in place.
                  </p>
                </div>
              </label>
            </RadioGroup>
          )}

          {choiceMode === 'inplace' && (() => {
            const r = affectedRange();
            return (
              <Alert variant="default" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-sm">
                  This will recalculate attendance for all days this schedule covers
                  ({formatDate(r.start)} to {editingVersion?.effective_end_date ? formatDate(r.end) : 'today'}, {r.days} day{r.days === 1 ? '' : 's'}).
                  Past late/absent statuses may change.
                </AlertDescription>
              </Alert>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setChoiceOpen(false)} disabled={savingChoice}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmChoice}
              disabled={savingChoice}
              variant={choiceMode === 'inplace' ? 'destructive' : 'default'}
            >
              {savingChoice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {choiceMode === 'inplace' ? 'Confirm correction' : 'Create new version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
