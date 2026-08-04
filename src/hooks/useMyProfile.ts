import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// The signed-in user's own profiles row (self-read/self-write RLS). Staff
// identity only — full name, email, and the initials stamped into Broken
// Appointments output blocks. No patient data.

export interface MyProfile {
  fullName: string;
  email: string;
  /** Explicit initials; blank = derive from fullName at point of use. */
  initials: string;
}

export function useMyProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-profile', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MyProfile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email, initials')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return {
        fullName: data?.full_name ?? '',
        email: data?.email ?? user?.email ?? '',
        initials: data?.initials ?? '',
      };
    },
  });
}

export function useUpdateMyInitials() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (initials: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ initials: initials.trim().toUpperCase() })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-profile'] }),
  });
}
