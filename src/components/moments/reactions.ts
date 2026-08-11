/**
 * TEAM MOMENTS — the closed set of approved reactions plus the pure rules that
 * govern them.
 *
 * Everything here is deliberately free of React and Supabase so the boundaries
 * (positive-only, length limits, one blocking sequence, reduced motion) can be
 * tested directly. The same closed set is enforced by a CHECK constraint in the
 * database, so a hand-rolled request cannot store a corrective reaction.
 */

export type ReactionKey =
  | 'nice_work'
  | 'celebrate'
  | 'thank_you'
  | 'crushed_it'
  | 'great_save'
  | 'team_win';

export type Reaction = {
  key: ReactionKey;
  /** Decorative only — never read out to assistive tech. */
  emoji: string;
  label: string;
  /** What a screen reader hears instead of the emoji. */
  spoken: string;
};

export const REACTIONS: readonly Reaction[] = [
  { key: 'nice_work', emoji: '👏', label: 'Nice work', spoken: 'Nice work' },
  { key: 'celebrate', emoji: '🎉', label: 'Celebrate', spoken: 'Celebrate' },
  { key: 'thank_you', emoji: '💜', label: 'Thank you', spoken: 'Thank you' },
  { key: 'crushed_it', emoji: '🔥', label: 'You crushed it', spoken: 'You crushed it' },
  { key: 'great_save', emoji: '⭐', label: 'Great save', spoken: 'Great save' },
  { key: 'team_win', emoji: '🙌', label: 'Team win', spoken: 'Team win' },
] as const;

const BY_KEY = new Map(REACTIONS.map((r) => [r.key, r]));

export function getReaction(key: string): Reaction | undefined {
  return BY_KEY.get(key as ReactionKey);
}

export function isApprovedReaction(key: string): key is ReactionKey {
  return BY_KEY.has(key as ReactionKey);
}

export const MESSAGE_MAX = 240;
export const CONTEXT_MAX = 60;

export type MomentDraft = {
  recipientEmployeeId: string | null;
  reaction: string | null;
  message?: string | null;
  contextLabel?: string | null;
};

export type DraftProblem = { field: 'recipient' | 'reaction' | 'message' | 'context'; text: string };

/**
 * Client-side mirror of the database rules. The database is still the
 * authority; this exists to give a person a useful message before a round trip.
 */
export function validateDraft(
  draft: MomentDraft,
  opts: { senderEmployeeId?: string | null; allowMessage?: boolean } = {},
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const { senderEmployeeId, allowMessage = true } = opts;

  if (!draft.recipientEmployeeId) {
    problems.push({ field: 'recipient', text: 'Choose who this is for.' });
  } else if (senderEmployeeId && draft.recipientEmployeeId === senderEmployeeId) {
    problems.push({ field: 'recipient', text: 'You cannot send a moment to yourself.' });
  }

  if (!draft.reaction) {
    problems.push({ field: 'reaction', text: 'Pick a reaction.' });
  } else if (!isApprovedReaction(draft.reaction)) {
    problems.push({ field: 'reaction', text: 'That reaction is not available.' });
  }

  const message = (draft.message ?? '').trim();
  if (message.length > MESSAGE_MAX) {
    problems.push({ field: 'message', text: `Keep it under ${MESSAGE_MAX} characters.` });
  }
  if (message && !allowMessage) {
    problems.push({ field: 'message', text: 'This office has messages turned off for moments.' });
  }

  const context = (draft.contextLabel ?? '').trim();
  if (context.length > CONTEXT_MAX) {
    problems.push({ field: 'context', text: `Keep the context under ${CONTEXT_MAX} characters.` });
  }

  return problems;
}

/** Trims to exactly what the database will accept, or null. */
export function normalizeText(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

export type RecipientRole = 'owner' | 'manager' | 'employee';

export type MomentRecipient = {
  id: string;
  userId: string;
  name: string;
  role: RecipientRole;
};

/**
 * Anyone active in the office can receive a moment — teammates, managers, and
 * owners alike. The picker splits them into two labelled groups so it is
 * obvious recognition flows in every direction, not just sideways.
 */
export function groupRecipients(recipients: MomentRecipient[]): {
  teammates: MomentRecipient[];
  leaders: MomentRecipient[];
} {
  const byName = (a: MomentRecipient, b: MomentRecipient) => a.name.localeCompare(b.name);
  return {
    teammates: recipients.filter((r) => r.role === 'employee').sort(byName),
    leaders: recipients.filter((r) => r.role === 'owner' || r.role === 'manager').sort(byName),
  };
}

export function roleLabel(role: RecipientRole): string {
  return role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Teammate';
}

// ---------------------------------------------------------------------------
// Reveal sequencing
// ---------------------------------------------------------------------------

export type PendingMoment = {
  id: string;
  reaction: string;
  message: string | null;
  context_label: string | null;
  created_at: string;
  sender_name: string;
};

/**
 * Several waiting moments must never queue several blocking animations: one
 * combined opening, then a compact stack the person pages through.
 */
export function planReveal(
  moments: PendingMoment[],
  opts: { reducedMotion?: boolean; muted?: boolean } = {},
): {
  show: boolean;
  animate: boolean;
  combined: boolean;
  order: PendingMoment[];
  announcement: string;
} {
  const order = [...moments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const animate = !opts.reducedMotion && !opts.muted && order.length > 0;
  return {
    show: order.length > 0,
    animate,
    combined: order.length > 1,
    order,
    announcement: announce(order),
  };
}

/** Plain-text equivalent for screen readers — no decorative emoji. */
export function announce(moments: PendingMoment[]): string {
  if (moments.length === 0) return '';
  if (moments.length === 1) return describe(moments[0]);
  return `${moments.length} team moments. ${moments.map(describe).join(' ')}`;
}

export function describe(m: PendingMoment): string {
  const reaction = getReaction(m.reaction)?.spoken ?? 'Recognition';
  const base = `${reaction} from ${m.sender_name}.`;
  const context = m.context_label ? ` Context: ${m.context_label}.` : '';
  const message = m.message ? ` ${m.message}` : '';
  return `${base}${context}${message}`.trim();
}

/**
 * Presentation is confirmed once. The database hands this device a claimed
 * batch; this decides which of those still need an `opened_at` confirmation.
 * Replays (a re-render, a retried request) resolve to nothing.
 */
export function idsToConfirmOpened(
  moments: { id: string; opened_at: string | null }[],
  alreadyConfirmed: Iterable<string> = [],
): string[] {
  const seen = new Set(alreadyConfirmed);
  return moments.filter((m) => m.opened_at === null && !seen.has(m.id)).map((m) => m.id);
}
