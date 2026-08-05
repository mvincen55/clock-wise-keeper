import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { normalizeStaffCode, isLegacyStaffCode } from '@/lib/staff-code';

export type OrgStaffMember = {
  employeeId: string;
  userId: string | null;
  displayName: string;
  code: string | null;
};

/**
 * Loads every employee in the current org with their canonical staff code
 * (`employees.tag`). This is the single source of truth other modules use to
 * attribute actions — no module should query tags or invent fallbacks itself.
 *
 * RLS: org members may read `employees`, so this works for owners, managers,
 * and team members.
 */
export function useOrgStaff() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-staff', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgStaffMember[]> => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, user_id, display_name, tag')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return (data ?? []).map((e) => ({
        employeeId: e.id,
        userId: e.user_id,
        displayName: e.display_name,
        code: e.tag ? normalizeStaffCode(e.tag) : null,
      }));
    },
  });
}

/** Map of authenticated user id → canonical staff code, for attribution display. */
export function useStaffCodeMap(): ReadonlyMap<string, string> {
  const { data: staff } = useOrgStaff();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const m of staff ?? []) {
      if (m.userId && m.code) map.set(m.userId, m.code);
    }
    return map;
  }, [staff]);
}

/** The current user's own canonical staff code (null when unassigned). */
export function useMyStaffCode(): { code: string | null; isLoading: boolean } {
  const { data: ctx } = useOrgContext();
  const { data: staff, isLoading } = useOrgStaff();
  const code = useMemo(() => {
    const mine = (staff ?? []).find((m) => m.userId && m.userId === ctx?.user_id);
    return mine?.code ?? null;
  }, [staff, ctx?.user_id]);
  return { code, isLoading };
}

/** Active-member employees whose code is missing or a legacy 2-char value. */
export function useStaffCodesNeedingAttention(): OrgStaffMember[] {
  const { data: staff } = useOrgStaff();
  return useMemo(
    () => (staff ?? []).filter((m) => m.userId && (!m.code || isLegacyStaffCode(m.code))),
    [staff],
  );
}
