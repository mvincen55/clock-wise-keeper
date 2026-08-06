/**
 * Forms & Consents domain model.
 *
 * Templates are arrays of typed blocks rendered by one professional master
 * layout (letterhead, section headings, signature area, footer) — offices
 * edit content, not page design, so every printed form stays consistent.
 *
 * PRIVACY BOUNDARY: everything in this module describes TEMPLATES — the
 * office's own wording. The temporary patient/treatment values typed during
 * the Complete Forms workflow live only in `PacketFill` objects held in
 * component state; they are never persisted anywhere and are cleared after
 * printing, on timeout, and on leaving the workflow.
 */

export type Cents = number;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const FORM_CATEGORIES = [
  'general_consent',
  'surgical_consent',
  'restorative',
  'endodontic',
  'periodontal',
  'implant',
  'orthodontic',
  'sedation',
  'medication',
  'financial',
  'preoperative',
  'postoperative',
  'office_policy',
  'other',
] as const;

export type FormCategory = (typeof FORM_CATEGORIES)[number];

export const FORM_CATEGORY_LABELS: Record<FormCategory, string> = {
  general_consent: 'General Consent',
  surgical_consent: 'Surgical Consent',
  restorative: 'Restorative',
  endodontic: 'Endodontic',
  periodontal: 'Periodontal',
  implant: 'Implant',
  orthodontic: 'Orthodontic',
  sedation: 'Sedation',
  medication: 'Medication',
  financial: 'Financial',
  preoperative: 'Preoperative',
  postoperative: 'Postoperative',
  office_policy: 'Office Policy',
  other: 'Other',
};

