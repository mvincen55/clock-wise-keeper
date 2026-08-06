import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Check, X, Pencil, ShieldAlert, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  consentAssist, contentToPlainText, reviewForm, actionLabelFor,
  ASSIST_GOALS, ASSIST_GOAL_LABELS, ASSIST_SCOPE_LABELS,
  type AssistGoal, type AssistScope, type ReviewItem,
} from '@/lib/consents/ai';
import { scanForPatientIdentifiers, PII_KIND_LABELS, type PiiHit } from '@/lib/consents/pii';
import type { ConsentTemplateContent } from '@/lib/consents/types';

/**
 * "Improve this form with AI" — a review-based workflow with a hard rule:
 * the AI proposes, the manager disposes. Every suggestion arrives as an
 * original-vs-suggested card that must be explicitly accepted (or edited,
 * or dismissed); nothing is ever applied automatically.
 *
 * PHI boundary: only TEMPLATE wording leaves the browser, and the outgoing
 * text is scanned for patient identifiers first — any hit blocks the
 * request entirely. The server scrubs again at the wire (belt and braces).
 */

export default function AiAssistPanel({
  content,
  selectedBlockId,
  allowStrings,
  onApplySuggestion,
  onInsertSection,
}: {
  content: ConsentTemplateContent;
  /** Currently selected section in the builder; null when none. */
  selectedBlockId?: string | null;
  /** Office branding strings the identifier scan must not flag. */
  allowStrings: string[];
  /** Replace the first occurrence of `original` in the matching block. */
  onApplySuggestion: (original: string, suggested: string) => void;
  /** Append drafted text as a new section at the end of the form. */
  onInsertSection: (text: string) => void;
}) {
  const { toast } = useToast();
  const [goal, setGoal] = useState<AssistGoal>('simplify');
  const [scope, setScope] = useState<AssistScope>(selectedBlockId ? 'selection' : 'form');
  const [draftTopic, setDraftTopic] = useState('');
  const [whyOpen, setWhyOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [blockedHits, setBlockedHits] = useState<PiiHit[] | null>(null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const selectedBlock = selectedBlockId
    ? content.blocks.find(b => b.id === selectedBlockId) ?? null
    : null;

  // Selecting (or deselecting) a section in the builder retargets the scope.
  useEffect(() => {
    setScope(selectedBlock ? 'selection' : 'form');
  }, [selectedBlockId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Page context is not available in the builder — offer selection/form only.
  const scopes: AssistScope[] = selectedBlock ? ['selection', 'form'] : ['form'];
  const effectiveScope: AssistScope = scopes.includes(scope) ? scope : 'form';
  const isDraft = goal === 'draft_section';

  const clearResults = () => {
    setItems(null);
    setDraft(null);
    setBlockedHits(null);
  };

  const outgoingText = (): string =>
    isDraft
      ? draftTopic
      : effectiveScope === 'selection' && selectedBlock
        ? contentToPlainText({ blocks: [selectedBlock] })
        : contentToPlainText(content);

  const run = async () => {
    const text = outgoingText();
    // Identifier hits block the request — nothing patient-shaped leaves.
    const { hits } = scanForPatientIdentifiers(text, allowStrings);
    if (hits.length > 0) {
      setBlockedHits(hits);
      setItems(null);
      setDraft(null);
      return;
    }
    setRunning(true);
    clearResults();
    try {
      if (isDraft) {
        setDraft(await consentAssist('draft_section', text));
      } else {
        setItems(await reviewForm(goal, ASSIST_SCOPE_LABELS[effectiveScope], text));
      }
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

  const accept = (item: ReviewItem, replacement: string) => {
    onApplySuggestion(item.original, replacement);
    setItems(prev => prev?.filter(i => i !== item) ?? null);
  };

  return (
    <Card className="card-elevated">
      <CardContent className="space-y-4 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />Improve this form with AI
        </p>

        {/* Step 1 — the goal */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Step 1 · What do you want help with?
          </p>
          <RadioGroup
            value={goal}
            onValueChange={v => { setGoal(v as AssistGoal); clearResults(); }}
            className="gap-1.5"
          >
            {ASSIST_GOALS.map(g => (
              <label key={g} className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value={g} id={`ai-goal-${g}`} />
                {ASSIST_GOAL_LABELS[g]}
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Step 2 — the scope (or, for a new section, what to cover) */}
        {isDraft ? (
          <div className="space-y-2">
            <Label htmlFor="ai-draft-topic" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 2 · What should the section cover?
            </Label>
            <Input
              id="ai-draft-topic"
              value={draftTopic}
              onChange={e => setDraftTopic(e.target.value)}
              placeholder="e.g. risks of local anesthetic"
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 2 · What should AI review?
            </p>
            <RadioGroup
              value={effectiveScope}
              onValueChange={v => { setScope(v as AssistScope); clearResults(); }}
              className="flex flex-wrap gap-3"
            >
              {scopes.map(s => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value={s} id={`ai-scope-${s}`} />
                  {ASSIST_SCOPE_LABELS[s]}
                </label>
              ))}
            </RadioGroup>
          </div>
        )}

        <Button size="sm" onClick={run} disabled={running || (isDraft && !draftTopic.trim())}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {actionLabelFor(goal, effectiveScope)}
        </Button>

        <div className="text-[11px] text-muted-foreground">
          Do not include patient names or identifying information.{' '}
          <button type="button" className="underline" onClick={() => setWhyOpen(v => !v)}>
            Why?
          </button>
          {whyOpen && (
            <p className="mt-1">
              AI help works on your office&apos;s template wording only. Patient details
              (names, birth dates, chart numbers) belong in the Complete Forms workflow,
              which never sends anything to AI. Text is checked for identifiers before it
              is sent, and a match stops the request.
            </p>
          )}
        </div>

        {blockedHits && (
          <div className="space-y-1.5 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
              <ShieldAlert className="h-3.5 w-3.5" />
              This looks like patient information — remove these first:
            </p>
            {blockedHits.map((h, i) => (
              <p key={i} className="text-xs text-destructive">
                {PII_KIND_LABELS[h.kind]}: “{h.excerpt}”
              </p>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Nothing was sent. If one of these is your office&apos;s own name or phone,
              add it under Practice Settings → Branding.
            </p>
          </div>
        )}

        {/* Structured review results */}
        {items && items.length === 0 && (
          <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            No changes suggested — this wording already reads well for that goal.
          </p>
        )}
        {items?.map((item, i) => (
          <SuggestionCard key={`${i}-${item.original.slice(0, 24)}`} item={item} onAccept={accept} onDismiss={it => setItems(prev => prev?.filter(x => x !== it) ?? null)} />
        ))}

        {/* Single-suggestion path for a drafted section */}
        {draft && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <p className="whitespace-pre-wrap text-sm">{draft}</p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                <X className="mr-1.5 h-3.5 w-3.5" />Dismiss
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onInsertSection(draft);
                  setDraft(null);
                  toast({ title: 'Section added to the end of the form', description: 'Review and edit it like any other block.' });
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />Insert as new section
              </Button>
            </div>
          </div>
        )}

        {(items || draft) && (
          <p className="text-[11px] text-muted-foreground">
            Suggestions never replace office-approved wording automatically — applying is always your call.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** One original-vs-suggested card: Accept, Edit (inline), or Dismiss. */
function SuggestionCard({
  item,
  onAccept,
  onDismiss,
}: {
  item: ReviewItem;
  onAccept: (item: ReviewItem, replacement: string) => void;
  onDismiss: (item: ReviewItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(item.suggested);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="rounded bg-destructive/10 p-2 text-sm text-muted-foreground line-through">
        {item.original}
      </p>
      {editing ? (
        <Textarea value={edited} onChange={e => setEdited(e.target.value)} rows={4} className="text-sm" />
      ) : (
        <p className="rounded bg-success/10 p-2 text-sm">{item.suggested}</p>
      )}
      {item.reason && <p className="text-xs text-muted-foreground">{item.reason}</p>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onDismiss(item)}>
          <X className="mr-1.5 h-3.5 w-3.5" />Dismiss
        </Button>
        {editing ? (
          <Button size="sm" onClick={() => onAccept(item, edited)} disabled={!edited.trim()}>
            <Check className="mr-1.5 h-3.5 w-3.5" />Accept edited
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />Edit
            </Button>
            <Button size="sm" onClick={() => onAccept(item, item.suggested)}>
              <Check className="mr-1.5 h-3.5 w-3.5" />Accept
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
