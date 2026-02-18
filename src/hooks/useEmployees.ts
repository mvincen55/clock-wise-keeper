import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';

export function useOrgEmployees() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-employees', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddEmployee() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: { display_name: string; email?: string; timezone?: string }) => {
      if (!ctx) throw new Error('No org context');
      const { data, error } = await supabase
        .from('employees')
        .insert({
          org_id: ctx.org_id,
          display_name: input.display_name,
          email: input.email || null,
          timezone: input.timezone || 'America/New_York',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-employees'] });
      toast({ title: 'Employee added' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useEmployeeAttendanceSummary(dateRange: { start: string; end: string }) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-attendance-summary', ctx?.org_id, dateRange.start, dateRange.end],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_day_status')
        .select('employee_id, entry_date, status_code, is_late, is_absent, minutes_late, has_punches')
        .eq('org_id', ctx!.org_id)
        .gte('entry_date', dateRange.start)
        .lte('entry_date', dateRange.end);
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeDetail(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-detail', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeTimeEntries(employeeId: string | undefined, dateRange: { start: string; end: string }) {
  return useQuery({
    queryKey: ['employee-time-entries', employeeId, dateRange.start, dateRange.end],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, punches(*)')
        .eq('employee_id', employeeId!)
        .gte('entry_date', dateRange.start)
        .lte('entry_date', dateRange.end)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeAttendance(employeeId: string | undefined, dateRange: { start: string; end: string }) {
  return useQuery({
    queryKey: ['employee-attendance', employeeId, dateRange.start, dateRange.end],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_day_status')
        .select('*')
        .eq('employee_id', employeeId!)
        .gte('entry_date', dateRange.start)
        .lte('entry_date', dateRange.end)
        .order('entry_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
