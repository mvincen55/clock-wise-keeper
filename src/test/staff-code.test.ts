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
