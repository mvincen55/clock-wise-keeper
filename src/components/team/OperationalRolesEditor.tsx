import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { BriefcaseMedical, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  OPERATIONAL_ROLES,
  ROLE_LABELS,
  useOperationalRoles,
  useSetEmployeeRoles,
} from '@/hooks/useOperationalRoles';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { OperationalRole } from '@/lib/schedule-reader/types';

/**
 * Operational roles on the Team page: what a person actually DOES, separate
 * from their permission role. The inviting owner/manager sets them on the
 * invite; this editor is where owners/managers adjust them afterward.
 */
export default function OperationalRolesEditor({ employeeId }: { employeeId: string }) {
  const { data: ctx } = useOrgContext();
  const { data: rolesByEmployee } = useOperationalRoles();
  const setRoles = useSetEmployeeRoles();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const roles = rolesByEmployee?.get(employeeId) ?? [];
  const primary = roles.find(r => r.is_primary);

  const [open, setOpen] = useState(false);
  const [draftPrimary, setDraftPrimary] = useState<OperationalRole | null>(null);
  const [draftSecondary, setDraftSecondary] = useState<OperationalRole[]>([]);

  const startEdit = () => {
    setDraftPrimary((primary?.operational_role as OperationalRole) ?? null);
    setDraftSecondary(
      roles.filter(r => !r.is_primary).map(r => r.operational_role as OperationalRole)
    );
    setOpen(true);
  };

  const saveDraft = async () => {
    try {
      await setRoles.mutateAsync({
        employeeId,
        primary: draftPrimary,
        secondary: draftSecondary,
      });
      setOpen(false);
      toast.success('Roles updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save roles');
    }
  };

  if (!isManager && roles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <BriefcaseMedical className="h-3 w-3 text-primary" />
      {roles.length === 0 ? (
        <span className="text-muted-foreground">No operational role yet</span>
      ) : (
        roles.map(r => (
          <Badge
            key={r.id}
            variant={r.is_primary ? 'secondary' : 'outline'}
            className="text-[10px]"
          >
            {ROLE_LABELS[r.operational_role as OperationalRole] ?? r.operational_role}
          </Badge>
        ))
      )}

      {isManager && (
        <Popover open={open} onOpenChange={o => (o ? startEdit() : setOpen(false))}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
              Edit
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3" align="start">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Primary role</p>
              <div className="grid grid-cols-2 gap-1.5">
                {OPERATIONAL_ROLES.map(role => (
                  <Button
                    key={role}
                    type="button"
                    size="sm"
                    variant={draftPrimary === role ? 'default' : 'outline'}
                    className="h-7 justify-start text-[11px]"
                    onClick={() => {
                      setDraftPrimary(role);
                      setDraftSecondary(list => list.filter(r => r !== role));
                    }}
                  >
                    {ROLE_LABELS[role]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Also covers</p>
              <div className="grid grid-cols-2 gap-1.5">
                {OPERATIONAL_ROLES.filter(r => r !== draftPrimary).map(role => (
                  <Button
                    key={role}
                    type="button"
                    size="sm"
                    variant={draftSecondary.includes(role) ? 'secondary' : 'outline'}
                    className="h-7 justify-start text-[11px]"
                    onClick={() =>
                      setDraftSecondary(list =>
                        list.includes(role)
                          ? list.filter(r => r !== role)
                          : [...list, role]
                      )
                    }
                  >
                    {draftSecondary.includes(role) && <Check className="mr-1 h-3 w-3" />}
                    {ROLE_LABELS[role]}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={saveDraft}
              disabled={setRoles.isPending}
            >
              {setRoles.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Save roles
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
