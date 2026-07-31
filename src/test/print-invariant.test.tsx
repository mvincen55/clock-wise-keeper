/**
 * Genericization-pass safety net: the printed output for the reference
 * records must stay BYTE-FOR-BYTE identical across every refactor phase.
 * These render the exact print components with fixed, known inputs
 * (a neutral reference practice configuration and a saved deposit record)
 * and snapshot the full print DOM. Any diff in these snapshots means a
 * phase changed what the office prints — the phase fails.
 *
 * The fixtures cover every feature the brief requires of the reference
 * FOF: insurance estimate, a downgrade line, a payment schedule with an
 * under-$1,000 first visit, a never-covered code, the "You save" chip,
 * and the benefit-year renewal note.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import DepositPrintSheet from '@/components/DepositPrintSheet';
import IncidentReportPrintSheet from '@/components/IncidentReportPrintSheet';
import type {
  FofAmounts,
  FofComputation,
  FofOfficeLine,
  FofPatientFields,
  FofPracticeInfo,
  FofTemplate,
} from '@/lib/fof/types';

// The office-copy page prints "Created by ... on <now>" — freeze it.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 24, 14, 30, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

/**
 * A neutral reference practice configuration (org_branding / fof_settings
 * rows). logoUrl pins the value the original bundled asset resolved to
 * in this test environment, keeping the reference DOM byte-identical;
 * in production the same PNG now comes from the org's branding row.
 */
const PRACTICE: FofPracticeInfo = {
  practiceName: 'Northfield Dental Group, LLC',
  addressLine1: '41 Northfield Avenue',
  addressLine2: 'Springvale, MA 02100',
  phone: '(555) 010-0142',
  website: 'northfielddentalgroup.example',
  doctorName: 'Dr. Scott',
  logoUrl: '/src/assets/practice-logo.png',
  membershipPlanName: 'Membership',
};

/**
 * Out-of-Network Insurance template as seeded for the org, with the
 * builder-appended situational footnotes (downgrade + benefit-year
 * renewal) present exactly as FofBuilder passes them at print time.
 */
const TEMPLATE: FofTemplate = {
  id: 'ref-template',
  name: 'Out-of-Network Insurance',
  sortOrder: 2,
  isActive: true,
  discountPercent: 10,
  discountLabel: 'Prepay Discount',
  showInsuranceEstimate: true,
  showWriteOff: false,
  showPrepayOption: true,
  showInstallmentOption: true,
  installmentCount: 3,
  installmentLabels: ['Visit 1 (Upon scheduling)', 'Visit 2 (Prep date)', 'Visit 3 (On delivery)'],
  validityNote:
    'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.',
  prepayNote:
    'The "Prepay Discount" on this Financial Options Form will be honored if the total amount is paid either at the time of scheduling or at least two weeks prior to the appointment. For appointments scheduled less than two weeks in advance, payment must be made at the time of scheduling to qualify for the discount.',
  insuranceNote:
    'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.',
  contactNote:
    "Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (555) 010-0142 — we're happy to help. Please mail your signed copy, along with your payment, to Northfield Dental Group, LLC, 41 Northfield Avenue, Springvale, MA 02100.",
  footnotes: [
    'Your dental plan applies an "alternate benefit" to tooth-colored (composite) fillings on back teeth: insurance pays as if a silver (amalgam) filling were placed. You still receive the tooth-colored filling; the difference up to our standard fee is included in your portion.',
    "Because this treatment continues into your next insurance benefit year, part of the estimate is paid from next year's renewed benefits: your annual maximum starts over for the visits after renewal, and your deductible applies again. If your coverage changes at renewal, this estimate may change as well.",
  ],
  signatureIntro: 'has read this Financial Options Form in its entirety and agrees to the following plan:',
  membershipDiscountPercent: 0,
  seniorDiscountApplies: true,
};

const PATIENT: FofPatientFields = {
  patientName: 'Reference Patient',
  dateISO: '2026-07-24',
  treatment:
    'Dr. Scott will prepare tooth #14 for a porcelain crown, place a composite filling on tooth #19, and use a surgical guide on implant surgery day, designed to help rebuild a strong, functional bite.',
};

const AMOUNTS: FofAmounts = {
  totalCents: 412_500, // $4,125.00
  insuranceEstimateCents: 98_500, // $985.00
  writeOffCents: 0,
  officeDiscountCents: 0,
  officeDiscountLabel: '',
  patientCreditCents: 0,
  autoDiscount: null,
  membershipCoveredCents: 0,
  prepayDiscountBaseCents: null,
};

// Patient portion $3,140.00 across three visits — the first visit is
// deliberately under $1,000 to exercise that reference case.
const COMPUTATION: FofComputation = {
  computed: {
    patientPortionCents: 314_000,
    discountCents: 31_400,
    prepayTotalCents: 282_600,
    installmentsCents: [94_000, 110_000, 110_000],
  },
  effective: {
    patientPortionCents: 314_000,
    discountCents: 31_400,
    prepayTotalCents: 282_600,
    installmentsCents: [94_000, 110_000, 110_000],
  },
  installmentLabels: ['Upon Scheduling', 'At Crown Prep', 'On Crown Delivery'],
  overridden: {
    patientPortion: false,
    discount: false,
    prepayTotal: false,
    installments: [false, false, false],
  },
};

