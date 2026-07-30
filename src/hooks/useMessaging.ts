import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';

export type ConversationType = 'dm' | 'group' | 'announcement' | 'ai';
export type Audience = 'all' | 'clinical' | 'clerical';

export type ConversationRow = {
  id: string;
  org_id: string;
  type: ConversationType;
  title: string | null;
  audience: Audience | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  org_id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_kind: 'member' | 'pathfinder' | 'system';
  content: string;
  reported_at: string | null;
  reported_by: string | null;
  created_at: string;
};

export type ConversationSummary = ConversationRow & {
  participantIds: string[];
  lastMessage: { content: string; created_at: string; sender_kind: string } | null;
  unread: number;
  displayTitle: string;
};

/** Everyone in the org who can be messaged (name + auth user id). */
export function useMessageableTeam() {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['messaging-team', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, display_name, user_id, team')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active')
        .not('user_id', 'is', null)
        .order('display_name');
      if (error) throw error;
      return (data || []).filter((e) => e.user_id !== user?.id);
    },
  });
}

/** Name lookup for every teammate, keyed by auth user id. */
export function useTeamNames() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['messaging-names', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('user_id, display_name')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const e of data || []) if (e.user_id) map[e.user_id] = e.display_name;
      return map;
    },
  });
}

export function useConversations() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: names } = useTeamNames();
  const qc = useQueryClient();

  // Live refresh whenever anything lands in a conversation we can read.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['conversations'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  return useQuery({
    queryKey: ['conversations', ctx?.org_id, user?.id, names ? Object.keys(names).length : 0],
    enabled: !!ctx?.org_id && !!user,
    queryFn: async (): Promise<ConversationSummary[]> => {
      const { data: convs, error } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const list = (convs || []) as ConversationRow[];
      if (!list.length) return [];
      const ids = list.map((c) => c.id);

      const [{ data: parts }, { data: msgs }] = await Promise.all([
        supabase
          .from('conversation_participants')
          .select('conversation_id, user_id, last_read_at')
          .in('conversation_id', ids),
        supabase
          .from('messages')
          .select('id, conversation_id, content, created_at, sender_id, sender_kind')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false })
          .limit(600),
      ]);

      const byConv: Record<string, string[]> = {};
      const myRead: Record<string, string | null> = {};
      for (const p of parts || []) {
        (byConv[p.conversation_id] ||= []).push(p.user_id);
        if (p.user_id === user!.id) myRead[p.conversation_id] = p.last_read_at;
      }

      const last: Record<string, { content: string; created_at: string; sender_kind: string }> = {};
      const unread: Record<string, number> = {};
      for (const m of msgs || []) {
        if (!last[m.conversation_id]) {
          last[m.conversation_id] = {
            content: m.content,
            created_at: m.created_at,
            sender_kind: m.sender_kind,
          };
        }
        const readAt = myRead[m.conversation_id];
        const mine = m.sender_id === user!.id;
        if (!mine && (!readAt || new Date(m.created_at) > new Date(readAt))) {
          unread[m.conversation_id] = (unread[m.conversation_id] || 0) + 1;
        }
      }

      return list
        .map((c) => {
          const participantIds = byConv[c.id] || [];
          let displayTitle = c.title || 'Conversation';
          if (c.type === 'ai') displayTitle = 'Office AI';
          else if (c.type === 'dm') {
            const other = participantIds.find((id) => id !== user!.id);
            displayTitle = (other && names?.[other]) || 'Teammate';
          } else if (c.type === 'announcement') {
            displayTitle = c.title || 'Announcement';
          } else if (c.type === 'group' && !c.title) {
            displayTitle = participantIds
              .filter((id) => id !== user!.id)
              .map((id) => names?.[id] || 'Teammate')
              .join(', ') || 'Group';
          }
          return {
            ...c,
            participantIds,
            lastMessage: last[c.id] || null,
            unread: unread[c.id] || 0,
            displayTitle,
          };
        })
        .sort((a, b) => {
          const at = a.lastMessage?.created_at || a.updated_at;
          const bt = b.lastMessage?.created_at || b.updated_at;
          return bt.localeCompare(at);
        });
    },
  });
}

export function useUnreadMessageCount() {
  const { data } = useConversations();
  return useMemo(() => (data || []).reduce((sum, c) => sum + c.unread, 0), [data]);
}

export function useConversationMessages(conversationId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['messages', conversationId] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);

  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as MessageRow[];
    },
  });
}

export function useSendMessage() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { error } = await supabase.from('messages').insert({
        org_id: ctx.org_id,
        conversation_id: conversationId,
        sender_id: user.id,
        sender_kind: 'member',
        content: content.trim(),
      });
      if (error) throw error;
      return conversationId;
    },
    onSuccess: (conversationId) => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e: Error) =>
      toast({ title: 'Message not sent', description: e.message, variant: 'destructive' }),
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc('mark_conversation_read', { _conv: conversationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useStartDm() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc('ensure_dm', { _other_user: otherUserId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    onError: (e: Error) =>
      toast({ title: 'Could not start chat', description: e.message, variant: 'destructive' }),
  });
}

export function useEnsureAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ensure_ai_conversation');
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useCreateGroup() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ title, userIds }: { title: string; userIds: string[] }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ org_id: ctx.org_id, type: 'group', title: title.trim() || null, created_by: user.id })
        .select('id')
        .single();
      if (error) throw error;
      const rows = [user.id, ...userIds].map((uid) => ({
        org_id: ctx.org_id,
        conversation_id: conv.id,
        user_id: uid,
      }));
      const { error: pErr } = await supabase.from('conversation_participants').insert(rows);
      if (pErr) throw pErr;
      return conv.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    onError: (e: Error) =>
      toast({ title: 'Could not create group', description: e.message, variant: 'destructive' }),
  });
}

export function useCreateAnnouncement() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      title,
      audience,
      content,
    }: {
      title: string;
      audience: Audience;
      content: string;
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({
          org_id: ctx.org_id,
          type: 'announcement',
          title: title.trim(),
          audience,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      const { error: mErr } = await supabase.from('messages').insert({
        org_id: ctx.org_id,
        conversation_id: conv.id,
        sender_id: user.id,
        sender_kind: 'member',
        content: content.trim(),
      });
      if (mErr) throw mErr;
      return conv.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Announcement posted' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not post', description: e.message, variant: 'destructive' }),
  });
}

export function useReportMessage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ messageId, note }: { messageId: string; note?: string }) => {
      const { error } = await supabase.rpc('report_message', {
        _message_id: messageId,
        _note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      toast({
        title: 'Reported to the owner',
        description: 'Only this one message was shared. The rest of the conversation stays private.',
      });
      void vars;
    },
    onError: (e: Error) =>
      toast({ title: 'Could not report', description: e.message, variant: 'destructive' }),
  });
}

/** Asks the office AI for today's message (at most one per day, fails open). */
export function useOfficeAi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'reply' | 'proactive') => {
      const { data, error } = await supabase.functions.invoke('office-ai', { body: { action } });
      if (error) throw error;
      return data as { ok: boolean; conversationId?: string; skipped?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    // fail open: the office AI going quiet must never break messaging
    onError: () => undefined,
  });
}
