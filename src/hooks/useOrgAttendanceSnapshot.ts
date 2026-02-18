import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

export type EmployeeSnapshot = {
  employee_id: string;
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
};

export function useOrgAttendanceSnapshot(date?: string) {
  const { data: ctx } = useOrgContext();
  const targetDate = date || getToday();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['org-attendance-snapshot', ctx?.org_id, targetDate],
    enabled: !!ctx?.org_id && isManager,
    queryFn: async () => {
      // Get all active employees
      const { data: employees } = await supabase
        .from('employees')
        .select('id, display_name')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active');

      if (!employees?.length) return [];

      // Get today's attendance status for all org employees
      const { data: statuses } = await supabase
        .from('attendance_day_status')
        .select('employee_id, status_code, is_late, is_absent, is_incomplete, has_punches, is_remote, minutes_late, has_day_off, office_closed, is_scheduled_day')
        .eq('org_id', ctx!.org_id)
        .eq('entry_date', targetDate);

      const statusMap = new Map(
        (statuses || []).map(s => [s.employee_id, s])
      );

      return employees.map(emp => {
        const s = statusMap.get(emp.id);
        return {
          employee_id: emp.id,
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
        } as EmployeeSnapshot;
      });
    },
    refetchInterval: 60_000, // refresh every minute
  });
}
