/**
 * The client-side patient-identifier scanner that gates the builder's AI
 * panel. Two duties in tension: catch a filled form pasted into template
 * wording, and never flag the template language every consent form is made
 * of (field labels, placeholders, the office's own identity).
 */
import { describe, it, expect } from 'vitest';
import { scanForPatientIdentifiers } from '@/lib/consents/pii';

const kinds = (text: string, allow: string[] = []) =>
  scanForPatientIdentifiers(text, allow).hits.map(h => h.kind);

describe('scanForPatientIdentifiers — catches real identifiers', () => {
  it('flags a date labeled DOB', () => {
    expect(kinds('Patient DOB: 04/12/1978 presented for extraction')).toContain('dob');
    expect(kinds('date of birth 4-12-1978')).toContain('dob');
    expect(kinds('born on 04/12/1978')).toContain('dob');
  });

  it('flags a full date near the word birth', () => {
    expect(kinds('birth date listed as 04/12/1978 on the chart')).toContain('dob');
  });

  it('reports one hit when the labeled and proximity patterns overlap', () => {
    const { hits } = scanForPatientIdentifiers('Date of birth: 04/12/1978');
    expect(hits.filter(h => h.kind === 'dob')).toHaveLength(1);
  });

  it('flags chart and record numbers with digits', () => {
    expect(kinds('see chart #44712 for history')).toContain('chart_number');
    expect(kinds('Record No. 88231')).toContain('chart_number');
    expect(kinds('acct 552901')).toContain('chart_number');
  });

  it('flags SSN patterns', () => {
    expect(kinds('SSN 123-45-6789 on file')).toContain('ssn');
  });

  it('flags a phone number attributed to the patient', () => {
    expect(kinds('patient can be reached at (508) 555-0134')).toContain('patient_phone');
    expect(kinds("the patient's cell 508-555-0134")).toContain('patient_phone');
  });

  it('flags an honorific followed by a name', () => {
    expect(kinds('Mrs. Delgado consented to the procedure')).toContain('patient_name');
    expect(kinds('spoke with Mr. Chen about risks')).toContain('patient_name');
  });

  it('returns excerpts the panel can show', () => {
    const { hits } = scanForPatientIdentifiers('see chart #44712');
    expect(hits[0].excerpt).toContain('44712');
  });
});

describe('scanForPatientIdentifiers — never flags template wording', () => {
  it('ignores blank fill-in labels', () => {
    expect(kinds('Patient Name: ____________')).toEqual([]);
    expect(kinds('Date of Birth: ____________')).toEqual([]);
    expect(kinds('Chart #: ______')).toEqual([]);
  });

  it('ignores honorifics without a name (signature-line labels)', () => {
    expect(kinds('Mr./Mrs./Ms.: ____________')).toEqual([]);
    expect(kinds('Signature of Mr./Mrs.')).toEqual([]);
  });

  it('ignores signature-role labels and consent boilerplate', () => {
    const boilerplate =
      'Patient Signature: ____________  Date: ____________\n' +
      'I have read this form, my questions were answered, and I consent to ' +
      'the treatment described above. Witness Signature: ____________';
    expect(kinds(boilerplate)).toEqual([]);
  });

  it('ignores ordinary consent wording with dates in prose', () => {
    expect(kinds('Take ibuprofen every 4-6 hours for 2-3 days after surgery.')).toEqual([]);
  });

  it('accepts the office phone via the allow list', () => {
    const text = 'Questions? Call our patient line at (508) 555-0100.';
    expect(kinds(text)).toContain('patient_phone');
    expect(kinds(text, ['(508) 555-0100'])).toEqual([]);
    // Formatting differences between the form and branding row still match.
    expect(kinds(text, ['508.555.0100'])).toEqual([]);
  });

  it('accepts the office name via the allow list', () => {
    const text = 'Mrs. Hartwell and the team at Hartwell Dental welcome you.';
    expect(kinds(text, ['Dr. Amelia Hartwell, Hartwell Dental'])).toEqual([]);
  });

  it('returns nothing for empty text', () => {
    expect(scanForPatientIdentifiers('').hits).toEqual([]);
  });
});
