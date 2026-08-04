import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareWarning } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useReviewKnowledgeVersion, type KnowledgeWorkspaceItem } from '@/hooks/useKnowledge';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: KnowledgeWorkspaceItem | null;
};

export default function KnowledgeReviewDialog({ open, onOpenChange, item }: Props) {
  const { user } = useAuth();
  const review = useReviewKnowledgeVersion();
  const [note, setNote] = useState('');
  const version = item?.workingVersion ?? null;
  const isAuthor = !!user && version?.created_by === user.id;

  useEffect(() => {
    if (open) setNote('');
  }, [open, item?.id]);

  const decide = async (decision: 'approved' | 'changes_requested') => {
    if (!version || isAuthor) return;
    try {
      await review.mutateAsync({ versionId: version.id, decision, note });
      toast.success(decision === 'approved' ? 'Version approved' : 'Draft returned with requested changes');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the review');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Review: {item?.title ?? 'Knowledge version'}</DialogTitle>
          <DialogDescription>
            Approval confirms the content is ready to publish. Publishing remains a separate action.
          </DialogDescription>
        </DialogHeader>

        {isAuthor ? (
          <Alert>
            <MessageSquareWarning className="h-4 w-4" />
            <AlertTitle>A second set of eyes is required</AlertTitle>
            <AlertDescription>
              The person who wrote a version cannot approve it. Another owner or manager must review this one.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="knowledge-review-note">Review note</Label>
            <Textarea
              id="knowledge-review-note"
              rows={5}
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Explain requested changes, or leave an optional approval note."
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={review.isPending}>
            Close
          </Button>
          {!isAuthor && (
            <>
              <Button
                variant="outline"
                onClick={() => decide('changes_requested')}
                disabled={review.isPending || !note.trim()}
              >
                <MessageSquareWarning className="mr-2 h-4 w-4" />
                Request changes
              </Button>
              <Button onClick={() => decide('approved')} disabled={review.isPending}>
                {review.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
