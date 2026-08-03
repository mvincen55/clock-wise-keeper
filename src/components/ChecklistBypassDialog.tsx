import { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { buttonVariants } from '@/components/ui/button';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import { DEFAULT_MESSAGING_SETTINGS } from '@/lib/messaging-settings';

interface Props {
  open: boolean;
  incompleteCount: number;
  openSharedCount: number;
  busy?: boolean;
  onGoBack: () => void;
  onBypass: (reason: string) => void;
}

/**
 * Shown before a clock-out punch is written when daily per-person checklist
 * items are still open. Matter-of-fact, never shaming — and never trapping:
 * "Bypass & clock out" always clocks the person out.
 */
export default function ChecklistBypassDialog({
  open,
  incompleteCount,
  openSharedCount,
  busy,
  onGoBack,
  onBypass,
}: Props) {
  const [reason, setReason] = useState('');
  const { settings: messaging } = useMessagingSettings();
  const doctorLabel = messaging?.doctor_recipient_label ?? DEFAULT_MESSAGING_SETTINGS.doctor_recipient_label;

  return (
    <AlertDialog open={open} onOpenChange={o => { if (!o) onGoBack(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {incompleteCount} checklist item{incompleteCount === 1 ? '' : 's'} still open
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your manager and {doctorLabel} will be notified that you bypassed your checklist.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bypass-reason">Add a quick note (optional)</Label>
            <Textarea
              id="bypass-reason"
              rows={3}
              placeholder="Anything that explains today — you can also add this later."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
          {openSharedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              For information: {openSharedCount} shared team item{openSharedCount === 1 ? ' is' : 's are'} also
              still open. Shared items don't affect your clock-out.
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onGoBack} disabled={busy} className={buttonVariants({ variant: 'default' })}>
            Go back and finish
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onBypass(reason)}
            disabled={busy}
            className={buttonVariants({ variant: 'destructive' })}
          >
            Bypass &amp; clock out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
