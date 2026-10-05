import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { usePtoAvailable, useRecordPtoUsage } from '@/hooks/usePtoUsage';
import { formatPtoHours, ptoUsageProblem } from '@/lib/pto-usage';
import { formatDate, getToday } from '@/lib/time-utils';

/**
 * "Use PTO": a team member says how many PTO hours they are using on a
 * day, or an owner or manager says it for them. The hours are the whole
 * record — nothing is derived from a day off — and the bank deducts them
 * at once. The server's guard refuses hours the bank cannot cover unless
 * this person may go negative; the dialog says so before the click.
 */

export type UsePtoMember = { employeeId: string; displayName: string };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Who the hours are for. One member: fixed. Several: the dialog offers the choice (owners and managers). */
  members: UsePtoMember[];
  /** Preselected member when several are offered. */
  initialEmployeeId?: string;
  /** Default date; today when omitted. */
  initialDate?: string;
  /** After a successful save. */
  onSaved?: (employeeId: string) => void;
};

export function UsePtoDialog({ open, onClose, members, initialEmployeeId, initialDate, onSaved }: Props) {
  const [employeeId, setEmployeeId] = useState('');
  const [usageDate, setUsageDate] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const record = useRecordPtoUsage();
  const { toast } = useToast();
  const memberKey = members.map(m => m.employeeId).join(',');

  useEffect(() => {
    if (!open) return;
    setEmployeeId(initialEmployeeId ?? members[0]?.employeeId ?? '');
    setUsageDate(initialDate ?? getToday());
    setHours('');
    setNote('');
    setTouched(false);
    // members is read through memberKey so a caller may pass a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEmployeeId, initialDate, memberKey]);

  const member = members.find(m => m.employeeId === employeeId);
  const bank = usePtoAvailable(member?.employeeId);
  const problem = member
    ? ptoUsageProblem({
        hours, usageDate, displayName: member.displayName,
        available: bank.data ? bank.data.available : null,
        allowNegative: bank.data?.allowNegative ?? false,
      })
    : 'Pick a team member.';
  const canSave = !problem && !record.isPending && !bank.isLoading;

  const save = () => {
    setTouched(true);
    if (!member || problem) return;
    record.mutate(
      { employeeId: member.employeeId, usageDate, hours: Number(hours), note: note.trim() },
      {
        onSuccess: row => {
          toast({ title: 'PTO hours recorded', description: `${member.displayName}: ${formatPtoHours(row.hours)} on ${formatDate(row.usage_date)}.` });
          onSaved?.(member.employeeId);
          onClose();
        },
        onError: (e: Error) => toast({ title: 'Could not record PTO hours', description: e.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Use PTO</DialogTitle>
          <DialogDescription>
            The hours recorded here come out of the PTO bank and print on the payroll report. A day off on the calendar never adds hours by itself.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {members.length > 1 ? (
            <div className="space-y-1">
              <Label htmlFor="use-pto-member">Team member</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger id="use-pto-member"><SelectValue placeholder="Pick a team member" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => <SelectItem key={m.employeeId} value={m.employeeId}>{m.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : member ? (
            <p className="text-sm"><span className="text-muted-foreground">For </span><span className="font-medium">{member.displayName}</span></p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="use-pto-date">Date</Label>
              <Input id="use-pto-date" type="date" value={usageDate} onChange={e => setUsageDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="use-pto-hours">PTO hours</Label>
              <Input id="use-pto-hours" type="number" inputMode="decimal" min={0.25} max={400} step={0.25} placeholder="8" value={hours}
                onChange={e => { setHours(e.target.value); setTouched(true); }} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {!member ? '' : bank.isLoading ? 'Reading the bank…' : bank.data?.available == null
              ? 'No PTO starting balance is on file.'
              : <>Available now: <span className="font-medium text-foreground">{formatPtoHours(bank.data.available)}</span>{bank.data.allowNegative ? ' · may go negative' : ''}</>}
          </p>

          <div className="space-y-1">
            <Label htmlFor="use-pto-note">Note (optional)</Label>
            <Textarea id="use-pto-note" rows={2} maxLength={500} placeholder="e.g. short week, vacation day, appointment" value={note} onChange={e => setNote(e.target.value)} />
          </div>

          {touched && problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={record.isPending}>Cancel</Button>
            <Button onClick={save} disabled={!canSave && touched}>
              {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record PTO hours
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
