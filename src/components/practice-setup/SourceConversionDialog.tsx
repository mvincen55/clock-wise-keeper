import { useEffect, useState } from 'react';
import { FileInput, Loader2, ShieldCheck } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConvertPracticeSetupSource } from '@/hooks/usePracticeSetup';
import type { PracticeSetupSourceRow } from '@/integrations/supabase/practice-setup-client';
import type { OfficeDoc } from '@/lib/doc-library';
import { cleanSourceTitle } from '@/lib/practice-setup';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PracticeSetupSourceRow | null;
  document: OfficeDoc | null;
};

function formatCharacters(count: number): string {
  if (count < 1_000) return `${count} characters`;
  return `${Math.round(count / 1_000).toLocaleString()}k characters`;
}

export default function SourceConversionDialog({ open, onOpenChange, source, document }: Props) {
  const convert = useConvertPracticeSetupSource();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (!open || !document) return;
    setTitle(cleanSourceTitle(document.title));
    setSummary('');
  }, [open, document]);

  const handleConvert = async () => {
    if (!source || !document || !title.trim()) return;
    try {
      const result = await convert.mutateAsync({
        source,
        sourceTitle: document.title,
        sourceCharCount: document.char_count,
        title,
        summary,
      });
      toast.success(`Draft created with ${result.preview.blocks.length} editable content blocks`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the governed draft');
    }
  };

  const oversized = (document?.char_count ?? 0) > 120_000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileInput className="h-5 w-5 text-primary" />
            Create a governed draft
          </DialogTitle>
          <DialogDescription>
            Purple Envelope will structure the extracted source text into editable blocks. It will not publish anything.
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-primary/25 bg-primary/5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertTitle>Source material is not automatically office policy</AlertTitle>
          <AlertDescription>
            The result starts as a draft, keeps a citation back to “{document?.title ?? 'this source'},” and must still be reviewed, approved, and published.
          </AlertDescription>
        </Alert>

        {oversized ? (
          <Alert variant="destructive">
            <AlertTitle>This source is too large for one draft</AlertTitle>
            <AlertDescription>
              It contains {formatCharacters(document?.char_count ?? 0)}. Break it into focused policies or procedures instead of creating one giant manual entry.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-draft-title">Draft title</Label>
              <Input
                id="setup-draft-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                placeholder="Clear office-facing title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-draft-summary">Summary override (optional)</Label>
              <Textarea
                id="setup-draft-summary"
                rows={3}
                value={summary}
                onChange={event => setSummary(event.target.value)}
                placeholder="Leave blank and Purple Envelope will use the first clear paragraph as the draft summary."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Source size: {formatCharacters(document?.char_count ?? 0)}. You can rewrite, split, reorder, or remove every generated block before review.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={convert.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConvert}
            disabled={convert.isPending || oversized || !title.trim()}
          >
            {convert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create draft, do not publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
