import { describe, it, expect } from 'vitest';
import { buildNameVisitsPayload, safeProcedureLabel, safeToothSuffix } from '@/lib/fof/labels';

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

  it('carries validated tooth numbers but never on dentures', () => {
    const payload = buildNameVisitsPayload(
      [
        [
          { code: 'D7140', tooth: '24' },
          { code: 'D5214', tooth: '19*30' },
        ],
      ],
      ['Upon Scheduling']
    );
    expect(payload.visits[0].procedures[0]).toBe('Tooth Extraction (tooth #24)');
    // Denture code: arch is in the name; tooth numbers are dropped.
    expect(payload.visits[0].procedures[1]).not.toContain('#');
  });

  it('drops any tooth value that is not a strict tooth number', () => {
    // Free text typed into the tooth box can never reach the AI.
    const payload = buildNameVisitsPayload(
      [[{ code: 'D2740', tooth: 'Jane Doe' }]],
      ['Upon Scheduling']
    );
    expect(JSON.stringify(payload)).not.toContain('Jane');
    expect(payload.visits[0].procedures[0]).toBe('Porcelain Crown');
  });
});

describe('safeToothSuffix', () => {
  it('accepts tooth numbers, primary letters, and PMS pairs', () => {
    expect(safeToothSuffix('30')).toBe('(tooth #30)');
    expect(safeToothSuffix('t')).toBe('(tooth #T)');
    expect(safeToothSuffix('19*30')).toBe('(tooth #19*30)');
    expect(safeToothSuffix('19-31')).toBe('(tooth #19-31)');
  });

  it('rejects anything else', () => {
    expect(safeToothSuffix('')).toBeNull();
    expect(safeToothSuffix('0')).toBeNull();
    expect(safeToothSuffix('33x')).toBeNull();
    expect(safeToothSuffix('Jane')).toBeNull();
    expect(safeToothSuffix('#8; drop table')).toBeNull();
  });
});
