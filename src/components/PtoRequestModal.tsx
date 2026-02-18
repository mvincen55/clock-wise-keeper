import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSubmitPtoRequest } from '@/hooks/usePtoRequests';
import { Loader2 } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PtoRequestModal({ open, onClose }: Props) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [ptoType, setPtoType] = useState<'pto' | 'sick' | 'unpaid' | 'other'>('pto');
  const [note, setNote] = useState('');
  const submit = useSubmitPtoRequest();

  const handleSubmit = async () => {
    if (!startDate || !endDate || !note.trim()) return;
    await submit.mutateAsync({
      start_date: startDate,
      end_date: endDate,
      hours_requested: hours ? parseFloat(hours) : undefined,
      pto_type: ptoType,
      note: note.trim(),
    });
    setStartDate('');
    setEndDate('');
    setHours('');
    setNote('');
    setPtoType('pto');
    onClose();
  };

  const isValid = startDate && endDate && note.trim().length >= 1 && endDate >= startDate;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request PTO</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={e => {
                setStartDate(e.target.value);
                if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
              }} />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={ptoType} onValueChange={v => setPtoType(v as any)}>
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
              <Input type="number" value={hours} onChange={e => setHours(e.target.value)} placeholder="Auto: 8h/day" min={0} step={0.5} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Why are you requesting time off?"
              rows={3}
            />
          </div>

          <Button onClick={handleSubmit} disabled={!isValid || submit.isPending} className="w-full">
            {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
