import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  useSetCoverageWindow,
  useSetEmployeeRoles,
} from '@/hooks/useOperationalRoles';
import { isCoveringOn } from '@/hooks/useMyOperationalRoles';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import type { OperationalRole } from '@/lib/schedule-reader/types';

/**
 * Operational roles on the Team page: what a person actually DOES, separate
 * from their permission role. The inviting owner/manager sets them on the
 * invite; this editor is where owners/managers adjust them afterward.
 *
 * Two distinct ideas, kept visibly apart:
 *  - a BACKUP role is permanent capability ("can cover"), never dated;
 *  - COVERING TODAY is an explicit dated assignment a manager creates on
 *    purpose. Editing the role set never creates or destroys one by accident.
 */
export default function OperationalRolesEditor({ employeeId }: { employeeId: string }) {
  const { data: ctx } = useOrgContext();
  const { data: rolesByEmployee } = useOperationalRoles();
  const setRoles = useSetEmployeeRoles();
  const setCoverage = useSetCoverageWindow();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const today = getToday();

  const roles = rolesByEmployee?.get(employeeId) ?? [];
  const primary = roles.find(r => r.is_primary);
  const secondaries = roles.filter(r => !r.is_primary);

  const [open, setOpen] = useState(false);
  const [draftPrimary, setDraftPrimary] = useState<OperationalRole | null>(null);
  const [draftSecondary, setDraftSecondary] = useState<OperationalRole[]>([]);
  const [coverRole, setCoverRole] = useState<OperationalRole | null>(null);
  const [coverStart, setCoverStart] = useState('');
  const [coverEnd, setCoverEnd] = useState('');

  const startEdit = () => {
    setDraftPrimary((primary?.operational_role as OperationalRole) ?? null);
    setDraftSecondary(
      secondaries.map(r => r.operational_role as OperationalRole)
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

  const saveCoverage = async (clear = false) => {
    if (!coverRole) return;
    try {
      await setCoverage.mutateAsync({
        employeeId,
        role: coverRole,
        startsOn: clear ? null : coverStart || null,
        endsOn: clear ? null : coverEnd || null,
      });
      setCoverRole(null);
      setCoverStart('');
      setCoverEnd('');
      toast.success(clear ? 'Back to backup only' : 'Coverage window saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save coverage');
    }
  };

  if (!isManager && roles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <BriefcaseMedical className="h-3 w-3 text-primary" />
      {roles.length === 0 ? (
        <span className="text-muted-foreground">No operational role yet</span>
      ) : (
        <>
          {primary && (
            <Badge variant="secondary" className="text-[10px]">
              {ROLE_LABELS[primary.operational_role as OperationalRole] ?? primary.operational_role}
            </Badge>
          )}
          {secondaries.map(r => {
            const covering = isCoveringOn(r, today);
            return (
              <Badge key={r.id} variant="outline" className="text-[10px]">
                {covering ? 'Also covering today: ' : 'Backup: '}
                {ROLE_LABELS[r.operational_role as OperationalRole] ?? r.operational_role}
              </Badge>
            );
          })}
        </>
      )}

      {isManager && (
        <Popover open={open} onOpenChange={o => (o ? startEdit() : setOpen(false))}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]">
              Edit
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3" align="start">
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
              <p className="text-xs font-medium">Can cover (backup)</p>
              <p className="text-[10.5px] text-muted-foreground">
                Backup means qualified to help. It does not schedule anyone.
              </p>
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

            {secondaries.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium">Temporary coverage</p>
                <p className="text-[10.5px] text-muted-foreground">
                  Only a dated assignment shows as covering today.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {secondaries.map(r => {
                    const role = r.operational_role as OperationalRole;
                    return (
                      <Button
                        key={r.id}
                        type="button"
                        size="sm"
                        variant={coverRole === role ? 'default' : 'outline'}
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setCoverRole(role);
                          setCoverStart(r.starts_on ?? '');
                          setCoverEnd(r.ends_on ?? '');
                        }}
                      >
                        {ROLE_LABELS[role]}
                      </Button>
                    );
                  })}
                </div>
                {coverRole && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        aria-label="Coverage starts on"
                        value={coverStart}
                        onChange={e => setCoverStart(e.target.value)}
                        className="h-7 text-[11px]"
                      />
                      <Input
                        type="date"
                        aria-label="Coverage ends on"
                        value={coverEnd}
                        onChange={e => setCoverEnd(e.target.value)}
                        className="h-7 text-[11px]"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 text-[11px]"
                        disabled={setCoverage.isPending || !coverStart}
                        onClick={() => saveCoverage(false)}
                      >
                        Save coverage
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px]"
                        disabled={setCoverage.isPending}
                        onClick={() => saveCoverage(true)}
                      >
                        Backup only
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
