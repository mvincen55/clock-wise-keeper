import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { OperationalRole } from '@/lib/schedule-reader/types';
import { OPERATIONAL_ROLES } from '@/lib/schedule-reader/types';

// Operational roles: the WORK a person does (dentist, hygienist, front desk…),
// separate from the permission role (owner/manager/employee) that controls
// authorization. One person can hold several; an owner may also be a working
// dentist without ever clocking in. Members propose their own during
// onboarding; owners/managers confirm and manage from the Team page.

export type EmployeeOperationalRole = {
  id: string;
  employee_id: string;
  operational_role: OperationalRole;
  is_primary: boolean;
  confirmed_at: string | null;
  confirmed_by: string | null;
};

export const ROLE_LABELS: Record<OperationalRole, string> = {
  dentist: 'Dentist',
  hygienist: 'Hygienist',
  dental_assistant: 'Dental assistant',
  front_desk: 'Front desk',
  office_manager: 'Office manager',
  sterilization: 'Sterilization',
  floater: 'Floater',
  other: 'Other',
};

export { OPERATIONAL_ROLES };

/** Every operational role in the org, keyed by employee. */
export function useOperationalRoles() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['operational-roles', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_operational_roles')
        .select('id, employee_id, operational_role, is_primary, confirmed_at, confirmed_by')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      const byEmployee = new Map<string, EmployeeOperationalRole[]>();
      for (const row of (data ?? []) as EmployeeOperationalRole[]) {
        const list = byEmployee.get(row.employee_id) ?? [];
        list.push(row);
        byEmployee.set(row.employee_id, list);
      }
      return byEmployee;
    },
  });
}

/**
 * A member proposes their own roles (onboarding). Replaces any previous
 * unconfirmed self-proposals; confirmation stays with owners/managers.
 */
export function useProposeMyRoles() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { primary: OperationalRole; secondary: OperationalRole[] }) => {
      if (!user || !ctx) throw new Error('No office found for your account');
      const roles = [
        { role: input.primary, is_primary: true },
        ...input.secondary
          .filter(r => r !== input.primary)
          .map(r => ({ role: r, is_primary: false })),
      ];
      // Clear my own unconfirmed proposals first so re-running onboarding
      // doesn't stack duplicates. (Admins' confirmed rows are untouched.)
      await supabase
        .from('employee_operational_roles')
        .delete()
        .eq('org_id', ctx.org_id)
        .eq('employee_id', ctx.employee_id)
        .is('confirmed_at', null);

      const { error } = await supabase.from('employee_operational_roles').insert(
        roles.map(r => ({
          org_id: ctx.org_id,
          employee_id: ctx.employee_id,
          operational_role: r.role,
          is_primary: r.is_primary,
          created_by: user.id,
        }))
      );
      // Duplicate role already confirmed by a manager — that's fine.
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operational-roles'] }),
  });
}

/** Owner/manager: set (replace) an employee's roles and confirm them. */
export function useSetEmployeeRoles() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      employeeId: string;
      primary: OperationalRole | null;
      secondary: OperationalRole[];
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const now = new Date().toISOString();

      await supabase
        .from('employee_operational_roles')
        .delete()
        .eq('org_id', ctx.org_id)
        .eq('employee_id', input.employeeId);

      const roles = [
        ...(input.primary ? [{ role: input.primary, is_primary: true }] : []),
        ...input.secondary
          .filter(r => r !== input.primary)
          .map(r => ({ role: r, is_primary: false })),
      ];
      if (roles.length === 0) return;

      const { error } = await supabase.from('employee_operational_roles').insert(
        roles.map(r => ({
          org_id: ctx.org_id,
          employee_id: input.employeeId,
          operational_role: r.role,
          is_primary: r.is_primary,
          created_by: user.id,
          confirmed_by: user.id,
          confirmed_at: now,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operational-roles'] }),
  });
}

/** Owner/manager: confirm a member's self-proposed roles as-is. */
export function useConfirmEmployeeRoles() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (employeeId: string) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('employee_operational_roles')
        .update({ confirmed_by: user.id, confirmed_at: new Date().toISOString() })
        .eq('org_id', ctx.org_id)
        .eq('employee_id', employeeId)
        .is('confirmed_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operational-roles'] }),
  });
}
