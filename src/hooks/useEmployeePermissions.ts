import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { PermissionKey } from '@/lib/permissions';

// Per-employee permission grants. A grant is a row; revoking deletes it.
// RLS is the enforcement: these hooks only read state and submit changes the
// policies will accept or reject (owner always; managers when delegated).

export type EmployeePermissionRow = {
  id: string;
  employee_id: string;
  permission: PermissionKey | string;
};

/** Every grant in the org, keyed by employee — the settings grid's data. */
export function useOrgPermissionGrants() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['employee-permissions', ctx?.org_id],
    enabled: !!ctx && (ctx.role === 'owner' || ctx.role === 'manager'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_permissions')
        .select('id, employee_id, permission')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      const byEmployee = new Map<string, Set<string>>();
      for (const row of (data ?? []) as EmployeePermissionRow[]) {
        const set = byEmployee.get(row.employee_id) ?? new Set<string>();
        set.add(row.permission);
        byEmployee.set(row.employee_id, set);
      }
      return byEmployee;
    },
  });
}

/** The signed-in person's own grants — UI gating only; RLS is the enforcement. */
export function useMyPermissionGrants(): ReadonlySet<string> {
  const { data: ctx } = useOrgContext();
  const { data } = useQuery({
    queryKey: ['my-permission-grants', ctx?.org_id, ctx?.employee_id],
    enabled: !!ctx,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_permissions')
        .select('permission')
        .eq('org_id', ctx!.org_id)
        .eq('employee_id', ctx!.employee_id);
      if (error) throw error;
      return (data ?? []).map(r => r.permission as string);
    },
  });
  return new Set(data ?? []);
}

export function useGrantPermission() {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; permission: PermissionKey }) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      const { error } = await supabase.from('employee_permissions').insert({
        org_id: ctx.org_id,
        employee_id: input.employeeId,
        permission: input.permission,
        granted_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-permissions'] });
      qc.invalidateQueries({ queryKey: ['my-permission-grants'] });
    },
  });
}

export function useRevokePermission() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; permission: PermissionKey }) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('employee_permissions')
        .delete()
        .eq('org_id', ctx.org_id)
        .eq('employee_id', input.employeeId)
        .eq('permission', input.permission);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-permissions'] });
      qc.invalidateQueries({ queryKey: ['my-permission-grants'] });
    },
  });
}

/** The owner's delegation switch: may managers edit the grants? */
export function usePermissionDelegation() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['permission-delegation', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_permission_delegation')
        .select('managers_can_manage')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return { managersCanManage: data?.managers_can_manage ?? false };
    },
  });
}

export function useSetPermissionDelegation() {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (managersCanManage: boolean) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      const { error } = await supabase.from('org_permission_delegation').upsert(
        {
          org_id: ctx.org_id,
          managers_can_manage: managersCanManage,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permission-delegation'] }),
  });
}
