import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export interface ApprovalCounts {
  changeRequests: number;
  ptoRequests: number;
  corrections: number;
  tardyRequests: number;
  total: number;
}

export function useApprovalCounts() {
  const { data: ctx } = useOrgContext();
  const orgId = ctx?.org_id;
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery<ApprovalCounts>({
    queryKey: ['approval-counts', orgId],
    enabled: !!orgId && isManager,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [cr, pto, corr, tardy] = await Promise.all([
        supabase
          .from('change_requests')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('status', 'pending'),
        supabase
          .from('pto_requests')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('status', 'pending'),
        supabase
          .from('correction_requests')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('status', 'pending'),
        supabase
          .from('tardy_approval_requests')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId!)
          .eq('status', 'pending'),
      ]);

      const changeRequests = cr.count ?? 0;
      const ptoRequests = pto.count ?? 0;
      const corrections = corr.count ?? 0;
      const tardyRequests = tardy.count ?? 0;

      return {
        changeRequests,
        ptoRequests,
        corrections,
        tardyRequests,
        total: changeRequests + ptoRequests + corrections + tardyRequests,
      };
    },
  });
}
