/**
 * Pure rules behind the end-of-night "Messages read" item.
 *
 * Kept out of the hook so the rules can be read — and tested — on their own,
 * without a database in the way.
 */

export type CloseoutExclusion = 'owner' | 'off' | 'not-scheduled' | 'time-off';

export interface ReceivedMessage {
  id: string;
  note: string;
  needs_reply: boolean;
  created_at: string;
  first_seen_at?: string | null;
  acknowledged_at?: string | null;
}

export interface OutstandingMessage {
  id: string;
  note: string;
  needs_reply: boolean;
  created_at: string;
}

/**
 * Whether the item exists for this person at all, before any message is read.
 * Returns null when it does apply.
 */
export function closeoutExclusion(input: {
  role: string | null | undefined;
  messagingEnabled: boolean;
  closeoutEnabled: boolean;
  onTimeOff?: boolean;
  scheduledToday?: boolean;
}): CloseoutExclusion | null {
  if (input.role === 'owner') return 'owner';
  if (!input.messagingEnabled || !input.closeoutEnabled) return 'off';
  if (input.onTimeOff) return 'time-off';
  if (input.scheduledToday === false) return 'not-scheduled';
  return null;
}

/** Eastern-wall cutoff, in minutes past midnight, for "this counts today". */
export function closeoutCutoffMinutes(endMinutes: number | null, graceMinutes: number): number {
  const end = endMinutes ?? 17 * 60;
  return Math.max(0, end - graceMinutes);
}

/**
 * The notes still owed at closeout.
 *
 * - A note that needs a reply clears only by replying or by an explicit
 *   acknowledgement — opening it is not reading it.
 * - A plain note clears the moment it is opened.
 * - A note that landed after the person clocked out was never theirs today.
 */
export function outstandingCloseoutMessages(
  received: ReceivedMessage[],
  opts: { clockedOutAt?: string | null; repliedTo?: Iterable<string> } = {},
): OutstandingMessage[] {
  const replied = new Set(opts.repliedTo ?? []);
  return received
    .filter(m => !opts.clockedOutAt || m.created_at <= opts.clockedOutAt)
    .filter(m =>
      m.needs_reply
        ? !m.acknowledged_at && !replied.has(m.id)
        : !m.first_seen_at,
    )
    .map(m => ({
      id: m.id,
      note: m.note,
      needs_reply: m.needs_reply,
      created_at: m.created_at,
    }));
}
