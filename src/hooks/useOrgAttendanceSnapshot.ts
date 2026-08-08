import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

export type EmployeeSnapshot = {
  employee_id: string;
  user_id: string | null;
  display_name: string;
  status_code: string;
  is_late: boolean;
  is_absent: boolean;
  is_incomplete: boolean;
  has_punches: boolean;
  is_remote: boolean;
  minutes_late: number;
  has_day_off: boolean;
  office_closed: boolean;
  is_scheduled_day: boolean;
  /** Local shift window ("HH:MM:SS"), when the schedule defines one. */
  schedule_expected_start: string | null;
  schedule_expected_end: string | null;
  tardy_approval_status: string | null;
};

/**
 * User ids that hold the org's Owner membership. Owners run the office and do
 * not clock in (`roleClocksIn`), so every attendance surface excludes them —
 * they must never read as absent, out, or a staffing exception.
 * Readable by any member under the "Members see org admin memberships" policy.
 */
export function useOwnerUserIds() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-owner-user-ids', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx!.org_id)
        .eq('role', 'owner')
        .eq('status', 'active');
      return new Set((data || []).map(m => m.user_id as string));
    },
  });
}

export function useOrgAttendanceSnapshot(date?: string) {
  const { data: ctx } = useOrgContext();
  const targetDate = date || getToday();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['org-attendance-snapshot', ctx?.org_id, targetDate],
    enabled: !!ctx?.org_id && isManager,
    queryFn: async () => {
      // Owner memberships — owners do not clock, so they are excluded at this
      // boundary, before any attendance math sees them.
      const { data: owners } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx!.org_id)
        .eq('role', 'owner')
        .eq('status', 'active');
      const ownerIds = new Set((owners || []).map(m => m.user_id as string));

      // All active employees who clock.
      const { data: employees } = await supabase
        .from('employees')
        .select('id, user_id, display_name')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active');

      const clocking = (employees || []).filter(e => !e.user_id || !ownerIds.has(e.user_id));
      if (!clocking.length) return [];

      // Today's attendance status for all org employees.
      const { data: statuses } = await supabase
        .from('attendance_day_status')
        .select('employee_id, status_code, is_late, is_absent, is_incomplete, has_punches, is_remote, minutes_late, has_day_off, office_closed, is_scheduled_day, schedule_expected_start, schedule_expected_end, tardy_approval_status')
        .eq('org_id', ctx!.org_id)
        .eq('entry_date', targetDate);

      const statusMap = new Map(
        (statuses || []).map(s => [s.employee_id, s])
      );

      return clocking.map(emp => {
        const s = statusMap.get(emp.id);
        return {
          employee_id: emp.id,
          user_id: emp.user_id ?? null,
          display_name: emp.display_name,
          status_code: s?.status_code || 'no_data',
          is_late: s?.is_late || false,
          is_absent: s?.is_absent || false,
          is_incomplete: s?.is_incomplete || false,
          has_punches: s?.has_punches || false,
          is_remote: s?.is_remote || false,
          minutes_late: s?.minutes_late || 0,
          has_day_off: s?.has_day_off || false,
          office_closed: s?.office_closed || false,
          is_scheduled_day: s?.is_scheduled_day || false,
          schedule_expected_start: s?.schedule_expected_start ?? null,
          schedule_expected_end: s?.schedule_expected_end ?? null,
          tardy_approval_status: s?.tardy_approval_status ?? null,
        } as EmployeeSnapshot;
      });
    },
    refetchInterval: 60_000, // refresh every minute
  });
}
