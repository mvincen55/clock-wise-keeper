import { describe, it, expect } from 'vitest';
import { MEMBER_ROLE_LABELS, memberRoleLabel, roleClocksIn } from '@/lib/roles';

// The office runs on three membership types: Owner, Manager, Team.
// Owners are the only ones without a clock — no setting can change that.

describe('membership types', () => {
  it('has exactly three, with the employee token displayed as Team', () => {
    expect(Object.keys(MEMBER_ROLE_LABELS)).toEqual(['owner', 'manager', 'employee']);
    expect(memberRoleLabel('owner')).toBe('Owner');
    expect(memberRoleLabel('manager')).toBe('Manager');
    expect(memberRoleLabel('employee')).toBe('Team');
  });

  it('passes unknown tokens through and blanks missing ones', () => {
    expect(memberRoleLabel('supervisor')).toBe('supervisor');
    expect(memberRoleLabel(null)).toBe('');
    expect(memberRoleLabel(undefined)).toBe('');
  });
});

describe('who clocks in', () => {
  it('owners never do', () => {
    expect(roleClocksIn('owner')).toBe(false);
  });

  it('managers and team always do', () => {
    expect(roleClocksIn('manager')).toBe(true);
    expect(roleClocksIn('employee')).toBe(true);
  });

  it('nobody does before membership resolves', () => {
    expect(roleClocksIn(null)).toBe(false);
    expect(roleClocksIn(undefined)).toBe(false);
  });
});
