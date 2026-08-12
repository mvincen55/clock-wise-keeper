import { useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useNotifications, type Notification } from '@/hooks/useNotifications';

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

const TYPE_FALLBACK_TITLE: Record<string, string> = {
  dm: 'Direct message',
  group: 'Group',
  announcement: 'Announcement',
  ai: 'Office AI',
};

/** One name for a conversation, shared by the Messages page and the chat dock. */
export function conversationTitle(
  c: ConversationSummary,
  currentUserId: string | null | undefined,
  nameByUserId: Map<string, string>,
): string {
  if (c.type === 'ai') return 'Office AI';
  if (c.title) return c.title;
  if (c.type === 'dm') {
    const other = c.participantUserIds.find(id => id !== currentUserId);
    return (other && nameByUserId.get(other)) || 'Direct message';
  }
  return TYPE_FALLBACK_TITLE[c.type] ?? 'Conversation';
}

/**
 * Who a message is from, as shown in a thread. The schema spells the AI
 * 'pathfinder'; 'ai' is accepted too in case of legacy rows.
 */
export function senderLabel(
  senderKind: string,
  senderId: string | null,
  nameByUserId: Map<string, string>,
): string {
  if (senderKind === 'pathfinder' || senderKind === 'ai') return 'Office AI';
  if (senderKind === 'system') return 'System';
  return nameByUserId.get(senderId ?? '') ?? 'Teammate';
}

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

export interface ParticipantReceipt {
  user_id: string;
  last_read_at: string | null;
}

/**
 * Read receipts for the open conversation, derived straight from each
 * participant's `last_read_at`. RLS only lets participants read these rows.
 */
export function useConversationReceipts(conversationId: string | null) {
  return useQuery({
    queryKey: ['conversation-receipts', conversationId],
    enabled: !!conversationId,
    refetchInterval: 10000,
    queryFn: async (): Promise<ParticipantReceipt[]> => {
      const { data, error } = await supabase
        .from('conversation_participants')
        .select(sel('user_id, last_read_at'))
        .eq('conversation_id', conversationId!)
        .returns<ParticipantReceipt[]>();
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
        const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
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

/**
 * Ask Office AI to answer the latest member message in an AI conversation.
 * Fire this after useSendMessage succeeds; while it is pending the thread
 * shows a typing indicator. The reply row is inserted server-side, so
 * success is just a refetch away.
 */
export function useOfficeAiReply() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke('office-ai-chat', {
        body: { conversation_id: conversationId },
      });
      if (error) throw new Error('Office AI could not reply right now — try again.');
      if (data?.error) throw new Error(data.error as string);
      return conversationId;
    },
    onError: (e: Error) =>
      toast({ title: 'Office AI', description: e.message, variant: 'destructive' }),
    onSettled: (_d, _e, conversationId) => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * True when a bell notification points at this conversation — the rows
 * notify_new_message writes, one per incoming message.
 */
export function isConversationNotification(
  n: Pick<Notification, 'related_table' | 'related_id'>,
  conversationId: string | null | undefined,
): boolean {
  return !!conversationId && n.related_table === 'conversations' && n.related_id === conversationId;
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user) throw new Error('Not ready');
      const { error } = await supabase.rpc('mark_conversation_read', { _conv: conversationId });
      if (error) throw error;
      // Reading the thread also retires its bell notifications. The
      // notify_new_message trigger writes one per incoming message; without
      // this, messages already seen in the chat keep the bell badge lit until
      // each row is clicked by hand.
      const { error: bellError } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_user_id', user.id)
        .eq('related_table', 'conversations')
        .eq('related_id', conversationId)
        .eq('is_read', false);
      if (bellError) throw bellError;
      return conversationId;
    },
    // Optimistic on the bell: the badge clears the moment the thread is read,
    // never waiting on the database write.
    onMutate: async (conversationId: string) => {
      await qc.cancelQueries({ queryKey: ['notifications', user?.id] });
      const previous = qc.getQueryData<Notification[]>(['notifications', user?.id]);
      qc.setQueryData<Notification[]>(['notifications', user?.id], old =>
        old
          ? old.map(n =>
              !n.is_read && isConversationNotification(n, conversationId) ? { ...n, is_read: true } : n,
            )
          : old,
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(['notifications', user?.id], context.previous);
    },
    onSettled: (_data, _err, conversationId) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['conversation-receipts', conversationId] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Keeps an on-screen thread's read state honest — the shared contract between
 * the Messages page and the chat dock.
 *
 * Two stores answer "has this person seen these messages?": the participant's
 * last_read_at (unread counts, other people's receipts) and the bell rows the
 * notify_new_message trigger writes per message. While the thread is open,
 * anything unread in either store triggers one mark-read pass that settles
 * both — so a conversation someone is looking at, or reopens later, never
 * lingers in the notification bell.
 */
export function useThreadReadMarker(
  conversation: ConversationSummary | null,
  newestMessageAt: string | null,
) {
  const markRead = useMarkConversationRead();
  const { data: notifications } = useNotifications();
  const conversationId = conversation?.id ?? null;
  const unreadBellRows = useMemo(
    () => (notifications ?? []).some(n => !n.is_read && isConversationNotification(n, conversationId)),
    [notifications, conversationId],
  );

  useEffect(() => {
    if (!conversation || markRead.isPending) return;
    const stale =
      !conversation.lastReadAt ||
      (newestMessageAt !== null && newestMessageAt > conversation.lastReadAt);
    if (conversation.unreadCount > 0 || stale || unreadBellRows) markRead.mutate(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unreadCount, conversation?.lastReadAt, newestMessageAt, unreadBellRows]);
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
