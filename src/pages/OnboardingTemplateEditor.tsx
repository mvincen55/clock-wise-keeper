import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import OnboardingTemplatePrintSheet from '@/components/onboarding/OnboardingTemplatePrintSheet';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useAddItem,
  useAddSection,
  useCanManageOnboarding,
  useDeleteItem,
  useDeleteSection,
  useDeleteTemplate,
  useOnboardingTemplate,
  useReorder,
  useUpdateItem,
  useUpdateSection,
  useUpdateTemplate,
} from '@/hooks/useOnboardingTemplates';
import { inDisplayOrder } from '@/lib/onboarding-order';

/**
 * Onboarding template editor — typed authoring only (AI parse-a-document is
 * a documented future item). Sections and items with sort-order reordering;
 * a Print button renders the blank checklist on the office letterhead.
 */
export default function OnboardingTemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { data: ctx } = useOrgContext();
  const canManage = useCanManageOnboarding();
  const { data: detail, isLoading } = useOnboardingTemplate(templateId);
  const { data: branding } = useOrgBranding();

  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const addSection = useAddSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const addItem = useAddItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const reorderSection = useReorder('section');
  const reorderItem = useReorder('item');

  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [itemDialog, setItemDialog] = useState<{
    sectionId: string;
    itemId?: string;
    title: string;
    detail: string;
  } | null>(null);

  const sections = useMemo(
    () => inDisplayOrder(detail?.sections ?? []),
    [detail?.sections],
  );
  const itemsBySection = useMemo(() => {
    const map = new Map<string, NonNullable<typeof detail>['items']>();
    for (const item of detail?.items ?? []) {
      map.set(item.section_id, [...(map.get(item.section_id) ?? []), item]);
    }
    for (const [k, v] of map) map.set(k, inDisplayOrder(v));
    return map;
  }, [detail?.items]);

  const printSections = useMemo(
    () =>
      sections.map(s => ({
        id: s.id,
        title: s.title,
        items: (itemsBySection.get(s.id) ?? []).map(i => ({
          id: i.id,
          title: i.title,
          detail: i.detail,
        })),
      })),
    [sections, itemsBySection],
  );

  if (ctx && !canManage) return <Navigate to="/" replace />;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Template not found.</p>
        <Link to="/new-hires/templates">
          <Button variant="outline" className="mt-4">
            Back to templates
          </Button>
        </Link>
      </div>
    );
  }

  const tpl = detail.template;

  const saveItemDialog = () => {
    if (!itemDialog || !itemDialog.title.trim()) return;
    const onDone = {
      onSuccess: () => setItemDialog(null),
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Could not save the item'),
    };
    if (itemDialog.itemId) {
      updateItem.mutate(
        {
          itemId: itemDialog.itemId,
          templateId: tpl.id,
          patch: { title: itemDialog.title.trim(), detail: itemDialog.detail.trim() },
        },
        onDone,
      );
    } else {
      addItem.mutate(
        {
          templateId: tpl.id,
          sectionId: itemDialog.sectionId,
          title: itemDialog.title,
          detail: itemDialog.detail,
          sortOrder: (itemsBySection.get(itemDialog.sectionId) ?? []).length,
        },
        onDone,
      );
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/new-hires/templates">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{tpl.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            {tpl.role_label && <Badge variant="secondary">{tpl.role_label}</Badge>}
            {!tpl.is_active && <Badge variant="outline">Inactive</Badge>}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setName(tpl.name);
            setRoleLabel(tpl.role_label);
            setRenameOpen(true);
          }}
        >
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print blank
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Active templates can be picked when starting a new hire. Editing here never
          changes an onboarding already underway — each hire gets a copy taken at start.
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor="tpl-active" className="text-xs">
            Active
          </Label>
          <Switch
            id="tpl-active"
            checked={tpl.is_active}
            onCheckedChange={v =>
              updateTemplate.mutate({ templateId: tpl.id, patch: { is_active: v } })
            }
          />
        </div>
      </div>

      {sections.map((section, sIndex) => {
        const items = itemsBySection.get(section.id) ?? [];
        return (
          <Card key={section.id} className="card-elevated">
            <CardHeader className="border-b py-3">
              <div className="flex items-center gap-2">
                <CardTitle className="flex-1 text-base">{section.title}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Move section up"
                  disabled={sIndex === 0}
                  onClick={() =>
                    reorderSection.mutate({
                      templateId: tpl.id,
                      rows: sections,
                      id: section.id,
                      direction: 'up',
                    })
                  }
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Move section down"
                  disabled={sIndex === sections.length - 1}
                  onClick={() =>
                    reorderSection.mutate({
                      templateId: tpl.id,
                      rows: sections,
                      id: section.id,
                      direction: 'down',
                    })
                  }
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Rename section"
                  onClick={() => {
                    const title = window.prompt('Section title', section.title);
                    if (title?.trim() && title.trim() !== section.title) {
                      updateSection.mutate({
                        sectionId: section.id,
                        templateId: tpl.id,
                        patch: { title: title.trim() },
                      });
                    }
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete section and its items"
                  onClick={() => {
                    if (window.confirm(`Delete “${section.title}” and its items?`)) {
                      deleteSection.mutate({ sectionId: section.id, templateId: tpl.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">No items yet.</p>
              )}
              <div className="divide-y">
                {items.map((item, iIndex) => (
                  <div key={item.id} className="flex items-start gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Move item up"
                      disabled={iIndex === 0}
                      onClick={() =>
                        reorderItem.mutate({
                          templateId: tpl.id,
                          rows: items,
                          id: item.id,
                          direction: 'up',
                        })
                      }
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Move item down"
                      disabled={iIndex === items.length - 1}
                      onClick={() =>
                        reorderItem.mutate({
                          templateId: tpl.id,
                          rows: items,
                          id: item.id,
                          direction: 'down',
                        })
                      }
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Edit item"
                      onClick={() =>
                        setItemDialog({
                          sectionId: section.id,
                          itemId: item.id,
                          title: item.title,
                          detail: item.detail,
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Delete item"
                      onClick={() => deleteItem.mutate({ itemId: item.id, templateId: tpl.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItemDialog({ sectionId: section.id, title: '', detail: '' })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add item
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="card-elevated">
        <CardContent className="flex items-center gap-2 p-4">
          <Input
            value={newSectionTitle}
            onChange={e => setNewSectionTitle(e.target.value)}
            placeholder="New section title (e.g. Systems & Tools)"
            onKeyDown={e => {
              if (e.key === 'Enter' && newSectionTitle.trim()) {
                addSection.mutate(
                  {
                    templateId: tpl.id,
                    title: newSectionTitle,
                    sortOrder: sections.length,
                  },
                  { onSuccess: () => setNewSectionTitle('') },
                );
              }
            }}
          />
          <Button
            disabled={!newSectionTitle.trim() || addSection.isPending}
            onClick={() =>
              addSection.mutate(
                { templateId: tpl.id, title: newSectionTitle, sortOrder: sections.length },
                { onSuccess: () => setNewSectionTitle('') },
              )
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Add section
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete template
        </Button>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-tpl-name">Template name</Label>
              <Input id="edit-tpl-name" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-tpl-role">Role label</Label>
              <Input
                id="edit-tpl-role"
                value={roleLabel}
                onChange={e => setRoleLabel(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || updateTemplate.isPending}
              onClick={() =>
                updateTemplate.mutate(
                  {
                    templateId: tpl.id,
                    patch: { name: name.trim(), role_label: roleLabel.trim() },
                  },
                  { onSuccess: () => setRenameOpen(false) },
                )
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item add/edit dialog */}
      <Dialog open={!!itemDialog} onOpenChange={o => !o && setItemDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{itemDialog?.itemId ? 'Edit item' : 'Add item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="item-title">What the new hire learns or completes</Label>
              <Input
                id="item-title"
                value={itemDialog?.title ?? ''}
                onChange={e =>
                  setItemDialog(d => (d ? { ...d, title: e.target.value } : d))
                }
              />
            </div>
            <div>
              <Label htmlFor="item-detail">Detail (optional sub-note)</Label>
              <Textarea
                id="item-detail"
                rows={2}
                value={itemDialog?.detail ?? ''}
                onChange={e =>
                  setItemDialog(d => (d ? { ...d, detail: e.target.value } : d))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveItemDialog} disabled={!itemDialog?.title.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete template confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{tpl.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Onboarding already started from it keeps its own copy — history is never
              rewritten — but this template disappears from the library for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTemplate.mutate(
                  { templateId: tpl.id },
                  {
                    onSuccess: () => {
                      toast.success('Template deleted');
                      navigate('/new-hires/templates');
                    },
                  },
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print-only: the blank checklist on the office letterhead. */}
      {branding &&
        createPortal(
          <div className="onboarding-print-root">
            <BrandPrintStyle branding={branding} />
            <OnboardingTemplatePrintSheet
              templateName={tpl.name}
              roleLabel={tpl.role_label}
              sections={printSections}
              branding={branding}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
