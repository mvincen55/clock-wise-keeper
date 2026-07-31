import { describe, expect, it } from 'vitest';
import { classifyNote, sanitizePhrase } from '@/lib/schedule-reader/note-classifier';

// The classifier converts visible schedule notes into controlled codes,
// locally. When it isn't confident it says UNCLASSIFIED — it never guesses.

describe('note classifier', () => {
  it.each([
    ['Dr out early today', 'PROVIDER_OUT_EARLY'],
    ['leaving early', 'PROVIDER_OUT_EARLY'],
    ['starts late', 'PROVIDER_STARTS_LATE'],
    ['Doctor off', 'PROVIDER_OFF'],
    ['provider off', 'PROVIDER_OFF'],
    ['Vacation', 'PROVIDER_OFF'],
    ['LUNCH', 'LUNCH_BLOCK'],
    ['staff meeting', 'MEETING_BLOCK'],
    ['training', 'TRAINING_BLOCK'],
    ['continuing education', 'TRAINING_BLOCK'],
    ['admin time', 'ADMIN_BLOCK'],
    ['emergency only', 'EMERGENCY_RESERVE'],
    ['reserved emergency', 'EMERGENCY_RESERVE'],
    ['no assistant', 'STAFFING_LIMITATION'],
    ['operatory down', 'EQUIPMENT_UNAVAILABLE'],
    ['equipment unavailable', 'EQUIPMENT_UNAVAILABLE'],
    ['office closed', 'OFFICE_CLOSED'],
    ['blocked', 'OTHER_OPERATIONAL_BLOCK'],
    ['do not book', 'OTHER_OPERATIONAL_BLOCK'],
  ])('classifies "%s" as %s', (note, code) => {
    const result = classifyNote(note);
    expect(result.code).toBe(code);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('returns UNCLASSIFIED with zero confidence for unknown notes', () => {
    expect(classifyNote('crown seat follow up')).toEqual({ code: 'UNCLASSIFIED', confidence: 0 });
    expect(classifyNote('')).toEqual({ code: 'UNCLASSIFIED', confidence: 0 });
  });

  it('refuses to guess between two conflicting specific codes', () => {
    const result = classifyNote('lunch meeting');
    expect(result.code).toBe('UNCLASSIFIED');
    expect(result.confidence).toBe(0);
  });

  it('lets a specific code beat the generic block catch-all', () => {
    expect(classifyNote('lunch block').code).toBe('LUNCH_BLOCK');
  });

  it('office phrase rules outrank the built-in lexicon', () => {
    const rules = [{ phrase: 'doc gone', code: 'PROVIDER_OFF' as const }];
    const result = classifyNote('DOC GONE', rules);
    expect(result.code).toBe('PROVIDER_OFF');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });
});

describe('phrase sanitizer', () => {
  it('keeps short generic office phrases', () => {
    expect(sanitizePhrase('doc gone')).toBe('doc gone');
    expect(sanitizePhrase('  Op 3 Down  ')).toBe('op 3 down');
  });

  it('rejects narratives, numbers that look like phones, and empty input', () => {
    expect(sanitizePhrase('')).toBeNull();
    expect(
      sanitizePhrase('patient called to say they will be late because of traffic on the highway')
    ).toBeNull();
    expect(sanitizePhrase('call back 555-1234')).toBeNull();
    expect(sanitizePhrase('one two three four five six seven')).toBeNull();
  });
});
