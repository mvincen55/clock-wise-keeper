import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Lock, Megaphone, MessageSquarePlus, Shield, Users } from 'lucide-react';
import MessageThread from '@/components/messages/MessageThread';
import {
  NewAnnouncementDialog,
  NewConversationDialog,
} from '@/components/messages/NewConversationDialogs';
import {
  useConversations,
  useEnsureAiConversation,
  useOfficeAi,
  type ConversationSummary,
} from '@/hooks/useMessaging';
import { useOrgContext } from '@/hooks/useOrgContext';

function ConversationRow({
  conv,
  active,
  onSelect,
}: {
  conv: ConversationSummary;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon =
    conv.type === 'announcement' ? Megaphone : conv.type === 'ai' ? Shield : conv.type === 'group' ? Users : Lock;
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/60 ${
        active ? 'bg-muted' : ''
      }`}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{conv.displayTitle}</p>
          {conv.unread > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {conv.unread}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {conv.lastMessage?.content || 'No messages yet'}
        </p>
      </div>
    </button>
  );
}

export default function Messages() {
  const { data: ctx } = useOrgContext();
  const { data: conversations, isLoading } = useConversations();
  const ensureAi = useEnsureAiConversation();
  const officeAi = useOfficeAi();
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(false);
  const [announceOpen, setAnnounceOpen] = useState(false);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const activeId = params.get('c');

  // Everyone gets their private office-AI channel, and one nudge a day lands there.
  useEffect(() => {
    if (!ctx) return;
    ensureAi.mutateAsync().then(() => officeAi.mutate('proactive')).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.org_id]);

  const active = useMemo(
    () => (conversations || []).find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );

  const select = (id: string | null) => {
    if (id) setParams({ c: id });
    else setParams({});
  };

  return (
    <>
      <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col px-3 py-4 md:px-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Messages</h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Messages stay between the people in them — managers and
              owners included.
            </p>
          </div>
          <div className="flex gap-2">
            {isManager && (
              <Button variant="outline" size="sm" onClick={() => setAnnounceOpen(true)}>
                <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Announcement</span>
              </Button>
            )}
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">New message</span>
            </Button>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={`w-full shrink-0 overflow-y-auto border-r md:block md:w-72 ${
              active ? 'hidden' : 'block'
            }`}
          >
            {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && !conversations?.length && (
              <p className="p-4 text-sm text-muted-foreground">
                Nothing here yet. Start a private chat with a teammate.
              </p>
            )}
            {(conversations || []).map((c) => (
              <ConversationRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onSelect={() => select(c.id)}
              />
            ))}
          </div>

          <div className={`min-w-0 flex-1 ${active ? 'block' : 'hidden md:block'}`}>
            {active ? (
              <MessageThread
                conversation={active}
                onBack={() => select(null)}
                canPostAnnouncement={!!isManager}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <Lock className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Pick a conversation</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Nobody but the people in a conversation can read it. Not managers, not owners.
                </p>
                <Badge variant="outline" className="mt-1 text-[10px]">
                  Private by default
                </Badge>
              </div>
            )}
          </div>
        </Card>
      </div>

      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} onCreated={select} />
      <NewAnnouncementDialog open={announceOpen} onOpenChange={setAnnounceOpen} onCreated={select} />
    </>
  );
}
