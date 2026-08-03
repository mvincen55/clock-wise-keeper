import type { BaSettings, BaTemplate, BrokenApptType, Rung } from './types';

/**
 * Factory content for the Broken Appointments module — settings defaults,
 * the per-rung behavior table, and the shipped letter/reply templates.
 * De-identified configuration only: bodies carry {{merge_field}}
 * placeholders; patient values are merged in the browser at render time
 * and never persisted. Seeds an org with no rows yet (useBrokenApptTemplates),
 * exactly like src/lib/fof/defaults.ts.
 */

export const DEFAULT_BA_SETTINGS: BaSettings = {
  feeAmount: 75,
  noticeBusinessHours: 48,
  historyWindowYears: 5,
  vipPrepayFloor: 150,
  officePhone: '',
  officeClosedDates: [],
  moduleNavLabel: 'Broken Appointments',
  signatureName: 'Megan Vincent',
  signatureTitle: 'Office Manager',
};

/** Dentrix event code posted for today's break (9102 is the on-time code). */
export function todayEventCode(todayType: BrokenApptType): string {
  return todayType === 'LC' ? '9101' : '9100';
}

export interface RungBehavior {
  /** How the fee moves on the ledger, shown on the outputs screen. */
  transactionLine: string;
  /** Letter template code, or null (Rung 5 sends no letter). */
  letterCode: string | null;
  /** Scheduling guidance shown to staff. */
  schedulingStatus: string;
  /** Reply template code offered in text mode. */
  replyCode: string | null;
  popUp: 'none' | 'standard' | 'vip' | 'update';
}

/**
 * The per-rung behavior table. {{fee}} and {{prepay_floor}} resolve from
 * org settings; ledger checklists are built per today's event code in
 * outputs.ts.
 */
export const RUNG_BEHAVIOR: Record<Rung, RungBehavior> = {
  1: {
    transactionLine: '{{fee}} posted by staff, courtesy credit applied — net $0',
    letterCode: '9101A',
    schedulingStatus: 'May schedule normally.',
    replyCode: 'rung1',
    popUp: 'none',
  },
  2: {
    transactionLine: '{{fee}} auto-posted as outstanding balance',
    letterCode: '9100A',
    schedulingStatus: 'BLOCKED until balance paid + card on file.',
    replyCode: null,
    popUp: 'standard',
  },
  3: {
    transactionLine: '{{fee}} posted as outstanding balance',
    letterCode: '9106',
    schedulingStatus:
      'BLOCKED until balance paid + card on file (collect card now if missing).',
    replyCode: 'rung3',
    popUp: 'standard',
  },
  4: {
    transactionLine: '{{fee}} charged to card on file; if no card, post as outstanding + flag OM',
    letterCode: '9107',
    schedulingStatus:
      'VIP only: cancel ALL future appts; hygiene = VIP text list; doctor = prepay greater of {{prepay_floor}} or est. patient portion, forfeited if broken.',
    replyCode: 'rung4',
    popUp: 'vip',
  },
  5: {
    transactionLine: 'Handled under Office Manager process',
    letterCode: null,
    schedulingStatus: 'HARD STOP — front desk does not handle.',
    replyCode: 'rung5',
    popUp: 'update',
  },
};

export type BaTemplateSeed = Omit<BaTemplate, 'id'>;

/**
 * Shared letter policy paragraph (the Monday→Thursday example the policy
 * is always explained with).
 */
const POLICY_PARAGRAPH =
  "Like most dental offices, we ask for at least {{notice_hours}} business hours' notice to cancel or reschedule, so we can offer your reserved time to another patient. Business hours don't include weekends — so for a Monday morning appointment, we'd need to hear from you by Thursday morning the week before.";

