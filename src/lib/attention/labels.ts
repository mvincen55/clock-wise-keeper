/**
 * The row labels every Attention surface shares, so Home and the Management
 * rooms never describe the same item two ways.
 */
import type { Tone } from '@/components/dashboard/types';
import type { AttentionItem } from './types';

/** "payroll Thu · 2d", "3h", "2d", "now": the deadline when one governs, else the age. */
export function ageLabel(item: AttentionItem): string {
  if (item.deadline) return item.deadline.days === 0 ? item.deadline.label : `${item.deadline.label} · ${item.deadline.days}d`;
  const h = item.ageHours;
  if (h === null) return '';
  if (h < 1) return 'now';
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** The dot: a coverage issue is urgent, a deadline within a day needs attention, a follow-up is calm. */
export function itemTone(item: AttentionItem): Tone {
  if (item.coverage) return 'urgent';
  if (item.deadline && item.deadline.days <= 1) return 'attention';
  return item.verb === 'follow_up' ? 'calm' : 'steady';
}

/** The one navigation action a Home row carries (design §3.3). */
export function itemAction(item: AttentionItem): 'Review' | 'Open' {
  return item.verb === 'decide' ? 'Review' : 'Open';
}
