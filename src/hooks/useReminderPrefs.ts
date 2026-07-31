import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type ReminderChannel = 'in_app' | 'email' | 'both';

export type ReminderPrefs = {
  enabled: boolean;
  reminder_hour: number;
  channel: ReminderChannel;
};

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: true,
  reminder_hour: 8,
  channel: 'in_app',
};

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  in_app: 'In-app only',
  email: 'Email only',
  both: 'In-app and email',
};

/** Friendly Eastern-time label for an hour, e.g. 8 → "8:00 AM". */
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

export function useReminderPrefs() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['goal-reminder-prefs', user?.id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ReminderPrefs> => {
      const { data, error } = await supabase
        .from('goal_reminder_prefs')
        .select('enabled, reminder_hour, channel')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_REMINDER_PREFS;
      return {
        enabled: data.enabled,
        reminder_hour: data.reminder_hour,
        channel: data.channel as ReminderChannel,
      };
    },
  });
}

export function useSaveReminderPrefs() {
  const { user } = useAuth();
  const { data: ctx, isLoading } = useOrgContext();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (prefs: ReminderPrefs) => {
      if (!user || !ctx) throw new Error('Not ready');
      const { error } = await supabase.from('goal_reminder_prefs').upsert(
        {
          org_id: ctx.org_id,
          user_id: user.id,
          enabled: prefs.enabled,
          reminder_hour: prefs.reminder_hour,
          channel: prefs.channel,
        },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      return prefs;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goal-reminder-prefs'] }),
  });

  return { ...mutation, isReady: !!user && !!ctx && !isLoading };
}
