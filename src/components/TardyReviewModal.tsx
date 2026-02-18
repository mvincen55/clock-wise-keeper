import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/time-utils';

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
  } | null;
  onSubmit: (id: string, status: 'approved' | 'unapproved', reason: string) => Promise<void>;
  onClose: () => void;
};

export function TardyReviewModal({ open, tardy, onSubmit, onClose }: Props) {
  const [status, setStatus] = useState<'approved' | 'unapproved'>('approved');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tardy) {
      setStatus(tardy.approval_status === 'unapproved' ? 'unapproved' : 'approved');
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

  const actualLocal = new Date(tardy.actual_start_time).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Review Tardy — {formatDate(tardy.entry_date)}
          </DialogTitle>
          <DialogDescription>
            {tardy.minutes_late} minutes late (Expected: {tardy.expected_start_time?.slice(0, 5)}, Actual: {actualLocal})
          </DialogDescription>
        </DialogHeader>

        {tardy.timezone_suspect && (
          <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Timestamp appears mis-zoned. Check punches before approving.</span>
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
