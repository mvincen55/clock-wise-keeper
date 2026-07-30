import { useEffect } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Check, CornerUpLeft, ListPlus, Send, Trash2, Eye } from 'lucide-react';
import { formatDateShort } from '@/lib/time-utils';
import { useRequestReplies, type OfficeRequest } from '@/hooks/useRequests';
import { statusCopy } from '@/lib/messaging-settings';

interface Props {
  request: OfficeRequest;
  names: Map<string, string>;
  currentUserId: string;
  isDoctor: boolean;
  onReply: (body: string) => Promise<void> | void;
  onHandled: () => void;
  onAddToList: () => void;
  onSendToManager: () => void;
  onAcknowledge: () => void;
  onDelete: () => void;
  onSeen: () => void;
}

function stamp(iso: string | null) {
  return iso ? formatDateShort(iso) : null;
}

export default function RequestThread({
  request,
  names,
  currentUserId,
  isDoctor,
  onReply,
  onHandled,
  onAddToList,
  onSendToManager,
  onAcknowledge,
  onDelete,
  onSeen,
}: Props) {
  const { replies, markRepliesSeen } = useRequestReplies(request.id);
  const [body, setBody] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isRecipient = request.recipient_id === currentUserId;

  // The Seen stamp is written here and only here — when the thread is open on
  // screen. Never from a list row, never from a notification preview.
  useEffect(() => {
    if (isRecipient) onSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  useEffect(() => {
    if (replies.length) markRepliesSeen.mutate(replies);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replies.length]);

  const send = async () => {
    if (!body.trim()) return;
    await onReply(body);
    setBody('');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {request.category}
          </Badge>
          {request.needs_reply && (
            <Badge className="bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
              Needs a reply
            </Badge>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatDateShort(request.created_at)}
          </span>
        </div>
        {request.reference && (
          <p className="font-mono text-xs text-muted-foreground">{request.reference}</p>
        )}
        <p className="whitespace-pre-wrap text-sm">{request.note}</p>
        <p className="text-[11px] text-muted-foreground">
          From {names.get(request.sender_id) ?? 'Teammate'} ·{' '}
          {stamp(request.first_seen_at) ? `Seen ${stamp(request.first_seen_at)}` : 'Not opened yet'}
          {request.acknowledged_at && ` · Got it ${stamp(request.acknowledged_at)}`}
        </p>
        <p className="text-[11px] font-medium text-muted-foreground">
          {statusCopy(request.status)}
        </p>
      </div>

      {replies.map(r => (
        <div
          key={r.id}
          className={`rounded-lg border p-3 ${
            r.sender_id === currentUserId ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
          }`}
        >
          <p className="whitespace-pre-wrap text-sm">{r.body}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            {names.get(r.sender_id) ?? 'Teammate'} · {formatDateShort(r.created_at)}
            {r.first_seen_at && (
              <>
                <Eye className="ml-1 h-3 w-3" /> Seen {stamp(r.first_seen_at)}
              </>
            )}
          </p>
        </div>
      ))}

      {isRecipient && !request.closed_at && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onHandled}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Handled
          </Button>
          {request.needs_reply && !request.acknowledged_at && (
            <Button size="sm" variant="outline" onClick={onAcknowledge}>
              Got it
            </Button>
          )}
          {isDoctor && (
            <>
              <Button size="sm" variant="outline" onClick={onAddToList}>
                <ListPlus className="mr-1.5 h-3.5 w-3.5" /> Add to my list
              </Button>
              <Button size="sm" variant="outline" onClick={onSendToManager}>
                <CornerUpLeft className="mr-1.5 h-3.5 w-3.5" /> Send to manager
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={confirmDelete ? 'destructive' : 'ghost'}
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {confirmDelete ? 'Delete for good?' : 'Delete'}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="Reply…"
          className="resize-none text-sm"
        />
        <Button size="sm" onClick={send} disabled={!body.trim()}>
          <Send className="mr-1.5 h-3.5 w-3.5" /> Reply
        </Button>
      </div>
    </div>
  );
}
