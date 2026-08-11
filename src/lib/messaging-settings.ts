/**
 * Settings registry for messaging / doctor requests.
 *
 * Every user-facing word in this feature comes from here. An office that calls
 * these "Runners" or "Doc Notes" renames them once and the whole surface
 * follows — nothing in the components hardcodes office vocabulary.
 */

export type DigestFrequency = 'daily' | 'weekly' | 'never';

export interface MessagingSettings {
  enabled: boolean;
  messages_label: string;
  requests_label: string;
  /** How the office refers to the doctor in checklist/clock-out messages. */
  doctor_recipient_label: string;
  categories: string[];
  retention_days: number;
  closeout_cutoff_minutes: number;
  closeout_item_enabled: boolean;
}

export interface OwnerBoardPrefs {
  share_with_manager: boolean;
  digest_frequency: DigestFrequency;
}

export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  enabled: true,
  messages_label: 'Messages',
  requests_label: 'Requests',
  doctor_recipient_label: 'the doctor',
  categories: [
    'Treatment question',
    'Lab',
    'Prescription',
    'Callback',
    'Financial',
    'Scheduling',
    'Other',
  ],
  retention_days: 30,
  closeout_cutoff_minutes: 30,
  closeout_item_enabled: true,
};

export const DEFAULT_OWNER_PREFS: OwnerBoardPrefs = {
  share_with_manager: false,
  digest_frequency: 'weekly',
};

/** Human-readable registry entries, matching the convention used elsewhere. */
export const MESSAGING_SETTING_LABELS = {
  enabled: {
    label: 'Messaging turned on',
    onboarding: 'Do you want people to be able to send notes through the app?',
  },
  messages_label: {
    label: 'What we call messaging',
    onboarding: 'What does your office call passing notes to each other?',
  },
  requests_label: {
    label: 'What we call requests in the Inbox',
    onboarding:
      'What does your office call something you need a teammate or the doctor to look at?',
  },
  doctor_recipient_label: {
    label: 'What we call the doctor in clock-out messages',
    onboarding: 'What does your office call the doctor in everyday messages?',
  },
  categories: {
    label: 'Kinds of notes',
    onboarding: 'What kinds of things get sent to the doctor?',
  },
  retention_days: {
    label: 'Keep closed notes for',
    onboarding: 'How long should a finished note stay in the app before it is erased?',
  },
  closeout_cutoff_minutes: {
    label: 'End-of-day cutoff',
    onboarding:
      'How close to closing time is too late for a note to count toward tonight’s checklist?',
  },
  closeout_item_enabled: {
    label: '“Messages read” on the end-of-night checklist',
    onboarding: 'Should the end-of-night checklist include reading your messages?',
  },
  share_with_manager: {
    label: 'Let my manager see my list',
    onboarding: 'Would you like your office manager to be able to see your list?',
  },
  digest_frequency: {
    label: 'Summary of notes still open',
    onboarding: 'How often, if ever, would you like a summary of what is still waiting on you?',
  },
} as const;

/** The one line of vocabulary derived from the two labels, per audience. */
export function inboxLabel(settings: MessagingSettings, isOwner: boolean): string {
  return isOwner ? settings.requests_label : settings.messages_label;
}

/** Wording for the closeout checklist item, derived from the office's own word. */
export function closeoutItemLabel(settings: MessagingSettings): string {
  return `${settings.messages_label} read`;
}

export const NO_PHI_WARNING =
  'No patient names or patient details. Use a chart or appointment reference instead.';

export const REFERENCE_LABEL = 'chart or appt reference — no patient names';

export const NOTE_MAX = 280;
export const REFERENCE_MAX = 40;

/**
 * Plain-language status. Nothing here reads as a scoreboard entry — a note that
 * was passed along says so, and stops there.
 */
export function statusCopy(status: string): string {
  switch (status) {
    case 'sent':
      return 'Sent';
    case 'seen':
      return 'Opened';
    case 'replied':
      return 'Replied';
    case 'handled':
      return 'Handled';
    case 'on_doctors_list':
      return 'On the doctor’s list';
    case 'sent_to_manager':
      return 'Passed to the manager';
    default:
      return 'Sent';
  }
}

