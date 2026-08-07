/**
 * Letterhead & Office Correspondence — shared types.
 *
 * HIPAA boundary (same contract as src/lib/broken-appts/types.ts and
 * src/lib/fof/types.ts): LetterRecipient, NoteFields, and every value a
 * staff member types about a patient while composing a letter or a
 * school/work note lives ONLY in browser memory and on the printed page.
 * Nothing importing these types may send those values to Supabase, storage
 * APIs, URLs, analytics, or logs.
 *
 * What IS persisted server-side: reusable office wording (letter_templates,
 * with {{placeholder}} tokens instead of patient values), per-office
 * correspondence settings, and each staff member's own stored signature —
 * all de-identified business configuration.
 */

/** Who a letter is addressed to. Memory-only — never persisted. */
export interface LetterRecipient {
  name: string;
  addressLine1: string;
  /** Optional; a blank line disappears from the printed block entirely. */
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
}

export const EMPTY_RECIPIENT: LetterRecipient = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
};

/** The closing block of a letter: phrase, optional ink, typed identity. */
export interface LetterSigner {
  /** e.g. "Warm regards," — always ends the letter body. */
  closing: string;
  /** Typed name under the signature line. */
  name: string;
  /** Typed title under the name; blank = omitted. */
  title: string;
  /** Resolved signature image (data URL); null/blank = typed name only. */
  signatureDataUrl?: string | null;
}

/** Where the ink for a letter/note comes from. */
export type SignerKind = 'self' | 'provider' | 'office';

export interface SignerChoice {
  kind: SignerKind;
  /** org_providers.id when kind = 'provider'. */
  providerId?: string;
}

/** A reusable office letter (letter_templates row, camelCase). */
export interface LetterTemplate {
  id: string;
  title: string;
  category: LetterCategory;
  /** Optional RE: line wording ({{placeholders}} allowed). */
  subject: string;
  /** Letter body in letter-markup ({{placeholders}} allowed). */
  body: string;
  /** Blank = office default closing at use time. */
  closing: string;
  status: 'active' | 'archived';
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const LETTER_CATEGORIES = [
  'general',
  'insurance',
  'employer',
  'referral',
  'records',
  'financial',
  'patient',
  'office_notice',
  'other',
] as const;

export type LetterCategory = (typeof LETTER_CATEGORIES)[number];

export const LETTER_CATEGORY_LABELS: Record<LetterCategory, string> = {
  general: 'General',
  insurance: 'Insurance',
  employer: 'Employer',
  referral: 'Referral',
  records: 'Records transfer',
  financial: 'Financial',
  patient: 'Patient correspondence',
  office_notice: 'Office notice',
  other: 'Other',
};

/**
 * The storable content of a template. Deliberately has NO recipient/patient
 * fields — the save path is typed so a filled letter cannot be persisted.
 */
export interface LetterTemplateContent {
  title: string;
  category: LetterCategory;
  subject: string;
  body: string;
  closing: string;
}

/** Per-office correspondence settings (correspondence_settings row). */
export interface CorrespondenceSettings {
  /** Default closing phrase for every letter surface. */
  defaultClosing: string;
  /** Office-level signer (e.g. the office manager); blank = practice name. */
  defaultSignerName: string;
  defaultSignerTitle: string;
  /** Blank = built-in default wording (DEFAULT_SCHOOL_NOTE_WORDING). */
  schoolNoteWording: string;
  /** Blank = built-in default wording (DEFAULT_WORK_NOTE_WORDING). */
  workNoteWording: string;
  /** OFF = only owners/managers may create/edit/archive saved letters. */
  teamCanManageTemplates: boolean;
}

export const DEFAULT_CORRESPONDENCE_SETTINGS: CorrespondenceSettings = {
  defaultClosing: 'Warm regards,',
  defaultSignerName: '',
  defaultSignerTitle: '',
  schoolNoteWording: '',
  workNoteWording: '',
  teamCanManageTemplates: false,
};

/** A staff member's stored-signature row (never the image itself). */
export interface StaffSignatureMeta {
  userId: string;
  storagePath: string;
  /** Self-service consent: teammates may print this ink on office letters/notes. */
  allowOfficeUse: boolean;
  updatedAt: string;
}

/** School/Work note temporary fields. Memory-only — never persisted. */
export interface NoteFields {
  noteFor: 'school' | 'work';
  patientName: string;
  /** ISO YYYY-MM-DD; defaults to today. */
  dateSeenISO: string;
  excusedFromISO: string;
  excusedThroughISO: string;
  returnDateISO: string;
  restrictions: string;
}
