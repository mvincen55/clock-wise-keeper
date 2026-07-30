import { useMemo, useRef, useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Search,
  X,
  Send,
  Loader2,
  Megaphone,
  Users,
  MessageSquare,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useOrgEmployees } from '@/hooks/useEmployees';
import MessageAttachments from '@/components/MessageAttachments';
import {
  useConversationAttachments,
  validateAttachment,
} from '@/hooks/useMessageAttachments';
import {
  useConversations,
  useMessages,
  useMessageSearch,
  useSendMessage,
  useMarkConversationRead,
  useEnsureDm,
  useEnsureAiConversation,
  type ConversationSummary,
  type ConversationType,
} from '@/hooks/useMessaging';

const TYPE_LABEL: Record<string, string> = {
  dm: 'Direct',
  group: 'Group',
  announcement: 'Announcement',
  ai: 'Office AI',
};

function typeIcon(type: string) {
  if (type === 'announcement') return Megaphone;
  if (type === 'group') return Users;
  if (type === 'ai') return Sparkles;
  return MessageSquare;
}

function sinceIso(range: string): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Highlights every occurrence of the search term inside a message body. */
function Highlight({ text, term }: { text: string; term: string }) {
  const q = term.trim();
  if (q.length < 2) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-primary/25 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const { data: employees } = useOrgEmployees();
  const { data: conversations = [], isLoading } = useConversations();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ConversationType | 'all'>('all');
  const [senderFilter, setSenderFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [scopeToThread, setScopeToThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const send = useSendMessage();
  const markRead = useMarkConversationRead();
  const ensureDm = useEnsureDm();
  const ensureAi = useEnsureAiConversation();
  const { data: attachments = [] } = useConversationAttachments(activeId);
  const attByMessage = useMemo(() => {
    const m = new Map<string, typeof attachments>();
    attachments.forEach(a => m.set(a.message_id, [...(m.get(a.message_id) ?? []), a]));
    return m;
  }, [attachments]);

  const nameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => {
      if (e.user_id) m.set(e.user_id, e.preferred_name || e.display_name || e.email || 'Teammate');
    });
    return m;
  }, [employees]);

  const convTitle = (c: ConversationSummary): string => {
    if (c.type === 'ai') return 'Office AI';
    if (c.title) return c.title;
    if (c.type === 'dm') {
      const other = c.participantUserIds.find(id => id !== user?.id);
      return other ? nameByUserId.get(other) ?? 'Direct message' : 'Direct message';
    }
    return TYPE_LABEL[c.type] ?? 'Conversation';
  };

  const searching = query.trim().length >= 2;
  const { data: hits = [], isFetching: searchFetching } = useMessageSearch(
    {
      query,
      type: typeFilter,
      senderId: senderFilter,
      since: sinceIso(dateFilter),
      conversationId: scopeToThread ? activeId : null,
    },
    conversations,
  );

  const hitCountByConv = useMemo(() => {
    const m = new Map<string, number>();
    hits.forEach(h => m.set(h.conversation_id, (m.get(h.conversation_id) ?? 0) + 1));
    return m;
  }, [hits]);

  // Conversation list respects the same filters, plus name matching.
  const visibleConversations = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (unreadOnly && c.unreadCount === 0) return false;
      if (senderFilter !== 'all' && !c.participantUserIds.includes(senderFilter)) return false;
      const since = sinceIso(dateFilter);
      if (since && (c.lastMessage?.created_at ?? c.updated_at) < since) return false;
      if (q.length >= 2) {
        const nameMatch = convTitle(c).toLowerCase().includes(q);
        return nameMatch || (hitCountByConv.get(c.id) ?? 0) > 0;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, typeFilter, unreadOnly, senderFilter, dateFilter, query, hitCountByConv, nameByUserId, user?.id]);

  const active = conversations.find(c => c.id === activeId) ?? null;
  const { data: messages = [] } = useMessages(activeId);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, activeId]);

  useEffect(() => {
    if (activeId && active && active.unreadCount > 0) markRead.mutate(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.unreadCount]);

  const activeFilters =
    (typeFilter !== 'all' ? 1 : 0) +
    (senderFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (unreadOnly ? 1 : 0);

  const clearFilters = () => {
    setTypeFilter('all');
    setSenderFilter('all');
    setDateFilter('all');
    setUnreadOnly(false);
    setScopeToThread(false);
  };

  const openDm = async (userId: string) => {
    const id = await ensureDm.mutateAsync(userId);
    setActiveId(id);
    setNewDmOpen(false);
  };

  const openAi = async () => {
    const id = await ensureAi.mutateAsync();
    setActiveId(id);
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list) return;
    const next: File[] = [];
    for (const f of Array.from(list)) {
      const err = validateAttachment(f);
      if (err) {
        toast({ title: 'File not attached', description: `${f.name}: ${err}`, variant: 'destructive' });
        continue;
      }
      next.push(f);
    }
    setPending(p => [...p, ...next]);
  };

  const submit = () => {
    if (!activeId || (!draft.trim() && pending.length === 0)) return;
    send.mutate(
      { conversationId: activeId, content: draft, files: pending },
      {
        onSuccess: () => {
          setDraft('');
          setPending([]);
          if (fileRef.current) fileRef.current.value = '';
        },
      },
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
            <p className="text-sm text-muted-foreground">
              Private by design — only participants can read a conversation.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openAi}>
              <Sparkles className="mr-2 h-4 w-4" /> Office AI
            </Button>
            <Button size="sm" onClick={() => setNewDmOpen(v => !v)}>
              <Plus className="mr-2 h-4 w-4" /> New chat
            </Button>
          </div>
        </div>

        {newDmOpen && (
          <Card>
            <CardContent className="flex flex-wrap gap-2 pt-5">
              {(employees ?? [])
                .filter(e => e.user_id && e.user_id !== user?.id)
                .map(e => (
                  <Button
                    key={e.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => openDm(e.user_id as string)}
                    disabled={ensureDm.isPending}
                  >
                    {e.preferred_name || e.display_name}
                  </Button>
                ))}
            </CardContent>
          </Card>
        )}

        {/* Search + filters */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search conversations and message text…"
                className="pl-9 pr-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={v => setTypeFilter(v as ConversationType | 'all')}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="dm">Direct</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="announcement">Announcements</SelectItem>
                  <SelectItem value="ai">Office AI</SelectItem>
                </SelectContent>
              </Select>

              <Select value={senderFilter} onValueChange={setSenderFilter}>
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Anyone</SelectItem>
                  {(employees ?? [])
                    .filter(e => e.user_id)
                    .map(e => (
                      <SelectItem key={e.id} value={e.user_id as string}>
                        {e.preferred_name || e.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Any time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch id="unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
                <Label htmlFor="unread-only" className="text-sm">Unread only</Label>
              </div>

              {activeId && searching && (
                <div className="flex items-center gap-2">
                  <Switch id="this-thread" checked={scopeToThread} onCheckedChange={setScopeToThread} />
                  <Label htmlFor="this-thread" className="text-sm">This conversation only</Label>
                </div>
              )}

              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters ({activeFilters})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Conversation list */}
          <Card className="overflow-hidden">
            <ScrollArea className="h-[62vh]">
              <div className="divide-y">
                {isLoading && (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                )}
                {!isLoading && visibleConversations.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground">No conversations match.</p>
                )}
                {visibleConversations.map(c => {
                  const Icon = typeIcon(c.type);
                  const hitCount = hitCountByConv.get(c.id) ?? 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={`flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-muted/60 ${
                        activeId === c.id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm font-medium">{convTitle(c)}</span>
                        {c.unreadCount > 0 && (
                          <Badge className="ml-auto h-5 px-1.5 text-[11px]">{c.unreadCount}</Badge>
                        )}
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {c.lastMessage?.content ?? 'No messages yet'}
                      </p>
                      {searching && hitCount > 0 && (
                        <span className="text-[11px] text-primary">
                          {hitCount} match{hitCount === 1 ? '' : 'es'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>

          {/* Right pane: search results while searching, otherwise the thread */}
          <Card className="flex flex-col overflow-hidden">
            {searching ? (
              <>
                <div className="flex items-center gap-2 border-b p-3 text-sm">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {searchFetching ? 'Searching…' : `${hits.length} result${hits.length === 1 ? '' : 's'} for “${query.trim()}”`}
                  </span>
                </div>
                <ScrollArea className="h-[56vh]">
                  <div className="divide-y">
                    {hits.length === 0 && !searchFetching && (
                      <p className="p-4 text-sm text-muted-foreground">
                        No messages found. Try fewer filters or a shorter phrase.
                      </p>
                    )}
                    {hits.map(h => (
                      <button
                        key={h.id}
                        onClick={() => {
                          setActiveId(h.conversation_id);
                          setQuery('');
                        }}
                        className="w-full space-y-1 p-3 text-left hover:bg-muted/60"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-[11px]">
                            {TYPE_LABEL[h.conversation?.type ?? ''] ?? 'Conversation'}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {h.sender_kind === 'ai'
                              ? 'Office AI'
                              : nameByUserId.get(h.sender_id ?? '') ?? 'Teammate'}
                          </span>
                          <span>{timeLabel(h.created_at)}</span>
                        </div>
                        <p className="text-sm">
                          <Highlight text={h.content} term={query} />
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : active ? (
              <>
                <div className="flex items-center gap-2 border-b p-3">
                  <span className="text-sm font-medium">{convTitle(active)}</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {TYPE_LABEL[active.type] ?? active.type}
                  </Badge>
                </div>
                <ScrollArea className="h-[46vh]">
                  <div className="space-y-3 p-4">
                    {messages.length === 0 && (
                      <p className="text-sm text-muted-foreground">No messages yet — say hello.</p>
                    )}
                    {messages.map(m => {
                      const mine = m.sender_id === user?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                              mine ? 'bg-primary text-primary-foreground' : 'bg-muted'
                            }`}
                          >
                            {!mine && (
                              <p className="mb-0.5 text-[11px] font-medium opacity-70">
                                {m.sender_kind === 'ai'
                                  ? 'Office AI'
                                  : nameByUserId.get(m.sender_id ?? '') ?? 'Teammate'}
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            <p className="mt-1 text-[10px] opacity-60">{timeLabel(m.created_at)}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
                <div className="flex items-end gap-2 border-t p-3">
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
                    className="min-h-[44px] resize-none"
                  />
                  <Button onClick={submit} disabled={!draft.trim() || send.isPending}>
                    {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex h-[56vh] items-center justify-center p-6 text-sm text-muted-foreground">
                Pick a conversation, or search to find a phrase across everything you can read.
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
