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