/** The four patient letters. Bold runs use **double asterisks**. */
const LETTER_SEEDS: BaTemplateSeed[] = [
  {
    kind: 'letter',
    code: '9101A',
    title: 'Rung 1 — first late cancellation (fee credited)',
    sortOrder: 0,
    body: [
      "Thank you for being a patient of our practice. We're reaching out about your appointment scheduled for {{appt_date}}. Schedules change — it happens to all of us.",
      POLICY_PARAGRAPH,
      "**A {{fee_amount}} scheduling fee was posted to your account and immediately credited back as a one-time courtesy — you don't owe anything for this one.** The enclosed statement shows both entries.",
      'Going forward, a late cancellation or missed appointment **will** result in a {{fee_amount}} scheduling fee, and a credit card on file will be required before scheduling future visits.',
      "We'd love to see you soon — give us a call at {{office_phone}} and we'll find a time that works for you.",
    ].join('\n\n'),
  },
  {
    kind: 'letter',
    code: '9100A',
    title: 'Rung 2 — first no-show (fee outstanding)',
    sortOrder: 1,
    body: [
      'We missed you at your appointment on {{appt_date}} — we hope everything is okay.',
      "Because we weren't able to offer that time to other patients, **a {{fee_amount}} scheduling fee has been posted to your account as an outstanding balance.** The enclosed statement reflects this charge.",
      POLICY_PARAGRAPH,
      "**To schedule your next appointment, we'll need the balance taken care of and a credit card on file.** The card is simply a safeguard — it would only ever be charged if a future appointment is missed or canceled without enough notice.",
      "If you have any questions, or you'd like to talk this through, call us at {{office_phone}} — we're happy to help.",
    ].join('\n\n'),
  },
  {
    kind: 'letter',
    code: '9106',
    title: 'Rung 3 — second broken appointment',
    sortOrder: 2,
    body: [
      "We're writing regarding your appointment on {{appt_date}}, which was missed or canceled without the required notice. Because this is the second time, **a {{fee_amount}} scheduling fee has been posted to your account as an outstanding balance.** The enclosed statement reflects this charge.",
      'We understand how quickly life fills up, and we truly value having you as a patient. At the same time, when an appointment is reserved for you, that time is set aside with our doctors and hygienists and turned away from other patients who needed it — when it goes unused without notice, it is simply lost.',
      "**A credit card on file is now required before scheduling your next visit.** If we already have yours, nothing more is needed. Once the balance is settled and a card is on file, we can get you scheduled right away.",
      "Call us at {{office_phone}} and we'll get everything squared away.",
    ].join('\n\n'),
  },
  {
    kind: 'letter',
    code: '9107',
    title: 'Rung 4 — third broken appointment (VIP scheduling)',
    sortOrder: 3,
    body: [
      "We're writing regarding your appointment scheduled for {{appt_date}}. Per our broken-appointment policy, **a {{fee_amount}} scheduling fee has been charged to the card we have on file.** The enclosed statement reflects this charge.",
      '**We have canceled all currently reserved future appointments. Those appointments are listed below.**',
      '{{appointment_table}}',
      "**Cleanings and hygiene visits:** we've added you to our VIP list — we'll text you when an opening fits your schedule. Share your best days and times with us and we'll watch for them.",
      "**Doctor and treatment visits:** these can be booked ahead with a prepayment of **{{prepay_floor}} or your estimated patient portion, whichever is greater.** The prepayment is applied to your treatment — if insurance covers more than expected, we'll refund the difference. It is **forfeited** if the appointment is missed or canceled without {{notice_hours}} business hours' notice.",
      "Keep a few visits with us and we'll gladly return to normal scheduling.",
      "If you have questions, call us at {{office_phone}} — we're glad to talk it through.",
    ].join('\n\n'),
  },
];

/**
 * Text replies — short on purpose; {{personal_line}} is replaced with the
 * staff-typed line (or removed cleanly when blank).
 */
const REPLY_SEEDS: BaTemplateSeed[] = [
  {
    kind: 'reply',
    code: 'on_time',
    title: 'On time — no fee',
    sortOrder: 0,
    body: "Thanks for letting us know, {{first_name}} — you're all set, no fee since we got plenty of notice. {{personal_line}} Want to grab a new time? Call or text us at {{office_phone}}.",
  },
  {
    kind: 'reply',
    code: 'rung1',
    title: 'Rung 1 — fee credited',
    sortOrder: 1,
    body: "Thanks for letting us know, {{first_name}}. {{personal_line}} Since this was inside our 48-business-hour window our policy has a {{fee_amount}} fee — we've credited it back this one time as a courtesy, so you don't owe anything. A letter with the full policy is on its way. We'd love to get you rescheduled — just let us know what works!",
  },
  {
    kind: 'reply',
    code: 'rung3',
    title: 'Rung 3 — fee posted, card required',
    sortOrder: 2,
    body: "Thanks for letting us know, {{first_name}}. {{personal_line}} Because this is inside our 48-business-hour window and is a second occurrence, a {{fee_amount}} fee has been posted to your account, and we'll need a card on file before your next visit. A letter is on the way with details. Call us at {{office_phone}} and we'll get everything squared away.",
  },
  {
    kind: 'reply',
    code: 'rung4',
    title: 'Rung 4 — card charged, scheduling change',
    sortOrder: 3,
    body: "Thanks for letting us know, {{first_name}}. {{personal_line}} Per our policy the {{fee_amount}} fee was charged to your card on file, and we're making a change to how your visits are scheduled — we'll give you a call to walk through it, and a letter is on the way. {{office_phone}} if you'd like to reach us first.",
  },
  {
    kind: 'reply',
    code: 'rung5',
    title: 'Rung 5 — holding reply (OM handles)',
    sortOrder: 4,
    body: 'Got your message, {{first_name}} — thank you. Our office manager will reach out to you directly about scheduling.',
  },
  {
    kind: 'reply',
    code: 'ns_outreach',
    title: 'No-show outreach (existing text)',
    sortOrder: 5,
    body: 'Hi {{first_name}}. {{doctor_name}} missed you at your appointment on {{appt_date}}. Your care is important to us. Please call or text {{office_phone}} to reschedule.',
  },
];

export const DEFAULT_BA_TEMPLATES: BaTemplateSeed[] = [...LETTER_SEEDS, ...REPLY_SEEDS];
