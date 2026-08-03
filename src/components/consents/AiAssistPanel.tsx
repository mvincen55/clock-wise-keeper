import { useState } from 'react';
import { Sparkles, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import NoPhiNote from '@/components/NoPhiNote';
import { consentAssist, contentToPlainText, ASSIST_MODE_LABELS, type AssistMode } from '@/lib/consents/ai';
import type { ConsentBlock, ConsentTemplateContent } from '@/lib/consents/types';

/**
 * AI drafting help for managers, with a hard rule: suggestions are shown
 * beside the office's wording and applied only by an explicit click on a
 * specific paragraph. AI never overwrites office-approved language on its
 * own — review-only modes have no apply button at all.
 */

const REWRITE_MODES: AssistMode[] = ['rewrite', 'simplify', 'professional'];
const REVIEW_MODES: AssistMode[] = ['missing_risks', 'unclear', 'suggest_sections'];

export default function AiAssistPanel({
  content,
  publishedText,
  onApplyToBlock,
}: {
  content: ConsentTemplateContent;
  /** Plain text of the published version, for the compare mode. */
  publishedText: string | null;
  /** Replace one paragraph-like block's text after explicit review. */
  onApplyToBlock: (blockId: string, newText: string) => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<AssistMode>('simplify');
  const [targetBlockId, setTargetBlockId] = useState<string>('whole');
  const [running, setRunning] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const textBlocks = content.blocks.filter(
    (b): b is ConsentBlock & { body: string } =>
      (b.type === 'paragraph' || b.type === 'instruction' || b.type === 'section') && !!b.body?.trim(),
  );

  const isRewrite = REWRITE_MODES.includes(mode);
  const targetBlock = textBlocks.find(b => b.id === targetBlockId);

  const run = async () => {
    setRunning(true);
    setSuggestion(null);
    try {
      const text = isRewrite && targetBlock ? targetBlock.body : contentToPlainText(content);
      const result = await consentAssist(
        mode,
        text,
        mode === 'compare' ? publishedText ?? '(never published)' : undefined,
      );
      setSuggestion(result);
    } catch (err) {
      toast({
        title: 'AI help unavailable',
        description: err instanceof Error ? err.message : 'Try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="card-elevated">
      <CardContent className="space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />AI drafting help
        </p>
        <div className="flex flex-wrap gap-2">
          <Select value={mode} onValueChange={v => { setMode(v as AssistMode); setSuggestion(null); }}>
            <SelectTrigger className="h-8 w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...REWRITE_MODES, ...REVIEW_MODES, ...(publishedText !== null ? (['compare'] as AssistMode[]) : [])].map(m => (
                <SelectItem key={m} value={m}>{ASSIST_MODE_LABELS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isRewrite && (
            <Select value={targetBlockId} onValueChange={setTargetBlockId}>
              <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="whole">Whole form (suggestion only)</SelectItem>
                {textBlocks.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    “{b.body.slice(0, 44)}…”
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Suggest
          </Button>
        </div>
        <NoPhiNote what="This template's wording" />

        {suggestion && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="whitespace-pre-wrap text-sm">{suggestion}</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
                <X className="mr-1.5 h-3.5 w-3.5" />Dismiss
              </Button>
              {isRewrite && targetBlock && (
                <Button
                  size="sm"
                  onClick={() => {
                    onApplyToBlock(targetBlock.id, suggestion);
                    setSuggestion(null);
                    toast({ title: 'Applied to that paragraph', description: 'Review it, then save or publish when ready.' });
                  }}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" />Apply to that paragraph
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Suggestions never replace office-approved wording automatically — applying is always your call.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
