import type { FofPracticeInfo, FofTemplate } from './types';

/**
 * Factory template content reproducing the office's existing FOF sheet
 * variants. Used to seed an org that has no templates yet and to power
 * "Restore default templates". De-identified configuration only.
 */

export const DEFAULT_PRACTICE_INFO: FofPracticeInfo = {
  practiceName: 'Harelick Dental Associates, LLC',
  addressLine1: '278 Alden Road',
  addressLine2: 'Fairhaven, MA 02719',
  phone: '(508) 993-0515',
  website: 'drharelick.com',
};

export const DEFAULT_SIGNATURE_INTRO =
  'has read this Financial Options Form in its entirety and agrees to the following plan:';

export const DEFAULT_VALIDITY_NOTE =
  'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.';

export const DEFAULT_PREPAY_NOTE =
  'The "Prepay Discount" on this Financial Options Form will be honored if the total amount is paid either at the time of scheduling or at least two weeks prior to the appointment. For appointments scheduled less than two weeks in advance, payment must be made at the time of scheduling to qualify for the discount.';

export const DEFAULT_INSURANCE_NOTE =
  'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.';

export const DEFAULT_CONTACT_NOTE =
  'If you are interested in exploring alternate financial arrangements, such as payment through an outside financing company, or if you have any questions regarding this form, please contact us at (508) 993-0515. Kindly mail your signed copy along with your payment to: Harelick Dental Associates, LLC. 278 Alden Road, Fairhaven, MA 02719';

const DEFAULT_INSTALLMENT_LABELS = [
  'Visit 1 (Upon scheduling)',
  'Visit 2 (Prep date)',
  'Visit 3 (On delivery)',
];

export type FofTemplateSeed = Omit<FofTemplate, 'id'>;

const BASE_SEED = {
  isActive: true,
  installmentCount: 3,
  installmentLabels: DEFAULT_INSTALLMENT_LABELS,
  validityNote: DEFAULT_VALIDITY_NOTE,
  contactNote: DEFAULT_CONTACT_NOTE,
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
    name: 'In-House Membership (Illumitrac)',
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
    footnotes: ['Membership pricing per the Illumitrac plan; some exclusions may apply.'],
  },
  {
    ...BASE_SEED,
    name: 'Financing / No Discount',
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
