import { Check, CheckCheck } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface ReadReceipt {
  user_id: string;
  last_read_at: string | null;
}

interface Props {
  /** Participants excluding the sender. */
  receipts: ReadReceipt[];
  /** ISO timestamp of the message. */
  messageCreatedAt: string;
  nameByUserId: Map<string, string>;
  /** Show a compact icon-only form (used for DMs). */
  compact?: boolean;
}

/**
 * Derives per-message read state from each participant's last_read_at — the
 * same field that drives unread counts, so the two can never disagree.
 */
export default function MessageReadReceipts({
  receipts,
  messageCreatedAt,
  nameByUserId,
  compact = false,
}: Props) {
  if (receipts.length === 0) return null;

  const readers = receipts.filter(
    r => r.last_read_at && r.last_read_at >= messageCreatedAt,
  );
  const names = readers.map(r => nameByUserId.get(r.user_id) ?? 'Teammate');
  const all = readers.length === receipts.length;

  const label = readers.length === 0
    ? 'Sent'
    : all
      ? compact ? 'Read' : `Read by everyone (${readers.length})`
      : `Read by ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`;

  const Icon = readers.length === 0 ? Check : CheckCheck;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`mt-0.5 inline-flex items-center gap-1 text-[10px] ${
              readers.length > 0 ? 'opacity-90' : 'opacity-55'
            }`}
          >
            <Icon className="h-3 w-3" />
            {!compact && <span>{label}</span>}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[220px] text-xs">
          {readers.length === 0 ? (
            <span>Not read yet</span>
          ) : (
            <span>Read by {names.join(', ')}</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
