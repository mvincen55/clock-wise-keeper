import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { formatDate, formatClock, formatInstantClock } from '@/lib/time-utils';

type TardyLike = {
  entry_date: string;
  minutes_late: number;
  expected_start_time: string;
  actual_start_time: string;
};

type Props = {
  open: boolean;
  tardy: TardyLike | null;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
};

/**
 * An employee asks a manager to excuse a late arrival. Office policy: a
 * tardy stays unapproved until a manager says otherwise, so this is the
 * employee's side of that decision — what happened, in their own words.
 */
export function TardyApprovalRequestModal({ open, tardy, onSubmit, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canSend = reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!tardy || !canSend) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  if (!tardy) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Request approval — {formatDate(tardy.entry_date)}
          </DialogTitle>
          <DialogDescription>
            {tardy.minutes_late} minutes late (Expected: {formatClock(tardy.expected_start_time)}, Actual: {formatInstantClock(tardy.actual_start_time)}).
            A late arrival stays unapproved until a manager excuses it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="tardy-request-reason">What happened? (required)</Label>
            <Textarea
              id="tardy-request-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Ran a work errand on the way in; the manager knew"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!canSend || submitting} className="flex-1">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send to manager
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your manager will approve or deny it, and you'll be notified either way.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
