/**
 * Print-invariant coverage for the consent sheet: the printed output for a
 * reference template must stay stable, blank copies must carry no patient
 * values, and the master layout rules (letterhead, version footer, page
 * numbering, unsplittable signature areas) must hold.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ConsentPrintSheet from '@/components/consents/ConsentPrintSheet';
import { emptyPacketFill, type ConsentBlock, type PacketFill } from '@/lib/consents/types';

const BRANDING = {
  displayName: 'Reference Dental',
  legalName: 'Reference Dental PC',
  addressLine1: '12 Main St, Springfield MA',
  addressLine2: '',
  phone: '(555) 555-0100',
  website: 'referencedental.example',
  logoUrl: '',
};

const BLOCKS: ConsentBlock[] = [
  { id: 't1', type: 'title', label: 'Tooth Extraction Consent' },
  { id: 'p1', type: 'patient_name', label: 'Patient Name', required: true },
  { id: 'th1', type: 'tooth_numbers', label: 'Tooth Number(s)' },
  { id: 's1', type: 'section', label: 'Common Risks', kind: 'risks', body: 'As with any procedure, there are risks.' },
  { id: 'b1', type: 'bullets', items: ['Bleeding and swelling', 'Dry socket'] },
  { id: 'q1', type: 'yesno', label: 'Do you take blood thinners?', required: true },
  { id: 'pb', type: 'page_break' },
  { id: 'cs', type: 'section', label: 'Consent', kind: 'consent_statement', body: 'I consent to the extraction described above.' },
  { id: 'sig1', type: 'signature', role: 'patient', required: true },
  { id: 'd1', type: 'date', label: 'Date', required: true },
];

const FORM = { id: 'form-1', name: 'Tooth Extraction Consent', isSample: false, isFinancial: false, currentVersion: 3 };

const FINANCIAL_BLOCKS: ConsentBlock[] = [
  { id: 'ft', type: 'title', label: 'Treatment Financial Agreement' },
  { id: 'fp', type: 'patient_name', label: 'Patient Name', required: true },
  { id: 'fc', type: 'cost', label: 'Treatment Fees', required: true },
  { id: 'fs', type: 'signature', role: 'patient', required: true },
];

const FINANCIAL_FORM = { id: 'form-fin', name: 'Financial Agreement', isSample: false, isFinancial: true, currentVersion: 1 };

const filled = (): PacketFill => ({
  ...emptyPacketFill('2026-08-03'),
  patientName: 'Jordan Reference',
  toothNumbers: '14, 15',
  providerName: 'Dr. Reference',
  procedures: [
    { code: 'D7140', description: 'Extraction, erupted tooth', officeFeeCents: 25000, feeCents: 25000, overridden: false },
    { code: 'D7953', description: 'Bone graft', officeFeeCents: 60000, feeCents: 45000, overridden: true },
  ],
  includeFinancial: true,
  discountCents: 5000,
  insuranceEstimateCents: 20000,
  answers: { 'form-1:q1': 'yes' },
});

const render = (props: Parameters<typeof ConsentPrintSheet>[0]) =>
  renderToStaticMarkup(<ConsentPrintSheet {...props} />);

describe('blank copy', () => {
  const html = render({ form: FORM, content: { blocks: BLOCKS }, branding: BRANDING, fill: null, versionDate: '2026-07-01' });

  it('prints the letterhead, version, and page numbers', () => {
    expect(html).toContain('Reference Dental');
    expect(html).toContain('v3');
    expect(html).toContain('Page 1 of 2');
    expect(html).toContain('Page 2 of 2');
    expect(html).toContain('Blank copy');
  });

  it('keeps signature areas and headed sections unsplittable', () => {
    expect(html).toContain('cf-sig cf-keep');
    expect(html).toContain('cf-keep');
  });

  it('carries no patient values — only ruled blanks', () => {
    expect(html).not.toContain('Jordan');
    expect(html).toContain('cf-fill');
  });

  it('stays byte-identical (master layout is not per-form design)', () => {
    expect(html).toMatchSnapshot();
  });
});

describe('completed packet sheet', () => {
  const html = render({ form: FORM, content: { blocks: BLOCKS }, branding: BRANDING, fill: filled(), versionDate: '2026-07-01' });

  it('prints the temporary values and the pre-answered question', () => {
    expect(html).toContain('Jordan Reference');
    expect(html).toContain('14, 15');
    expect(html).toContain('August 3, 2026');
    expect(html).toContain('not stored by Purple Envelope');
  });

  it('shows no fee table — this consent has no cost block', () => {
    expect(html).not.toContain('cf-feetable');
    expect(html).not.toContain('$');
  });
});

describe('financial agreement sheet', () => {
  const html = render({
    form: FINANCIAL_FORM,
    content: { blocks: FINANCIAL_BLOCKS },
    branding: BRANDING,
    fill: filled(),
    versionDate: '2026-07-01',
  });

  it('prints the fee table with the override labeled', () => {
    expect(html).toContain('cf-feetable');
    expect(html).toContain('$250.00');
    expect(html).toContain('$450.00');
    expect(html).toContain('adjusted from office fee');
    expect(html).toContain('Total treatment fee');
    expect(html).toContain('$650.00'); // 700 − 50 discount
    expect(html).toContain('Estimated patient portion');
    expect(html).toContain('$450.00');
  });

  it('stays byte-identical', () => {
    expect(html).toMatchSnapshot();
  });
});

describe('sample labeling', () => {
  it('sample templates print the review banner', () => {
    const html = render({
      form: { ...FORM, isSample: true },
      content: { blocks: BLOCKS },
      branding: BRANDING,
      fill: null,
    });
    expect(html).toContain('SAMPLE TEMPLATE — review and edit before clinical use');
  });
});

describe('conditional blocks', () => {
  const blocks: ConsentBlock[] = [
    { id: 't', type: 'title', label: 'Sedation Consent' },
    { id: 'q', type: 'yesno', label: 'Using IV sedation?' },
    { id: 'c', type: 'paragraph', body: 'IV-only instructions here.', condition: { blockId: 'q', equals: 'yes' } },
  ];

  it('hides a conditional block when its answer says no, prints it on blank copies', () => {
    const yes = render({
      form: FORM, content: { blocks }, branding: BRANDING,
      fill: { ...emptyPacketFill('2026-08-03'), patientName: 'X', answers: { 'form-1:q': 'yes' } },
    });
    const no = render({
      form: FORM, content: { blocks }, branding: BRANDING,
      fill: { ...emptyPacketFill('2026-08-03'), patientName: 'X', answers: { 'form-1:q': 'no' } },
    });
    const blank = render({ form: FORM, content: { blocks }, branding: BRANDING, fill: null });
    expect(yes).toContain('IV-only instructions');
    expect(no).not.toContain('IV-only instructions');
    expect(blank).toContain('IV-only instructions');
  });
});