export function categoryLabel(category: string): string {
  return FORM_CATEGORY_LABELS[category as FormCategory] ?? 'Other';
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export const SIGNATURE_ROLES = [
  'patient',
  'guardian',
  'doctor',
  'hygienist',
  'assistant',
  'witness',
] as const;

export type SignatureRole = (typeof SIGNATURE_ROLES)[number];

export const SIGNATURE_ROLE_LABELS: Record<SignatureRole, string> = {
  patient: 'Patient',
  guardian: 'Parent or Guardian',
  doctor: 'Doctor',
  hygienist: 'Hygienist',
  assistant: 'Dental Assistant',
  witness: 'Witness',
};

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type ConsentBlockType =
  | 'title'
  | 'section'        // section heading; optional structured `kind`
  | 'instruction'    // emphasized guidance text
  | 'paragraph'
  | 'bullets'
  | 'checkbox'
  | 'yesno'
  | 'short_answer'
  | 'long_answer'
  | 'date'
  | 'tooth_numbers'
  | 'procedure'
  | 'provider'
  | 'patient_name'
  | 'cost'
  | 'initials'
  | 'signature'      // one line per role
  | 'medications'    // checklist of medication options
  | 'notes'          // printable notes area (temporary packet notes render here)
  | 'logo'
  | 'divider'
  | 'page_break';

/**
 * Structured meaning for section blocks, so validation can tell whether a
 * consent covers risks/alternatives/consent statement, and AI review can
 * point at what is missing without guessing from wording.
 */
export type ConsentSectionKind =
  | 'description'
  | 'purpose'
  | 'benefits'
  | 'risks'
  | 'serious_risks'
  | 'alternatives'
  | 'declining'
  | 'questions'
  | 'consent_statement'
  | 'preop'
  | 'postop'
  | 'other';

export const SECTION_KIND_LABELS: Record<ConsentSectionKind, string> = {
  description: 'Procedure Description',
  purpose: 'Purpose of Treatment',
  benefits: 'Expected Benefits',
  risks: 'Common Risks',
  serious_risks: 'Serious but Less Common Risks',
  alternatives: 'Alternatives',
  declining: 'Consequences of Declining Treatment',
  questions: 'Patient Questions Acknowledgment',
  consent_statement: 'Consent Statement',
  preop: 'Preoperative Instructions',
  postop: 'Postoperative Instructions',
  other: 'Other Section',
};

/** A condition attached to a block: show it only for a given answer. */
export interface BlockCondition {
  /** id of a `yesno` or `checkbox` block earlier in the form. */
  blockId: string;
  equals: 'yes' | 'no' | 'checked' | 'unchecked';
}

export interface ConsentBlock {
  id: string;
  type: ConsentBlockType;
  /** Heading text, field label, or checkbox statement. */
  label?: string;
  /** Paragraph / instruction body text. */
  body?: string;
  /** Bullet list rows or medication options. */
  items?: string[];
  /** Field blocks: must be completed before printing. */
  required?: boolean;
  /** Signature blocks only. */
  role?: SignatureRole;
  /** Section blocks only: structured meaning. */
  kind?: ConsentSectionKind;
  /** Conditional display, or null/undefined for always shown. */
  condition?: BlockCondition | null;
}

/** Explicit page-layout choice for the printed form. */
export type PageFit = 'auto' | 'one_page' | 'two_pages';

export interface TemplateLayout {
  /**
   * auto      — pages break wherever content and page_break blocks fall.
   * one_page  — compact spacing (within readable minimums) to fit one sheet.
   * two_pages — intentional two-page layout honoring page_break markers.
   */
  pageFit: PageFit;
  /**
   * Standard patient-information row (Patient Name left, Date of Birth right)
   * under the page-1 header. When on, body patient_name blocks are skipped so
   * the name never prints twice.
   */
  patientRow: boolean;
}

export const DEFAULT_LAYOUT: TemplateLayout = { pageFit: 'auto', patientRow: true };

export interface ConsentTemplateContent {
  blocks: ConsentBlock[];
  layout?: Partial<TemplateLayout>;
}

/** Layout with defaults applied — the only way readers should access it. */
export function templateLayout(content: ConsentTemplateContent): TemplateLayout {
  return { ...DEFAULT_LAYOUT, ...(content.layout ?? {}) };
}

let blockSeq = 0;

/** Ids only need to be unique within a template; keep them short and stable. */
export function newBlockId(): string {
  blockSeq += 1;
  return `b${Date.now().toString(36)}${blockSeq.toString(36)}`;
}

export function makeBlock(type: ConsentBlockType, partial: Partial<ConsentBlock> = {}): ConsentBlock {
  return { id: newBlockId(), type, ...partial };
}

/** Palette metadata for the builder. */
export interface BlockTypeMeta {
  type: ConsentBlockType;
  label: string;
  group: 'Content' | 'Fields' | 'Signatures' | 'Layout';
}

export const BLOCK_TYPES: BlockTypeMeta[] = [
  { type: 'title', label: 'Title', group: 'Content' },
  { type: 'section', label: 'Section Heading', group: 'Content' },
  { type: 'instruction', label: 'Instruction Text', group: 'Content' },
  { type: 'paragraph', label: 'Paragraph', group: 'Content' },
  { type: 'bullets', label: 'Bullet List', group: 'Content' },
  { type: 'checkbox', label: 'Checkbox', group: 'Fields' },
  { type: 'yesno', label: 'Yes / No Question', group: 'Fields' },
  { type: 'short_answer', label: 'Short Answer', group: 'Fields' },
  { type: 'long_answer', label: 'Long Answer', group: 'Fields' },
  { type: 'date', label: 'Date', group: 'Fields' },
  { type: 'tooth_numbers', label: 'Tooth Number(s)', group: 'Fields' },
  { type: 'procedure', label: 'Procedure Name', group: 'Fields' },
  { type: 'provider', label: 'Provider Name', group: 'Fields' },
  { type: 'patient_name', label: 'Patient Name', group: 'Fields' },
  { type: 'cost', label: 'Treatment Cost', group: 'Fields' },
  { type: 'medications', label: 'Medication Selection', group: 'Fields' },
  { type: 'notes', label: 'Notes Area', group: 'Fields' },
  { type: 'initials', label: 'Initial Box', group: 'Signatures' },
  { type: 'signature', label: 'Signature Line', group: 'Signatures' },
  { type: 'logo', label: 'Office Logo', group: 'Layout' },
  { type: 'divider', label: 'Divider', group: 'Layout' },
  { type: 'page_break', label: 'Page Break', group: 'Layout' },
];

export function blockTypeLabel(type: ConsentBlockType): string {
  return BLOCK_TYPES.find(b => b.type === type)?.label ?? type;
}

// ---------------------------------------------------------------------------
// Derived template facts (kept in sync on the consent_forms row on publish)
// ---------------------------------------------------------------------------

export interface TemplateSignatureFacts {
  patient: boolean;
  doctor: boolean;
  witness: boolean;
  guardian: boolean;
  hygienist: boolean;
  assistant: boolean;
  includesCost: boolean;
}

export function deriveSignatureFacts(content: ConsentTemplateContent): TemplateSignatureFacts {
  const facts: TemplateSignatureFacts = {
    patient: false, doctor: false, witness: false,
    guardian: false, hygienist: false, assistant: false,
    includesCost: false,
  };
  for (const block of content.blocks) {
    if (block.type === 'signature' && block.role) facts[block.role] = true;
    if (block.type === 'cost') facts.includesCost = true;
  }
  return facts;
}

// ---------------------------------------------------------------------------
// Library rows (client shapes for the consent_* tables)
// ---------------------------------------------------------------------------

export type FormStatus = 'draft' | 'published' | 'archived';

export interface ConsentForm {
  id: string;
  orgId: string;
  name: string;
  category: FormCategory;
  status: FormStatus;
  procedureCodes: string[];
  editableBy: 'managers' | 'everyone';
  requiresPatientSignature: boolean;
  requiresDoctorSignature: boolean;
  requiresWitnessSignature: boolean;
  requiresGuardianSignature: boolean;
  hygienistMayComplete: boolean;
  includesCost: boolean;
  isFinancial: boolean;
  isSample: boolean;
  needsReview: boolean;
  source: 'manual' | 'upload' | 'duplicate' | 'sample';
  currentVersion: number;
  publishedContent: ConsentTemplateContent | null;
  draftContent: ConsentTemplateContent | null;
  createdAt: string;
  updatedAt: string;
}

/** What the workflow prints: the published content, or the draft for a
 *  never-published form (flagged by bundle warnings). */
export function effectiveContent(form: ConsentForm): ConsentTemplateContent | null {
  return form.publishedContent ?? form.draftContent;
}

/** What the builder edits: the working draft, else the published content. */
export function workingContent(form: ConsentForm): ConsentTemplateContent | null {
  return form.draftContent ?? form.publishedContent;
}

export interface ConsentFormVersion {
  id: string;
  formId: string;
  version: number;
  content: ConsentTemplateContent;
  changeNotes: string;
  publishedAt: string;
  publishedBy: string | null;
}

export type BundleItemRequirement = 'required' | 'recommended' | 'optional' | 'conditional';

export const REQUIREMENT_LABELS: Record<BundleItemRequirement, string> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
  conditional: 'Conditional',
};

