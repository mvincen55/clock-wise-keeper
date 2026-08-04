import { todayEventCode } from './defaults';
import type { BaCardState, BaLetterCode, BaSettings, BrokenApptType, Rung } from './types';

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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Thu 7/30/2026 9:00 AM" — the cutoff helper-text format. */
export function formatCutoff(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${formatDateTimeMDY(d)}`;
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

// ---------------------------------------------------------------------------
// Card state (the second axis, rungs 2–5). The card is only ever charged
// after a prior Pop-Up promised it — first offenses are posted, never
// charged, so the transaction snippets only apply from Rung 3 up.
// ---------------------------------------------------------------------------

export type TransactionSnippetCode = 'txn_charged' | 'txn_posted' | 'txn_posted_card_failed';

/** Which transaction snippet the card state selects (rungs 3–5). */
export function transactionSnippetCode({
  cardOnFile,
  chargeSucceeded,
}: BaCardState): TransactionSnippetCode {
  if (cardOnFile && chargeSucceeded === true) return 'txn_charged';
  if (cardOnFile && chargeSucceeded === false) return 'txn_posted_card_failed';
  return 'txn_posted';
}

/** Which card sentence a Rung 2–3 letter carries. */
export function cardSentenceCode({ cardOnFile }: BaCardState): 'card_have' | 'card_needed' {
  return cardOnFile ? 'card_have' : 'card_needed';
}

/**
 * Short-form fee clause for the Rung 3–4 replies, from the same card-state
 * logic as the letter snippets. `askForCard` folds the card requirement
 * into the no-card variant (Rung 3); Rung 4 replies announce the
 * scheduling change instead.
 */
export function feeClauseShort(card: BaCardState, askForCard: boolean): string {
  if (card.cardOnFile && card.chargeSucceeded === true) return 'charged to your card on file';
  if (card.cardOnFile && card.chargeSucceeded === false)
    return "posted to your account — the card on file didn't go through, so we'll need an updated card";
  return askForCard
    ? "posted to your account, and we'll need a card on file before your next visit"
    : 'posted to your account';
}

/** True only when the fee actually went on the card (never at Rung 2). */
export function chargedToCard(rung: Rung, card: BaCardState): boolean {
  return rung >= 3 && card.cardOnFile === true && card.chargeSucceeded === true;
}

/** The outputs screen's transaction line, resolved per rung + card state. */
export function buildTransactionLine(
  rung: Rung,
  todayType: BrokenApptType,
  card: BaCardState,
  settings: Pick<BaSettings, 'feeAmount'>
): string {
  const fee = formatMoney(settings.feeAmount);
  switch (rung) {
    case 1:
      return `${fee} posted by staff, courtesy credit applied — net $0`;
    case 2:
      return todayType === 'NS'
        ? `${fee} auto-posted as outstanding balance`
        : `${fee} posted by staff as outstanding balance`;
    case 3:
    case 4: {
      if (chargedToCard(rung, card))
        return `${fee} charged to the card on file (per the prior Pop-Up promise)`;
      const flagOm = rung === 4 ? ' + flag Office Manager' : '';
      if (card.cardOnFile)
        return `${fee} posted as outstanding — card failed, start the 7-business-day card update procedure${flagOm}`;
      return `${fee} posted as outstanding balance — collect a card on file${flagOm}`;
    }
    case 5:
      return 'Handled under Office Manager process';
  }
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
  card: BaCardState;
  settings: Pick<BaSettings, 'feeAmount' | 'vipPrepayFloor'>;
  /** Today's dateline, e.g. "8/3/2026". */
  todayMDY: string;
  initials: string;
}

/**
 * The Dentrix Pop-Up block for rungs 2–5 (Rung 1 has none — returns null;
 * Rung 5 is an update to the existing VIP Pop-Up). "charged to card"
 * appears only when the charge actually went through.
 */
export function buildPopUp({
  rung,
  todayType,
  card,
  settings,
  todayMDY,
  initials,
}: PopUpInput): string | null {
  if (rung === 1) return null;
  const fee = formatMoney(settings.feeAmount);
  const feeAction = chargedToCard(rung, card) ? `${fee} charged to card` : `${fee} posted`;
  let body =
    `Rung ${rung} / ${WHAT_HAPPENED[todayType]}. ${feeAction}. ` +
    `DO NOT reschedule until: (1) balance paid in full, (2) card on file. ` +
    `Card will be charged ${fee} for future broken appointments.`;
  if (rung >= 4) {
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

/** The card-failure procedure step (rungs 3–4 when the charge bounced). */
const CARD_FAILURE_STEP =
  'Card failure procedure: run the failure script — updated card required within 7 business days';

export interface LedgerChecklistInput {
  rung: Rung;
  todayType: BrokenApptType;
  /** Letter code today's event posts (from the rung engine). */
  letterCode: BaLetterCode | null;
  card: BaCardState;
  settings: Pick<BaSettings, 'feeAmount'>;
}

/** The ledger checklist for the rung (per the behavior table + card state). */
export function buildLedgerChecklist({
  rung,
  todayType,
  letterCode,
  card,
  settings,
}: LedgerChecklistInput): string[] {
  const fee = formatMoney(settings.feeAmount);
  const chargeFailed = card.cardOnFile === true && card.chargeSucceeded === false;
  const letterStep = letterCode ? [`Post ${letterCode} (letter sent)`] : [];
  switch (rung) {
    case 1:
      return [
        `Post 9101 + ${fee} fee`,
        'Apply courtesy credit (net $0)',
        ...letterStep,
      ];
    case 2:
      // Never charged at Rung 2 — the first Pop-Up promise starts today.
      return [
        postEventStep(todayType, fee),
        ...(card.cardOnFile ? [] : ['Collect card on file — required before the next visit']),
        ...letterStep,
      ];
    case 3:
      return [
        postEventStep(todayType, fee),
        ...letterStep,
        ...(chargeFailed ? [CARD_FAILURE_STEP] : []),
      ];
    case 4:
      return [
        postEventStep(todayType, fee),
        ...letterStep,
        'Create unscheduled hygiene appointment',
        ...(chargeFailed ? [CARD_FAILURE_STEP] : []),
        ...(chargeFailed || !card.cardOnFile
          ? ['Flag Office Manager — card failed or missing']
          : []),
      ];
    case 5:
      return [postEventStep(todayType, fee), 'Update Pop-Up', 'Notify Office Manager'];
  }
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
