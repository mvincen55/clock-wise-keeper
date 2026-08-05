import { describe, it, expect } from 'vitest';
import {
  STAFF_CODE_PATTERN,
  LEGACY_STAFF_CODE_PATTERN,
  UNASSIGNED_STAFF_CODE,
  normalizeStaffCode,
  isValidStaffCode,
  isLegacyStaffCode,
  validateStaffCodeInput,
  resolveStaffCode,
  staffCodeLabel,
  attributionLabel,
  suggestStaffCode,
} from '@/lib/staff-code';

describe('staff code patterns', () => {
  it('accepts 3-4 uppercase alnum for the current rule', () => {
    for (const c of ['MEG', 'MEGV', 'AB1', 'Z9Z9']) expect(STAFF_CODE_PATTERN.test(c)).toBe(true);
    for (const c of ['ME', 'MEGVV', 'me', 'M-E', '']) expect(STAFF_CODE_PATTERN.test(c)).toBe(false);
  });
  it('legacy pattern still allows 2 chars', () => {
    expect(LEGACY_STAFF_CODE_PATTERN.test('ME')).toBe(true);
    expect(LEGACY_STAFF_CODE_PATTERN.test('MEGVV')).toBe(false);
  });
});

describe('normalizeStaffCode', () => {
  it('uppercases and trims', () => {
    expect(normalizeStaffCode(' meg ')).toBe('MEG');
    expect(normalizeStaffCode(null)).toBe('');
    expect(normalizeStaffCode(undefined)).toBe('');
  });
});

describe('isValidStaffCode / isLegacyStaffCode', () => {
  it('valid only for 3-4', () => {
    expect(isValidStaffCode('meg')).toBe(true);
    expect(isValidStaffCode('MEGV')).toBe(true);
    expect(isValidStaffCode('ME')).toBe(false);
  });
  it('legacy detects grandfathered 2-char only', () => {
    expect(isLegacyStaffCode('ME')).toBe(true);
    expect(isLegacyStaffCode('MEG')).toBe(false);
    expect(isLegacyStaffCode('')).toBe(false);
  });
});

describe('validateStaffCodeInput', () => {
  it('accepts 3-4 char codes', () => {
    expect(validateStaffCodeInput('meg')).toEqual({ ok: true });
    expect(validateStaffCodeInput('MEGV')).toEqual({ ok: true });
  });
  it('rejects too short / too long / non-alnum / empty', () => {
    expect(validateStaffCodeInput('me').ok).toBe(false);
    expect(validateStaffCodeInput('megvv').ok).toBe(false);
    expect(validateStaffCodeInput('m-e').ok).toBe(false);
    expect(validateStaffCodeInput('   ').ok).toBe(false);
  });
});

describe('resolveStaffCode', () => {
  const map = new Map<string, string>([
    ['u1', 'MEGV'],
    ['u2', 'me'],
  ]);
  it('returns the normalized code for a known user', () => {
    expect(resolveStaffCode(map, 'u1')).toEqual({ code: 'MEGV' });
    expect(resolveStaffCode(map, 'u2')).toEqual({ code: 'ME' });
  });
  it('returns null (never a name/email) for unknown or missing users', () => {
    expect(resolveStaffCode(map, 'nope')).toEqual({ code: null });
    expect(resolveStaffCode(map, null)).toEqual({ code: null });
    expect(resolveStaffCode(map, undefined)).toEqual({ code: null });
  });
});

describe('suggestStaffCode', () => {
  it('takes the first three alphanumerics of the name, uppercased', () => {
    expect(suggestStaffCode('Megan Vincent')).toBe('MEG');
    expect(suggestStaffCode('soleil baptiste')).toBe('SOL');
    expect(suggestStaffCode("O'Brien")).toBe('OBR');
  });
  it('pads short names to 3 characters', () => {
    expect(suggestStaffCode('Jo')).toBe('JOX');
    expect(suggestStaffCode('')).toBe('XXX');
  });
  it('always returns a valid 3-4 char code, even when avoiding collisions', () => {
    const taken = new Set(['MEG']);
    const s = suggestStaffCode('Megan Vincent', taken);
    expect(s).toBe('MEG2');
    expect(STAFF_CODE_PATTERN.test(s)).toBe(true);
  });
  it('keeps trying until it finds a free code', () => {
    const taken = new Set(['MEG', 'MEG2', 'MEG3']);
    const s = suggestStaffCode('Megan Vincent', taken);
    expect(taken.has(s)).toBe(false);
    expect(STAFF_CODE_PATTERN.test(s)).toBe(true);
  });
});

describe('labels', () => {
  it('staffCodeLabel falls back to Unassigned, never a name', () => {
    expect(staffCodeLabel('MEGV')).toBe('MEGV');
    expect(staffCodeLabel(null)).toBe(UNASSIGNED_STAFF_CODE);
    expect(staffCodeLabel('')).toBe(UNASSIGNED_STAFF_CODE);
  });
  it('attributionLabel composes the action and code', () => {
    expect(attributionLabel('Published', 'MEGV')).toBe('Published by MEGV');
    expect(attributionLabel('Created', null)).toBe('Created by Unassigned');
  });
});
