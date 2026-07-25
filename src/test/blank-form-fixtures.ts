/**
 * Blank-form print fixtures — what FofBuilder passes to FofPrintSheet
 * when staff print an empty form to fill in by hand, for each of the
 * org's five live templates (values mirror the production rows).
 *
 * Shared by print-robustness.test.tsx (DOM-level assertions) and
 * scripts/print-layout-render.tsx (Chromium pagination measurement).
 */
import type {
  FofAmounts,
  FofComputation,
  FofPatientFields,
  FofPracticeInfo,
  FofTemplate,
} from '@/lib/fof/types';

/** Live practice identity with the branding-editor defaults. */
export const PRACTICE_DEFAULT_BRANDING: FofPracticeInfo = {
  practiceName: 'Harelick Dental Associates, LLC',
  addressLine1: '278 Alden Road',
  addressLine2: 'Fairhaven, MA 02719',
  phone: '(508) 993-0515',
  website: 'drharelick.com',
  doctorName: 'Dr. Scott',
  logoUrl: '/src/assets/harelick-logo.png',
};

/**
 * The same org while test branding is active: an uploaded logo served
 * from the org-branding storage bucket (a near-square image, unlike the
 * wide original). Everything except the logo URL is identical — the
 * sheet DOM must not depend on which is in effect.
 */
export const PRACTICE_LIVE_BRANDING: FofPracticeInfo = {
  ...PRACTICE_DEFAULT_BRANDING,
  logoUrl:
    'https://lfiplzmxpmybtbzhmnkp.supabase.co/storage/v1/object/public/org-branding/852fc8e0-4071-499b-b655-f86d6f789cd5/logo-1784942859798.png',
};

export const BLANK_PATIENT: FofPatientFields = {
  patientName: '',
  dateISO: '2026-07-24',
  treatment: '',
};

export const BLANK_AMOUNTS: FofAmounts = {
  totalCents: 0,
  insuranceEstimateCents: 0,
  writeOffCents: 0,
  officeDiscountCents: 0,
  officeDiscountLabel: '',
  patientCreditCents: 0,
  autoDiscount: null,
  membershipCoveredCents: 0,
  prepayDiscountBaseCents: null,
};

export const BLANK_COMPUTATION: FofComputation = {
  computed: {
    patientPortionCents: 0,
    discountCents: 0,
    prepayTotalCents: 0,
    installmentsCents: [0, 0, 0],
  },
  effective: {
    patientPortionCents: 0,
    discountCents: 0,
    prepayTotalCents: 0,
    installmentsCents: [0, 0, 0],
  },
  installmentLabels: ['Visit 1 (Upon scheduling)', 'Visit 2 (Prep date)', 'Visit 3 (On delivery)'],
  overridden: {
    patientPortion: false,
    discount: false,
    prepayTotal: false,
    installments: [false, false, false],
  },
};

const VALIDITY_NOTE =
  'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.';
const PREPAY_NOTE =
  'The "Prepay Discount" on this Financial Options Form will be honored if the total amount is paid either at the time of scheduling or at least two weeks prior to the appointment. For appointments scheduled less than two weeks in advance, payment must be made at the time of scheduling to qualify for the discount.';
const INSURANCE_NOTE =
  'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.';
const CONTACT_NOTE =
  "Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (508) 993-0515 — we're happy to help. Please mail your signed copy, along with your payment, to Harelick Dental Associates, LLC, 278 Alden Road, Fairhaven, MA 02719.";
const SIGNATURE_INTRO =
  'has read this Financial Options Form in its entirety and agrees to the following plan:';
const INSTALLMENT_LABELS = [
  'Visit 1 (Upon scheduling)',
  'Visit 2 (Prep date)',
  'Visit 3 (On delivery)',
];

const BASE: Omit<FofTemplate, 'id' | 'name' | 'sortOrder'> = {
  isActive: true,
  discountPercent: 10,
  discountLabel: 'Prepay Discount',
  showInsuranceEstimate: false,
  showWriteOff: false,
  showPrepayOption: true,
  showInstallmentOption: true,
  installmentCount: 3,
  installmentLabels: INSTALLMENT_LABELS,
  validityNote: VALIDITY_NOTE,
  prepayNote: PREPAY_NOTE,
  insuranceNote: '',
  contactNote: CONTACT_NOTE,
  footnotes: [],
  signatureIntro: SIGNATURE_INTRO,
  membershipDiscountPercent: 0,
  seniorDiscountApplies: true,
};

/** The org's five templates as seeded and confirmed live. */
export const LIVE_TEMPLATES: FofTemplate[] = [
  { ...BASE, id: 'self-pay', name: 'Self-Pay', sortOrder: 0 },
  {
    ...BASE,
    id: 'in-network',
    name: 'In-Network Insurance',
    sortOrder: 1,
    discountPercent: 0,
    discountLabel: '',
    showInsuranceEstimate: true,
    showWriteOff: true,
    showPrepayOption: false,
    prepayNote: '',
    insuranceNote: INSURANCE_NOTE,
    seniorDiscountApplies: false,
  },
  {
    ...BASE,
    id: 'oon',
    name: 'Out-of-Network Insurance',
    sortOrder: 2,
    showInsuranceEstimate: true,
    insuranceNote: INSURANCE_NOTE,
  },
  {
    ...BASE,
    id: 'membership',
    name: 'In-House Membership',
    sortOrder: 3,
    discountPercent: 0,
    discountLabel: '',
    prepayNote: '',
    footnotes: ['Membership pricing per the in-house membership plan; some exclusions may apply.'],
    membershipDiscountPercent: 10,
  },
  {
    ...BASE,
    id: 'financing',
    name: 'Financing',
    sortOrder: 4,
    discountPercent: 0,
    discountLabel: '',
    showInsuranceEstimate: true,
    showPrepayOption: false,
    prepayNote: '',
    insuranceNote: INSURANCE_NOTE,
    footnotes: ['No prepay discount applies when payment is made through an outside financing company.'],
    seniorDiscountApplies: false,
  },
];
