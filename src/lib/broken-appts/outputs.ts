import { RUNG_BEHAVIOR, todayEventCode } from './defaults';
import type { BaSettings, BrokenApptType, Rung } from './types';

/**
 * Pure builders for the copy-paste blocks on the outputs screen (Pop-Up,
 * appointment note, ledger checklist) and the {{merge_field}} resolution
 * for letters and replies. Everything here is string-in/string-out —
 * patient values pass through browser memory only (see types.ts).
 */

/** "$75" for whole dollars, "$75.50" otherwise. */
export function formatMoney(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/**
 * Staff initials derived from a full name: first letters of the first and
 * last words, uppercased ("Ann Smith" → "AS", middle names ignored). A
 * single word yields its first letter; blank yields '' — callers must
 * prompt for entry rather than stamping blanks.
 */
export function deriveInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** ISO YYYY-MM-DD → M/D/YYYY (unparseable input passes through). */
export function formatDateMDY(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function formatDateTimeMDY(d: Date): string {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h}:${mm} ${ampm}`;
}

/**
 * Resolve {{merge_field}} placeholders. personal_line gets special
 * treatment: a blank value removes the placeholder and collapses the
 * doubled space it leaves behind, so the sentence still reads naturally.
 */
export function mergeFields(body: string, fields: Record<string, string>): string {
  let out = body;
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'personal_line' && value.trim() === '') continue;
    out = out.split(`{{${key}}}`).join(value);
  }
  return out
    .replace(/\s*\{\{personal_line\}\}\s*/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

const WHAT_HAPPENED: Record<BrokenApptType, string> = {
  LC: 'Late cancellation',
  NS: 'No-show',
};

/** "Post 9101 + $75 fee" (LC) / "Post 9100 (auto-fee)" (NS). */
function postEventStep(todayType: BrokenApptType, feeText: string): string {
  return todayType === 'LC'
    ? `Post ${todayEventCode(todayType)} + ${feeText} fee`
    : `Post ${todayEventCode(todayType)} (auto-fee)`;
}

export interface PopUpInput {
  rung: Rung;
  todayType: BrokenApptType;
  settings: Pick<BaSettings, 'feeAmount' | 'vipPrepayFloor'>;
  /** Today's dateline, e.g. "8/3/2026". */
  todayMDY: string;
  initials: string;
}

/**
 * The Dentrix Pop-Up block for rungs 2–4. Rung 1 has no Pop-Up and
 * Rung 5 only updates the existing one (stop screen) — both return null.
 */
export function buildPopUp({ rung, todayType, settings, todayMDY, initials }: PopUpInput): string | null {
  if (rung === 1 || rung === 5) return null;
  const fee = formatMoney(settings.feeAmount);
  const feeAction = rung === 4 ? `${fee} charged to card` : `${fee} posted`;
  let body =
    `Rung ${rung} / ${WHAT_HAPPENED[todayType]}. ${feeAction}. ` +
    `DO NOT reschedule until: (1) balance paid in full, (2) card on file. ` +
    `Card will be charged ${fee} for future broken appointments.`;
  if (rung === 4) {
    body +=
      ` Patient is VIP ONLY. All future appts canceled. Hygiene = VIP list. ` +
      `Doctor = prepay greater of ${formatMoney(settings.vipPrepayFloor)} or est. patient portion; forfeited if broken.`;
  }
  return `${todayMDY} - "${body}" - ${initials}`;
}

export interface ApptNoteInput {
  todayMDY: string;
  /** The broken appointment's date, M/D/YYYY. */
  apptDateMDY: string;
  todayType: BrokenApptType;
  onTime: boolean;
  rung: Rung;
  /** Mode B: the pasted cancellation text (embedded verbatim). */
  pastedText?: string;
  /** true = "Reply sent", false = "Call made". */
  replySent: boolean;
  initials: string;
}

/** The appointment-note block (pasted-text clause only in text mode). */
export function buildApptNote({
  todayMDY,
  apptDateMDY,
  todayType,
  onTime,
  rung,
  pastedText,
  replySent,
  initials,
}: ApptNoteInput): string {
  const event = pastedText?.trim()
    ? `Patient texted to cancel ${apptDateMDY} appt: '${pastedText.trim()}'`
    : todayType === 'NS'
      ? `Patient no-showed ${apptDateMDY} appt`
      : `Patient canceled ${apptDateMDY} appt without required notice`;
  const verdict = onTime ? 'On time' : `Late — Rung ${rung}`;
  const followUp = replySent ? 'Reply sent' : 'Call made';
  return `${todayMDY} - "${event}. ${verdict}. ${followUp}." - ${initials}`;
}

/** The ledger checklist for the rung (per the behavior table). */
export function buildLedgerChecklist(
  rung: Rung,
  todayType: BrokenApptType,
  settings: Pick<BaSettings, 'feeAmount'>,
  /** The letter actually printed (Rung 3 uses 0002 for LC when seeded). */
  letterCode?: string
): string[] {
  const fee = formatMoney(settings.feeAmount);
  switch (rung) {
    case 1:
      return [
        `Post 9101 + ${fee} fee`,
        'Apply courtesy credit (net $0)',
        'Post 9101A (letter sent)',
      ];
    case 2:
      return ['Post 9100 (auto-fee)', 'Post 9100A (letter sent)'];
    case 3:
      return [postEventStep(todayType, fee), `Post ${letterCode ?? '9106'} (letter sent)`];
    case 4:
      return [
        postEventStep(todayType, fee),
        'Post 9107 (letter sent)',
        'Create unscheduled hygiene appointment',
      ];
    case 5:
      return [postEventStep(todayType, fee), 'Update Pop-Up', 'Notify Office Manager'];
  }
}

/**
 * The copy-paste form of the checklist, stamped with the staff initials
 * like every other output block.
 */
export function formatLedgerChecklist(steps: string[], initials: string): string {
  return [...steps.map(line => `☐ ${line}`), `— ${initials}`].join('\n');
}

/** Behavior-table strings with {{fee}} / {{prepay_floor}} resolved. */
export function resolveBehaviorText(
  text: string,
  settings: Pick<BaSettings, 'feeAmount' | 'vipPrepayFloor'>
): string {
  return text
    .split('{{fee}}')
    .join(formatMoney(settings.feeAmount))
    .split('{{prepay_floor}}')
    .join(formatMoney(settings.vipPrepayFloor));
}
