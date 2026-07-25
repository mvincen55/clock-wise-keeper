/**
 * Settings registry — the machine-readable enumeration of every org
 * setting the genericization pass created (Phase 2), organized the way
 * a brand-new office would be walked through them, section by section.
 *
 * This structure is load-bearing beyond the settings cards: the groups,
 * labels, and descriptions here will drive the guided onboarding flow
 * (form-based and AI-interview modes read the same registry), and Phase
 * 3's capability contract marks which entries the assistant may write.
 * Keys are stable identifiers — never rename one that has shipped.
 */

export type SettingTier = 'pixels' | 'money';

export type SettingType =
  | 'text'
  | 'multiline_text'
  | 'text_list'
  | 'color'
  | 'image'
  | 'money_cents'
  | 'percent'
  | 'boolean'
  | 'code_list';

export interface SettingGroup {
  id: string;
  /** Section heading, in onboarding order. */
  title: string;
  /** One line a new office reads before the section's questions. */
  description: string;
  order: number;
}

export interface SettingDef {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingType;
  /** 'money' entries change dollar output and carry server-side bounds. */
  tier: SettingTier;
  bounds?: { min: number; max: number };
  /** Storage location, for tooling and the Phase 3 contract. */
  source: { table: string; column?: string };
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'identity_branding',
    title: 'Practice Identity & Branding',
    description:
      'Who you are on every screen, printed document, and email: names, address, contact info, logo, and colors.',
    order: 1,
  },
  {
    id: 'documents_wording',
    title: 'Documents & Wording',
    description:
      'What your documents call themselves and the office vocabulary printed on them.',
    order: 2,
  },
  {
    id: 'money_thresholds',
    title: 'Money & Thresholds',
    description:
      'Dollar rules that shape payment schedules. Bounded and validated — these change what patients are asked to pay and when.',
    order: 3,
  },
  {
    id: 'discounts_rules',
    title: 'Discounts & Rules',
    description:
      'Your named discount programs and the procedure-code lists that drive coverage and scheduling behavior.',
    order: 4,
  },
  {
    id: 'time_off_policy',
    title: 'Time Off Policy',
    description: 'PTO accrual tiers and caps for your team.',
    order: 5,
  },
  {
    id: 'feature_toggles',
    title: 'Feature Toggles',
    description: 'Optional behaviors an office can turn on or off. (None yet — sections and templates already cover the optional form blocks.)',
    order: 6,
  },
];

