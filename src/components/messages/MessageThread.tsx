import { useEffect, useMemo, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Flag, Lock, Megaphone, MoreHorizontal, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useConversationMessages,
  useMarkConversationRead,
  useOfficeAi,
  useReportMessage,
  useSendMessage,
  useTeamNames,
  type ConversationSummary,
} from '@/hooks/useMessaging';
import { formatTime } from '@/lib/time-utils';

const AUDIENCE_LABEL: Record<string, string> = {
  all: 'Entire team',
  clinical: 'Clinical only',
  clerical: 'Clerical only',
};

export default function MessageThread({
  conversation,
  onBack,
  canPostAnnouncement,
}: {
  conversation: ConversationSummary;
  onBack: () => void;
  canPostAnnouncement: boolean;
}) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useConversationMessages(conversation.id);
  const { data: names } = useTeamNames();
  const send = useSendMessage();
  const markRead = useMarkConversationRead();
  const report = useReportMessage();
  const officeAi = useOfficeAi();
  const [draft, setDraft] = useState('');
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  const isAi = conversation.type === 'ai';
  const isAnnouncement = conversation.type === 'announcement';
  const readOnly = isAnnouncement && !canPostAnnouncement;

  useEffect(() => {
    markRead.mutate(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, messages?.length]);

  // The office AI answers whenever the member's message is the newest one.
  const awaitingAi = useMemo(() => {
    if (!isAi || !messages?.length) return false;
    return messages[messages.length - 1].sender_kind === 'member';
  }, [isAi, messages]);

  useEffect(() => {
    if (isAi && awaitingAi && !officeAi.isPending) officeAi.mutate('reply');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAi, awaitingAi]);

  const handleSubmit = async (_m: unknown, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || send.isPending) return;
    setDraft('');
    await send.mutateAsync({ conversationId: conversation.id, content: text });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {isAnnouncement ? (
          <Megaphone className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{conversation.displayTitle}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {isAnnouncement
              ? `Announcement · ${AUDIENCE_LABEL[conversation.audience || 'all']}`
              : isAi
                ? 'Just you and the office AI. Nobody else can read this.'
                : 'Messages stay between the people in them.'}
          </p>
        </div>
      </div>

      <Conversation className="flex-1">
        <ConversationContent className="gap-3">
          {isLoading && <Shimmer className="text-sm">Loading…</Shimmer>}
          {!isLoading && !messages?.length && (
            <ConversationEmptyState
              icon={isAi ? <Shield className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
              title={isAi ? 'Your private line to the office' : 'No messages yet'}
              description={
                isAi
                  ? 'Ask about your goals, training, or the office rules. This channel is yours alone.'
                  : 'Messages stay between the people in them.'
              }
            />
          )}
          {(messages || []).map((m) => {
            const mine = m.sender_id === user?.id;
            const senderName =
              m.sender_kind === 'pathfinder'
                ? 'Office AI'
                : (m.sender_id && names?.[m.sender_id]) || 'Teammate';
            return (
              <div key={m.id} className="group">
                {!mine && conversation.type !== 'dm' && (
                  <p className="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground">
                    {senderName}
                  </p>
                )}
                <Message from={mine ? 'user' : 'assistant'}>
                  <MessageContent
                    className={
                      mine
                        ? 'bg-primary text-primary-foreground'
                        : m.sender_kind === 'pathfinder'
                          ? 'bg-transparent p-0'
                          : 'bg-muted text-foreground'
                    }
                  >
                    {m.sender_kind === 'pathfinder' ? (
                      <MessageResponse>{m.content}</MessageResponse>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{m.content}</span>
                    )}
                  </MessageContent>
                </Message>
                <div className="mt-0.5 flex items-center gap-2 px-1">
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(m.created_at)}
                  </span>
                  {m.reported_at && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] text-destructive border-destructive/40">
                      <Flag className="mr-0.5 h-2.5 w-2.5" />Reported to owner
                    </Badge>
                  )}
                  {!mine && !m.reported_at && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => setReportTarget(m.id)}>
                          <Flag className="mr-2 h-3.5 w-3.5" />Report to owner
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
          {isAi && (awaitingAi || officeAi.isPending) && (
            <Shimmer className="px-1 text-sm">Thinking…</Shimmer>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {readOnly ? (
        <div className="border-t px-3 py-3 text-center text-xs text-muted-foreground">
          Announcements are read-only.
        </div>
      ) : (
        <div className="border-t p-2">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={isAi ? 'Ask the office anything…' : 'Write a message…'}
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit
                status={send.isPending ? 'submitted' : undefined}
                disabled={!draft.trim()}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      )}

      <AlertDialog open={!!reportTarget} onOpenChange={(o) => !o && setReportTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report this message to the owner?</AlertDialogTitle>
            <AlertDialogDescription>
              Only this one message is shared with the owner, and it will be marked as reported.
              The rest of the conversation stays private.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (reportTarget) report.mutate({ messageId: reportTarget });
                setReportTarget(null);
              }}
            >
              Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
