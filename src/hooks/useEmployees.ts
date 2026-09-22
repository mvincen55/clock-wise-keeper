import type { EmployeeContactFields } from '@/lib/employee-contact';
import { employeeNamePayload, type EmployeeNameFields } from '@/lib/employee-name-fields';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export function useOrgEmployees() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-employees', ctx?.org_id, ctx?.user_id],
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

export function useArchivedEmployees() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-employees-archived', ctx?.org_id, ctx?.user_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .neq('employment_status', 'active')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });
}

export function useRestoreEmployee() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('employees')
        .update({ employment_status: 'active' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-employees'] });
      qc.invalidateQueries({ queryKey: ['org-employees-archived'] });
      toast({ title: 'Team member restored' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useAddEmployee() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: EmployeeNameFields & { email?: string; contact?: EmployeeContactFields }) => {
      if (!ctx) throw new Error('No org context');
      const name = employeeNamePayload(input);
      const { data, error } = await supabase.rpc('save_team_member_contact', {
        p_org_id: ctx.org_id, p_employee_id: null,
        p_first_name: name.first_name, p_middle_initial: name.middle_initial,
        p_last_name: name.last_name, p_email: input.email?.trim() || null,
        ...(input.contact ? { p_contact: input.contact } : {}),
      });
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

/** Update roster contact details only; invitations are a separate action. */
export function useUpdateEmployeeDetails() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EmployeeNameFields & { id: string; email: string | null; contact: EmployeeContactFields }) => {
      if (!ctx || !['owner', 'manager'].includes(ctx.role)) throw new Error('Manager access required');
      const name = employeeNamePayload(input);
      const { data, error } = await supabase.rpc('save_team_member_contact', {
        p_org_id: ctx.org_id, p_employee_id: input.id,
        p_first_name: name.first_name, p_middle_initial: name.middle_initial,
        p_last_name: name.last_name, p_email: input.email?.trim() || null,
        p_contact: input.contact,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['org-employees'] });
      qc.invalidateQueries({ queryKey: ['org-employees-archived'] });
      qc.invalidateQueries({ queryKey: ['employee-detail', input.id] });
    },
  });
}

export function useEmployeeAttendanceSummary(dateRange: { start: string; end: string }) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-attendance-summary', ctx?.org_id, dateRange.start, dateRange.end, ctx?.user_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_day_status')
        .select('employee_id, entry_date, status_code, is_late, is_absent, minutes_late, has_punches, is_incomplete, has_day_off, office_closed, is_scheduled_day, schedule_expected_start, schedule_expected_end')
        .eq('org_id', ctx!.org_id)
        .gte('entry_date', dateRange.start)
        .lte('entry_date', dateRange.end);
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployeeDetail(employeeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['employee-detail', employeeId, user?.id],
    enabled: !!employeeId && !!user,
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
  const { user } = useAuth();
  return useQuery({
    queryKey: ['employee-time-entries', employeeId, dateRange.start, dateRange.end, user?.id],
    enabled: !!employeeId && !!user,
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
  const { user } = useAuth();
  return useQuery({
    queryKey: ['employee-attendance', employeeId, dateRange.start, dateRange.end, user?.id],
    enabled: !!employeeId && !!user,
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
