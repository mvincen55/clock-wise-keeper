import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import {
  useGrantPermission, useOrgPermissionGrants, usePermissionDelegation, useRevokePermission,
  useSetPermissionDelegation,
} from '@/hooks/useEmployeePermissions';
import { PERMISSION_DEFS, type PermissionKey } from '@/lib/permissions';

/**
 * Per-employee permissions, chosen by the owner.
 *
 * Each grant unlocks one named capability for one person and is enforced in
 * RLS — this card is a control panel, never the enforcement. Managers see the
 * grid read-only unless the owner flips the delegation switch; the switch
 * itself is owner-only (backed by an owner-only write policy).
 */
export default function EmployeePermissionsCard() {
  const { toast } = useToast();
  const { data: ctx } = useOrgContext();
  const isOwner = ctx?.role === 'owner';
  const { data: employees, isLoading: employeesLoading } = useOrgEmployees();
  const { data: grants } = useOrgPermissionGrants();
  const { data: delegation } = usePermissionDelegation();
  const grant = useGrantPermission();
  const revoke = useRevokePermission();
  const setDelegation = useSetPermissionDelegation();

  const canEdit = isOwner || (delegation?.managersCanManage ?? false);

  const onToggle = (employeeId: string, permission: PermissionKey, next: boolean) => {
    const action = next ? grant : revoke;
    action.mutate(
      { employeeId, permission },
      {
        onError: (err: Error) =>
          toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
      }
    );
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Employee Permissions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Grant specific capabilities to specific people. Owners and managers already have every
          capability — grants matter for team members. Each grant is enforced by the database,
          not just hidden buttons.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-5">
        {isOwner && (
          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm">
              <span className="font-medium">Managers can manage these permissions</span>
              <span className="block text-xs text-muted-foreground">
                Off: only you change grants. On: managers can grant and revoke too. Only the
                owner can change this switch.
              </span>
            </span>
            <Switch
              checked={delegation?.managersCanManage ?? false}
              onCheckedChange={v =>
                setDelegation.mutate(v, {
                  onError: (err: Error) =>
                    toast({ title: 'Could not save', description: err.message, variant: 'destructive' }),
                })
              }
            />
          </label>
        )}

        {!canEdit && (
          <p className="rounded-md border border-muted bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Read-only: the owner has not delegated permission management to managers.
          </p>
        )}

        {employeesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !employees?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active team members yet — grants appear here once people join.
          </p>
        ) : (
          <div className="space-y-4">
            {employees.map(emp => {
              const set = grants?.get(emp.id);
              return (
                <div key={emp.id} className="rounded-lg border p-3">
                  <p className="text-sm font-semibold">{emp.display_name}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {PERMISSION_DEFS.map(def => (
                      <label
                        key={def.key}
                        className="flex items-start justify-between gap-2 rounded-md p-2 hover:bg-muted/50"
                        title={`${def.description} Enforced at: ${def.enforcedAt}.`}
                      >
                        <span className="text-xs leading-snug">
                          <Label className="text-xs font-medium">{def.label}</Label>
                          <span className="block text-[11px] text-muted-foreground">
                            {def.description}
                          </span>
                        </span>
                        <Switch
                          checked={set?.has(def.key) ?? false}
                          disabled={!canEdit}
                          onCheckedChange={v => onToggle(emp.id, def.key, v)}
                          aria-label={`${def.label} for ${emp.display_name}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
