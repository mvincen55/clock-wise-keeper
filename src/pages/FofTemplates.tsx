/**
 * FOF template management — de-identified configuration only (wording,
 * discounts, installment rules, practice header). No patient data lives
 * on this page or in these tables; see src/pages/FofBuilder.tsx for the
 * HIPAA boundary.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import FofTemplateEditor from '@/components/fof/FofTemplateEditor';
import {
  useDeleteFofTemplate,
  useFofSettings,
  useFofTemplates,
  useRestoreDefaultFofTemplates,
  useUpsertFofSettings,
  useUpsertFofTemplate,
  type FofTemplateUpsert,
} from '@/hooks/useFofTemplates';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { FofPracticeInfo, FofTemplate } from '@/lib/fof/types';

function HeaderSettingsCard({ isManager }: { isManager: boolean }) {
  const { data: settings, isLoading } = useFofSettings();
  const upsert = useUpsertFofSettings();
  const [form, setForm] = useState<FofPracticeInfo | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const set = (field: keyof FofPracticeInfo) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => (f ? { ...f, [field]: e.target.value } : f));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Form Header (Practice Info)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hdr-name">Practice Name</Label>
            <Input id="hdr-name" value={form.practiceName} onChange={set('practiceName')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hdr-phone">Phone</Label>
            <Input id="hdr-phone" value={form.phone} onChange={set('phone')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hdr-addr1">Address Line 1</Label>
            <Input id="hdr-addr1" value={form.addressLine1} onChange={set('addressLine1')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hdr-addr2">Address Line 2</Label>
            <Input id="hdr-addr2" value={form.addressLine2} onChange={set('addressLine2')} disabled={!isManager} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hdr-website">Website</Label>
            <Input id="hdr-website" value={form.website} onChange={set('website')} disabled={!isManager} />
          </div>
        </div>
        {isManager && (
          <div className="flex justify-end">
            <Button
              disabled={upsert.isPending}
              onClick={() =>
                upsert.mutate(form, {
                  onSuccess: () => toast.success('Practice info saved'),
                  onError: err => toast.error(`Save failed: ${err.message}`),
                })
              }
            >
              {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Header
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FofTemplates() {
  const { data: templates, isLoading } = useFofTemplates();
  const upsert = useUpsertFofTemplate();
  const remove = useDeleteFofTemplate();
  const restore = useRestoreDefaultFofTemplates();
  // Templates and practice info are admin-write (RLS enforced); employees
  // see the configuration read-only rather than getting failing controls.
  const { data: orgCtx } = useOrgContext();
  const isManager = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FofTemplate | null>(null);
  const [deleting, setDeleting] = useState<FofTemplate | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const openEditor = (template: FofTemplate | null) => {
    setEditing(template);
    setEditorOpen(true);
  };

  const handleSave = (template: FofTemplateUpsert) => {
    upsert.mutate(template, {
      onSuccess: () => {
        toast.success('Template saved');
        setEditorOpen(false);
      },
      onError: err => toast.error(`Save failed: ${err.message}`),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/fof"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">FOF Templates</h1>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirmRestore(true)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Restore Defaults
            </Button>
            <Button onClick={() => openEditor(null)}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        )}
      </div>

      <HeaderSettingsCard isManager={isManager} />

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {(templates ?? []).map(template => (
            <Card key={template.id}>
              <CardContent className="py-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-48">
                  <div className="font-medium">{template.name}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <Badge variant="secondary">{template.discountPercent}% discount</Badge>
                    {template.showInsuranceEstimate && <Badge variant="outline">insurance</Badge>}
                    {template.showPrepayOption && <Badge variant="outline">prepay</Badge>}
                    {template.showInstallmentOption && (
                      <Badge variant="outline">{template.installmentCount} installments</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`active-${template.id}`} className="text-sm text-muted-foreground">
                    Active
                  </Label>
                  <Switch
                    id={`active-${template.id}`}
                    checked={template.isActive}
                    disabled={!isManager}
                    onCheckedChange={isActive =>
                      upsert.mutate(
                        { ...template, isActive },
                        { onError: err => toast.error(`Update failed: ${err.message}`) }
                      )
                    }
                  />
                  {isManager && (
                    <>
                      <Button variant="ghost" size="icon" onClick={() => openEditor(template)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => setDeleting(template)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FofTemplateEditor
        open={editorOpen}
        template={editing}
        saving={upsert.isPending}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />

      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the template for everyone. Printed forms are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleting) {
                  remove.mutate(deleting.id, {
                    onSuccess: () => toast.success('Template deleted'),
                    onError: err => toast.error(`Delete failed: ${err.message}`),
                  });
                }
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore default templates?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes ALL current templates and replaces them with the
              factory defaults (Self-Pay, Out-of-Network Insurance, Financing).
              Any custom wording will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                restore.mutate(undefined, {
                  onSuccess: () => toast.success('Default templates restored'),
                  onError: err => toast.error(`Restore failed: ${err.message}`),
                })
              }
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
