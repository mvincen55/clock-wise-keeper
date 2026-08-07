import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useToast } from '@/hooks/use-toast';
import { CONTEXT_MAX, MESSAGE_MAX, normalizeText, type PendingMoment, type ReactionKey } from '@/components/moments/reactions';

/**
 * TEAM MOMENTS data layer.
 *
 * Kept deliberately separate from useNotifications: a celebration must never
 * sit in the same queue as an approval, a safety item, or a required
 * acknowledgment, and must never be able to obscure one.
 */

export type MomentRow = {
  id: string;
  org_id: string;
  sender_user_id: string;
  sender_employee_id: string;
  recipient_user_id: string;
  recipient_employee_id: string;
  reaction: string;
  message: string | null;
  context_label: string | null;
  created_at: string;
  revealed_at: string | null;
  dismissed_at: string | null;
  expires_at: string;
};

const SELECT =
  'id, org_id, sender_user_id, sender_employee_id, recipient_user_id, recipient_employee_id, reaction, message, context_label, created_at, revealed_at, dismissed_at, expires_at';

/** Office switch + limits. Absent row means the shipped defaults apply. */
export function useMomentSettings() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['moment-settings', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_moment_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? {
          org_id: ctx!.org_id,
          enabled: true,
          allow_message: true,
          max_per_sender_per_hour: 10,
          max_per_pair_per_day: 3,
          unseen_expiry_days: 30,
          history_retention_days: 180,
        }
      );
    },
  });
}

/** Personal mute / opt-out. */
export function useMomentPrefs() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['moment-prefs', ctx?.user_id],
    enabled: !!ctx?.user_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('moment_prefs')
        .select('*')
        .eq('user_id', ctx!.user_id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { user_id: ctx!.user_id, org_id: ctx!.org_id, animations_muted: false, receive_enabled: true };
    },
  });
}

export function useUpdateMomentPrefs() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (patch: { animations_muted?: boolean; receive_enabled?: boolean }) => {
      if (!ctx) throw new Error('No office context');
      const { error } = await supabase
        .from('moment_prefs')
        .upsert(
          { user_id: ctx.user_id, org_id: ctx.org_id, updated_at: new Date().toISOString(), ...patch },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moment-prefs'] }),
    onError: (e: any) => toast({ title: 'Could not save that', description: e.message, variant: 'destructive' }),
  });
}

/** Unrevealed, unexpired moments for the signed-in person. */
export function usePendingMoments() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['team-moments', 'pending', ctx?.user_id],
    enabled: !!ctx?.user_id,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<MomentRow[]> => {
      const { data, error } = await supabase
        .from('team_moments')
        .select(SELECT)
        .eq('recipient_user_id', ctx!.user_id)
        .is('revealed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as MomentRow[];
    },
  });
}

/** Everything already seen, plus what this person has sent. */
export function useMomentHistory() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['team-moments', 'history', ctx?.user_id],
    enabled: !!ctx?.user_id,
    queryFn: async (): Promise<{ received: MomentRow[]; sent: MomentRow[] }> => {
      const [received, sent] = await Promise.all([
        supabase
          .from('team_moments')
          .select(SELECT)
          .eq('recipient_user_id', ctx!.user_id)
          .not('revealed_at', 'is', null)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('team_moments')
          .select(SELECT)
          .eq('sender_user_id', ctx!.user_id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (received.error) throw received.error;
      if (sent.error) throw sent.error;
      return { received: (received.data ?? []) as MomentRow[], sent: (sent.data ?? []) as MomentRow[] };
    },
  });
}

/**
 * Write-once reveal. Safe to call repeatedly and from more than one device: the
 * filter skips rows already marked and the database keeps the first timestamp.
 */
export function useMarkMomentsRevealed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('team_moments')
        .update({ revealed_at: new Date().toISOString() })
        .in('id', ids)
        .is('revealed_at', null);
      if (error) throw error;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['team-moments'] });
    },
  });
}

export function useSendMoment() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      recipientEmployeeId: string;
      recipientUserId: string;
      reaction: ReactionKey;
      message?: string | null;
      contextLabel?: string | null;
    }) => {
      if (!ctx) throw new Error('No office context');
      const { error } = await supabase.from('team_moments').insert({
        org_id: ctx.org_id,
        sender_user_id: ctx.user_id,
        sender_employee_id: ctx.employee_id,
        recipient_user_id: input.recipientUserId,
        recipient_employee_id: input.recipientEmployeeId,
        reaction: input.reaction,
        message: normalizeText(input.message, MESSAGE_MAX),
        context_label: normalizeText(input.contextLabel, CONTEXT_MAX),
        // expires_at is stamped server-side from office settings.
        expires_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-moments'] });
      toast({ title: 'Moment sent', description: 'It opens the next time they sign in.' });
    },
    onError: (e: any) =>
      toast({ title: 'Could not send that', description: humanizeSendError(e?.message), variant: 'destructive' }),
  });
}

export function humanizeSendError(message?: string): string {
  const m = message ?? '';
  if (m.includes('Sending limit')) return 'You have sent a lot of moments in the last hour. Try again shortly.';
  if (m.includes('several moments today')) return 'You have already sent this person a few moments today.';
  if (m.includes('turned off for this office')) return 'Team Moments are turned off for this office.';
  if (m.includes('turned off Team Moments')) return 'This person has turned Team Moments off.';
  if (m.includes('row-level security') || m.includes('violates')) return 'You can only send moments inside your own office.';
  return m || 'Something went wrong.';
}

/** Employees who may receive a moment: active, same office, not yourself. */
export function useMomentRecipients() {
  const { data: ctx } = useOrgContext();
  const { data: employees } = useOrgEmployees();
  return useMemo(
    () =>
      (employees ?? [])
        .filter((e: any) => e.id !== ctx?.employee_id && !!e.user_id)
        .map((e: any) => ({ id: e.id as string, userId: e.user_id as string, name: (e.display_name as string) || 'Teammate' })),
    [employees, ctx?.employee_id],
  );
}

/** Resolves an employee id to a display name for reveal + history. */
export function useEmployeeNameLookup() {
  const { data: employees } = useOrgEmployees();
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of (employees ?? []) as any[]) m.set(e.id, e.display_name || 'Teammate');
    return m;
  }, [employees]);
  return useCallback((id: string) => map.get(id) ?? 'A teammate', [map]);
}

export function toPending(row: MomentRow, senderName: string): PendingMoment {
  return {
    id: row.id,
    reaction: row.reaction,
    message: row.message,
    context_label: row.context_label,
    created_at: row.created_at,
    sender_name: senderName,
  };
}
