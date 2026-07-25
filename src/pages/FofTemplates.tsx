/**
 * FOF template management — de-identified configuration only (wording,
 * discounts, installment rules, practice header). No patient data lives
 * on this page or in these tables; see src/pages/FofBuilder.tsx for the
 * HIPAA boundary.
 */
import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import FofTemplateEditor from '@/components/fof/FofTemplateEditor';
import OrgBrandingCard from '@/components/OrgBrandingCard';
import FofMoneySettingsCard from '@/components/FofMoneySettingsCard';
import FofDiscountRulesCard from '@/components/FofDiscountRulesCard';
import FofVocabularyCard from '@/components/FofVocabularyCard';
import SettingsSection from '@/components/SettingsSection';
import { useFofSettings } from '@/hooks/useFofTemplates';
import {
  useDeleteFofTemplate,
  useFofTemplates,
  useRestoreDefaultFofTemplates,
  useUpsertFofTemplate,
  type FofTemplateUpsert,
} from '@/hooks/useFofTemplates';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { FofTemplate } from '@/lib/fof/types';

export default function FofTemplates() {
  const { data: templates, isLoading } = useFofTemplates();
  const { data: practice } = useFofSettings();
  const featureName = practice?.featureDisplayName?.trim() || 'Treatment Estimator';
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
          <h1 className="text-2xl font-bold">{featureName} Templates</h1>
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

      {/* Org settings, sectioned by the registry's onboarding groups. */}
      <SettingsSection groupId="identity_branding">
        <OrgBrandingCard isManager={isManager} />
      </SettingsSection>
      {isManager && (
        <SettingsSection groupId="documents_wording">
          <FofVocabularyCard />
        </SettingsSection>
      )}
      {isManager && (
        <SettingsSection groupId="money_thresholds">
          <FofMoneySettingsCard />
        </SettingsSection>
      )}
      {isManager && (
        <SettingsSection groupId="discounts_rules">
          <FofDiscountRulesCard />
        </SettingsSection>
      )}

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