export interface ConsentBundleItem {
  id: string;
  bundleId: string;
  formId: string;
  requirement: BundleItemRequirement;
  conditionLabel: string;
  sortOrder: number;
}

export interface ConsentBundle {
  id: string;
  orgId: string;
  name: string;
  description: string;
  procedureCodes: string[];
  status: 'active' | 'archived';
  sortOrder: number;
  isSample: boolean;
  useCount: number;
  updatedAt: string;
  items: ConsentBundleItem[];
}

export interface ConsentSettings {
  clearTimeoutMinutes: number;
  warnBeforeClear: boolean;
  teamCanUpload: boolean;
  teamCanEditTemplates: boolean;
  teamCanPublish: boolean;
  teamCanArchive: boolean;
  teamCanCreateBundles: boolean;
  teamCanOverrideFees: boolean;
  teamCanPrint: boolean;
  teamCanChangeSignatures: boolean;
  requireWitnessDefault: boolean;
  requireGuardianForMinors: boolean;
  financialFormId: string | null;
  alwaysOfferFinancial: boolean;
}

export const DEFAULT_CONSENT_SETTINGS: ConsentSettings = {
  clearTimeoutMinutes: 30,
  warnBeforeClear: true,
  teamCanUpload: false,
  teamCanEditTemplates: false,
  teamCanPublish: false,
  teamCanArchive: false,
  teamCanCreateBundles: false,
  teamCanOverrideFees: true,
  teamCanPrint: true,
  teamCanChangeSignatures: false,
  requireWitnessDefault: false,
  requireGuardianForMinors: true,
  financialFormId: null,
  alwaysOfferFinancial: true,
};

