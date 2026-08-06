import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useTagRegistry } from '@/hooks/useOnboarding';
import { normalizeStaffCode, isLegacyStaffCode, buildReservedSet } from '@/lib/staff-code';

/**
 * How an employee record relates to current auditable activity:
 * - `active`    — active employment + a linked login + ACTIVE org membership.
 * - `loginless` — roster record with no login (cannot act).
 * - `inactive`  — archived/inactive employment.
 * - `former`    — terminated employment.
 * - `nonmember` — has a login but no active org membership (removed, suspended,
 *                 disabled, or only invited — cannot currently act).
 * Only `active` members need a staff code for current attribution.
 */
export type StaffKind = 'active' | 'loginless' | 'inactive' | 'former' | 'nonmember';

export type OrgStaffMember = {
  employeeId: string;
  userId: string | null;
  displayName: string;
  code: string | null;
  employmentStatus: string;
  membershipStatus: string | null;
  kind: StaffKind;
  /** True only for employees who currently perform auditable actions. */
  isActiveActor: boolean;
};

/**
 * Classifies a staff record using employment status, login linkage, AND real
 * org-membership status. Never treats `user_id !== null` as proof of active
 * membership.
 */
export function classifyStaff(
  employmentStatus: string,
  userId: string | null,
  membershipStatus: string | null,
): StaffKind {
  if (employmentStatus === 'terminated') return 'former';
  if (employmentStatus !== 'active') return 'inactive';
  if (!userId) return 'loginless';
  if (membershipStatus !== 'active') return 'nonmember';
  return 'active';
}

/**
 * Loads every employee in the current org with their canonical staff code
 * (`employees.tag`) and an accurate activity classification driven by REAL
 * org-membership status (via the `org_staff_directory` SECURITY DEFINER RPC,
 * since the org_members read policies only expose your own + admin rows). This
 * is the single source of truth other modules use to attribute actions.
 */
export function useOrgStaff() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-staff', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OrgStaffMember[]> => {
      const { data, error } = await supabase.rpc('org_staff_directory', { p_org_id: ctx!.org_id });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const kind = classifyStaff(r.employment_status, r.user_id, r.membership_status);
        return {
          employeeId: r.employee_id,
          userId: r.user_id,
          displayName: r.display_name,
          code: r.tag ? normalizeStaffCode(r.tag) : null,
          employmentStatus: r.employment_status,
          membershipStatus: r.membership_status,
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

/**
 * Every code reserved in the org (uppercased) — the union of current
 * `employees.tag` values AND the permanent `employee_tags` registry (which
 * keeps codes retired to former employees). This is the ONE shared reserved-set
 * helper used by suggestions and duplicate checks so no screen rolls its own.
 * Pass `excludeEmployeeId` when editing a specific member so their own current
 * code is not treated as a conflict. The database (unique index + tag registry
 * trigger) remains the authoritative check against simultaneous writes.
 */
export function useReservedStaffCodes(excludeEmployeeId?: string): ReadonlySet<string> {
  const { data: staff } = useOrgStaff();
  const { data: registry } = useTagRegistry();
  return useMemo(() => {
    const codes: (string | null | undefined)[] = [];
    for (const m of staff ?? []) {
      if (m.employeeId === excludeEmployeeId) continue;
      codes.push(m.code);
    }
    for (const r of registry ?? []) {
      if (excludeEmployeeId && r.employee_id === excludeEmployeeId) continue;
      codes.push(r.tag as string);
    }
    return buildReservedSet(codes);
  }, [staff, registry, excludeEmployeeId]);
}
