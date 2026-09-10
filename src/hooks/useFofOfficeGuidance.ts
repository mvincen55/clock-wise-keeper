import { useQuery } from '@tanstack/react-query';
import { useOrgContext } from './useOrgContext';
import { useCodeNotes } from './useAssistantMemory';
import { supabase } from '@/integrations/supabase/client';
import type { OfficeGuidance } from '../../supabase/functions/_shared/fof-office-guidance';

/** Office-wide AI configuration. Neither the key nor the request uses a form. */
export function useFofOfficeGuidance() {
  const { data: org } = useOrgContext();
  const notes = useCodeNotes();
  const officeNotes = notes.data?.filter(note => note.isUniversal);
  return useQuery({
    queryKey: ['fof-office-guidance', org?.org_id, officeNotes],
    enabled: !!org?.org_id && notes.isSuccess,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<OfficeGuidance> => {
      if (!officeNotes?.length) return { revision: 'empty', recipes: [], warnings: [] };
      const { data, error } = await supabase.functions.invoke('fof-office-guidance', { body: { orgId: org!.org_id } });
      if (error || data?.error || !Array.isArray(data?.recipes) || typeof data?.revision !== 'string') {
        throw new Error('Code-bank guidance is unavailable. The existing office payment rules still apply.');
      }
      return data as OfficeGuidance;
    },
  });
}
