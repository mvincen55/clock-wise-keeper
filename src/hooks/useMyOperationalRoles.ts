import { useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOperationalRoles, ROLE_LABELS } from '@/hooks/useOperationalRoles';
import type { OperationalRole } from '@/lib/schedule-reader/types';
import { getToday } from '@/lib/time-utils';

/**
 * The signed-in person's OPERATIONAL roles — the work they do — read from the
 * canonical `employee_operational_roles` table.
 *
 * This is deliberately separate from the permission tier (owner / manager /
 * employee) that `useOrgContext` resolves. A manager may work front desk; a
 * team member may be front desk with dental assisting as backup. No competing
 * role system is created here: this hook only reads and shapes existing rows.
 */
export type MyOperationalRoles = {
  /** Primary role — drives the default dashboard emphasis. */
  primary: OperationalRole | null;
  primaryLabel: string | null;
  /** Secondary/backup roles, excluding the primary. */
  secondary: OperationalRole[];
  /**
   * Secondary roles with an EXPLICIT coverage assignment whose window includes
   * today. A permanent backup row (no dates) is capability only — it is never
   * treated as covering, so it cannot elevate urgent backup work every day.
   */
  coveringToday: OperationalRole[];
  label: (role: OperationalRole) => string;
};

/**
 * Coverage is an explicit, dated assignment. An undated secondary row means
 * "can cover" (permanent backup), never "covering today".
 */
export function isCoveringOn(
  row: { starts_on?: string | null; ends_on?: string | null },
  today: string,
): boolean {
  if (!row.starts_on) return false; // permanent backup capability, not an assignment
  if (row.starts_on > today) return false; // future coverage
  if (row.ends_on && row.ends_on < today) return false; // expired coverage
  return true;
}

export function useMyOperationalRoles(): MyOperationalRoles {
  const { data: ctx } = useOrgContext();
  const { data: byEmployee } = useOperationalRoles();

  return useMemo(() => {
    const label = (role: OperationalRole) => ROLE_LABELS[role] ?? role;
    const rows = (ctx?.employee_id && byEmployee?.get(ctx.employee_id)) || [];
    const today = getToday();

    const primaryRow = rows.find(r => r.is_primary) ?? null;
    const primary = (primaryRow?.operational_role as OperationalRole | undefined) ?? null;
    const secondaryRows = rows.filter(r => !r.is_primary && r.operational_role !== primary);
    const secondary = Array.from(
      new Set(secondaryRows.map(r => r.operational_role as OperationalRole)),
    );
    const coveringToday = Array.from(
      new Set(
        secondaryRows
          .filter(r => isCoveringOn(r, today))
          .map(r => r.operational_role as OperationalRole),
      ),
    );


    return {
      primary,
      primaryLabel: primary ? label(primary) : null,
      secondary,
      coveringToday,
      label,
    };
  }, [ctx?.employee_id, byEmployee]);
}
