import { describe, it, expect } from 'vitest';
import { categorizeCdtCode } from '@/lib/fof/cdt';

describe('categorizeCdtCode', () => {
  it('maps diagnostic and preventive codes', () => {
    expect(categorizeCdtCode('D0120')).toBe('preventive'); // periodic exam
    expect(categorizeCdtCode('D0274')).toBe('preventive'); // bitewings
    expect(categorizeCdtCode('D1110')).toBe('preventive'); // prophy
    expect(categorizeCdtCode('1206')).toBe('preventive'); // fluoride, bare code
  });

  it('maps fillings to basic and crowns to major', () => {
    expect(categorizeCdtCode('D2140')).toBe('basic'); // amalgam
    expect(categorizeCdtCode('D2392')).toBe('basic'); // composite
    expect(categorizeCdtCode('D2740')).toBe('major'); // crown
    expect(categorizeCdtCode('2950')).toBe('major'); // core buildup
  });

  it('maps endo, perio, and oral surgery to basic', () => {
    expect(categorizeCdtCode('D3310')).toBe('basic'); // root canal
    expect(categorizeCdtCode('D4341')).toBe('basic'); // SRP
    expect(categorizeCdtCode('D7140')).toBe('basic'); // extraction
    expect(categorizeCdtCode('7210')).toBe('basic'); // surgical extraction
  });

  it('maps prosthodontics, implants, and bridges to major', () => {
    expect(categorizeCdtCode('D5110')).toBe('major'); // complete denture
    expect(categorizeCdtCode('D6010')).toBe('major'); // implant
    expect(categorizeCdtCode('D6740')).toBe('major'); // bridge retainer
  });

  it('maps ortho, adjunctive, and custom codes to other', () => {
    expect(categorizeCdtCode('D8080')).toBe('other'); // ortho
    expect(categorizeCdtCode('D9110')).toBe('other'); // palliative
    expect(categorizeCdtCode('XX232')).toBe('other');
    expect(categorizeCdtCode('111B')).toBe('other');
    expect(categorizeCdtCode('14')).toBe('other');
    expect(categorizeCdtCode('')).toBe('other');
  });

  it('is case- and whitespace-tolerant', () => {
    expect(categorizeCdtCode(' d1110 ')).toBe('preventive');
  });
});
