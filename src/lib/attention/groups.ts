/**
 * Needs you, grouped: the same open items Attention lists, folded into
 * expandable categories where the same kind of work repeats. Three unsealed
 * closeouts become one "Closeouts awaiting seal · 3" row with the dates
 * underneath; each date still opens its own record, so nothing is reviewed
 * in bulk and nothing is counted twice — a group's count is exactly the
 * unique items inside it, and the sum over groups is the badge.
 *
 * Pure: it never changes membership or order. A group takes the position
 * of its first item, so the consequence order Attention derives survives.
 */
import type { AttentionItem, AttentionKind, AttentionVerb } from './types';
import { ageLabel, itemTone } from './labels';
import type { Tone } from '@/components/dashboard/types';

/** What to call a category of repeated work, and what one of them is called. */
export const KIND_GROUP_LABELS: Record<AttentionKind, { group: string; one: string }> = {
  staffing_answer: { group: 'Staffing answers', one: 'Staffing answer' },
  clocked_in_after_close: { group: 'Still clocked in after close', one: 'Still clocked in' },
  pto_request: { group: 'PTO requests', one: 'PTO request' },
  correction_request: { group: 'Time corrections', one: 'Time correction' },
  change_request: { group: 'Change requests', one: 'Change request' },
  content_review: { group: 'Versions in review', one: 'Version in review' },
  challenge_verify: { group: 'Challenges to verify', one: 'Challenge to verify' },
  incident_countersign: { group: 'Incident reports to countersign', one: 'Incident report to countersign' },
  missing_clock_out: { group: 'Missing clock-outs', one: 'Missing clock-out' },
  missing_day: { group: 'Scheduled days with no time', one: 'Scheduled day with no time' },
  unpaired_punches: { group: 'Punches that do not pair', one: 'Punches that do not pair' },
  time_suspect: { group: 'Days with suspect time', one: 'Suspect time' },
  close_day_unsealed: { group: 'Closeouts awaiting seal', one: 'Closeout awaiting seal' },
  close_day_behind: { group: 'Close the Day behind', one: 'Close the Day behind' },
  close_day_review: { group: 'Sealed days with items to review', one: 'Sealed day to review' },
  excuse_request: { group: 'Late-arrival excuse requests', one: 'Excuse request' },
  attendance_meeting: { group: 'Attendance reports', one: 'Attendance report' },
  bypass_followup: { group: 'Checklist bypass reasons owed', one: 'Bypass reason owed' },
  record_signoff: { group: 'Records awaiting sign-off', one: 'Record awaiting sign-off' },
  ack_escalated: { group: 'Acknowledgments escalated to you', one: 'Acknowledgment escalated' },
  training_overdue: { group: 'Training overdue', one: 'Training overdue' },
  incident_followup: { group: 'Incident follow-ups', one: 'Incident follow-up' },
};

/** The next action, in plain words, for a row that opens the item. */
export const KIND_NEXT_STEP: Record<AttentionKind, string> = {
  staffing_answer: 'Read the answer',
  clocked_in_after_close: 'Verify the punch',
  pto_request: 'Approve or decline',
  correction_request: 'Review the correction',
  change_request: 'Approve or decline',
  content_review: 'Review the version',
  challenge_verify: 'Verify the result',
  incident_countersign: 'Countersign',
  missing_clock_out: 'Fix the punches',
  missing_day: 'Record the day',
  unpaired_punches: 'Fix the punches',
  time_suspect: 'Check the day',
  close_day_unsealed: 'Seal the day',
  close_day_behind: 'Close the days',
  close_day_review: 'Review the day',
  excuse_request: 'Approve or decline the excuse',
  attendance_meeting: 'Meet, then sign',
  bypass_followup: 'Follow up',
  record_signoff: 'Sign off',
  ack_escalated: 'Follow up',
  training_overdue: 'Follow up',
  incident_followup: 'Follow up',
};

const VERB_LABEL: Record<AttentionVerb, string> = { decide: 'Decide', fix: 'Fix', follow_up: 'Follow up' };

export type QueueEntry =
  | { type: 'item'; item: AttentionItem }
  | { type: 'group'; kind: AttentionKind; verb: AttentionVerb; label: string; items: AttentionItem[]; tone: Tone; count: number; next: string };

/**
 * Fold repeated kinds into groups. Singletons stay as rows; a group sits
 * where its first item was. `minGroup` is how many of a kind it takes.
 */
export function groupAttention(items: AttentionItem[], minGroup = 2): QueueEntry[] {
  const byKind = new Map<AttentionKind, AttentionItem[]>();
  for (const i of items) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  const placed = new Set<AttentionKind>();
  const out: QueueEntry[] = [];
  for (const item of items) {
    const all = byKind.get(item.kind) ?? [];
    if (all.length < minGroup) { out.push({ type: 'item', item }); continue; }
    if (placed.has(item.kind)) continue;
    placed.add(item.kind);
    out.push({
      type: 'group',
      kind: item.kind,
      verb: item.verb,
      label: KIND_GROUP_LABELS[item.kind].group,
      items: all,
      tone: groupTone(all),
      count: all.length,
      next: KIND_NEXT_STEP[item.kind],
    });
  }
  return out;
}

/** The most urgent tone inside a group. */
export function groupTone(items: AttentionItem[]): Tone {
  const rank: Record<Tone, number> = { urgent: 0, attention: 1, steady: 2, calm: 3 };
  return items.map(itemTone).sort((a, b) => rank[a] - rank[b])[0] ?? 'calm';
}

/** Unique items across entries — always equals the input length. */
export function entryCount(entries: QueueEntry[]): number {
  return entries.reduce((n, e) => n + (e.type === 'item' ? 1 : e.count), 0);
}

/** "Priya S. · PTO request · Mar 9 – Mar 10 (16h)" without the subject when the row already names them. */
export function itemTitle(item: AttentionItem): string {
  return item.subject.name ? `${item.subject.name} · ${item.label}` : item.label;
}

/** The short meta line: deadline or age, and the verb. */
export function itemMeta(item: AttentionItem): string {
  const age = ageLabel(item);
  const parts = [age, VERB_LABEL[item.verb]].filter(Boolean);
  return parts.join(' · ');
}

/** The filtered work list for a group: Attention narrowed to that kind. */
export function groupHref(kind: AttentionKind): string {
  return `/management?kind=${kind}`;
}


