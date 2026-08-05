import { describe, it, expect } from 'vitest';
import { classifyStaff } from '@/hooks/useStaffCodes';

// A current auditable actor requires active employment + a linked login + an
// ACTIVE org membership. user_id != null alone is never treated as active.
describe('classifyStaff', () => {
  it('active employee + active membership → active', () => {
    expect(classifyStaff('active', 'user-1', 'active')).toBe('active');
  });

  it('owner/manager with active membership → active (role is irrelevant here)', () => {
    // Membership role is separate; any active membership with a login counts.
    expect(classifyStaff('active', 'owner-1', 'active')).toBe('active');
    expect(classifyStaff('active', 'mgr-1', 'active')).toBe('active');
  });

  it('active employee + removed membership (no org_members row) → nonmember', () => {
    expect(classifyStaff('active', 'user-1', null)).toBe('nonmember');
  });

  it('active employee + pending invitation membership → nonmember', () => {
    expect(classifyStaff('active', 'user-1', 'invited')).toBe('nonmember');
  });

  it('active employee + disabled/suspended membership → nonmember', () => {
    expect(classifyStaff('active', 'user-1', 'disabled')).toBe('nonmember');
  });

  it('terminated employee with linked user → former', () => {
    expect(classifyStaff('terminated', 'user-1', 'active')).toBe('former');
  });

  it('inactive employment → inactive', () => {
    expect(classifyStaff('inactive', 'user-1', 'active')).toBe('inactive');
  });

  it('loginless employee (no user_id) → loginless', () => {
    expect(classifyStaff('active', null, null)).toBe('loginless');
  });
});
