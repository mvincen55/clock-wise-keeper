import { describe, it, expect } from 'vitest';
import { buildNameVisitsPayload, safeProcedureLabel } from '@/lib/fof/ai';

// HIPAA regression tests: the name-visits request must be de-identified by
// construction. The builder takes CDT codes only, so staff-typed
// descriptions (which may name a patient) can never reach the AI gateway.

describe('safeProcedureLabel', () => {
  it('resolves known CDT codes to their friendly names', () => {
    expect(safeProcedureLabel('D7140')).toBe('Tooth Extraction');
    expect(safeProcedureLabel('d7140')).toBe('Tooth Extraction');
  });

  it('falls back to the bare code for custom/unknown codes — never typed text', () => {
    expect(safeProcedureLabel('D9999')).toBe('D9999');
    expect(safeProcedureLabel('n100')).toBe('N100');
  });

  it('returns null for a blank code (line dropped from AI payloads)', () => {
    expect(safeProcedureLabel('')).toBeNull();
    expect(safeProcedureLabel('   ')).toBeNull();
  });
});

describe('buildNameVisitsPayload', () => {
  it('builds procedures from codes only and drops code-less entries', () => {
    const payload = buildNameVisitsPayload(
      [
        ['D7140', 'ZZ-CUSTOM'],
        ['', 'D9110'],
      ],
      ['Upon Scheduling', 'Surgery', 'Delivery']
    );
    expect(payload).toEqual({
      slots: ['Upon Scheduling', 'Surgery', 'Delivery'],
      visits: [
        { procedures: ['Tooth Extraction', 'ZZ-CUSTOM'] },
        { procedures: ['Emergency Pain Treatment'] },
      ],
    });
  });

  it('cannot leak text that is not derived from a code', () => {
    // Simulates the old bug: a staff-typed description containing a
    // patient name. The builder has no description input at all, so the
    // serialized request can never contain it.
    const typedDescription = "Crown for Jane Doe tooth #8";
    const payload = buildNameVisitsPayload([['D2740']], ['Upon Scheduling', 'Crown Prep']);
    expect(JSON.stringify(payload)).not.toContain('Jane');
    expect(JSON.stringify(payload)).not.toContain(typedDescription);
  });
});
