import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type EmployeeNameRecord = {
  id: string;
  user_id: string | null;
  display_name: string;
  preferred_name: string | null;
};

/** Who an attendance-family row (day status, tardy, exception) belongs to. */
export type AttendanceSubject = { employee_id?: string | null; user_id: string | null };

/**
 * Names for every employee record in the office the caller may read, active
 * and archived alike, because attendance rows outlive employment. Managers
 * read the whole office; everyone else reads only their own record (RLS),
 * which is the only one their attendance rows ever reference.
 */
export function useOrgEmployeeNames() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    // Prefixed like useOrgEmployees so team edits invalidate this list too.
    queryKey: ['org-employees', 'names', ctx?.org_id, ctx?.user_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, user_id, display_name, preferred_name')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return (data || []) as EmployeeNameRecord[];
    },
  });
}

export type EmployeeNameLookup = {
  byEmployeeId: Map<string, string>;
  byUserId: Map<string, string>;
};

export function buildEmployeeNameLookup(employees: EmployeeNameRecord[] | undefined): EmployeeNameLookup {
  const byEmployeeId = new Map<string, string>();
  const byUserId = new Map<string, string>();
  (employees || []).forEach(e => {
    const name = e.preferred_name?.trim() || e.display_name;
    byEmployeeId.set(e.id, name);
    // Several employee records can share one login (imports attribute staff
    // without a login to the importer), so the first linked record keeps the
    // login; rows that carry an employee_id never consult this map anyway.
    if (e.user_id && !byUserId.has(e.user_id)) byUserId.set(e.user_id, name);
  });
  return { byEmployeeId, byUserId };
}

/**
 * Key that identifies the person behind a row. The employee record is the
 * truth: imported rows for staff without a login carry the importer's
 * user_id, so grouping by login alone would fold them into the manager.
 */
export function attendanceSubjectKey(row: AttendanceSubject): string {
  return row.employee_id ? `employee:${row.employee_id}` : `user:${row.user_id ?? 'unknown'}`;
}

/** Display name for the person behind a row, or null when nothing readable names them. */
export function employeeNameForRow(lookup: EmployeeNameLookup, row: AttendanceSubject): string | null {
  if (row.employee_id) return lookup.byEmployeeId.get(row.employee_id) ?? null;
  if (row.user_id) return lookup.byUserId.get(row.user_id) ?? null;
  return null;
}

/** True when the row belongs to the signed-in person, judged the same way as `attendanceSubjectKey`. */
export function isOwnAttendanceRow(row: AttendanceSubject, self: { employee_id?: string | null; user_id?: string | null }): boolean {
  if (row.employee_id) return row.employee_id === self.employee_id;
  return !!row.user_id && row.user_id === self.user_id;
}
