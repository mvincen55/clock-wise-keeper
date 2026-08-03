import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  ArrowLeft, Save, Send, History, Eye, Plus, AlertTriangle, Loader2, Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import {
  useConsentForm, useCreateConsentForm, usePublishConsentForm, useUpdateConsentForm,
} from '@/hooks/useConsentForms';
import { useConsentPermissions } from '@/hooks/useConsentSettings';
import BlockEditor, { CONDITION_SOURCES } from '@/components/consents/BlockEditor';
import VersionHistoryDialog from '@/components/consents/VersionHistoryDialog';
import AiAssistPanel from '@/components/consents/AiAssistPanel';
import { contentToPlainText } from '@/lib/consents/ai';
import ConsentPrintSheet from '@/components/consents/ConsentPrintSheet';
import { ConsentPreviewDialog } from '@/components/consents/ConsentPrinting';
import { templateWarnings } from '@/lib/consents/validation';
import {
  BLOCK_TYPES, FORM_CATEGORIES, FORM_CATEGORY_LABELS, makeBlock, newBlockId, workingContent,
  type ConsentBlock, type ConsentBlockType, type ConsentForm, type FormCategory,
} from '@/lib/consents/types';

/**
 * The form builder. Offices edit CONTENT — the master print layout
 * (letterhead, headings, signature areas, footer) is fixed so every form
 * the office prints looks like the same office printed it.
 *
 * Publishing snapshots a new version; drafts save without touching the
 * published version. Prior versions are never overwritten.
 */

const STARTER_BLOCKS = (): ConsentBlock[] => [
  makeBlock('title', { label: 'New Consent Form' }),
  makeBlock('patient_name', { label: 'Patient Name', required: true }),
  makeBlock('section', { label: 'Procedure Description', kind: 'description', body: '' }),
  makeBlock('section', { label: 'Common Risks', kind: 'risks', body: '' }),
  makeBlock('section', { label: 'Alternatives', kind: 'alternatives', body: '' }),
  makeBlock('section', { label: 'Consent', kind: 'consent_statement', body: 'I have read this form, my questions were answered, and I consent to the treatment described above.' }),
  makeBlock('signature', { role: 'patient', required: true }),
  makeBlock('date', { label: 'Date', required: true }),
];

