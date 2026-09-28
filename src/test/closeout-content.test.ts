import { describe, expect, it } from 'vitest';
import { closeoutHasContent, type CloseoutContent } from '@/hooks/useDepositLog';

/** An importer's placeholder: nothing recorded, counts marked not recorded. */
const placeholder = (over: Partial<CloseoutContent> = {}): CloseoutContent => ({
  cash_cents: 0, checks: [], ins_cc_cents: 0, pt_cc_cents: 0, illumitrac_cents: 0, outside_financing_cents: 0,
  other_collections_cents: 0, production_cents: null, hygiene_cancellations: 0, hygiene_no_shows: 0,
  doctor_cancellations: 0, doctor_no_shows: 0, new_patients_scheduled_count: null, new_patients_seen_count: 0,
  staffing_assessment: null, missed_appointments_recorded: false,
  ...over,
});

describe('closeoutHasContent', () => {
  it('treats an importer placeholder as no closeout, whatever its checks field holds', () => {
    expect(closeoutHasContent(placeholder())).toBe(false);
    expect(closeoutHasContent(placeholder({ checks: null }))).toBe(false);
    expect(closeoutHasContent(placeholder({ checks: [0] }))).toBe(false);
    expect(closeoutHasContent(placeholder({ new_patients_scheduled_count: 0 }))).toBe(false);
  });
  it('counts money, production, counts, a staffing answer, or confirmed counts as a closeout', () => {
    expect(closeoutHasContent(placeholder({ production_cents: 285995 }))).toBe(true);
    expect(closeoutHasContent(placeholder({ production_cents: 0 }))).toBe(true); // an explicit zero is an answer
    expect(closeoutHasContent(placeholder({ cash_cents: 13800 }))).toBe(true);
    expect(closeoutHasContent(placeholder({ checks: [15140] }))).toBe(true);
    expect(closeoutHasContent(placeholder({ pt_cc_cents: 90223 }))).toBe(true);
    expect(closeoutHasContent(placeholder({ other_collections_cents: 500 }))).toBe(true);
    expect(closeoutHasContent(placeholder({ doctor_no_shows: 1 }))).toBe(true);
    expect(closeoutHasContent(placeholder({ new_patients_seen_count: 2 }))).toBe(true);
    expect(closeoutHasContent(placeholder({ staffing_assessment: 'about_right' }))).toBe(true);
    expect(closeoutHasContent(placeholder({ missed_appointments_recorded: true }))).toBe(true);
  });
});