/** Office-copy detail incl. a downgraded filling and a never-covered code. */
const OFFICE_LINES: FofOfficeLine[] = [
  {
    code: 'D2740',
    tooth: '14',
    visit: '2',
    category: 'Major',
    description: 'Crown - porcelain/ceramic',
    entryDate: '',
    officeFeeCents: 165_000,
    allowableCents: 120_000,
    insPaysCents: 60_000,
    writeOffCents: 0,
  },
  {
    // Downgrade line: D2392 paid from the D2150 amalgam basis.
    code: 'D2392',
    tooth: '19',
    visit: '1',
    category: 'Basic',
    description: 'Resin composite - 2 surfaces, posterior',
    entryDate: '',
    officeFeeCents: 32_500,
    allowableCents: 21_500,
    insPaysCents: 17_200,
    writeOffCents: 0,
  },
  {
    // Never-covered code (D5982 surgical guide) — no insurance columns.
    code: 'D5982',
    tooth: '',
    visit: '3',
    category: 'No Coverage',
    description: 'Surgical stent',
    entryDate: '',
    officeFeeCents: 45_000,
    allowableCents: null,
    insPaysCents: 0,
    writeOffCents: 0,
  },
  {
    code: 'D6010',
    tooth: '30',
    visit: '3',
    category: 'Major',
    description: 'Surgical placement of implant body',
    entryDate: '',
    officeFeeCents: 170_000,
    allowableCents: 140_000,
    insPaysCents: 21_300,
    writeOffCents: 0,
  },
];

describe('print invariant — reference output must never change', () => {
  it('FOF patient copy + office copy render byte-for-byte identically', () => {
    const html = renderToStaticMarkup(
      <FofPrintSheet
        practice={PRACTICE}
        template={TEMPLATE}
        patient={PATIENT}
        amounts={AMOUNTS}
        computation={COMPUTATION}
        officeLines={OFFICE_LINES}
        createdBy="Jordan Rivera"
        doctorName="Dr. Scott"
      />
    );
    // Sanity: the reference features are actually on the page.
    expect(html).toContain('You save');
    expect(html).toContain('alternate benefit'); // downgrade note
    expect(html).toContain('benefit year'); // renewal note
    expect(html).toContain('D5982'); // never-covered code
    expect(html).toContain('Estimated Insurance Payment');
    expect(html).toMatchSnapshot();
  });

  it('Deposit Log office copy + bank copy render byte-for-byte identically', () => {
    // Mirrors the saved 2026-07-24 deposit record; branding and printed
    // wording carry the org's live row values (formerly code literals).
    const html = renderToStaticMarkup(
      <DepositPrintSheet
        date="2026-07-24"
        cashCents={5500}
        checksCents={[1100]}
        insCcCents={0}
        ptCcCents={0}
        illumitracCents={0}
        outsideFinancingCents={0}
        preparedBy="Jordan Rivera"
        initials="MV"
        branding={{
          displayName: 'Northfield Dental Group',
          legalName: 'Northfield Dental Group, LLC',
          logoUrl: '/src/assets/practice-logo.png',
        }}
        settings={{
          accountLine: 'Sample Bank Account #000000000',
          bankSplitCashLabel: 'SB Bank — cash & checks',
          bankSplitCardsLabel: 'F Bank — card deposits',
          bankTotalLabel: 'SB Bank Total',
          envelopeNote: 'Purple envelope — no tape',
          officeCopyNote: 'Office Copy — file with the day sheet',
          membershipRowLabel: 'Membership',
          outsideFinancingLabel: 'Outside Financing',
        }}
      />
    );
    expect(html).toContain('Sample Bank Account #000000000');
    expect(html).toContain('Purple envelope — no tape');
    expect(html).toContain('Northfield Dental Group, LLC · Daily Deposit Log');
    expect(html).toMatchSnapshot();
  });

  it('Incident report sheet renders byte-for-byte identically', () => {
    // The filed safety record: letterhead with the office logo, the
    // incident grid, the narrative blocks, the review card, and both
    // signatures. Any diff here changed what goes in the binder.
    const report = {
      id: 'incident-fixture',
      org_id: 'org',
      employee_id: 'emp',
      reported_by: 'user',
      reported_by_employee_id: 'emp',
      reported_by_name: 'Jordan Rivera',
      incident_date: '2026-07-27',
      incident_time: '14:45:00',
      category: 'sharps_injury',
      severity: 'moderate',
      location: 'Operatory 2',
      description: 'Stuck on an instrument while cleaning up after an extraction.',
      body_part: 'Left index finger',
      device_involved: 'Hu-Friedy scaler',
      ppe_worn: 'yes',
      witnesses: 'Dr. Avery',
      immediate_action: 'Washed with soap and water, reported to the doctor immediately.',
      medical_treatment: 'first_aid',
      follow_up_required: true,
      follow_up_notes: 'Bloodwork scheduled; source evaluation requested.',
      work_related: true,
      days_away: 0,
      status: 'closed',
      reviewed_by: 'user',
      reviewed_by_name: 'Jordan Rivera',
      reviewed_at: '2026-07-28T18:00:00Z',
      review_notes: 'Reviewed with the team; sharps container relocated to the counter.',
      employee_signature: 'Test Employee',
      employee_signed_at: '2026-07-28T17:00:00Z',
      manager_signature: 'Jordan Rivera',
      manager_signed_at: '2026-07-28T21:16:00Z',
      manager_signed_role: 'owner',
      countersign_role: 'manager',
      created_at: '2026-07-28T16:00:00Z',
      updated_at: '2026-07-28T21:16:00Z',
    } as never;

    const html = renderToStaticMarkup(
      <IncidentReportPrintSheet
        report={report}
        employeeName="Test Employee"
        branding={{
          displayName: 'Northfield Dental Group',
          legalName: 'Northfield Dental Group, LLC',
          addressLine1: '41 Northfield Avenue',
          addressLine2: 'Springvale, MA 02100',
          phone: '(555) 010-0142',
          website: 'northfielddentalgroup.example',
          logoUrl: 'https://example.invalid/logo.png',
        }}
      />
    );
    expect(html).toMatchSnapshot();
  });
});
