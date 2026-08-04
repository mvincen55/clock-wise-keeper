import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileCheck2,
  FilePlus2,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  asKnowledgeAudienceRoles,
  useKnowledgeBlocks,
  useSubmitKnowledgeReview,
  type KnowledgeWorkspaceItem,
} from '@/hooks/useKnowledge';
import {
  useCreateKnowledgeDraftWithAcknowledgment,
  useKnowledgeAcknowledgmentSettings,
  useSaveKnowledgeDraftWithAcknowledgment,
} from '@/hooks/useKnowledgeAcknowledgments';
import type { KnowledgeCategoryRow } from '@/integrations/supabase/knowledge-client';
import {
  DEFAULT_ACKNOWLEDGMENT_STATEMENT,
  KNOWLEDGE_AUDIENCE_ROLES,
  KNOWLEDGE_BLOCK_LABELS,
  KNOWLEDGE_BLOCK_TYPES,
  areaForKnowledgeKind,
  createBlankKnowledgeDraft,
  createKnowledgeBlock,
  knowledgeAreaLabel,
  knowledgeAudienceLabel,
  knowledgeKindLabel,
  validateKnowledgeDraft,
  type KnowledgeBlockDraft,
  type KnowledgeBlockType,
  type KnowledgeDraftInput,
  type KnowledgeKind,
} from '@/lib/knowledge';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: KnowledgeCategoryRow[];
  item?: KnowledgeWorkspaceItem | null;
};

