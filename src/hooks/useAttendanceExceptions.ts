import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AttendanceExceptionRow = {
  id: string;
  user_id: string;
  exception_date: string;
  type: 'missing_shift' | 'other';
  status: 'open' | 'resolved' | 'ignored';
  reason_text: string | null;
  resolved_at: string | null;
  resolution_action: string | null;
  created_at: string;
  updated_at: string;
};

export function useAttendanceExceptions(startDate?: string, endDate?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['attendance-exceptions', startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('attendance_exceptions').select('*').order('exception_date', { ascending: false });
      if (startDate) q = q.gte('exception_date', startDate);
      if (endDate) q = q.lte('exception_date', endDate);
      const { data } = await q;
      return (data || []) as AttendanceExceptionRow[];
    },
  });
}

export function useCreateException() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      exception_date: string;
      type?: 'missing_shift' | 'other';
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('attendance_exceptions').upsert(
        {
          user_id: user.id,
          exception_date: input.exception_date,
          type: input.type || 'missing_shift',
          status: 'open',
        },
        { onConflict: 'user_id,exception_date,type' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-exceptions'] }),
  });
}

export function useResolveException() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason_text, resolution_action, status }: {
      id: string;
      reason_text: string;
      resolution_action: string;
      status?: 'resolved' | 'ignored';
    }) => {
      const { error } = await supabase.from('attendance_exceptions').update({
        status: status || 'resolved',
        reason_text,
        resolution_action,
        resolved_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-exceptions'] }),
  });
}
