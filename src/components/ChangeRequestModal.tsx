import { useState } from 'react';
import { useSubmitChangeRequest } from '@/hooks/useChangeRequests';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ChangeRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill with a specific date/entry context */
  prefill?: {
    entry_date?: string;
    entry_id?: string;
    description?: string;
  };
}

export function ChangeRequestModal({ open, onClose, prefill }: ChangeRequestModalProps) {
  const submit = useSubmitChangeRequest();
  const { toast } = useToast();

  const [requestType, setRequestType] = useState<string>('punch_edit');
  const [entryDate, setEntryDate] = useState(prefill?.entry_date || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [details, setDetails] = useState('');

  const handleSubmit = async () => {
    if (!description.trim()) return;
    try {
      await submit.mutateAsync({
        request_type: requestType as any,
        payload: {
          entry_date: entryDate || undefined,
          entry_id: prefill?.entry_id || undefined,
          description: description.trim(),
          details: details.trim() || undefined,
        },
      });
      toast({ title: 'Request submitted', description: 'Your manager will review it.' });
      onClose();
      // Reset
      setRequestType('punch_edit');
      setEntryDate('');
      setDescription('');
      setDetails('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Change Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Request Type</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="punch_edit">Punch Edit</SelectItem>
                <SelectItem value="day_off">Day Off</SelectItem>
                <SelectItem value="schedule_change">Schedule Change</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Date (optional)</Label>
            <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Description <span className="text-destructive">*</span></Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to change and why?"
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <Label>Additional Details (optional)</Label>
            <Textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Exact times, punch corrections, etc."
              rows={2}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || submit.isPending}
            className="w-full"
          >
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
