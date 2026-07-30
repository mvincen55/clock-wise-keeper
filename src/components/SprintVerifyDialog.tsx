import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import NoPhiNote from '@/components/NoPhiNote';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Check, FileUp, Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useUploadSprintDoc,
  useVerifySprint,
  type SprintVerdict,
  type TeamGoal,
} from '@/hooks/useTeamGoals';

/**
 * Closing out a sprint. A recorded decision, never a signature.
 * On document sprints the AI reads the office's own report and shows its
 * receipts — and the verifier can always overrule it with a reason.
 */
export default function SprintVerifyDialog({
  sprint,
  open,
  onOpenChange,
}: {
  sprint: TeamGoal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const verify = useVerifySprint();
  const upload = useUploadSprintDoc();
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [verdict, setVerdict] = useState<SprintVerdict | null>(sprint.ai_verdict);
  const [busy, setBusy] = useState(false);

  const decide = async (action: 'approve' | 'decline') => {
    try {
      await verify.mutateAsync({ goalId: sprint.id, action, note: note.trim() || undefined });
      toast.success(action === 'approve' ? 'Recorded — the reward is declared.' : 'Recorded.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const readDocument = async (file: File) => {
    setBusy(true);
    try {
      const path = await upload.mutateAsync({ goalId: sprint.id, file });
      const res = await verify.mutateAsync({ goalId: sprint.id, action: 'document', doc_path: path });
      setVerdict(res.verdict ?? null);
      toast.success(res.verdict?.supported ? 'The report supports the target.' : 'The report does not show the target.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const override = async (result: 'won' | 'missed') => {
    if (!overrideReason.trim()) {
      toast.error('An override needs a reason — it goes on the record.');
      return;
    }
    try {
      await verify.mutateAsync({
        goalId: sprint.id,
        action: 'override',
        result,
        note: overrideReason.trim(),
      });
      toast.success('Override recorded.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const isDocument = sprint.verification === 'document';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Verify "{sprint.title}"
          </DialogTitle>
          <DialogDescription>
            {sprint.progress} of {sprint.target_count} {sprint.metric} recorded.{' '}
            {isDocument
              ? "Upload the outside report and the AI will read the number out of it."
              : 'A recorded decision — not a signature.'}
          </DialogDescription>
        </DialogHeader>

        {isDocument && (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) readDocument(f);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {busy ? 'Reading the report…' : 'Upload the report (PDF or photo)'}
            </Button>

            <NoPhiNote what="This report" />
            <p className="text-xs text-muted-foreground">
              Upload a totals-only export. The file is read once and deleted straight after —
              only the number and where it was found are kept.
            </p>



            {verdict && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm">
                <p className="font-medium">
                  {verdict.supported ? 'The document supports the target.' : 'The document does not support the target.'}
                </p>
                <p className="text-muted-foreground">
                  Found: {verdict.found_count ?? 'no clear number'} · target {sprint.target_count}
                </p>
                {verdict.where && (
                  <p className="text-xs text-muted-foreground">Where: {verdict.where}</p>
                )}
                {verdict.reasoning && (
                  <p className="text-xs text-muted-foreground">{verdict.reasoning}</p>
                )}
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="sprint-override" className="text-xs">
                    Disagree? You outrank the reader — say why.
                  </Label>
                  <Textarea
                    id="sprint-override"
                    rows={2}
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder="The export was missing the last two days of calls."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => override('won')}>
                      Override to won
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => override('missed')}>
                      Override to missed
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isDocument && (
          <div className="space-y-1.5">
            <Label htmlFor="sprint-note">Note (optional)</Label>
            <Textarea
              id="sprint-note"
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Counted against the front desk log."
            />
          </div>
        )}

        {!isDocument && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => decide('decline')} disabled={verify.isPending}>
              <X className="mr-2 h-4 w-4" />Decline
            </Button>
            <Button onClick={() => decide('approve')} disabled={verify.isPending}>
              <Check className="mr-2 h-4 w-4" />Approve
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
