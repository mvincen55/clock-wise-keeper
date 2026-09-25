import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { PreparedReport } from '@/lib/prepared-report';
import type { ReportImportRow } from '@/lib/report-history';

/**
 * The office's loaded prepared-report packages, newest range first. Owners
 * and managers only: RLS on practice_report_imports admits `is_org_admin`,
 * and the query never runs for anyone else. Report history and Home share
 * this one query (same key), so loading a package on one refreshes the other.
 */
export function usePracticeReportImports() {
  const { data: ctx } = useOrgContext();
  const admin = ctx?.role === 'owner' || ctx?.role === 'manager';
  return useQuery({
    queryKey: ['practice-report-imports', ctx?.org_id],
    enabled: !!ctx && admin,
    queryFn: async (): Promise<ReportImportRow[]> => {
      const { data, error } = await supabase
        .from('practice_report_imports')
        .select('id,report_start,report_end,payload,imported_at')
        .eq('org_id', ctx!.org_id)
        .order('report_end', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => ({
        id: r.id,
        report_start: r.report_start,
        report_end: r.report_end,
        imported_at: r.imported_at,
        payload: r.payload as unknown as PreparedReport,
      }));
    },
  });
}
