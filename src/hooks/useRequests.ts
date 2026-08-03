import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type RequestStatus =
  | 'sent'
  | 'seen'
  | 'handled'
  | 'replied'
  | 'on_doctors_list'
  | 'sent_to_manager';

export interface OfficeRequest {
  id: string;
  org_id: string;
  sender_id: string;
  recipient_id: string;
  category: string;
  reference: string | null;
  note: string;
  needs_reply: boolean;
  first_seen_at: string | null;
  acknowledged_at: string | null;
  status: RequestStatus;
  created_at: string;
  closed_at: string | null;
}

export interface RequestReply {
  id: string;
  request_id: string;
  sender_id: string;
  body: string;
  first_seen_at: string | null;
  created_at: string;
}

const OPEN_STATUSES: RequestStatus[] = ['sent', 'seen', 'replied'];

export function isOpen(r: OfficeRequest) {
  return OPEN_STATUSES.includes(r.status) && !r.closed_at;
}

/** People this user can send to, by user id. */
export function useMessageableTeam() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['messageable-team', ctx?.org_id, user?.id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: members } = await supabase
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', ctx!.org_id)
        .eq('status', 'active');

      const { data: employees } = await supabase
        .from('employees')
        .select('user_id, display_name, preferred_name')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active');

      const nameByUser = new Map(
        (employees ?? [])
          .filter(e => e.user_id)
          .map(e => [e.user_id as string, e.preferred_name || e.display_name || 'Teammate']),
      );

      return (members ?? [])
        .filter(m => m.user_id && m.user_id !== user?.id)
        .map(m => ({
          user_id: m.user_id as string,
          role: m.role as 'owner' | 'manager' | 'employee',
          name: nameByUser.get(m.user_id as string) ?? 'Teammate',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/** Names for everyone in the org, so a thread can say who spoke. */
export function useOrgNames() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-names', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('employees')
        .select('user_id, display_name, preferred_name')
        .eq('org_id', ctx!.org_id);
      const map = new Map<string, string>();
      for (const e of data ?? []) {
        if (e.user_id) map.set(e.user_id, e.preferred_name || e.display_name || 'Teammate');
      }
      return map;
    },
  });
}

export function useRequests() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  const inbox = useQuery({
    queryKey: ['requests', 'inbox', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<OfficeRequest[]> => {
      const { data, error } = await supabase
        .from('office_requests')
        .select('*')
        .eq('recipient_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OfficeRequest[];
    },
  });

  const sent = useQuery({
    queryKey: ['requests', 'sent', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<OfficeRequest[]> => {
      const { data, error } = await supabase
        .from('office_requests')
        .select('*')
        .eq('sender_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OfficeRequest[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['requests'] });
    qc.invalidateQueries({ queryKey: ['messages-closeout'] });
  };

  const send = useMutation({
    mutationFn: async (input: {
      recipient_id: string;
      category: string;
      reference: string;
      note: string;
      needs_reply: boolean;
    }) => {
      if (!user || !ctx) throw new Error('Not signed in.');
      const { error } = await supabase.from('office_requests').insert({
        org_id: ctx.org_id,
        sender_id: user.id,
        recipient_id: input.recipient_id,
        category: input.category,
        reference: input.reference.trim() || null,
        note: input.note.trim(),
        needs_reply: input.needs_reply,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /**
   * Written once, when the thread is actually opened — never on list render,
   * never from a notification preview. The database trigger refuses to let it
   * be rewritten on a second open.
   */
  const markSeen = useMutation({
    mutationFn: async (r: OfficeRequest) => {
      if (!user || r.recipient_id !== user.id || r.first_seen_at) return;
      const { error } = await supabase
        .from('office_requests')
        .update({
          first_seen_at: new Date().toISOString(),
          status: r.status === 'sent' ? 'seen' : r.status,
        })
        .eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** The explicit "I've got it" for a note the sender flagged as needing one. */
  const acknowledge = useMutation({
    mutationFn: async (r: OfficeRequest) => {
      const { error } = await supabase
        .from('office_requests')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Handled / on the doctor's list / sent to the manager — all keep a trace. */
  const setStatus = useMutation({
    mutationFn: async ({ r, status }: { r: OfficeRequest; status: RequestStatus }) => {
      const closes = status === 'handled' || status === 'sent_to_manager';
      const { error } = await supabase
        .from('office_requests')
        .update({
          status,
          closed_at: closes ? new Date().toISOString() : null,
          closed_by: closes ? user?.id ?? null : null,
        })
        .eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reply = useMutation({
    mutationFn: async ({ r, body }: { r: OfficeRequest; body: string }) => {
      if (!user || !ctx) throw new Error('Not signed in.');
      const { error } = await supabase.from('office_request_replies').insert({
        org_id: ctx.org_id,
        request_id: r.id,
        sender_id: user.id,
        body: body.trim(),
      });
      if (error) throw error;
      await supabase.from('office_requests').update({ status: 'replied' }).eq('id', r.id);
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['request-replies'] });
    },
  });

  /** The second-tap true delete. Everything else closes with a visible status. */
  const hardDelete = useMutation({
    mutationFn: async (r: OfficeRequest) => {
      const { error } = await supabase.from('office_requests').delete().eq('id', r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unopened = (inbox.data ?? []).filter(r => !r.first_seen_at).length;

  return { inbox, sent, send, markSeen, acknowledge, setStatus, reply, hardDelete, unopened };
}

export function useRequestReplies(requestId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['request-replies', requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<RequestReply[]> => {
      const { data, error } = await supabase
        .from('office_request_replies')
        .select('*')
        .eq('request_id', requestId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as RequestReply[];
    },
  });

  /** Receipts run both ways: the doctor's reply gets a Seen stamp too. */
  const markRepliesSeen = useMutation({
    mutationFn: async (replies: RequestReply[]) => {
      if (!user) return;
      const mine = replies.filter(r => r.sender_id !== user.id && !r.first_seen_at);
      if (mine.length === 0) return;
      const now = new Date().toISOString();
      await Promise.all(
        mine.map(r =>
          supabase.from('office_request_replies').update({ first_seen_at: now }).eq('id', r.id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['request-replies'] }),
  });

  return { replies: query.data ?? [], isLoading: query.isLoading, markRepliesSeen };
}
