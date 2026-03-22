import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubmitCorrectionRequest } from '@/hooks/useCorrectionRequests';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import type { PtoRequest } from '@/hooks/usePtoRequests';

type Props = {
  open: boolean;
  onClose: () => void;
  request: PtoRequest;
  mode: 'cancel' | 'correct';
};

export function PtoCorrectionModal({ open, onClose, request, mode }: Props) {
  const [reason, setReason] = useState('');
  const [newStartDate, setNewStartDate] = useState(request.start_date);
  const [newEndDate, setNewEndDate] = useState(request.end_date);
  const [newHours, setNewHours] = useState(request.hours_requested?.toString() || '');
  const [newPtoType, setNewPtoType] = useState(request.pto_type);
  const submit = useSubmitCorrectionRequest();
  const { toast } = useToast();

  const isCancel = mode === 'cancel';
  const title = isCancel ? 'Request Cancellation' : 'Request Correction';

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({ title: 'Reason is required', variant: 'destructive' });
      return;
    }

    const proposed_change: Record<string, any> = isCancel
      ? { action: 'cancel', status: 'cancelled' }
      : {
          action: 'correct',
          start_date: newStartDate,
          end_date: newEndDate,
          hours_requested: newHours ? parseFloat(newHours) : null,
          pto_type: newPtoType,
        };

    try {
      await submit.mutateAsync({
        target_table: 'pto_requests',
        target_id: request.id,
        proposed_change,
        reason: reason.trim(),
      });
      toast({ title: `${isCancel ? 'Cancellation' : 'Correction'} request submitted` });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
            <p className="font-medium">Original Request</p>
            <p className="text-muted-foreground">
              {request.start_date}{request.start_date !== request.end_date && ` — ${request.end_date}`}
              {request.hours_requested && ` (${request.hours_requested}h)`}
              {' · '}<span className="capitalize">{request.pto_type}</span>
              {' · '}<span className="capitalize">{request.status}</span>
            </p>
          </div>

          {!isCancel && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>New Start Date</Label>
                  <Input type="date" value={newStartDate} onChange={e => {
                    setNewStartDate(e.target.value);
                    if (e.target.value > newEndDate) setNewEndDate(e.target.value);
                  }} />
                </div>
                <div className="space-y-1">
                  <Label>New End Date</Label>
                  <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} min={newStartDate} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={newPtoType} onValueChange={v => setNewPtoType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pto">PTO</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Hours (optional)</Label>
                  <Input type="number" value={newHours} onChange={e => setNewHours(e.target.value)} placeholder="Auto: 8h/day" min={0} step={0.5} />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={isCancel ? 'Why do you need to cancel this request? (min 10 chars)' : 'What needs to be changed and why? (min 10 chars)'}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{reason.trim().length}/10 characters minimum</p>
          </div>

          <Button onClick={handleSubmit} disabled={reason.trim().length < 10 || submit.isPending} className="w-full">
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit {isCancel ? 'Cancellation' : 'Correction'} Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