function blockPlaceholder(type: KnowledgeBlockType): string {
  if (type === 'heading') return 'Section heading';
  if (type === 'bullet_list' || type === 'checklist') return 'One item per line';
  if (type === 'numbered_list' || type === 'steps') return 'One step per line';
  if (type === 'script') return 'Write the exact words the team can use';
  if (type === 'table') return 'Use one row per line and separate columns with |';
  if (type === 'image') return 'Describe the image and why it belongs here';
  if (type === 'callout') return 'Important warning, reminder, or exception';
  return 'Write this section in clear, direct language';
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function move<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function KnowledgeEditorDialog({ open, onOpenChange, categories, item }: Props) {
  const version = item?.workingVersion ?? null;
  const isExistingDraft = version?.status === 'draft';
  const versionId = isExistingDraft ? version.id : null;
  const { data: storedBlocks = [], isLoading: blocksLoading } = useKnowledgeBlocks(versionId);
  const { data: acknowledgmentSettings, isLoading: settingsLoading } =
    useKnowledgeAcknowledgmentSettings(versionId);
  const createDraft = useCreateKnowledgeDraftWithAcknowledgment();
  const saveDraft = useSaveKnowledgeDraftWithAcknowledgment();
  const submitReview = useSubmitKnowledgeReview();
  const [input, setInput] = useState<KnowledgeDraftInput>(() => createBlankKnowledgeDraft());
  const [seededKey, setSeededKey] = useState('');

  const seedKey = open
    ? [
        item?.id ?? 'new',
        version?.id ?? 'none',
        storedBlocks.length,
        acknowledgmentSettings?.acknowledgment_required ?? false,
        acknowledgmentSettings?.acknowledgment_due_days ?? 'none',
        acknowledgmentSettings?.acknowledgment_statement ?? 'default',
      ].join(':')
    : '';

  useEffect(() => {
    if (!open || seedKey === seededKey) return;
    if (item && isExistingDraft && (blocksLoading || settingsLoading)) return;

    if (item && isExistingDraft && version) {
      setInput({
        title: item.title,
        summary: item.summary,
        kind: item.kind,
        categoryId: item.category_id,
        audienceRoles: asKnowledgeAudienceRoles(item.audience_roles),
        changeSummary: version.change_summary,
        blocks:
          storedBlocks.length > 0
            ? storedBlocks.map(block => ({
                block_key: block.block_key,
                block_type: block.block_type,
                plain_text: block.plain_text,
                data:
                  block.data && typeof block.data === 'object' && !Array.isArray(block.data)
                    ? (block.data as Record<string, unknown>)
                    : {},
              }))
            : [createKnowledgeBlock('paragraph')],
        acknowledgmentRequired: acknowledgmentSettings?.acknowledgment_required ?? false,
        acknowledgmentDueDays: acknowledgmentSettings?.acknowledgment_due_days ?? null,
        acknowledgmentStatement:
          acknowledgmentSettings?.acknowledgment_statement
          ?? DEFAULT_ACKNOWLEDGMENT_STATEMENT,
      });
    } else {
      setInput(createBlankKnowledgeDraft('policy'));
    }
    setSeededKey(seedKey);
  }, [
    open,
    seedKey,
    seededKey,
    item,
    version,
    isExistingDraft,
    storedBlocks,
    blocksLoading,
    settingsLoading,
    acknowledgmentSettings,
  ]);

  useEffect(() => {
    if (!open) setSeededKey('');
  }, [open]);

  const area = areaForKnowledgeKind(input.kind);
  const availableCategories = useMemo(
    () => categories.filter(category => category.area === area),
    [categories, area],
  );
  const errors = validateKnowledgeDraft(input);
  const loadingExisting = !!item && (blocksLoading || settingsLoading);
  const saving = createDraft.isPending || saveDraft.isPending || submitReview.isPending;

  const setKind = (kind: KnowledgeKind) => {
    setInput(current => ({
      ...current,
      kind,
      categoryId:
        categories.some(
          category => category.id === current.categoryId && category.area === areaForKnowledgeKind(kind),
        )
          ? current.categoryId
          : null,
    }));
  };

  const setBlock = (index: number, block: KnowledgeBlockDraft) => {
    setInput(current => ({ ...current, blocks: replaceAt(current.blocks, index, block) }));
  };

  const closeAfter = (message: string) => {
    toast.success(message);
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (errors.length > 0) return;
    try {
      if (item && version && isExistingDraft) {
        await saveDraft.mutateAsync({ versionId: version.id, input });
        closeAfter(`${knowledgeKindLabel(input.kind)} draft saved`);
      } else {
        await createDraft.mutateAsync(input);
        closeAfter(`${knowledgeKindLabel(input.kind)} draft created`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the draft');
    }
  };

  const handleSubmit = async () => {
    if (!item || !version || !isExistingDraft || errors.length > 0) return;
    try {
      await saveDraft.mutateAsync({ versionId: version.id, input });
      await submitReview.mutateAsync(version.id);
      closeAfter('Draft saved and sent for review');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit the draft');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-primary" />
            {item ? `Edit ${knowledgeKindLabel(item.kind).toLowerCase()}` : 'Create office knowledge'}
          </DialogTitle>
          <DialogDescription>
            Policies publish to the employee handbook. Procedures publish to the practice playbook.
            Team members never see a draft or review copy.
          </DialogDescription>
        </DialogHeader>

        {loadingExisting ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Where does this belong?</Label>
                <Select value={input.kind} onValueChange={value => setKind(value as KnowledgeKind)} disabled={!!item}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="policy">Policy Handbook</SelectItem>
                    <SelectItem value="procedure">Practice Playbook</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {input.kind === 'policy'
                    ? 'Employment expectations, benefits, conduct, and office-wide policies.'
                    : 'The repeatable steps for how this dental office performs work.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={input.categoryId ?? 'uncategorized'}
                  onValueChange={value => setInput(current => ({ ...current, categoryId: value === 'uncategorized' ? null : value }))}
                >
                  <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uncategorized">Uncategorized</SelectItem>
                    {availableCategories.map(category => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Published in {knowledgeAreaLabel(area)}.</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="knowledge-title">Title</Label>
                <Input
                  id="knowledge-title"
                  value={input.title}
                  onChange={event => setInput(current => ({ ...current, title: event.target.value }))}
                  placeholder={input.kind === 'policy' ? 'Example: Attendance and punctuality' : 'Example: Closing the office at the end of the day'}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="knowledge-summary">What should someone understand at a glance?</Label>
                <Textarea
                  id="knowledge-summary"
                  rows={2}
                  value={input.summary}
                  onChange={event => setInput(current => ({ ...current, summary: event.target.value }))}
                  placeholder="A short plain-language summary."
                />
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <Label>Who can read the published version?</Label>
                <p className="text-xs text-muted-foreground">Drafts remain limited to owners and managers.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {KNOWLEDGE_AUDIENCE_ROLES.map(role => {
                  const checked = input.audienceRoles.includes(role);
                  return (
                    <label key={role} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={value =>
                          setInput(current => ({
                            ...current,
                            audienceRoles: value
                              ? [...current.audienceRoles, role]
                              : current.audienceRoles.filter(currentRole => currentRole !== role),
                          }))
                        }
                      />
                      {knowledgeAudienceLabel(role)}
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={input.acknowledgmentRequired}
                  onCheckedChange={value =>
                    setInput(current => ({
                      ...current,
                      acknowledgmentRequired: value === true,
                      acknowledgmentDueDays: value === true
                        ? current.acknowledgmentDueDays ?? 7
                        : null,
                      acknowledgmentStatement: value === true
                        ? current.acknowledgmentStatement || DEFAULT_ACKNOWLEDGMENT_STATEMENT
                        : DEFAULT_ACKNOWLEDGMENT_STATEMENT,
                    }))
                  }
                />
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <FileCheck2 className="h-4 w-4 text-primary" />
                    Require each person to acknowledge this exact published version
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This records receipt and reading. It does not automatically prove agreement, understanding, or misconduct.
                  </p>
                </div>
              </label>

              {input.acknowledgmentRequired && (
                <div className="grid gap-4 border-t border-primary/15 pt-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label htmlFor="ack-due-days">Deadline after publication</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="ack-due-days"
                        type="number"
                        min={1}
                        max={90}
                        step={1}
                        value={input.acknowledgmentDueDays ?? ''}
                        onChange={event => {
                          const nextValue = event.target.value;
                          setInput(current => ({
                            ...current,
                            acknowledgmentDueDays: nextValue === '' ? null : Number(nextValue),
                          }));
                        }}
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ack-statement">Statement shown above the signature</Label>
                    <Textarea
                      id="ack-statement"
                      rows={3}
                      maxLength={1000}
                      value={input.acknowledgmentStatement}
                      onChange={event => setInput(current => ({
                        ...current,
                        acknowledgmentStatement: event.target.value,
                      }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Keep this factual and neutral. The signer will type their own name after opening the full version.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Content blocks</Label>
                  <p className="text-xs text-muted-foreground">
                    Keep policies readable and procedures scannable instead of writing one giant text wall.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(current => ({ ...current, blocks: [...current.blocks, createKnowledgeBlock('paragraph')] }))}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Add block
                </Button>
              </div>

              <div className="space-y-3">
                {input.blocks.map((block, index) => (
                  <div key={block.block_key} className="rounded-xl border bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-7 text-center text-xs font-semibold text-muted-foreground">{index + 1}</span>
                      <Select
                        value={block.block_type}
                        onValueChange={value => setBlock(index, { ...block, block_type: value as KnowledgeBlockType })}
                      >
                        <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {KNOWLEDGE_BLOCK_TYPES.map(type => (
                            <SelectItem key={type} value={type}>{KNOWLEDGE_BLOCK_LABELS[type]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="ml-auto flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => setInput(current => ({ ...current, blocks: move(current.blocks, index, -1) }))} aria-label="Move block up">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" disabled={index === input.blocks.length - 1} onClick={() => setInput(current => ({ ...current, blocks: move(current.blocks, index, 1) }))} aria-label="Move block down">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setInput(current => ({ ...current, blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index) }))} aria-label="Remove block">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {block.block_type !== 'divider' && (
                      <Textarea
                        className="mt-3 min-h-24"
                        value={block.plain_text}
                        onChange={event => setBlock(index, { ...block, plain_text: event.target.value })}
                        placeholder={blockPlaceholder(block.block_type)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {item && (
              <div className="space-y-2">
                <Label htmlFor="change-summary">What changed in this version?</Label>
                <Input
                  id="change-summary"
                  value={input.changeSummary}
                  onChange={event => setInput(current => ({ ...current, changeSummary: event.target.value }))}
                  placeholder="Example: Clarified the third-call escalation step."
                />
              </div>
            )}

            {errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errors[0].message}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loadingExisting || errors.length > 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save draft
          </Button>
          {item && isExistingDraft && (
            <Button onClick={handleSubmit} disabled={saving || loadingExisting || errors.length > 0}>
              Send for review
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
