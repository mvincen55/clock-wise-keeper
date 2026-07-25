import type { FofPracticeInfo, FofTemplate } from './types';

/**
 * Factory template content — the shipped FOF variants. Used to seed an
 * org that has no templates yet and to power "Restore default
 * templates". De-identified configuration only; practice identity comes
 * from org_branding rows, never from code.
 */

export const DEFAULT_PRACTICE_INFO: FofPracticeInfo = {
  practiceName: '',
  addressLine1: '',
  addressLine2: '',
  phone: '',
  website: '',
  doctorName: '',
  logoUrl: '',
  doctorNames: [],
  membershipPlanName: '',
  featureDisplayName: 'Treatment Estimator',
  printFormTitle: 'Treatment Estimate',
};

/**
 * Initials of the printed form title, used where the office copy names
 * the form compactly ("FOF Detail", "As Printed on the FOF").
 */
export function formShortName(printFormTitle: string): string {
  const initials = printFormTitle
    .split(/\s+/)
    .map(w => w[0])
    .filter(c => c && /[A-Za-z]/.test(c))
    .join('')
    .toUpperCase();
  return initials || 'Form';
}

export const DEFAULT_SIGNATURE_INTRO =
  'has read this Financial Options Form in its entirety and agrees to the following plan:';

export const DEFAULT_VALIDITY_NOTE =
  'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.';

export const DEFAULT_PREPAY_NOTE =
  'The "Prepay Discount" on this Financial Options Form will be honored if the total amount is paid either at the time of scheduling or at least two weeks prior to the appointment. For appointments scheduled less than two weeks in advance, payment must be made at the time of scheduling to qualify for the discount.';

export const DEFAULT_INSURANCE_NOTE =
  'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.';

/**
 * Contact footnote generated from the org's branding at template-seed
 * time, so a new office's forms carry its own phone and mailing address.
 * (Existing template rows keep whatever text they were saved with.)
 */
export function buildDefaultContactNote(practice: {
  practiceName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
}): string {
  const call = practice.phone.trim() ? ` Call us at ${practice.phone.trim()} — we're happy to help.` : '';
  const mailTo = [practice.practiceName, practice.addressLine1, practice.addressLine2]
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ');
  const mail = mailTo ? ` Please mail your signed copy, along with your payment, to ${mailTo}.` : '';
  return `Questions about this form, or interested in another payment arrangement such as outside financing?${call}${mail}`;
}

const DEFAULT_INSTALLMENT_LABELS = [
  'Visit 1 (Upon scheduling)',
  'Visit 2 (Prep date)',
  'Visit 3 (On delivery)',
];

export type FofTemplateSeed = Omit<FofTemplate, 'id'>;

/**
 * Seed wording names the form with the org's own printed title. The
 * shipped texts carry the historical name; seeding swaps it for the
 * org's print_form_title so a new office's templates read naturally.
 */
export function applyFormTitle<T extends FofTemplateSeed>(seed: T, printFormTitle: string): T {
  const title = printFormTitle.trim();
  if (title === '') return seed;
  const swap = (text: string) => text.split('Financial Options Form').join(title);
  return {
    ...seed,
    validityNote: swap(seed.validityNote),
    prepayNote: swap(seed.prepayNote),
    signatureIntro: swap(seed.signatureIntro),
  };
}

const BASE_SEED = {
  isActive: true,
  installmentCount: 3,
  installmentLabels: DEFAULT_INSTALLMENT_LABELS,
  validityNote: DEFAULT_VALIDITY_NOTE,
  // Interpolated from org_branding at seed time (buildDefaultContactNote).
  contactNote: '',
  footnotes: [] as string[],
  signatureIntro: DEFAULT_SIGNATURE_INTRO,
  showInstallmentOption: true,
};

export const DEFAULT_TEMPLATES: FofTemplateSeed[] = [
  {
    ...BASE_SEED,
    name: 'Self-Pay',
    sortOrder: 0,
    discountPercent: 10,
    discountLabel: 'Prepay Discount',
    showInsuranceEstimate: false,
    showWriteOff: false,
    showPrepayOption: true,
    prepayNote: DEFAULT_PREPAY_NOTE,
    insuranceNote: '',
    membershipDiscountPercent: 0,
    seniorDiscountApplies: true,
  },
  {
    ...BASE_SEED,
    name: 'In-Network Insurance',
    sortOrder: 1,
    discountPercent: 0,
    discountLabel: '',
    showInsuranceEstimate: true,
    showWriteOff: true,
    showPrepayOption: false,
    prepayNote: '',
    insuranceNote: DEFAULT_INSURANCE_NOTE,
    membershipDiscountPercent: 0,
    seniorDiscountApplies: false,
  },
  {
    ...BASE_SEED,
    name: 'Out-of-Network Insurance',
    sortOrder: 2,
    discountPercent: 10,
    discountLabel: 'Prepay Discount',
    showInsuranceEstimate: true,
    // Write-offs are an in-network concept — OON forms never show the row.
    showWriteOff: false,
    showPrepayOption: true,
    prepayNote: DEFAULT_PREPAY_NOTE,
    insuranceNote: DEFAULT_INSURANCE_NOTE,
    membershipDiscountPercent: 0,
    seniorDiscountApplies: true,
  },
  {
    ...BASE_SEED,
    name: 'In-House Membership',
    sortOrder: 3,
    discountPercent: 0,
    discountLabel: '',
    showInsuranceEstimate: false,
    showWriteOff: false,
    showPrepayOption: true,
    prepayNote: '',
    insuranceNote: '',
    membershipDiscountPercent: 10,
    seniorDiscountApplies: true,
    footnotes: ['Membership pricing per the in-house membership plan; some exclusions may apply.'],
  },
  {
    ...BASE_SEED,
    name: 'Financing',
    sortOrder: 4,
    discountPercent: 0,
    discountLabel: '',
    // Financed patients can still have insurance: estimate/write-off rows
    // compute (and print only when non-zero); write-offs apply when the
    // selected carrier schedule is marked in network. No prepay or senior
    // discounts, and Prepay in Full defaults off (still toggleable).
    showInsuranceEstimate: true,
    showWriteOff: false,
    showPrepayOption: false,
    prepayNote: '',
    insuranceNote: DEFAULT_INSURANCE_NOTE,
    membershipDiscountPercent: 0,
    seniorDiscountApplies: false,
    footnotes: ['No prepay discount applies when payment is made through an outside financing company.'],
  },
];
