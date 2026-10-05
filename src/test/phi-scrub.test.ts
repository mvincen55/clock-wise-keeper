import { describe, it, expect } from 'vitest';
import { scrubFreeText, looksPersonLevel } from '../../supabase/functions/_shared/phi-scrub';

// The scrubber is the last thing standing between staff free text and an AI
// gateway that is outside the practice's BAA. These tests are the contract.

describe('scrubFreeText — person-level detail never leaves', () => {
  it('removes a full name', () => {
    const r = scrubFreeText('Call Sarah Whitman about the crown');
    expect(r.text).toBe('Call [a person] about the crown');
    expect(r.redacted).toBe(true);
    expect(r.hits).toContain('full_name');
  });

  it('removes a titled name', () => {
    expect(scrubFreeText('Mrs. Alvarez rescheduled').text).toBe('[a person] rescheduled');
  });

  it('removes phone numbers in any common shape', () => {
    expect(scrubFreeText('call 508-555-0134 back').text).toBe('call [removed] back');
    expect(scrubFreeText('call (508) 555 0134 back').text).toBe('call [removed] back');
  });

  it('removes emails, SSNs, dates of birth and chart numbers', () => {
    expect(scrubFreeText('email jane@x.com').text).toBe('email [removed]');
    expect(scrubFreeText('ssn 123-45-6789').text).toBe('ssn [removed]');
    expect(scrubFreeText('DOB: 04/12/1978').text).toBe('[removed]');
    expect(scrubFreeText('chart #4471 needs a note').text).toBe('[removed] needs a note');
  });

  it('keeps first names — the office speaks to its own people by first name', () => {
    const r = scrubFreeText('Ask Megan to review the day sheet');
    expect(r.text).toBe('Ask Megan to review the day sheet');
    expect(r.redacted).toBe(false);
  });

  it('leaves ordinary office vocabulary alone', () => {
    for (const phrase of ['Morning huddle at 8', 'Update the day sheet', 'New patient forms']) {
      expect(scrubFreeText(phrase).redacted).toBe(false);
    }
  });

  it('handles empty and non-string input without throwing', () => {
    expect(scrubFreeText(undefined).text).toBe('');
    expect(scrubFreeText(null).redacted).toBe(false);
    expect(scrubFreeText(42).text).toBe('');
  });

  it('truncates to the caller bound before scanning', () => {
    expect(scrubFreeText('a'.repeat(500), 100).text).toHaveLength(100);
  });

  it('flags person-level text for callers that would rather refuse', () => {
    expect(looksPersonLevel('Robert Chen, DOB 01/01/1970')).toBe(true);
    expect(looksPersonLevel('hygiene recall count for July')).toBe(false);
  });
});

describe('scrubFreeText — office vocabulary and places are not people', () => {
  it('keeps carrier names, manual titles and section headings intact', () => {
    for (const phrase of [
      '[DD MA Processing Manual — Timely Filing, page 12] (insurance)',
      'per the Delta Dental manual, claims are due in 12 months',
      'Blue Cross Blue Shield requires a narrative for D2740',
      'see the Coordination of Benefits section in the Aetna Provider Handbook',
      'Harbor Dental is closed Friday',
      'United Concordia downgrades posterior composites',
      'Practice: Harbor Dental',
    ]) {
      const r = scrubFreeText(phrase);
      expect(r.text, phrase).toBe(phrase);
      expect(r.redacted, phrase).toBe(false);
    }
  });

  it('keeps cities and states intact', () => {
    for (const phrase of ['Salt Lake City', 'Boston, Massachusetts', 'North Carolina', 'San Diego office', 'New Bedford', 'Fort Worth', 'Rhode Island']) {
      expect(scrubFreeText(phrase).text, phrase).toBe(phrase);
    }
  });

  it('still removes a name that sits next to vocabulary', () => {
    expect(scrubFreeText('Patient Robert Chen called about his crown').text).toBe('Patient [a person] called about his crown');
    expect(scrubFreeText('Sarah Whitman Insurance Verification').text).toBe('[a person] Insurance Verification');
  });
});

describe('scrubFreeText — names typed in lower case or caps', () => {
  it('removes a known first+last pair in any case', () => {
    expect(scrubFreeText('call sarah johnson about the crown').text).toBe('call [a person] about the crown');
    expect(scrubFreeText('NP - JANE DOE 9am').text).toBe('NP - [a person] 9am');
    expect(scrubFreeText('Doe, Jane owes $40').text).toBe('[a person] owes $40');
    expect(scrubFreeText('robert j. chen jr. called').text).toBe('[a person] called');
    expect(scrubFreeText('mrs alvarez rescheduled').text).toBe('[a person] rescheduled');
  });

  it('honours word-like surnames only after a first name', () => {
    expect(scrubFreeText('sarah white is here').text).toBe('[a person] is here');
    expect(scrubFreeText('Snow Day on Friday').redacted).toBe(false);
    expect(scrubFreeText('the white filling').redacted).toBe(false);
  });

  it('leaves lower-case office prose alone', () => {
    for (const phrase of [
      'megan called about the delta claim',
      'ask megan to review the day sheet',
      'sarah will cover the front desk',
      'order more prophy paste',
      'the new patient forms are printed',
    ]) {
      expect(scrubFreeText(phrase).redacted, phrase).toBe(false);
    }
  });
});

describe('scrubFreeText — titles', () => {
  it('trusts a lower-case title only before a known surname', () => {
    expect(scrubFreeText('mrs alvarez rescheduled').text).toBe('[a person] rescheduled');
    expect(scrubFreeText('the dr said to wait').redacted).toBe(false);
    expect(scrubFreeText('Dr. Appointment reminders go out Monday').redacted).toBe(false);
  });
});
