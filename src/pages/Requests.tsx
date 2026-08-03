import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Inbox, PenSquare } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMessagingSettings } from '@/hooks/useMessagingSettings';
import { useRequests, useMessageableTeam, useOrgNames, isOpen, type OfficeRequest } from '@/hooks/useRequests';
import { useDoctorBoard } from '@/hooks/useDoctorBoard';
import { inboxLabel, statusCopy } from '@/lib/messaging-settings';
import RequestComposer from '@/components/requests/RequestComposer';
import RequestThread from '@/components/requests/RequestThread';
import { formatDateShort } from '@/lib/time-utils';
import { toast } from 'sonner';

function Row({
  r,
  names,
  onOpen,
}: {
  r: OfficeRequest;
  names: Map<string, string>;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-2">
        {!r.first_seen_at && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
        <Badge variant="secondary" className="text-[10px]">
          {r.category}
        </Badge>
        {r.needs_reply && !r.closed_at && (
          <Badge className="bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
            Needs a reply
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {formatDateShort(r.created_at)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm">{r.note}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {names.get(r.sender_id) ?? 'Teammate'} · {statusCopy(r.status)}
      </p>
    </button>
  );
}

export default function Requests() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { settings } = useMessagingSettings();
  const { data: team = [] } = useMessageableTeam();
  const { data: names = new Map() } = useOrgNames();
  const { inbox, sent, send, markSeen, acknowledge, setStatus, reply, hardDelete } = useRequests();
  const board = useDoctorBoard();

  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const isDoctor = ctx?.role === 'owner';
  const title = inboxLabel(settings, !!isDoctor);
  const all = [...(inbox.data ?? []), ...(sent.data ?? [])];
  const active = useMemo(() => all.find(r => r.id === openId) ?? null, [all, openId]);

  const openInbox = (inbox.data ?? []).filter(isOpen);
  const closedInbox = (inbox.data ?? []).filter(r => !isOpen(r));

  if (!settings.enabled) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Messaging is turned off for this office.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">
              Short notes with a reference — never patient details.
            </p>
          </div>
          <Button size="sm" onClick={() => setComposing(true)}>
            <PenSquare className="mr-1.5 h-4 w-4" /> New
          </Button>
        </div>

        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">
              Waiting {openInbox.length > 0 && `(${openInbox.length})`}
            </TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="mt-3 space-y-2">
            {openInbox.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Inbox className="h-5 w-5" />
                  Nothing waiting on you.
                </CardContent>
              </Card>
            ) : (
              openInbox.map(r => (
                <Row key={r.id} r={r} names={names} onOpen={() => setOpenId(r.id)} />
              ))
            )}
          </TabsContent>

          <TabsContent value="done" className="mt-3 space-y-2">
            {closedInbox.map(r => (
              <Row key={r.id} r={r} names={names} onOpen={() => setOpenId(r.id)} />
            ))}
          </TabsContent>

          <TabsContent value="sent" className="mt-3 space-y-2">
            {(sent.data ?? []).map(r => (
              <Row key={r.id} r={r} names={names} onOpen={() => setOpenId(r.id)} />
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={composing} onOpenChange={setComposing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
          </DialogHeader>
          <RequestComposer
            settings={settings}
            team={team}
            sending={send.isPending}
            onSend={async input => {
              await send.mutateAsync(input);
              setComposing(false);
              toast.success('Sent.');
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!active} onOpenChange={o => !o && setOpenId(null)}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
          </DialogHeader>
          {active && user && (
            <RequestThread
              request={active}
              names={names}
              currentUserId={user.id}
              isDoctor={!!isDoctor}
              onSeen={() => markSeen.mutate(active)}
              onReply={async body => {
                await reply.mutateAsync({ r: active, body });
              }}
              onAcknowledge={() => acknowledge.mutate(active)}
              onHandled={() => {
                setStatus.mutate({ r: active, status: 'handled' });
                setOpenId(null);
              }}
              onAddToList={async () => {
                await board.create.mutateAsync({
                  title: active.note.slice(0, 80),
                  note: active.reference ?? undefined,
                  source_request_id: active.id,
                });
                setStatus.mutate({ r: active, status: 'on_doctors_list' });
                toast.success('On your list.');
                setOpenId(null);
              }}
              onSendToManager={() => {
                setStatus.mutate({ r: active, status: 'sent_to_manager' });
                toast.success('Passed to the manager.');
                setOpenId(null);
              }}
              onDelete={() => {
                hardDelete.mutate(active);
                setOpenId(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
