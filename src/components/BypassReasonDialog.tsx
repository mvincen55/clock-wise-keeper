import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useSubmitBypassReason, type ChecklistBypass } from '@/hooks/useChecklistBypasses';

interface Props {
  bypass: ChecklistBypass | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The follow-up: the member gives their reason. Firm, never shaming. */
export default function BypassReasonDialog({ bypass, open, onOpenChange }: Props) {
  const [reason, setReason] = useState('');
  const submit = useSubmitBypassReason();

  useEffect(() => {
    if (open) setReason(bypass?.reason ?? '');
  }, [open, bypass?.id]);

  if (!bypass) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    try {
      await submit.mutateAsync({ id: bypass.id, reason });
      toast.success('Thanks — your reason has been recorded.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save your reason.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your checklist on {bypass.checklist_date}</DialogTitle>
          <DialogDescription>
            You clocked out with {bypass.incomplete_count} item{bypass.incomplete_count === 1 ? '' : 's'} open.
            {bypass.escalation_level > 1
              ? ' This has come up more than once now, so it needs an answer.'
              : ' A short explanation is all that\u2019s needed.'}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={4}
          placeholder="What got in the way that day?"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button onClick={handleSubmit} disabled={!reason.trim() || submit.isPending}>
            Submit reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
