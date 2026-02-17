import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

type EditAuditDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
};

export function EditAuditDialog({ open, onClose, onConfirm, fieldChanged, oldValue, newValue }: EditAuditDialogProps) {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim());
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Edit Requires Comment
          </DialogTitle>
          <DialogDescription>
            You must provide a reason for this change. This will be recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
            <p><span className="text-muted-foreground">Field:</span> <span className="font-medium">{fieldChanged}</span></p>
            <p><span className="text-muted-foreground">From:</span> <span className="font-mono text-xs">{oldValue || '(empty)'}</span></p>
            <p><span className="text-muted-foreground">To:</span> <span className="font-mono text-xs">{newValue || '(empty)'}</span></p>
          </div>

          <div className="space-y-1">
            <Label>Reason for change *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this change is being made..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!reason.trim()}>
            Save with Audit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
