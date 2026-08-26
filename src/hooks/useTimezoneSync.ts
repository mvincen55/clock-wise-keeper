import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { setAppTimezone } from '@/lib/time-utils';

/**
 * Feeds the app's display timezone from org context, mirroring the
 * server's get_user_timezone resolution: the signed-in person's
 * explicit timezone (employees.timezone, when set), else the office
 * timezone (org_practice_settings.timezone), else the default.
 *
 * Mounted once in the app shell. Display-only: server-side truth
 * (entry dating in the punch RPCs) resolves its own timezone in the
 * database and never depends on this.
 */
export function useTimezoneSync() {
  const { data: ctx } = useOrgContext();
  const { data: settings } = usePracticeSettings();

  const { data: ownTimezone } = useQuery({
    queryKey: ['own-employee-timezone', ctx?.employee_id],
    enabled: !!ctx?.employee_id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('timezone')
        .eq('id', ctx!.employee_id)
        .maybeSingle();
      return (data?.timezone as string | null) ?? null;
    },
  });

  useEffect(() => {
    setAppTimezone(ownTimezone ?? settings?.timezone ?? null);
  }, [ownTimezone, settings?.timezone]);
}
