import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import { getToday, easternWallToUtcIso, hhmmToMinutes } from '@/lib/time-utils';
import {
  closeoutCutoffMinutes,
  outstandingCloseoutMessages,
} from '@/lib/messages-closeout';

export interface CloseoutState {
  /** False means the item does not exist for this person today, at all. */
  applies: boolean;
  /** Why it does not apply — used for the "no false failures" audit. */
  excludedBecause?: 'owner' | 'off' | 'not-scheduled' | 'time-off';
  /** Messages from today that still need opening, replying or acknowledging. */
  outstanding: {
    id: string;
    note: string;
    needs_reply: boolean;
    created_at: string;
  }[];
  satisfied: boolean;
  label: string;
}

/**
 * The end-of-night "Messages read" item.
 *
 * It is never a box someone ticks while notes sit unopened — the system knows
 * the answer, so it computes it. Notes the sender marked as needing a reply
 * cannot be cleared by scrolling past them; they clear by replying or by an
 * explicit acknowledgement.
 *
 * It never applies to the Owner, to someone who was not working, to someone on
 * time off, or to a note that landed after the office's end-of-day cutoff.
 */
export function useMessagesCloseout(): CloseoutState & { isLoading: boolean } {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { settings } = useMessagingSettings();
  const today = getToday();
  const label = `${settings.messages_label} read`;

  const off = (reason: CloseoutState['excludedBecause']): CloseoutState => ({
    applies: false,
    excludedBecause: reason,
    outstanding: [],
    satisfied: true,
    label,
  });

  const enabled =
    !!user && !!ctx && ctx.role !== 'owner' && settings.enabled && settings.closeout_item_enabled;

  const query = useQuery({
    queryKey: ['messages-closeout', user?.id, today, settings.closeout_cutoff_minutes],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CloseoutState> => {
      // On PTO or otherwise off today: no item, no reason prompt.
      const { data: off_today } = await supabase
        .from('days_off')
        .select('id')
        .eq('user_id', user!.id)
        .lte('date_start', today)
        .gte('date_end', today)
        .limit(1);
      if (off_today?.length) return off('time-off');

      // Not on the schedule today: nothing to close out.
      const { data: sched } = await supabase.rpc('get_schedule_for_date', {
        p_user_id: user!.id,
        p_date: today,
      });
      const weekday = new Date(`${today}T12:00:00`).getDay();
      const row = (sched ?? []).find(
        (s: { weekday: number; enabled: boolean }) => s.weekday === weekday && s.enabled,
      ) as { end_time: string | null } | undefined;
      if (!row) return off('not-scheduled');

      // Anything sent inside the cutoff rolls to the next working day.
      const endMinutes = row.end_time ? hhmmToMinutes(row.end_time.slice(0, 5)) : null;
      const cutoffMinutes = closeoutCutoffMinutes(endMinutes, settings.closeout_cutoff_minutes);
      const cutoffIso = easternWallToUtcIso(
        today,
        Math.floor(cutoffMinutes / 60),
        cutoffMinutes % 60,
      );

      const dayStart = easternWallToUtcIso(today, 0, 0);
      const { data: received } = await supabase
        .from('office_requests')
        .select('id, note, needs_reply, first_seen_at, acknowledged_at, created_at, status')
        .eq('recipient_id', user!.id)
        .gte('created_at', dayStart)
        .lte('created_at', cutoffIso);

      // Already clocked out when it landed? Then it was never theirs to read today.
      const { data: lastOut } = await supabase
        .from('punches')
        .select('punch_time')
        .eq('employee_id', ctx!.employee_id)
        .eq('punch_type', 'out')
        .gte('punch_time', dayStart)
        .order('punch_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      const clockedOutAt = lastOut?.punch_time ?? null;

      const myReplies = await supabase
        .from('office_request_replies')
        .select('request_id')
        .eq('sender_id', user!.id)
        .gte('created_at', dayStart);
      const repliedTo = new Set((myReplies.data ?? []).map(r => r.request_id));

      const outstanding = outstandingCloseoutMessages(received ?? [], {
        clockedOutAt,
        repliedTo: repliedTo,
      });

      return { applies: true, outstanding, satisfied: outstanding.length === 0, label };
    },
  });

  if (!enabled) {
    return {
      ...off(ctx?.role === 'owner' ? 'owner' : 'off'),
      isLoading: false,
    };
  }

  return {
    ...(query.data ?? { applies: true, outstanding: [], satisfied: true, label }),
    isLoading: query.isLoading,
  };
}
