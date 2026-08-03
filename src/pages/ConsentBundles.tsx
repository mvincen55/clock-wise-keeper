import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Layers, Plus, GripVertical, Pencil, Copy, Archive, ArchiveRestore,
  AlertTriangle, Trash2, ArrowUp, ArrowDown, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useConsentForms } from '@/hooks/useConsentForms';
import {
  useArchiveConsentBundle, useConsentBundles, useDuplicateConsentBundle,
  useReorderConsentBundles, useSaveConsentBundle, type BundleItemInput,
} from '@/hooks/useConsentBundles';
import { useConsentPermissions } from '@/hooks/useConsentSettings';
import { bundleWarnings } from '@/lib/consents/validation';
import {
  REQUIREMENT_LABELS, categoryLabel,
  type BundleItemRequirement, type ConsentBundle, type ConsentForm,
} from '@/lib/consents/types';

/**
 * Treatment Bundles: the forms each treatment travels with, in default
 * print order, with required / recommended / optional / conditional rules.
 * Bundles drive Step 2 of the Complete Forms workflow.
 */

interface EditorItem extends BundleItemInput {
  key: string;
}

function BundleRow({
  bundle,
  formsById,
  canEdit,
  onEdit,
  onDuplicate,
  onArchive,
}: {
  bundle: ConsentBundle;
  formsById: Map<string, ConsentForm>;
  canEdit: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: (archive: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bundle.id,
    disabled: !canEdit || bundle.status === 'archived',
  });
  const warnings = bundleWarnings(bundle, formsById);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
    >
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-start gap-2">
            {canEdit && bundle.status === 'active' && (
              <button
                className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground"
                aria-label="Drag to reorder bundles"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{bundle.name}</p>
                {bundle.isSample && <Badge variant="outline">Sample</Badge>}
                {bundle.status === 'archived' && <Badge variant="outline">Archived</Badge>}
                {bundle.useCount > 0 && (
                  <span className="text-xs text-muted-foreground">Used {bundle.useCount}×</span>
                )}
              </div>
              {bundle.description && (
                <p className="text-sm text-muted-foreground">{bundle.description}</p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {bundle.items.map(item => {
                  const form = formsById.get(item.formId);
                  return (
                    <Badge
                      key={item.id}
                      variant={item.requirement === 'required' ? 'default' : 'secondary'}
                      className="font-normal"
                    >
                      {form?.name ?? 'Missing form'}
                      <span className="ml-1 opacity-70">
                        · {item.requirement === 'conditional' && item.conditionLabel
                          ? `if: ${item.conditionLabel}`
                          : REQUIREMENT_LABELS[item.requirement].toLowerCase()}
                      </span>
                    </Badge>
                  );
                })}
                {bundle.items.length === 0 && (
                  <span className="text-xs text-muted-foreground">No forms yet.</span>
                )}
              </div>
              {warnings.map((w, i) => (
                <p key={i} className="mt-1 flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w.message}
                </p>
              ))}
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1">
                {bundle.status === 'active' && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Edit bundle">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} aria-label="Duplicate bundle">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onArchive(bundle.status === 'active')}
                  aria-label={bundle.status === 'active' ? 'Archive bundle' : 'Restore bundle'}
                >
                  {bundle.status === 'active' ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConsentBundles() {
  const { toast } = useToast();
  const { data: bundles = [], isLoading } = useConsentBundles();
  const { data: forms = [] } = useConsentForms();
  const { can } = useConsentPermissions();
  const saveBundle = useSaveConsentBundle();
  const duplicateBundle = useDuplicateConsentBundle();
  const archiveBundle = useArchiveConsentBundle();
  const reorderBundles = useReorderConsentBundles();

  const canEdit = can('createBundles');
  const formsById = useMemo(() => new Map(forms.map(f => [f.id, f])), [forms]);
  const selectableForms = useMemo(
    () => forms.filter(f => f.status !== 'archived').sort((a, b) => a.name.localeCompare(b.name)),
    [forms],
  );
  const active = bundles.filter(b => b.status === 'active');
  const archived = bundles.filter(b => b.status === 'archived');

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [codesText, setCodesText] = useState('');
  const [items, setItems] = useState<EditorItem[]>([]);
  const [addFormId, setAddFormId] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const openEditor = (bundle?: ConsentBundle) => {
    setEditingId(bundle?.id ?? null);
    setName(bundle?.name ?? '');
    setDescription(bundle?.description ?? '');
    setCodesText(bundle?.procedureCodes.join(', ') ?? '');
    setItems(
      (bundle?.items ?? []).map(item => ({
        key: item.id,
        formId: item.formId,
        requirement: item.requirement,
        conditionLabel: item.conditionLabel,
      })),
    );
    setAddFormId('');
    setEditorOpen(true);
  };

  const moveItem = (index: number, delta: number) => {
    setItems(prev => {
      const next = index + delta;
      if (next < 0 || next >= prev.length) return prev;
      return arrayMove(prev, index, next);
    });
  };

  const save = () => {
    if (!name.trim()) {
      toast({ title: 'Name the bundle first', variant: 'destructive' });
      return;
    }
    saveBundle.mutate(
      {
        id: editingId ?? undefined,
        name: name.trim(),
        description: description.trim(),
        procedureCodes: codesText.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean),
        items: items.map(({ formId, requirement, conditionLabel }) => ({ formId, requirement, conditionLabel })),
      },
      {
        onSuccess: () => {
          toast({ title: editingId ? 'Bundle updated' : 'Bundle created' });
          setEditorOpen(false);
        },
        onError: err => toast({ title: 'Could not save bundle', description: String(err), variant: 'destructive' }),
      },
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const ordered = arrayMove(
      active.map(b => b.id),
      active.findIndex(b => b.id === dragged.id),
      active.findIndex(b => b.id === over.id),
    );
    reorderBundles.mutate(ordered);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Treatment Bundles</h1>
          <p className="text-muted-foreground">
            The forms each treatment needs, in print order.{' '}
            <Link to="/consents" className="text-primary underline-offset-2 hover:underline">Forms &amp; Consents home</Link>
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => openEditor()}>
            <Plus className="mr-2 h-4 w-4" />New bundle
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading bundles…</p>}
      {!isLoading && bundles.length === 0 && (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Layers className="mx-auto mb-2 h-6 w-6" />
            No bundles yet. Create one, or install the sample library from the Forms &amp; Consents home.
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={active.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {active.map(bundle => (
              <BundleRow
                key={bundle.id}
                bundle={bundle}
                formsById={formsById}
                canEdit={canEdit}
                onEdit={() => openEditor(bundle)}
                onDuplicate={() =>
                  duplicateBundle.mutate(bundle, { onSuccess: () => toast({ title: 'Bundle duplicated' }) })
                }
                onArchive={archive =>
                  archiveBundle.mutate(
                    { bundle, archive },
                    { onSuccess: () => toast({ title: archive ? 'Bundle archived' : 'Bundle restored' }) },
                  )
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Archived</h2>
          {archived.map(bundle => (
            <BundleRow
              key={bundle.id}
              bundle={bundle}
              formsById={formsById}
              canEdit={canEdit}
              onEdit={() => openEditor(bundle)}
              onDuplicate={() => duplicateBundle.mutate(bundle)}
              onArchive={archive =>
                archiveBundle.mutate(
                  { bundle, archive },
                  { onSuccess: () => toast({ title: archive ? 'Bundle archived' : 'Bundle restored' }) },
                )
              }
            />
          ))}
        </section>
      )}

      {/* Bundle editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit bundle' : 'New bundle'}</DialogTitle>
            <DialogDescription>
              Required forms are locked into every packet; conditional forms ask their question first;
              optional forms are offered and easy to skip.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bundle-name">Bundle name</Label>
              <Input id="bundle-name" value={name} onChange={e => setName(e.target.value)} placeholder="Extraction Bundle" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bundle-codes">Procedure codes (for recommendations)</Label>
              <Input id="bundle-codes" value={codesText} onChange={e => setCodesText(e.target.value)} placeholder="D7140, D7210" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="bundle-desc">Description</Label>
              <Textarea id="bundle-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forms in this bundle (top prints first)</Label>
            {items.map((item, index) => {
              const form = formsById.get(item.formId);
              return (
                <div key={item.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Move up">
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveItem(index, 1)} disabled={index === items.length - 1} aria-label="Move down">
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {form?.name ?? 'Missing form'}
                    {form && <span className="ml-1 text-xs text-muted-foreground">· {categoryLabel(form.category)}</span>}
                  </span>
                  <Select
                    value={item.requirement}
                    onValueChange={v =>
                      setItems(prev => prev.map((it, i) => (i === index ? { ...it, requirement: v as BundleItemRequirement } : it)))
                    }
                  >
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(REQUIREMENT_LABELS) as BundleItemRequirement[]).map(r => (
                        <SelectItem key={r} value={r}>{REQUIREMENT_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {item.requirement === 'conditional' && (
                    <Input
                      value={item.conditionLabel ?? ''}
                      onChange={e =>
                        setItems(prev => prev.map((it, i) => (i === index ? { ...it, conditionLabel: e.target.value } : it)))
                      }
                      placeholder="Question, e.g. Bone graft planned?"
                      className="h-8 w-full sm:w-60"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setItems(prev => prev.filter((_, i) => i !== index))}
                    aria-label="Remove form from bundle"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}

            <div className="flex gap-2">
              <Select value={addFormId} onValueChange={setAddFormId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Add a form…" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {selectableForms
                    .filter(f => !items.some(i => i.formId === f.id))
                    .map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} · {categoryLabel(f.category)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => {
                  if (!addFormId) return;
                  setItems(prev => [...prev, { key: `new-${addFormId}`, formId: addFormId, requirement: 'required' }]);
                  setAddFormId('');
                }}
                disabled={!addFormId}
              >
                <Plus className="mr-1.5 h-4 w-4" />Add
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saveBundle.isPending}>
              {saveBundle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
