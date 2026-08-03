/**
 * Office overrides for the name patients see.
 *
 * Owners and managers can reword any code; everyone else reads it. The
 * resolver decides what prints: the office's wording, else the built-in
 * CDT name, else nothing (callers fall back to the schedule description).
 *
 * The HIPAA boundary matters here and is asserted below: overrides are
 * staff-authored free text, so they must reach the printed form but never
 * the AI payload, which stays derived from codes alone.
 */
import { describe, it, expect } from 'vitest';
import { friendlyCdtName, resolvePatientName } from '@/lib/fof/cdt-names';
import { safeProcedureLabel } from '@/lib/fof/ai';

describe('resolvePatientName', () => {
  it('falls back to the built-in name when the office has set nothing', () => {
    expect(resolvePatientName('D2740', {})).toBe('Porcelain Crown');
    expect(resolvePatientName('D2740', undefined)).toBe('Porcelain Crown');
  });

  it("prefers the office's own wording over the built-in name", () => {
    expect(resolvePatientName('D2740', { D2740: 'Tooth-Coloured Crown' })).toBe(
      'Tooth-Coloured Crown'
    );
  });

  it('is case-insensitive about the code', () => {
    expect(resolvePatientName('d2740', { D2740: 'Custom Crown' })).toBe('Custom Crown');
    expect(resolvePatientName(' D2740 ', { D2740: 'Custom Crown' })).toBe('Custom Crown');
  });

  it('names custom office codes that have no built-in name', () => {
    expect(resolvePatientName('D9999', {})).toBeNull();
    expect(resolvePatientName('D9999', { D9999: 'Comfort Menu' })).toBe('Comfort Menu');
  });

  it('treats a blank or whitespace override as "use the built-in name"', () => {
    expect(resolvePatientName('D2740', { D2740: '' })).toBe('Porcelain Crown');
    expect(resolvePatientName('D2740', { D2740: '   ' })).toBe('Porcelain Crown');
  });

  it('returns null for an empty code rather than throwing', () => {
    expect(resolvePatientName('', { D2740: 'Crown' })).toBeNull();
    expect(resolvePatientName('   ', {})).toBeNull();
  });

  it('leaves other codes alone when one is overridden', () => {
    const overrides = { D2740: 'Tooth-Coloured Crown' };
    expect(resolvePatientName('D1110', overrides)).toBe('Adult Cleaning');
    expect(resolvePatientName('D2750', overrides)).toBe('Crown');
  });

  it('does not mutate or depend on the built-in map', () => {
    resolvePatientName('D2740', { D2740: 'Something Else' });
    expect(friendlyCdtName('D2740')).toBe('Porcelain Crown');
  });
});

describe('HIPAA boundary: overrides print but never reach the AI', () => {
  // The practice has no BAA covering the AI gateway, so the name-visits
  // payload is derived from codes alone. An override is staff-typed text
  // and must not be able to ride along — this is the guarantee that makes
  // a mistyped patient detail in that field harmless to the gateway.
  it('safeProcedureLabel ignores office overrides entirely', () => {
    expect(safeProcedureLabel('D2740')).toBe('Porcelain Crown');
  });

  it('takes no overrides argument at all, so none can be threaded in', () => {
    expect(safeProcedureLabel.length).toBe(1);
  });

  it('still yields the code itself for an unknown code, never typed text', () => {
    expect(safeProcedureLabel('D9999')).toBe('D9999');
  });
});
