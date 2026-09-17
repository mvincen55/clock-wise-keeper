import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { formatDate, formatClock, formatInstantClock } from '@/lib/time-utils';

type Props = {
  open: boolean;
  tardy: {
    id: string;
    entry_date: string;
    minutes_late: number;
    expected_start_time: string;
    actual_start_time: string;
    approval_status: string;
    reason_text: string | null;
    timezone_suspect?: boolean;
    /** Null until a manager has decided; the dialog then opens on Approve. */
    reviewed_at?: string | null;
  } | null;
  /** Whose tardy is under review — shown when a manager reads the office's rows. */
  employeeName?: string | null;
  /** The employee's waiting request, when the review answers one. */
  request?: { reason: string; created_at: string } | null;
  onSubmit: (id: string, status: 'approved' | 'unapproved', reason: string) => Promise<void>;
  onClose: () => void;
};

export function TardyReviewModal({ open, tardy, employeeName, request, onSubmit, onClose }: Props) {
  const [status, setStatus] = useState<'approved' | 'unapproved'>('approved');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tardy) {
      // Every tardy starts unapproved; a manager opening it is most often
      // here to excuse it, so an undecided one opens on Approve.
      setStatus(tardy.reviewed_at && tardy.approval_status === 'unapproved' ? 'unapproved' : 'approved');
      setReason(tardy.reason_text || '');
    }
  }, [tardy]);

  const canSave = reason.trim().length > 0;

  const handleSubmit = async () => {
    if (!tardy || !canSave) return;
    setSubmitting(true);
    try {
      await onSubmit(tardy.id, status, reason.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!tardy) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Review Tardy — {employeeName ? `${employeeName} · ` : ''}{formatDate(tardy.entry_date)}
          </DialogTitle>
          <DialogDescription>
            {/* Both times in the office timezone, in the same style as the table. */}
            {tardy.minutes_late} minutes late (Expected: {formatClock(tardy.expected_start_time)}, Actual: {formatInstantClock(tardy.actual_start_time)})
          </DialogDescription>
        </DialogHeader>

        {tardy.timezone_suspect && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Timestamp appears mis-zoned. Check punches before approving.</span>
          </div>
        )}

        {request && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">Approval requested {formatDate(request.created_at)}</p>
            <p className="mt-1">{request.reason}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Decision</Label>
            <Select value={status} onValueChange={v => setStatus(v as 'approved' | 'unapproved')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved (excused)</SelectItem>
                <SelectItem value="unapproved">Unapproved (unexcused)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain the decision..."
              rows={3}
            />
            {reason.trim().length === 0 && (
              <p className="text-xs text-destructive">A reason is required to save.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!canSave || submitting} className="flex-1">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Review
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
