import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type OrgContext = {
  org_id: string;
  employee_id: string;
  role: 'owner' | 'manager' | 'employee';
  org_name: string;
};

/**
 * Resolves the current user's org membership and employee record.
 * Every mutation hook should use this to get org_id + employee_id.
 */
export function useOrgContext() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['org-context', user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // cache 5 min
    queryFn: async (): Promise<OrgContext | null> => {
      if (!user) return null;

      // Get membership
      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (!membership) return null;

      // Get employee record
      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('org_id', membership.org_id)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!employee) return null;

      // Get org name
      const { data: org } = await supabase
        .from('orgs')
        .select('name')
        .eq('id', membership.org_id)
        .single();

      return {
        org_id: membership.org_id,
        employee_id: employee.id,
        role: membership.role as OrgContext['role'],
        org_name: org?.name || 'Organization',
      };
    },
  });
}
