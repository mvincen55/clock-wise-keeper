import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useToast } from '@/hooks/use-toast';
import {
  CONTEXT_MAX,
  MESSAGE_MAX,
  normalizeText,
  type MomentRecipient,
  type PendingMoment,
  type ReactionKey,
  type RecipientRole,
} from '@/components/moments/reactions';

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
  claimed_at: string | null;
  claim_expires_at: string | null;
  opened_at: string | null;
  dismissed_at: string | null;
  expires_at: string;
};

const SELECT =
  'id, org_id, sender_user_id, sender_employee_id, recipient_user_id, recipient_employee_id, reaction, message, context_label, created_at, revealed_at, claimed_at, claim_expires_at, opened_at, dismissed_at, expires_at';

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

/**
 * Personal mute / opt-out — PER OFFICE. One login can belong to more than one
 * office, and a preference set in one office must never speak for another, so
 * every read and write carries both the active org and the user.
 */
export function useMomentPrefs() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['moment-prefs', ctx?.org_id, ctx?.user_id],
    enabled: !!ctx?.user_id && !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('moment_prefs')
        .select('*')
        .eq('org_id', ctx!.org_id)
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
          { onConflict: 'org_id,user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moment-prefs'] }),
    onError: (e: any) => toast({ title: 'Could not save that', description: e.message, variant: 'destructive' }),

  });
}

/**
 * ATOMIC CLAIM.
 *
 * The client no longer reads pending rows and then marks them itself. It asks
 * the database to hand it a batch: `claim_team_moments` locks the rows with
 * SKIP LOCKED, stamps a two-minute claim lease, and returns exactly what this
 * device may show. A second tab or phone opening at the same instant gets a
 * different (usually empty) batch.
 *
 * Guarantee, stated honestly: at most one device shows a given moment at a
 * time. If this device disappears before confirming, the lease expires and the
 * moment comes back — so a moment can, in that narrow window, be shown twice.
 * It is never silently lost.
 */
export function useClaimedMoments() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['team-moments', 'claimed', ctx?.org_id, ctx?.user_id],
    enabled: !!ctx?.user_id && !!ctx?.org_id,
    // A claim is a write: never refetch it in the background or on focus.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: false,
    queryFn: async (): Promise<MomentRow[]> => {
      const { data, error } = await supabase.rpc('claim_team_moments', {
        p_org_id: ctx!.org_id,
        p_limit: 5,
      });
      if (error) throw error;
      return ((data ?? []) as MomentRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  });
}

/** Confirms the claimed batch was actually presented. Write-once server side. */
export function useOpenMoments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { data, error } = await supabase.rpc('open_team_moments', { p_ids: ids });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['team-moments', 'history'] });
    },
  });
}

/** Everything already opened, plus what this person has sent — this office. */
export function useMomentHistory() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['team-moments', 'history', ctx?.org_id, ctx?.user_id],
    enabled: !!ctx?.user_id && !!ctx?.org_id,
    queryFn: async (): Promise<{ received: MomentRow[]; sent: MomentRow[] }> => {
      const [received, sent] = await Promise.all([
        supabase
          .from('team_moments')
          .select(SELECT)
          .eq('org_id', ctx!.org_id)
          .eq('recipient_user_id', ctx!.user_id)
          .not('opened_at', 'is', null)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('team_moments')
          .select(SELECT)
          .eq('org_id', ctx!.org_id)
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

/** Role of every active member, so the picker can label managers and owners. */
function useOrgMemberRoles() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-member-roles', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, RecipientRole>> => {
      const { data, error } = await supabase
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', ctx!.org_id)
        .eq('status', 'active');
      if (error) throw error;
      const roles: Record<string, RecipientRole> = {};
      for (const m of data ?? []) {
        if (m.user_id) roles[m.user_id as string] = m.role as RecipientRole;
      }
      return roles;
    },
  });
}

/**
 * Everyone who may receive a moment: active, same office, not yourself.
 * Managers and owners are included — recognition flows up as well as sideways —
 * and carry their role so the picker can group them.
 */
export function useMomentRecipients(): MomentRecipient[] {
  const { data: ctx } = useOrgContext();
  const { data: employees } = useOrgEmployees();
  const { data: roles } = useOrgMemberRoles();
  return useMemo(
    () =>
      (employees ?? [])
        .filter((e: any) => e.id !== ctx?.employee_id && !!e.user_id)
        .map((e: any) => ({
          id: e.id as string,
          userId: e.user_id as string,
          name: (e.display_name as string) || 'Teammate',
          role: roles?.[e.user_id as string] ?? 'employee',
        })),
    [employees, ctx?.employee_id, roles],
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
