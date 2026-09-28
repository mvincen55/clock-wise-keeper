import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { EXCUSE_CLASSES, EXCUSE_LABELS, excuseState } from '@/lib/late-arrivals';
import { formatClock, formatDate, formatTime } from '@/lib/time-utils';

type Reviewable = {
  id: string;
  entry_date: string;
  minutes_late: number;
  expected_start_time: string;
  actual_start_time: string;
  approval_status: string;
  reason_text: string | null;
  timezone_suspect?: boolean;
  acknowledged_at?: string | null;
  excuse_requested_at?: string | null;
  excuse_decided_at?: string | null;
  manager_note?: string;
};

type Props = {
  open: boolean;
  tardy: Reviewable | null;
  /** Whose late arrival this is — shown in the title so a manager reviewing the office never guesses. */
  employeeName?: string;
  onSubmit: (id: string, decision: 'excused' | 'unexcused', note: string) => Promise<void>;
  onClose: () => void;
};

/**
 * A manager's decision on one late arrival, at any time: excused (never
 * counts) or unexcused (counts). Notes are optional. The database refuses
 * the person the row is about, so this never offers to decide one's own.
 */
export function LateArrivalReviewModal({ open, tardy, employeeName, onSubmit, onClose }: Props) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<'excused' | 'unexcused' | null>(null);

  useEffect(() => {
    if (tardy) setNote(tardy.manager_note ?? '');
  }, [tardy]);

  if (!tardy) return null;
  const state = excuseState(tardy);

  const decide = async (decision: 'excused' | 'unexcused') => {
    setPending(decision);
    try {
      await onSubmit(tardy.id, decision, note.trim());
      onClose();
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Late arrival — {employeeName ? `${employeeName} — ` : ''}{formatDate(tardy.entry_date)}
          </DialogTitle>
          <DialogDescription>
            {tardy.minutes_late} minutes late (scheduled {formatClock(tardy.expected_start_time)}, arrived {formatTime(tardy.actual_start_time)})
          </DialogDescription>
        </DialogHeader>

        {tardy.timezone_suspect && (
          <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Timestamp appears mis-zoned. Check the punches before deciding; a suspect time never counts.</span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${EXCUSE_CLASSES[state]}`}>{EXCUSE_LABELS[state]}</span>
            {tardy.acknowledged_at
              ? <span className="text-xs text-muted-foreground">Acknowledged by the team member {formatDate(tardy.acknowledged_at)}</span>
              : <span className="text-xs text-muted-foreground">Not acknowledged yet (counts all the same)</span>}
          </div>
          {tardy.reason_text && (
            <div>
              <p className="text-xs text-muted-foreground">Explanation from the team member{tardy.excuse_requested_at ? ` · requested ${formatDate(tardy.excuse_requested_at)}` : ''}</p>
              <p className="text-sm italic">“{tardy.reason_text}”</p>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="late-arrival-note">Note (optional)</Label>
            <Textarea id="late-arrival-note" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Anything worth keeping with the decision. The team member sees it." />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decide('excused')} disabled={!!pending} className="flex-1">
              {pending === 'excused' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excused
            </Button>
            <Button variant="outline" onClick={() => decide('unexcused')} disabled={!!pending} className="flex-1">
              {pending === 'unexcused' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unexcused
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={!!pending}>Cancel</Button>
          </div>
          <p className="text-xs text-muted-foreground">Excused never counts toward the late-arrival rule; unexcused counts. The team member is notified either way.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
