import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, FileCheck2, FileQuestion, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SourceConversionDialog from '@/components/practice-setup/SourceConversionDialog';
import { useConfirmPracticeSetupSource } from '@/hooks/usePracticeSetup';
import type { KnowledgeCategoryRow } from '@/integrations/supabase/knowledge-client';
import type { PracticeSetupSourceRow } from '@/integrations/supabase/practice-setup-client';
import type { OfficeDoc } from '@/lib/doc-library';
import { DOC_COLLECTION_LABELS, LIBRARY_AREA_LABELS, resolveDocPlacement } from '@/lib/doc-library';
import {
  PRACTICE_SETUP_ACTION_LABELS,
  PRACTICE_SETUP_SUGGESTION_LABELS,
  confidenceLabel,
  confidencePercent,
  knowledgeKindForSetupAction,
  type PracticeSetupAction,
} from '@/lib/practice-setup';

type Props = {
  source: PracticeSetupSourceRow;
  document: OfficeDoc;
  categories: KnowledgeCategoryRow[];
  duplicateCount?: number;
};

function actionFromSource(source: PracticeSetupSourceRow): PracticeSetupAction | '' {
  if (source.confirmed_action) return source.confirmed_action;
  return source.suggested_action === 'review' ? '' : source.suggested_action;
}

function statusBadge(source: PracticeSetupSourceRow) {
  if (source.status === 'converted') return <Badge className="bg-emerald-600">Draft created</Badge>;
  if (source.status === 'confirmed') return <Badge className="bg-violet-600">Ready for draft</Badge>;
  if (source.status === 'source_only') return <Badge variant="secondary">Source reference</Badge>;
  if (source.status === 'excluded') return <Badge variant="outline">Excluded</Badge>;
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Needs decision</Badge>;
}

export default function PracticeSetupSourceCard({ source, document, categories, duplicateCount = 0 }: Props) {
  const confirm = useConfirmPracticeSetupSource();
  const [action, setAction] = useState<PracticeSetupAction | ''>(() => actionFromSource(source));
  const [categoryId, setCategoryId] = useState(source.confirmed_category_id ?? '');
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => {
    setAction(actionFromSource(source));
    setCategoryId(source.confirmed_category_id ?? '');
  }, [source]);

  const kind = action ? knowledgeKindForSetupAction(action) : null;
  const availableCategories = useMemo(
    () => categories.filter(category => category.area === (kind === 'policy' ? 'handbook' : 'playbook')),
    [categories, kind],
  );
  const placement = resolveDocPlacement(document);
  const categoryRequired = action === 'policy' || action === 'procedure';
  const canSave = !!action && (!categoryRequired || !!categoryId);
  const oversized = document.char_count > 120_000;

  const saveClassification = async () => {
    if (!action || !canSave) return;
    try {
      await confirm.mutateAsync({
        sourceId: source.id,
        action,
        categoryId: categoryRequired ? categoryId : null,
      });
      toast.success(
        action === 'policy' || action === 'procedure'
          ? 'Source confirmed and ready for a draft'
          : 'Source decision saved',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the source decision');
    }
  };

  const icon = source.status === 'converted'
    ? FileCheck2
    : action === 'policy'
      ? BookOpen
      : action === 'procedure'
        ? Wrench
        : FileQuestion;
  const Icon = icon;

  return (
    <>
      <Card className={source.status === 'converted' ? 'border-emerald-200 bg-emerald-50/20' : ''}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="break-words text-base">{document.title}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {LIBRARY_AREA_LABELS[placement.libraryArea]} · {DOC_COLLECTION_LABELS[placement.collection]} · {document.char_count.toLocaleString()} characters
                </p>
              </div>
            </div>
            {statusBadge(source)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Purple Envelope suggests: {PRACTICE_SETUP_SUGGESTION_LABELS[source.suggested_action]}</p>
              <span className="text-xs text-muted-foreground">
                {confidenceLabel(source.confidence)} · {confidencePercent(source.confidence)}%
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{source.suggestion_reason}</p>
          </div>

          {duplicateCount > 1 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {duplicateCount} documents have a similar title. Compare them before making multiple drafts.
            </div>
          )}

          {oversized && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              This is a large mixed source. Classify it, but do not turn it into one giant policy or procedure. It needs to be broken into focused sections.
            </div>
          )}

          {source.status !== 'converted' && (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-1.5">
                <Label>What should Purple Envelope do with it?</Label>
                <Select
                  value={action}
                  onValueChange={value => {
                    const next = value as PracticeSetupAction;
                    setAction(next);
                    if (next === 'source_only' || next === 'exclude') setCategoryId('');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choose the real destination" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRACTICE_SETUP_ACTION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Destination category</Label>
                <Select
                  value={categoryId}
                  onValueChange={setCategoryId}
                  disabled={!categoryRequired}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={categoryRequired ? 'Choose a category' : 'Not needed'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map(category => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={saveClassification} disabled={!canSave || confirm.isPending}>
                {confirm.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Save decision
              </Button>
            </div>
          )}

          {source.status === 'confirmed' && (
            <div className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                <p className="text-sm text-violet-950">
                  Classification is confirmed. The next step creates an editable draft and source citation. It does not publish.
                </p>
              </div>
              <Button size="sm" onClick={() => setConvertOpen(true)} disabled={oversized}>
                Create review draft
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <SourceConversionDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        source={source}
        document={document}
      />
    </>
  );
}
