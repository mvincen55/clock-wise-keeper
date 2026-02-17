import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  minutesLate: number;
  entryDate: string;
  onSubmit: (reason: string) => Promise<void>;
  onDismiss: () => void;
};

export function TardyReasonModal({ open, minutesLate, entryDate, onSubmit, onDismiss }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(reason.trim());
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onDismiss(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Late Arrival — {minutesLate} min late
          </DialogTitle>
          <DialogDescription>
            You were late on {entryDate}. A reason is required.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why you were late..."
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={!reason.trim() || submitting} className="flex-1">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Reason
            </Button>
            <Button variant="outline" onClick={onDismiss}>Dismiss</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dismissing without a reason keeps this tardy as "unreviewed".
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
