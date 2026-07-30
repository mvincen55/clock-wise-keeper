/**
 * Executive Co-Pilot — the pure logic behind "the AI carries the remembering".
 *
 * Principles baked in here:
 *  - capture is one tap, never typing
 *  - the first step is always tiny
 *  - one thing at a time (Today Focus picks exactly one)
 *  - quiet is a feature (a declined proposal is never raised again)
 */

/** Stable identity for a proposal so the same idea is never re-asked. */
export function captureFingerprint(surface: string, title: string, dueDate?: string | null): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${surface}:${dueDate ?? 'any'}:${normalized}`.slice(0, 200);
}

/** Shift an ET date string ('YYYY-MM-DD') by whole days. */
export function shiftDay(etDate: string, days: number): string {
  const [y, m, d] = etDate.split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  noon.setUTCDate(noon.getUTCDate() + days);
  return noon.toISOString().slice(0, 10);
}

/** Next Monday (ET) strictly after the given date. */
export function nextMonday(etDate: string): string {
  let cursor = shiftDay(etDate, 1);
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = cursor.split('-').map(Number);
    if (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() === 1) return cursor;
    cursor = shiftDay(cursor, 1);
  }
  return cursor;
}

/** Plain-language day label used everywhere in the co-pilot. */
export function dayLabel(etDate: string, today: string): string {
  if (etDate === today) return 'today';
  if (etDate === shiftDay(today, 1)) return 'tomorrow';
  if (etDate < today) return 'was due earlier';
  const [y, m, d] = etDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Read a day out of everyday phrasing ("tomorrow", "Monday", "by Friday").
 * Falls back to today — never to a vague someday.
 */
export function dueDayFromPhrase(phrase: string, today: string): string {
  const text = phrase.toLowerCase();
  if (/\btomorrow\b/.test(text)) return shiftDay(today, 1);
  if (/\bnext week\b/.test(text)) return nextMonday(today);
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < weekdays.length; i++) {
    if (new RegExp(`\\b${weekdays[i]}\\b`).test(text)) {
      let cursor = shiftDay(today, 1);
      for (let step = 0; step < 7; step++) {
        const [y, m, d] = cursor.split('-').map(Number);
        if (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() === i) return cursor;
        cursor = shiftDay(cursor, 1);
      }
    }
  }
  return today;
}

/** A tiny opening move, so starting never requires a decision. */
export function tinyFirstStep(title: string, given?: string | null): string {
  if (given && given.trim()) return given.trim();
  const t = title.toLowerCase();
  if (t.includes('call')) return 'Pull up the number and dial — 2 minutes.';
  if (t.includes('email') || t.includes('send')) return 'Open a blank email and write the subject line.';
  if (t.includes('report') || t.includes('export')) return 'Open the report screen — nothing else yet.';
  if (t.includes('review') || t.includes('read')) return 'Open it and read the first section only.';
  if (t.includes('schedule') || t.includes('book')) return 'Open the schedule and find one open slot.';
  return 'Open the thing and do the first 2 minutes.';
}

export type FocusKind = 'checklist' | 'goal_task' | 'training';

export interface FocusCandidate {
  id: string;
  kind: FocusKind;
  title: string;
  firstStep?: string | null;
  dueDate?: string | null;
  /** Whether the member confirmed this themselves (captured or manual). */
  href?: string;
}

const KIND_WEIGHT: Record<FocusKind, number> = { checklist: 0, goal_task: 1, training: 2 };

/**
 * One thing at a time: the single most important open item right now.
 * Overdue first, then today, then soonest; ties break toward the checklist
 * item the member already committed to.
 */
export function pickNextThing(candidates: FocusCandidate[], today: string): FocusCandidate | null {
  const open = candidates.filter(c => !c.dueDate || c.dueDate <= today || c.kind !== 'checklist');
  if (!open.length) return null;
  return [...open].sort((a, b) => {
    const ad = a.dueDate ?? '9999-12-31';
    const bd = b.dueDate ?? '9999-12-31';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind];
  })[0];
}

/**
 * Rescope, don't pile up: when items keep slipping, offer to move them rather
 * than letting a backlog rot. Trigger is deliberately conservative — quiet is
 * a feature.
 */
export function shouldOfferRescope(items: { deferral_count: number; due_date: string | null }[], today: string): boolean {
  const overdue = items.filter(i => i.due_date && i.due_date < today).length;
  const repeatedlyMoved = items.filter(i => i.deferral_count >= 2).length;
  return overdue >= 3 || repeatedlyMoved >= 2;
}

/** Kind, never shaming — wording is always on the member's side. */
export function chaseMessage(openCount: number, phase: 'clock_in' | 'midday'): string | null {
  if (openCount <= 0) return null;
  if (phase === 'clock_in') {
    return openCount === 1
      ? "One thing on your list today — it's a quick one."
      : `${openCount} things on your list today, first one's quick.`;
  }
  return openCount === 1
    ? 'Still one thing waiting — or hold it for tomorrow?'
    : `${openCount} still open — knock one out, or hold them for tomorrow?`;
}
