import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export type ConversationType = 'dm' | 'group' | 'announcement' | 'ai';

export interface ConversationRow {
  id: string;
  org_id: string;
  type: string;
  title: string | null;
  audience: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummary extends ConversationRow {
  participantUserIds: string[];
  lastMessage: { content: string; created_at: string; sender_id: string | null } | null;
  unreadCount: number;
  lastReadAt: string | null;
}

export interface MessageRow {
  id: string;
  org_id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_kind: string;
  content: string;
  reported_at: string | null;
  created_at: string;
}

const sel = (s: string): string => s;

/**
 * All conversations the signed-in user can read, with last message + unread
 * counts. RLS scopes this to conversations they participate in — there is no
 * admin override anywhere, by design.
 */
export function useConversations() {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();

  return useQuery({
    queryKey: ['conversations', ctx?.org_id, user?.id],
    enabled: !!ctx?.org_id && !!user?.id,
    refetchInterval: 20000,
    queryFn: async (): Promise<ConversationSummary[]> => {
      const { data: convs, error } = await supabase
        .from('conversations')
        .select(sel('*'))
        .eq('org_id', ctx!.org_id)
        .order('updated_at', { ascending: false })
        .returns<ConversationRow[]>();
      if (error) throw error;
      if (!convs || convs.length === 0) return [];

      const ids = convs.map(c => c.id);

      const [{ data: parts }, { data: msgs }] = await Promise.all([
        supabase
          .from('conversation_participants')
          .select(sel('conversation_id, user_id, last_read_at'))
          .in('conversation_id', ids)
          .returns<{ conversation_id: string; user_id: string; last_read_at: string | null }[]>(),
        supabase
          .from('messages')
          .select(sel('id, conversation_id, sender_id, content, created_at'))
          .in('conversation_id', ids)
          .order('created_at', { ascending: false })
          .limit(2000)
          .returns<
            { id: string; conversation_id: string; sender_id: string | null; content: string; created_at: string }[]
          >(),
      ]);

      return convs.map(c => {
        const cParts = (parts ?? []).filter(p => p.conversation_id === c.id);
        const mine = cParts.find(p => p.user_id === user!.id);
        const cMsgs = (msgs ?? []).filter(m => m.conversation_id === c.id);
        const last = cMsgs[0] ?? null;
        const lastRead = mine?.last_read_at ?? null;
        const unread = cMsgs.filter(
          m => m.sender_id !== user!.id && (!lastRead || m.created_at > lastRead),
        ).length;

        return {
          ...c,
          participantUserIds: cParts.map(p => p.user_id),
          lastMessage: last
            ? { content: last.content, created_at: last.created_at, sender_id: last.sender_id }
            : null,
          unreadCount: unread,
          lastReadAt: lastRead,
        };
      });
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    refetchInterval: 10000,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select(sel('*'))
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .returns<MessageRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface MessageSearchFilters {
  query: string;
  /** Restrict to conversations of this type. */
  type?: ConversationType | 'all';
  /** Restrict to a single sender (auth user id). */
  senderId?: string | 'all';
  /** ISO date lower bound. */
  since?: string | null;
  conversationId?: string | null;
}

export interface MessageSearchHit extends MessageRow {
  conversation: ConversationRow | null;
}

/**
 * Full-text style search across every message the user is allowed to read.
 * RLS does the scoping: nobody can search a conversation they are not in.
 */
export function useMessageSearch(filters: MessageSearchFilters, conversations: ConversationSummary[]) {
  const { data: ctx } = useOrgContext();
  const q = filters.query.trim();

  return useQuery({
    queryKey: ['message-search', ctx?.org_id, q, filters.type, filters.senderId, filters.since, filters.conversationId],
    enabled: !!ctx?.org_id && q.length >= 2,
    queryFn: async (): Promise<MessageSearchHit[]> => {
      let builder = supabase
        .from('messages')
        .select(sel('*'))
        .eq('org_id', ctx!.org_id)
        .ilike('content', `%${q.replace(/[%_]/g, m => `\\${m}`)}%`);

      if (filters.senderId && filters.senderId !== 'all') {
        builder = builder.eq('sender_id', filters.senderId);
      }
      if (filters.since) {
        builder = builder.gte('created_at', filters.since);
      }
      if (filters.conversationId) {
        builder = builder.eq('conversation_id', filters.conversationId);
      }

      const { data, error } = await builder
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<MessageRow[]>();
      if (error) throw error;

      const byId = new Map(conversations.map(c => [c.id, c as ConversationRow]));
      return (data ?? [])
        .map(m => ({ ...m, conversation: byId.get(m.conversation_id) ?? null }))
        .filter(hit => {
          if (!filters.type || filters.type === 'all') return true;
          return hit.conversation?.type === filters.type;
        });
    },
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      files = [],
    }: {
      conversationId: string;
      content: string;
      files?: File[];
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          org_id: ctx.org_id,
          conversation_id: conversationId,
          sender_id: user.id,
          sender_kind: 'member',
          content: content.trim(),
        })
        .select('id')
        .single();
      if (error) throw error;

      for (const file of files) {
        // Path is always <org_id>/<conversation_id>/<file> — storage RLS
        // reads the conversation id out of the path and allows participants only.
        const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
        const path = `${ctx.org_id}/${conversationId}/${crypto.randomUUID()}-${safe}`;
        const up = await supabase.storage
          .from('message-attachments')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;

        const { error: rowErr } = await supabase.from('message_attachments').insert({
          org_id: ctx.org_id,
          conversation_id: conversationId,
          message_id: msg.id,
          uploaded_by: user.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        });
        if (rowErr) {
          await supabase.storage.from('message-attachments').remove([path]);
          throw rowErr;
        }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', vars.conversationId] });
      qc.invalidateQueries({ queryKey: ['message-attachments', vars.conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e: Error) => toast({ title: 'Message not sent', description: e.message, variant: 'destructive' }),
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

export function useEnsureDm() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc('ensure_dm', { _other_user: otherUserId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
    onError: (e: Error) => toast({ title: 'Could not open chat', description: e.message, variant: 'destructive' }),
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
