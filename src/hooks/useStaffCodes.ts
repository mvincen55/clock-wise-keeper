import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { normalizeStaffCode, isLegacyStaffCode } from '@/lib/staff-code';

/**
 * How an employee record relates to current auditable activity:
 * - `active`   — active employment + a linked login: performs auditable actions.
 * - `loginless`— roster record with no login (cannot act).
 * - `inactive` — archived/inactive employment.
 * - `former`   — terminated.
 * Only `active` members need a staff code for current attribution.
 */
export type StaffKind = 'active' | 'loginless' | 'inactive' | 'former';

export type OrgStaffMember = {
  employeeId: string;
  userId: string | null;
  displayName: string;
  code: string | null;
  employmentStatus: string;
  kind: StaffKind;
  /** True only for employees who currently perform auditable actions. */
  isActiveActor: boolean;
};

function classify(employmentStatus: string, userId: string | null): StaffKind {
  if (employmentStatus === 'terminated') return 'former';
  if (employmentStatus !== 'active') return 'inactive';
  if (!userId) return 'loginless';
  return 'active';
}

/**
 * Loads every employee in the current org with their canonical staff code
 * (`employees.tag`) and an accurate activity classification. This is the single
 * source of truth other modules use to attribute actions — no module should
 * query tags or invent fallbacks itself.
 *
 * We classify by `employees.employment_status` (the app's active-roster signal,
 * also used by `useOrgEmployees`) combined with login linkage — never by
 * `user_id !== null` alone. RLS: org members may read `employees`.
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
        .select('id, user_id, display_name, tag, employment_status')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return (data ?? []).map((e) => {
        const kind = classify(e.employment_status, e.user_id);
        return {
          employeeId: e.id,
          userId: e.user_id,
          displayName: e.display_name,
          code: e.tag ? normalizeStaffCode(e.tag) : null,
          employmentStatus: e.employment_status,
          kind,
          isActiveActor: kind === 'active',
        };
      });
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

/**
 * Active auditable actors whose code is missing or a legacy 2-char value —
 * i.e. exactly the population that needs a manager to assign/update a code.
 * Loginless, inactive, and former employees are intentionally excluded.
 */
export function useStaffCodesNeedingAttention(): OrgStaffMember[] {
  const { data: staff } = useOrgStaff();
  return useMemo(
    () => (staff ?? []).filter((m) => m.isActiveActor && (!m.code || isLegacyStaffCode(m.code))),
    [staff],
  );
}

/** All codes currently reserved in the org (uppercased), for duplicate checks. */
export function useReservedStaffCodes(): ReadonlySet<string> {
  const { data: staff } = useOrgStaff();
  return useMemo(() => {
    const set = new Set<string>();
    for (const m of staff ?? []) if (m.code) set.add(m.code);
    return set;
  }, [staff]);
}
