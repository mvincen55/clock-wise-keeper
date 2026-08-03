/**
 * Code-note placement rules.
 *
 * A note about a procedure code has two possible homes, and which one it
 * lands in decides when the assistant applies it:
 *
 *   office schedule  → universal: every patient, whatever their insurance
 *   carrier schedule → only when billing that code to that insurance
 *
 * These cover the sorting and scoping logic that the panel and the prompt
 * both depend on — in particular that a Delta Dental note never presents
 * itself as applying to a BCBS patient, and that office notes are never
 * filtered out by a patient's carrier.
 */
import { describe, it, expect } from 'vitest';

interface Note {
  code: string;
  notes: string;
  scheduleName: string;
  scheduleKind: string;
}

const isUniversal = (n: Note) => n.scheduleKind === 'office';

/** Office-first, then per-carrier; each group ordered by code. */
function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) =>
    isUniversal(a) === isUniversal(b)
      ? a.code.localeCompare(b.code) || a.scheduleName.localeCompare(b.scheduleName)
      : isUniversal(a)
        ? -1
        : 1
  );
}

/** What the assistant should have in scope for a given patient's plan. */
function notesInScope(notes: Note[], carrierName: string | null): Note[] {
  return notes.filter(n => isUniversal(n) || (carrierName !== null && n.scheduleName === carrierName));
}

function describeScope(n: Note): string {
  return isUniversal(n) ? 'ALL patients' : `${n.scheduleName} patients only`;
}

const OFFICE: Note = {
  code: 'D2740',
  notes: 'Always called Crown Delivery, never seating.',
  scheduleName: 'Office Fee Schedule',
  scheduleKind: 'office',
};
const DELTA: Note = {
  code: 'D2740',
  notes: 'Delta downgrades posterior composite to amalgam.',
  scheduleName: 'Delta Dental MA',
  scheduleKind: 'carrier',
};
const BCBS: Note = {
  code: 'D6010',
  notes: 'BCBS needs a narrative for implant placement.',
  scheduleName: 'BCBS',
  scheduleKind: 'carrier',
};

describe('code note placement', () => {
  it('puts universal office guidance before insurance-specific notes', () => {
    const sorted = sortNotes([BCBS, DELTA, OFFICE]);
    expect(sorted[0]).toBe(OFFICE);
    expect(sorted.slice(1).every(n => !isUniversal(n))).toBe(true);
  });

  it('labels an office note as applying to every patient', () => {
    expect(describeScope(OFFICE)).toBe('ALL patients');
  });

  it('scopes a carrier note to that carrier by name', () => {
    expect(describeScope(DELTA)).toBe('Delta Dental MA patients only');
    expect(describeScope(BCBS)).toBe('BCBS patients only');
  });
});

describe('what the assistant sees per patient', () => {
  const all = [OFFICE, DELTA, BCBS];

  it('keeps office notes in scope for a Delta Dental patient', () => {
    const scoped = notesInScope(all, 'Delta Dental MA');
    expect(scoped).toContain(OFFICE);
    expect(scoped).toContain(DELTA);
  });

  it('keeps office notes in scope for a BCBS patient', () => {
    const scoped = notesInScope(all, 'BCBS');
    expect(scoped).toContain(OFFICE);
    expect(scoped).toContain(BCBS);
  });

  it("never leaks one carrier's rule to another carrier's patient", () => {
    expect(notesInScope(all, 'BCBS')).not.toContain(DELTA);
    expect(notesInScope(all, 'Delta Dental MA')).not.toContain(BCBS);
  });

  it('still applies office notes to a self-pay patient with no carrier', () => {
    const scoped = notesInScope(all, null);
    expect(scoped).toEqual([OFFICE]);
  });

  it('applies every office note regardless of carrier — the whole point', () => {
    const second: Note = { ...OFFICE, code: 'D5110', notes: 'Denture Delivery wording.' };
    const withTwo = [OFFICE, second, DELTA];
    for (const carrier of ['Delta Dental MA', 'BCBS', null]) {
      const scoped = notesInScope(withTwo, carrier);
      expect(scoped).toContain(OFFICE);
      expect(scoped).toContain(second);
    }
  });
});
