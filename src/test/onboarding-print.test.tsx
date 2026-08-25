/**
 * Blank onboarding checklist print — snapshot-tested like every other
 * branded sheet (README: printing is snapshot-tested). Fixed inputs, full
 * print DOM; a diff here means the office's printed checklist changed.
 * Also pins the branding rules: logo carries the letterhead when set, the
 * practice name is the text fallback when not.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OnboardingTemplatePrintSheet from '@/components/onboarding/OnboardingTemplatePrintSheet';
import OnboardingRecordPrintSheet from '@/components/onboarding/OnboardingRecordPrintSheet';
import {
  GENERIC_FRONT_DESK_TEMPLATE,
} from '@/lib/onboarding-template-defaults';

const BRANDING = {
  displayName: 'Northfield Dental Group',
  legalName: 'Northfield Dental Group, LLC',
  addressLine1: '41 Northfield Avenue',
  addressLine2: 'Springvale, MA 02100',
  phone: '(555) 010-0142',
  website: 'northfielddentalgroup.example',
  logoUrl: '/src/assets/practice-logo.png',
};

const SECTIONS = GENERIC_FRONT_DESK_TEMPLATE.sections.map((s, sIndex) => ({
  id: `section-${sIndex}`,
  title: s.title,
  items: s.items.map((i, iIndex) => ({
    id: `item-${sIndex}-${iIndex}`,
    title: i.title,
    detail: i.detail ?? '',
  })),
}));

describe('onboarding template print sheet', () => {
  it('renders the reference blank checklist byte-for-byte', () => {
    const html = renderToStaticMarkup(
      <OnboardingTemplatePrintSheet
        templateName="Front Desk Onboarding (starter)"
        roleLabel="Front Desk"
        sections={SECTIONS}
        branding={BRANDING}
      />,
    );
    expect(html).toMatchSnapshot();
  });

  it('prints the logo when set, the practice name as text fallback when not', () => {
    const withLogo = renderToStaticMarkup(
      <OnboardingTemplatePrintSheet
        templateName="T"
        roleLabel=""
        sections={[]}
        branding={BRANDING}
      />,
    );
    expect(withLogo).toContain('<img');
    expect(withLogo).toContain('onb-logo');

    const noLogo = renderToStaticMarkup(
      <OnboardingTemplatePrintSheet
        templateName="T"
        roleLabel=""
        sections={[]}
        branding={{ ...BRANDING, logoUrl: '' }}
      />,
    );
    expect(noLogo).not.toContain('<img');
    expect(noLogo).toContain('Northfield Dental Group');
    expect(noLogo).toContain('onb-practice');
  });

  it('the record sheet prints initials, dates, and verification status per side', () => {
    const html = renderToStaticMarkup(
      <OnboardingRecordPrintSheet
        employeeName="Hire Probe"
        templateName="Front Desk Onboarding (starter)"
        roleLabel="Front Desk"
        startedAt="2026-08-20T13:00:00Z"
        status="active"
        completedAt={null}
        items={[
          {
            id: 'i1',
            section_title: 'Basics',
            item_title: 'Verified both ways',
            item_detail: '',
            trainer_initials: 'TRN',
            trainer_signed_at: '2026-08-21T13:00:00Z',
            trainer_attestation_id: 'a1',
            trainee_initials: 'NEW',
            trainee_signed_at: '2026-08-21T13:05:00Z',
            trainee_attestation_id: 'a2',
          },
          {
            id: 'i2',
            section_title: 'Basics',
            item_title: 'Initials fallback, one side open',
            item_detail: '',
            trainer_initials: 'TRN',
            trainer_signed_at: '2026-08-22T13:00:00Z',
            trainer_attestation_id: null,
            trainee_initials: '',
            trainee_signed_at: null,
            trainee_attestation_id: null,
          },
        ]}
        branding={BRANDING}
      />,
    );
    expect(html).toMatchSnapshot();
    expect(html).toContain('PIN verified');
    expect(html).toContain('initials only — unverified');
    // The open slot prints the blank rule so the sheet can finish on paper.
    expect(html).toContain('onb-sign-line');
  });

  it('every item carries the two sign-off slots (trainer + team member)', () => {
    const html = renderToStaticMarkup(
      <OnboardingTemplatePrintSheet
        templateName="T"
        roleLabel="R"
        sections={[
          {
            id: 's1',
            title: 'Section',
            items: [{ id: 'i1', title: 'Item', detail: '' }],
          },
        ]}
        branding={BRANDING}
      />,
    );
    const slots = html.match(/onb-sign-slot/g) ?? [];
    expect(slots).toHaveLength(2);
  });
});
