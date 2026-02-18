import { useState } from 'react';
import { useSubmitCorrectionRequest } from '@/hooks/useCorrectionRequests';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface CorrectionRequestModalProps {
  open: boolean;
  onClose: () => void;
  prefill?: {
    target_table?: string;
    target_id?: string;
    entry_date?: string;
    description?: string;
  };
}

export function CorrectionRequestModal({ open, onClose, prefill }: CorrectionRequestModalProps) {
  const submit = useSubmitCorrectionRequest();
  const { toast } = useToast();

  const [targetTable] = useState(prefill?.target_table || 'punches');
  const [targetId] = useState(prefill?.target_id || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (reason.trim().length < 10) {
      toast({ title: 'Reason too short', description: 'Minimum 10 characters required.', variant: 'destructive' });
      return;
    }
    try {
      await submit.mutateAsync({
        target_table: targetTable,
        target_id: targetId || crypto.randomUUID(),
        proposed_change: { description: description.trim(), entry_date: prefill?.entry_date },
        reason: reason.trim(),
      });
      toast({ title: 'Correction request submitted', description: 'Your manager will review it.' });
      onClose();
      setDescription('');
      setReason('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Correction Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {prefill?.entry_date && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <span className="text-muted-foreground">Date:</span>{' '}
              <span className="font-medium">{prefill.entry_date}</span>
            </div>
          )}

          <div className="space-y-1">
            <Label>What needs to change? <span className="text-destructive">*</span></Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the correction needed (e.g., wrong clock-in time, missing punch)"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label>
              Reason for correction <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground ml-1">(min 10 chars)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this correction needed? Be specific."
              rows={3}
            />
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className="text-xs text-destructive">{10 - reason.trim().length} more characters needed</p>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || reason.trim().length < 10 || submit.isPending}
            className="w-full"
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Correction Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
