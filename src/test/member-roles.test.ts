import { describe, it, expect } from 'vitest';
import { MEMBER_ROLE_LABELS, memberClocksIn, memberRoleLabel, roleClocksIn } from '@/lib/roles';

// The office runs on three membership types: Owner, Manager, Team.
// Owners are the only ones without a clock — no setting can change that.
// A Manager or Team member is off the clock only when their roster record
// says so (employees.clocks_in), which a doctor kept on Team for the
// schedule reader is.

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

  it('the roster can take a manager or team member off the clock, never put an owner on it', () => {
    expect(memberClocksIn('employee', false)).toBe(false);
    expect(memberClocksIn('manager', false)).toBe(false);
    expect(memberClocksIn('employee', true)).toBe(true);
    expect(memberClocksIn('employee', undefined)).toBe(true);
    expect(memberClocksIn('owner', true)).toBe(false);
  });
});
