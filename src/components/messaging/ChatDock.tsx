import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  Maximize2,
  Megaphone,
  MessageSquare,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkConversationRead,
  useEnsureAiConversation,
  useOfficeAiReply,
  conversationTitle,
  senderLabel,
  type ConversationSummary,
} from '@/hooks/useMessaging';
import {
  markConversationOpen,
  markConversationClosed,
  requestDesktopNotificationPermission,
} from '@/lib/active-conversation';

function typeIcon(type: string) {
  if (type === 'announcement') return Megaphone;
  if (type === 'group') return Users;
  if (type === 'ai') return Sparkles;
  return MessageSquare;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The conversation view inside the dock: thread + composer. */
function DockThread({
  conversation,
  nameByUserId,
  onBack,
}: {
  conversation: ConversationSummary;
  nameByUserId: Map<string, string>;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const send = useSendMessage();
  const aiReply = useOfficeAiReply();
  const markRead = useMarkConversationRead();
  const { data: messages = [] } = useMessages(conversation.id);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, aiReply.isPending]);

  // The corner popups skip a thread that is open here, and read state keeps
  // advancing while the thread stays on screen — same contract as the page.
  useEffect(() => {
    markConversationOpen(conversation.id);
    return () => markConversationClosed(conversation.id);
  }, [conversation.id]);

  const newestAt = messages.length ? messages[messages.length - 1].created_at : null;
  useEffect(() => {
    const stale =
      !conversation.lastReadAt || (newestAt !== null && newestAt > conversation.lastReadAt);
    if (conversation.unreadCount > 0 || stale) markRead.mutate(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, conversation.unreadCount, conversation.lastReadAt, newestAt]);

  const submit = () => {
    if (!draft.trim()) return;
    const conversationId = conversation.id;
    const isAi = conversation.type === 'ai';
    send.mutate(
      { conversationId, content: draft },
      {
        onSuccess: () => {
          setDraft('');
          if (isAi) aiReply.mutate(conversationId);
        },
      },
    );
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2.5 p-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages yet — say hello.</p>
          )}
          {messages.map(m => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm ${
                    mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                >
                  {!mine && (
                    <p className="mb-0.5 text-[10px] font-medium opacity-70">
                      {senderLabel(m.sender_kind, m.sender_id, nameByUserId)}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className="mt-0.5 text-right text-[9px] opacity-60">
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          {conversation.type === 'ai' && aiReply.isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Office AI is typing
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="flex items-end gap-1.5 border-t p-2">
        <Textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Write a message…"
          className="min-h-[38px] max-h-28 resize-none text-sm"
          hideDateline
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={submit}
          disabled={!draft.trim() || send.isPending}
          aria-label="Send"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      {/* Back sits under the composer so the thread keeps maximum height. */}
      <button
        onClick={onBack}
        className="flex items-center justify-center gap-1 border-t py-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All conversations
      </button>
    </>
  );
}

/**
 * The Google Chat-style dock: a bar pinned to the bottom corner on every
 * desktop page, expanding into a mini messenger — conversation list, thread,
 * composer — without leaving what you were doing. The full Messages page
 * stays one click away (the expand icon). Hidden on mobile: the bottom
 * navigation owns that edge, and the Inbox tab is always one tap away.
 */
export default function ChatDock() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useMessagingSettings();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: conversations = [] } = useConversations();
  const { data: employees } = useOrgEmployees();
  const ensureAi = useEnsureAiConversation();

  const nameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => {
      if (e.user_id) m.set(e.user_id, e.preferred_name || e.display_name || e.email || 'Teammate');
    });
    return m;
  }, [employees]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const active = conversations.find(c => c.id === activeId) ?? null;

  // The Messages page already is the chat surface — no dock on top of it.
  const onMessages =
    location.pathname.startsWith('/inbox') || location.pathname.startsWith('/messages');
  if (!settings.enabled || onMessages) return null;

  const toggle = () => {
    setOpen(v => !v);
    // Asking in the moment someone opens chat, not at page load.
    if (!open) requestDesktopNotificationPermission();
  };

  const title = active ? conversationTitle(active, user?.id, nameByUserId) : 'Chat';

  return (
    <div className="fixed bottom-0 right-[4.75rem] z-40 hidden w-80 flex-col md:flex">
      {open && (
        <div className="flex h-[26rem] flex-col overflow-hidden rounded-t-xl border border-b-0 bg-card shadow-2xl">
          {active ? (
            <>
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <span className="truncate text-sm font-medium">{title}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      navigate(`/inbox/messages?conversation=${active.id}`)
                    }
                    aria-label="Open in Messages"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggle}
                    aria-label="Minimize chat"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DockThread
                conversation={active}
                nameByUserId={nameByUserId}
                onBack={() => setActiveId(null)}
              />
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{settings.messages_label}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigate('/inbox/messages')}
                    aria-label="Open Messages page"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggle}
                    aria-label="Minimize chat"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="divide-y">
                  <button
                    onClick={async () => setActiveId(await ensureAi.mutateAsync())}
                    disabled={ensureAi.isPending}
                    className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm font-medium">Ask Office AI</span>
                    {ensureAi.isPending && (
                      <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
                    )}
                  </button>
                  {conversations
                    .filter(c => c.type !== 'ai')
                    .map(c => {
                      const Icon = typeIcon(c.type);
                      return (
                        <button
                          key={c.id}
                          onClick={() => setActiveId(c.id)}
                          className="flex w-full flex-col gap-0.5 p-3 text-left transition-colors hover:bg-muted/60"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">
                              {conversationTitle(c, user?.id, nameByUserId)}
                            </span>
                            {c.unreadCount > 0 && (
                              <Badge className="ml-auto h-5 px-1.5 text-[11px]">
                                {c.unreadCount}
                              </Badge>
                            )}
                          </div>
                          <p className="line-clamp-1 pl-6 text-xs text-muted-foreground">
                            {c.lastMessage?.content ?? 'No messages yet'}
                          </p>
                        </button>
                      );
                    })}
                  {conversations.length === 0 && (
                    <p className="p-4 text-sm text-muted-foreground">
                      No conversations yet. Start one from the Messages page.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={toggle}
        className="flex items-center gap-2 rounded-t-xl border border-b-0 bg-card px-4 py-2.5 shadow-lg transition-colors hover:bg-muted/60"
        aria-label={open ? 'Minimize chat' : 'Open chat'}
        aria-expanded={open}
      >
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Chat</span>
        {totalUnread > 0 && (
          <Badge className="h-5 min-w-5 justify-center px-1.5 text-[11px]">{totalUnread}</Badge>
        )}
        {open ? (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