export interface ConsentAuditEntry {
  id: string;
  action: string;
  entityType: 'form' | 'bundle' | 'settings' | 'packet';
  entityId: string | null;
  entityName: string;
  actorName: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// The temporary packet (Complete Forms workflow) — NEVER persisted
// ---------------------------------------------------------------------------

/** One selected procedure line with its fee handling. */
export interface PacketProcedure {
  code: string;
  description: string;
  /** The office's normal fee for the code; null when not on the schedule. */
  officeFeeCents: Cents | null;
  /** What will print. Starts at officeFeeCents; user may override. */
  feeCents: Cents | null;
  overridden: boolean;
}

/** Temporary patient/treatment values — memory only, cleared after print. */
export interface PacketFill {
  patientName: string;
  dateOfBirth: string;        // YYYY-MM-DD or free entry; memory only like all of it
  date: string;               // YYYY-MM-DD, auto-filled with today
  toothNumbers: string;       // free entry, "3, 14, 19" where applicable
  surfaces: string;
  providerName: string;
  notes: string;
  isMinor: boolean;
  procedures: PacketProcedure[];
  includeFinancial: boolean;
  discountCents: Cents;
  insuranceEstimateCents: Cents;
  depositCents: Cents;
  paymentArrangement: string;
  /** Per-block answers keyed by `${formId}:${blockId}` (yes/no, checks, text). */
  answers: Record<string, string>;
}

export function emptyPacketFill(todayIso: string): PacketFill {
  return {
    patientName: '',
    dateOfBirth: '',
    date: todayIso,
    toothNumbers: '',
    surfaces: '',
    providerName: '',
    notes: '',
    isMinor: false,
    procedures: [],
    includeFinancial: false,
    discountCents: 0,
    insuranceEstimateCents: 0,
    depositCents: 0,
    paymentArrangement: '',
    answers: {},
  };
}

/** True when the fill holds anything a patient could be identified by. */
export function fillHasPatientInfo(fill: PacketFill): boolean {
  return Boolean(
    fill.patientName.trim() ||
    fill.dateOfBirth.trim() ||
    fill.toothNumbers.trim() ||
    fill.surfaces.trim() ||
    fill.notes.trim() ||
    Object.values(fill.answers).some(v => v && v.trim())
  );
}

/** Financial math for the packet: total, minus adjustments. */
export function packetTotals(fill: PacketFill): {
  subtotalCents: Cents;
  totalCents: Cents;
  estimatedPatientCents: Cents;
} {
  const subtotal = fill.procedures.reduce((sum, p) => sum + (p.feeCents ?? 0), 0);
  const total = Math.max(0, subtotal - fill.discountCents);
  const patient = Math.max(0, total - fill.insuranceEstimateCents - fill.depositCents);
  return { subtotalCents: subtotal, totalCents: total, estimatedPatientCents: patient };
}
