import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, GraduationCap, Loader2, Plus, Settings2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import {
  useOnboardingInstances,
  useStartOnboarding,
  type OnboardingInstance,
} from '@/hooks/useOnboardingInstances';
import {
  useCanManageOnboarding,
  useOnboardingTemplates,
} from '@/hooks/useOnboardingTemplates';
import { formatDate } from '@/lib/time-utils';

/**
 * New-hire onboarding home. Managers/owners see every instance in the org
 * (owner pull-access: current state visible without hunting) and start new
 * ones; a team member lands on their own checklist. Content comes from the
 * office's own templates — see /new-hires/templates.
 */

/** items-complete counts per instance, from the completed_at stamps. */
function useProgressByInstance(instances: OnboardingInstance[] | undefined) {
  const { data: ctx } = useOrgContext();
  const ids = (instances ?? []).map(i => i.id);
  return useQuery({
    queryKey: ['onboarding-progress', ctx?.org_id, ids.join(',')],
    enabled: !!ctx && ids.length > 0,
    queryFn: async (): Promise<Map<string, { total: number; complete: number }>> => {
      const { data, error } = await supabase
        .from('onboarding_instance_items')
        .select('instance_id, completed_at')
        .in('instance_id', ids);
      if (error) throw error;
      const map = new Map<string, { total: number; complete: number }>();
      for (const row of data ?? []) {
        const p = map.get(row.instance_id) ?? { total: 0, complete: 0 };
        p.total += 1;
        if (row.completed_at) p.complete += 1;
        map.set(row.instance_id, p);
      }
      return map;
    },
  });
}

function InstanceRow({
  instance,
  who,
  progress,
}: {
  instance: OnboardingInstance;
  who: string;
  progress?: { total: number; complete: number };
}) {
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.complete / progress.total) * 100)
      : 0;
  return (
    <Link
      to={`/new-hires/${instance.id}`}
      className="block px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{who}</p>
          <p className="text-xs text-muted-foreground">
            {instance.template_name}
            {instance.role_label ? ` · ${instance.role_label}` : ''} · started{' '}
            {formatDate(instance.started_at.slice(0, 10))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {progress && (
            <span className="text-xs text-muted-foreground">
              {progress.complete} of {progress.total}
            </span>
          )}
          {instance.status === 'complete' ? (
            <Badge variant="secondary">Complete</Badge>
          ) : (
            <Badge variant="outline">In progress</Badge>
          )}
        </div>
      </div>
      <Progress value={pct} className="mt-2 h-1.5" />
    </Link>
  );
}

export default function NewHires() {
  const navigate = useNavigate();
  const { data: ctx } = useOrgContext();
  const canManage = useCanManageOnboarding();
  const { data: instances, isLoading } = useOnboardingInstances();
  const { data: templates } = useOnboardingTemplates();
  const { data: staff } = useOrgStaff();
  const progress = useProgressByInstance(instances);
  const start = useStartOnboarding();

  const [startOpen, setStartOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [templateId, setTemplateId] = useState('');

  const nameByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of staff ?? []) map.set(m.employeeId, m.displayName);
    return map;
  }, [staff]);

  const activeTemplates = (templates ?? []).filter(t => t.is_active);
  const activeStaff = (staff ?? []).filter(m => m.employmentStatus === 'active');

  const mine = (instances ?? []).filter(i => i.employee_id === ctx?.employee_id);
  const visible = canManage ? instances ?? [] : mine;

  const handleStart = () => {
    if (!employeeId || !templateId) return;
    start.mutate(
      { employeeId, templateId },
      {
        onSuccess: id => {
          toast.success('Onboarding started');
          setStartOpen(false);
          setEmployeeId('');
          setTemplateId('');
          navigate(`/new-hires/${id}`);
        },
        onError: e => toast.error(e instanceof Error ? e.message : 'Could not start it'),
      },
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">New-Hire Onboarding</h1>
          <p className="text-muted-foreground">
            {canManage
              ? 'Every onboarding in the office — each item signed off by trainer and new hire.'
              : 'Your onboarding checklist: you and your trainer sign each item off together.'}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Link to="/new-hires/templates">
              <Button variant="outline" size="sm">
                <Settings2 className="mr-2 h-4 w-4" />
                Templates
              </Button>
            </Link>
            <Button size="sm" onClick={() => setStartOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Start onboarding
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="card-elevated">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              {canManage ? (
                <ClipboardList className="h-5 w-5" />
              ) : (
                <GraduationCap className="h-5 w-5" />
              )}
              {canManage ? 'Onboarding in this office' : 'My onboarding'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground">
                {canManage
                  ? 'Nothing underway. Start a new hire from a template.'
                  : 'No onboarding checklist has been started for you.'}
              </p>
            ) : (
              <div className="divide-y">
                {visible.map(i => (
                  <InstanceRow
                    key={i.id}
                    instance={i}
                    who={nameByEmployee.get(i.employee_id) ?? 'Team member'}
                    progress={progress.data?.get(i.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start onboarding</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Team member</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick the new hire" />
                </SelectTrigger>
                <SelectContent>
                  {activeStaff.map(m => (
                    <SelectItem key={m.employeeId} value={m.employeeId}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick the checklist" />
                </SelectTrigger>
                <SelectContent>
                  {activeTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.role_label ? ` (${t.role_label})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeTemplates.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No active templates yet —{' '}
                  <Link to="/new-hires/templates" className="underline">
                    build one first
                  </Link>
                  .
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A copy of the template is taken now, so later edits never change this
              hire&apos;s record.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={!employeeId || !templateId || start.isPending}
            >
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
