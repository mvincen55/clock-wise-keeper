import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ClipboardList, Copy, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useCanManageOnboarding,
  useCreateTemplate,
  useDuplicateTemplate,
  useOnboardingTemplates,
  useSeedStarterTemplate,
} from '@/hooks/useOnboardingTemplates';

/**
 * Onboarding template library — owner/manager (and delegated) home for
 * per-role new-hire checklists. First visit to an empty library seeds ONE
 * generic dental front-desk starter; everything after that is the office's
 * own content. Duplicating an existing template is the intended starting
 * point for the next role.
 */
export default function OnboardingTemplates() {
  const { data: ctx } = useOrgContext();
  const canManage = useCanManageOnboarding();
  const { data: templates, isLoading } = useOnboardingTemplates();
  const create = useCreateTemplate();
  const duplicate = useDuplicateTemplate();
  const seed = useSeedStarterTemplate();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const seedTried = useRef(false);

  // Seed-on-first-visit, once per mount, only into an empty library.
  useEffect(() => {
    if (!canManage || isLoading || seedTried.current) return;
    if ((templates ?? []).length > 0) return;
    seedTried.current = true;
    seed.mutate(undefined, {
      onSuccess: added => {
        if (added) toast.success('Added a generic front-desk starter template');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, isLoading, templates]);

  if (ctx && !canManage) return <Navigate to="/" replace />;

  const handleCreate = () => {
    if (!name.trim()) return;
    create.mutate(
      { name, roleLabel },
      {
        onSuccess: () => {
          toast.success('Template created');
          setCreateOpen(false);
          setName('');
          setRoleLabel('');
        },
        onError: e => toast.error(e instanceof Error ? e.message : 'Could not create it'),
      },
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Onboarding Templates</h1>
          <p className="text-muted-foreground">
            Per-role checklists of everything a new team member learns — each item
            signed off by the trainer and the new hire.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="card-elevated">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Templates
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!templates?.length ? (
              <p className="p-6 text-center text-muted-foreground">
                No templates yet. Create one, or wait a moment for the starter to appear.
              </p>
            ) : (
              <div className="divide-y">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <Link to={`/new-hires/templates/${t.id}`} className="min-w-0 flex-1 group">
                      <p className="font-medium group-hover:underline">{t.name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {t.role_label && <Badge variant="secondary">{t.role_label}</Badge>}
                        {!t.is_active && <Badge variant="outline">Inactive</Badge>}
                      </div>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicate as the starting point for another role"
                      onClick={() =>
                        duplicate.mutate(
                          { templateId: t.id },
                          {
                            onSuccess: () => toast.success(`Duplicated “${t.name}”`),
                            onError: e =>
                              toast.error(e instanceof Error ? e.message : 'Could not duplicate'),
                          },
                        )
                      }
                      disabled={duplicate.isPending}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New onboarding template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Front Desk Onboarding"
              />
            </div>
            <div>
              <Label htmlFor="tpl-role">Role label (your office&apos;s wording)</Label>
              <Input
                id="tpl-role"
                value={roleLabel}
                onChange={e => setRoleLabel(e.target.value)}
                placeholder="e.g. Front Desk"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