export const SETTINGS_REGISTRY: SettingDef[] = [
  // ── Practice Identity & Branding ─────────────────────────────────
  { key: 'branding.legal_name', group: 'identity_branding', label: 'Legal / printed name', description: 'The long form printed on forms and document footers.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'legal_name' } },
  { key: 'branding.display_name', group: 'identity_branding', label: 'Short display name', description: 'Used in headings and as the logo alt text.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'display_name' } },
  { key: 'branding.address_line1', group: 'identity_branding', label: 'Address line 1', description: 'Street address printed on documents.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'address_line1' } },
  { key: 'branding.address_line2', group: 'identity_branding', label: 'Address line 2', description: 'City, state, ZIP printed on documents.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'address_line2' } },
  { key: 'branding.phone', group: 'identity_branding', label: 'Phone', description: 'Printed on documents and in contact wording.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'phone' } },
  { key: 'branding.website', group: 'identity_branding', label: 'Website', description: 'Printed in document footers when set.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'website' } },
  { key: 'branding.logo', group: 'identity_branding', label: 'Logo', description: 'Printed on forms and the deposit log.', type: 'image', tier: 'pixels', source: { table: 'org_branding', column: 'logo_url' } },
  { key: 'branding.brand_color', group: 'identity_branding', label: 'Brand color', description: 'Accent color on printed documents and previews.', type: 'color', tier: 'pixels', source: { table: 'org_branding', column: 'brand_color' } },
  { key: 'branding.brand_tint', group: 'identity_branding', label: 'Brand tint', description: 'Light background shade paired with the brand color.', type: 'color', tier: 'pixels', source: { table: 'org_branding', column: 'brand_tint' } },
  { key: 'branding.google_calendar_id', group: 'identity_branding', label: 'Office Google Calendar ID', description: 'Calendar shown on the Office Calendar page.', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'google_calendar_id' } },
  { key: 'branding.email_sender_name', group: 'identity_branding', label: 'Email sender name', description: 'Display name on outbound org email (reserved; no org email yet).', type: 'text', tier: 'pixels', source: { table: 'org_branding', column: 'email_sender_name' } },

  // ── Documents & Wording ──────────────────────────────────────────
  { key: 'fof.feature_display_name', group: 'documents_wording', label: 'Estimator feature name', description: 'What the feature is called in the navigation and page headers.', type: 'text', tier: 'pixels', source: { table: 'fof_settings', column: 'feature_display_name' } },
  { key: 'fof.print_form_title', group: 'documents_wording', label: 'Printed form title', description: 'How the printed form names itself; its initials label the office copy.', type: 'text', tier: 'pixels', source: { table: 'fof_settings', column: 'print_form_title' } },
  { key: 'fof.membership_plan_name', group: 'documents_wording', label: 'Membership plan name', description: 'Names the membership on the printed form and the deposit log row.', type: 'text', tier: 'pixels', source: { table: 'fof_settings', column: 'membership_plan_name' } },
  { key: 'fof.doctor_names', group: 'documents_wording', label: 'Doctors', description: 'Offered in the builder’s doctor dropdown for treatment wording.', type: 'text_list', tier: 'pixels', source: { table: 'fof_settings', column: 'doctor_names' } },
  { key: 'deposit.account_line', group: 'documents_wording', label: 'Deposit account line', description: 'The “Deposit To” line pre-printed on the bank copy.', type: 'text', tier: 'pixels', source: { table: 'org_deposit_settings', column: 'account_line' } },
  { key: 'deposit.bank_split_cash_label', group: 'documents_wording', label: 'Cash & checks bank label', description: 'Bank-split row label on the office copy.', type: 'text', tier: 'pixels', source: { table: 'org_deposit_settings', column: 'bank_split_cash_label' } },
  { key: 'deposit.bank_split_cards_label', group: 'documents_wording', label: 'Card deposits bank label', description: 'Bank-split row label on the office copy.', type: 'text', tier: 'pixels', source: { table: 'org_deposit_settings', column: 'bank_split_cards_label' } },
  { key: 'deposit.bank_total_label', group: 'documents_wording', label: 'Bank copy total label', description: 'The total line on the bank copy.', type: 'text', tier: 'pixels', source: { table: 'org_deposit_settings', column: 'bank_total_label' } },
  { key: 'deposit.envelope_note', group: 'documents_wording', label: 'Envelope callout', description: 'Handling note printed on both deposit copies; blank = omitted.', type: 'text', tier: 'pixels', source: { table: 'org_deposit_settings', column: 'envelope_note' } },
  { key: 'deposit.office_copy_note', group: 'documents_wording', label: 'Office copy filing note', description: 'Filing instruction in the office copy footer.', type: 'text', tier: 'pixels', source: { table: 'org_deposit_settings', column: 'office_copy_note' } },

  // ── Money & Thresholds ───────────────────────────────────────────
  { key: 'fof.day_of_service_threshold_cents', group: 'money_thresholds', label: 'Day-of-service threshold', description: 'Patient portions under this are simply paid at the visit — nothing due before the first visit.', type: 'money_cents', tier: 'money', bounds: { min: 0, max: 500_000 }, source: { table: 'fof_settings', column: 'day_of_service_threshold_cents' } },
  { key: 'fof.min_standalone_payment_cents', group: 'money_thresholds', label: 'Minimum standalone payment', description: 'Schedule payments smaller than this fold into the payment before them.', type: 'money_cents', tier: 'money', bounds: { min: 0, max: 100_000 }, source: { table: 'fof_settings', column: 'min_standalone_payment_cents' } },
  { key: 'fof.downgrade_default_on', group: 'money_thresholds', label: 'Downgrade fillings by default', description: 'Whether the alternate-benefit downgrade toggle starts on for posterior composites.', type: 'boolean', tier: 'money', source: { table: 'fof_settings', column: 'downgrade_default_on' } },

  // ── Discounts & Rules ────────────────────────────────────────────
  { key: 'rules.senior', group: 'discounts_rules', label: 'Senior 65+ program', description: 'Automatic under the threshold; earned by prepay-in-full above it.', type: 'percent', tier: 'money', bounds: { min: 0, max: 100 }, source: { table: 'fof_discount_rules' } },
  { key: 'rules.prepay', group: 'discounts_rules', label: 'Prepay (under 65)', description: 'Earned by prepay-in-full at the senior threshold or more.', type: 'percent', tier: 'money', bounds: { min: 0, max: 100 }, source: { table: 'fof_discount_rules' } },
  { key: 'rules.membership', group: 'discounts_rules', label: 'In-house membership program', description: 'Automatic on membership templates; the extra percent is the 65+ prepay add-on.', type: 'percent', tier: 'money', bounds: { min: 0, max: 100 }, source: { table: 'fof_discount_rules' } },
  { key: 'codes.never_covered', group: 'discounts_rules', label: 'Never covered by insurance', description: 'Codes that always land in “No Coverage” regardless of CDT range.', type: 'code_list', tier: 'money', source: { table: 'fof_code_rules' } },
  { key: 'codes.no_prepay', group: 'discounts_rules', label: 'Billed at the visit (no prepay)', description: 'Fees collected at their visit, never in the half-ahead schedule.', type: 'code_list', tier: 'money', source: { table: 'fof_code_rules' } },
  { key: 'codes.membership_included', group: 'discounts_rules', label: 'Included with membership', description: 'Procedures the membership covers at no charge on membership forms.', type: 'code_list', tier: 'money', source: { table: 'fof_code_rules' } },

  // ── Time Off Policy ──────────────────────────────────────────────
  { key: 'pto.accrual_tiers', group: 'time_off_policy', label: 'PTO accrual tiers', description: 'Accrual rate and weekly cap by years of service.', type: 'text_list', tier: 'money', source: { table: 'pto_accrual_tiers' } },
];

export function getSettingGroup(id: string): SettingGroup {
  const group = SETTING_GROUPS.find(g => g.id === id);
  if (!group) throw new Error(`Unknown settings group: ${id}`);
  return group;
}

export function settingsInGroup(id: string): SettingDef[] {
  return SETTINGS_REGISTRY.filter(s => s.group === id);
}