export default function ConsentBuilder() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: branding = GENERIC_BRANDING } = useOrgBranding();
  const { data: existing, isLoading } = useConsentForm(formId ?? null);
  const { can } = useConsentPermissions();
  const createForm = useCreateConsentForm();
  const updateForm = useUpdateConsentForm();
  const publishForm = usePublishConsentForm();

  const [name, setName] = useState('New Consent Form');
  const [category, setCategory] = useState<FormCategory>('general_consent');
  const [procedureCodesText, setProcedureCodesText] = useState('');
  const [editableBy, setEditableBy] = useState<'managers' | 'everyone'>('managers');
  const [hygienistMayComplete, setHygienistMayComplete] = useState(false);
  const [blocks, setBlocks] = useState<ConsentBlock[]>(STARTER_BLOCKS);
  const [dirty, setDirty] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const [publishOpen, setPublishOpen] = useState(false);
  const [changeNotes, setChangeNotes] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Hydrate from the loaded form exactly once per form id.
  useEffect(() => {
    if (!existing || existing.id === loadedId) return;
    setName(existing.name);
    setCategory(existing.category);
    setProcedureCodesText(existing.procedureCodes.join(', '));
    setEditableBy(existing.editableBy);
    setHygienistMayComplete(existing.hygienistMayComplete);
    const content = workingContent(existing);
    setBlocks(content?.blocks ?? STARTER_BLOCKS());
    setDirty(false);
    setLoadedId(existing.id);
  }, [existing, loadedId]);

  // Leaving with unsaved template edits deserves a browser warning.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const readOnly = !!existing && !(can('editTemplates') || existing.editableBy === 'everyone');
  const isFinancial = existing?.isFinancial ?? category === 'financial';
  const content = useMemo(() => ({ blocks }), [blocks]);
  const procedureCodes = useMemo(
    () => procedureCodesText.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
    [procedureCodesText],
  );

  const warnings = useMemo(
    () =>
      templateWarnings(
        {
          category,
          isFinancial,
          needsReview: existing?.needsReview ?? false,
          status: existing?.status ?? 'draft',
          procedureCodes,
          currentVersion: existing?.currentVersion ?? 0,
          hasDraft: dirty || !!existing?.draftContent,
        },
        content,
      ),
    [category, isFinancial, existing, procedureCodes, content, dirty],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const touch = () => setDirty(true);

  const patchBlock = (id: string, patch: Partial<ConsentBlock>) => {
    setBlocks(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
    touch();
  };

  const duplicateBlock = (id: string) => {
    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === id);
      if (index < 0) return prev;
      const copy = { ...prev[index], id: newBlockId() };
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
    touch();
  };

  const deleteBlock = (id: string) => {
    setBlocks(prev =>
      prev
        .filter(b => b.id !== id)
        // A condition pointing at a deleted block would never show — drop it.
        .map(b => (b.condition?.blockId === id ? { ...b, condition: null } : b)),
    );
    touch();
  };

  const addBlock = (type: ConsentBlockType) => {
    setBlocks(prev => [...prev, makeBlock(type, type === 'signature' ? { role: 'patient', required: true } : {})]);
    touch();
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks(prev => {
      const oldIndex = prev.findIndex(b => b.id === active.id);
      const newIndex = prev.findIndex(b => b.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    touch();
  };

  /** Save the working copy. Returns the form (created on first save). */
  const saveDraft = async (silent = false): Promise<ConsentForm | null> => {
    try {
      if (existing) {
        await updateForm.mutateAsync({
          id: existing.id,
          name,
          category,
          procedureCodes,
          editableBy,
          hygienistMayComplete,
          isFinancial: category === 'financial',
          draftContent: content,
          audit: { action: 'form_edited' },
          entityName: name,
        });
        setDirty(false);
        if (!silent) toast({ title: 'Draft saved' });
        return existing;
      }
      const created = await createForm.mutateAsync({
        name,
        category,
        content,
        procedureCodes,
        isFinancial: category === 'financial',
        source: 'manual',
      });
      setDirty(false);
      if (!silent) toast({ title: 'Draft created' });
      navigate(`/consents/builder/${created.id}`, { replace: true });
      return created;
    } catch (err) {
      toast({ title: 'Could not save', description: String(err), variant: 'destructive' });
      return null;
    }
  };

  const publish = async () => {
    const form = await saveDraft(true);
    if (!form) return;
    try {
      const version = await publishForm.mutateAsync({
        form: { ...form, name },
        content,
        changeNotes: changeNotes.trim() || (form.currentVersion === 0 ? 'First published version.' : 'Revision.'),
      });
      setPublishOpen(false);
      setChangeNotes('');
      setDirty(false);
      toast({ title: `Published as version ${version}`, description: 'The prior version stays in history.' });
    } catch (err) {
      toast({ title: 'Could not publish', description: String(err), variant: 'destructive' });
    }
  };

  const blockingWarnings = warnings.filter(w => w.severity === 'warning');

  if (formId && isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (formId && !isLoading && !existing) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        This form no longer exists.{' '}
        <Link to="/consents/library" className="text-primary underline">Back to the library</Link>
      </div>
    );
  }

  const paletteGroups = ['Content', 'Fields', 'Signatures', 'Layout'] as const;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate('/consents/library')} aria-label="Back to library">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{existing ? name : 'Create Form'}</h1>
            <p className="text-xs text-muted-foreground">
              {existing
                ? existing.currentVersion > 0
                  ? `Published v${existing.currentVersion}${dirty || existing.draftContent ? ' · editing draft' : ''}`
                  : 'Draft — never published'
                : 'New form'}
              {existing?.isSample && ' · Sample — review before clinical use'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly && (
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />View only</Badge>
          )}
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-2 h-4 w-4" />Preview
          </Button>
          {existing && (
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="mr-2 h-4 w-4" />History
            </Button>
          )}
          {!readOnly && (
            <>
              <Button variant="outline" onClick={() => saveDraft()} disabled={updateForm.isPending || createForm.isPending}>
                <Save className="mr-2 h-4 w-4" />Save draft
              </Button>
              {can('publish') && (
                <Button onClick={() => setPublishOpen(true)}>
                  <Send className="mr-2 h-4 w-4" />Publish…
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Left: form settings + blocks */}
        <div className="space-y-4 min-w-0">
          <Card className="card-elevated">
            <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cb-name">Form name</Label>
                <Input id="cb-name" value={name} onChange={e => { setName(e.target.value); touch(); }} disabled={readOnly} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={v => { setCategory(v as FormCategory); touch(); }} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORM_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{FORM_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-codes">Connected procedures (CDT codes)</Label>
                <Input
                  id="cb-codes"
                  value={procedureCodesText}
                  onChange={e => { setProcedureCodesText(e.target.value); touch(); }}
                  placeholder="D7140, D7210"
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Who can edit this form</Label>
                <Select value={editableBy} onValueChange={v => { setEditableBy(v as 'managers' | 'everyone'); touch(); }} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="managers">Managers and doctors</SelectItem>
                    <SelectItem value="everyone">Whole team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
                <span className="text-sm">
                  <span className="font-medium">Hygienist may complete without a doctor signature</span>
                  <span className="block text-xs text-muted-foreground">
                    Office rule for this form (e.g. SRP or sonic instrumentation consents).
                  </span>
                </span>
                <Switch checked={hygienistMayComplete} onCheckedChange={v => { setHygienistMayComplete(v); touch(); }} disabled={readOnly} />
              </label>
            </CardContent>
          </Card>

          {blockingWarnings.length > 0 && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="space-y-1 p-3">
                {blockingWarnings.map(w => (
                  <p key={w.code} className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Form content</h2>
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm"><Plus className="mr-1.5 h-4 w-4" />Add block</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
                  {paletteGroups.map((group, gi) => (
                    <div key={group}>
                      {gi > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-xs text-muted-foreground">{group}</DropdownMenuLabel>
                      {BLOCK_TYPES.filter(b => b.group === group).map(meta => (
                        <DropdownMenuItem key={meta.type} onClick={() => addBlock(meta.type)}>
                          {meta.label}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {blocks.map((block, index) => (
                  <BlockEditor
                    key={block.id}
                    block={block}
                    conditionSources={blocks.slice(0, index).filter(b => CONDITION_SOURCES.has(b.type))}
                    onChange={patch => patchBlock(block.id, patch)}
                    onDuplicate={() => duplicateBlock(block.id)}
                    onDelete={() => deleteBlock(block.id)}
                    disabled={readOnly}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Right: AI help (desktop) */}
        <div className="space-y-4">
          {!readOnly && (
            <AiAssistPanel
              content={content}
              publishedText={existing?.publishedContent ? contentToPlainText(existing.publishedContent) : null}
              onApplyToBlock={(blockId, text) => patchBlock(blockId, { body: text })}
            />
          )}
          <Card className="card-elevated">
            <CardContent className="p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground text-sm">Master layout</p>
              <p>
                Every form prints on the same professional letterhead: office logo and identity,
                the form title, brand-ruled section headings, unsplittable signature areas, and a
                footer with the version date and page numbers.
              </p>
              <p>Add a <strong>Page Break</strong> block to control where a new page starts; the preview shows exactly what prints.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish {existing && existing.currentVersion > 0 ? `version ${existing.currentVersion + 1}` : 'version 1'}</DialogTitle>
            <DialogDescription>
              The current published version is kept in history and can be restored any time.
            </DialogDescription>
          </DialogHeader>
          {blockingWarnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-warning/50 bg-warning/5 p-3">
              {blockingWarnings.map(w => (
                <p key={w.code} className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w.message}
                </p>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cb-notes">Change notes</Label>
            <Textarea
              id="cb-notes"
              value={changeNotes}
              onChange={e => setChangeNotes(e.target.value)}
              placeholder="What changed and why"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancel</Button>
            <Button onClick={publish} disabled={publishForm.isPending}>
              {publishForm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {existing && (
        <VersionHistoryDialog form={existing} open={historyOpen} onOpenChange={setHistoryOpen} />
      )}

      <ConsentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={name}
        description="Print preview — exactly what the printed page will look like."
        branding={branding}
        printLabel="Print blank copy"
        canPrint={can('print')}
        sheet={
          <ConsentPrintSheet
            form={{
              id: existing?.id ?? 'new',
              name,
              isSample: existing?.isSample ?? false,
              isFinancial,
              currentVersion: existing?.currentVersion ?? 0,
            }}
            content={content}
            branding={branding}
            fill={null}
            versionDate={existing?.updatedAt ?? null}
          />
        }
      />
    </div>
  );
}
