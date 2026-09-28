import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAddDayOff } from '@/hooks/useDaysOff';
import { useToast } from '@/hooks/use-toast';

/**
 * A manager records time off for a team member — PTO, sick time, a callout
 * or another absence — with the hours that come out of their PTO bank. It
 * is the same days_off record the Attendance page keeps and the PTO ledger
 * reads, written for anyone on the roster, logins or not. The bank guard on
 * the server refuses hours the bank cannot cover unless this person may go
 * negative; the dialog says so before the click.
 */

export type RecordTimeOffMember = {
  employeeId: string;
  userId: string | null;
  displayName: string;
  /** Hours that can still be taken; null when no starting balance is on file. */
  available: number | null;
  allowNegative: boolean;
};

type TimeOffKind = 'pto' | 'sick' | 'callout' | 'other';

const KIND_TO_DAY_OFF: Record<TimeOffKind, 'scheduled_with_notice' | 'medical_leave' | 'unscheduled' | 'other'> = {
  pto: 'scheduled_with_notice',
  sick: 'medical_leave',
  callout: 'unscheduled',
  other: 'other',
};

const KIND_LABELS: Record<TimeOffKind, string> = {
  pto: 'PTO (planned time off)',
  sick: 'Sick time',
  callout: 'Callout (no notice)',
  other: 'Other absence',
};

type Props = {
  open: boolean;
  onClose: () => void;
  member: RecordTimeOffMember;
};

export function RecordTimeOffDialog({ open, onClose, member }: Props) {
  const [kind, setKind] = useState<TimeOffKind>('pto');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const addDayOff = useAddDayOff();
  const qc = useQueryClient();
  const { toast } = useToast();

  const hoursNumber = hours.trim() === '' ? 0 : Number(hours);
  const hoursValid = Number.isFinite(hoursNumber) && hoursNumber >= 0 && hoursNumber <= 400;
  const datesValid = !!startDate && !!endDate && endDate >= startDate;
  const noteRequired = kind === 'sick';
  const noteValid = !noteRequired || note.trim().length > 0;

  // What the server's guard will say, said first.
  let bankProblem: string | null = null;
  if (hoursNumber > 0 && !member.allowNegative) {
    if (member.available == null) {
      bankProblem = `No PTO starting balance is on file for ${member.displayName}. Set it on their Team card before recording PTO hours.`;
    } else if (hoursNumber > member.available + 0.005) {
      bankProblem = `Not enough PTO: ${member.displayName} has ${Math.max(member.available, 0).toFixed(2)} hours available and this would use ${hoursNumber.toFixed(2)}.`;
    }
  }

  const canSave = datesValid && hoursValid && noteValid && !bankProblem && !addDayOff.isPending;

  const reset = () => {
    setKind('pto');
    setStartDate('');
    setEndDate('');
    setHours('');
    setNote('');
  };

  const save = async () => {
    if (!canSave) return;
    try {
      await addDayOff.mutateAsync({
        date_start: startDate,
        date_end: endDate,
        type: KIND_TO_DAY_OFF[kind],
        hours: hoursNumber,
        notes: note.trim() || undefined,
        target: { user_id: member.userId, employee_id: member.employeeId },
      });
      // Their attendance rows now know about the day off (someone with a
      // login only; the day off itself is already saved).
      if (member.userId) {
        await supabase.rpc('request_attendance_recompute', { p_user_id: member.userId, p_start_date: startDate, p_end_date: endDate });
      }
      await qc.invalidateQueries({ queryKey: ['team-pto-balances'] });
      await qc.invalidateQueries({ queryKey: ['pto-ledger'] });
      toast({
        title: `${KIND_LABELS[kind].split(' (')[0]} recorded for ${member.displayName}`,
        description: hoursNumber > 0 ? `${hoursNumber.toFixed(2)} hours come out of their PTO bank.` : 'No PTO hours were deducted.',
      });
      reset();
      onClose();
    } catch (err) {
      toast({ title: 'Could not record the time off', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record time off for {member.displayName}</DialogTitle>
          <DialogDescription>
            {member.available == null
              ? 'No PTO starting balance is on file for this person yet.'
              : `${Math.max(member.available, 0).toFixed(2)} hours available${member.allowNegative ? ' · may go negative' : ''}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="rto-kind">Kind</Label>
            <Select value={kind} onValueChange={v => setKind(v as TimeOffKind)}>
              <SelectTrigger id="rto-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABELS) as TimeOffKind[]).map(k => (
                  <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="rto-start">First day</Label>
              <Input id="rto-start" type="date" value={startDate} onChange={e => {
                setStartDate(e.target.value);
                if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
              }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rto-end">Last day</Label>
              <Input id="rto-end" type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rto-hours">PTO hours to deduct</Label>
            <Input id="rto-hours" type="number" min={0} step={0.25} value={hours} onChange={e => setHours(e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">
              Only the hours entered here leave the bank. Leave it at 0 for unpaid time or a callout with no PTO.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rto-note">Note{noteRequired ? ' (required for sick time)' : ''}</Label>
            <Textarea id="rto-note" rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          {bankProblem && <p role="alert" className="text-sm text-destructive">{bankProblem}</p>}
          <Button className="w-full" disabled={!canSave} onClick={save}>
            {addDayOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record time off
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
